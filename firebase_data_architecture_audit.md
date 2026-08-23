# Comprehensive Firebase & Data Architecture Audit Documentation

This document contains the complete, un-truncated source code, caller map, Firebase & IndexedDB operations inventory, end-to-end trace diagrams, partition algorithms, and observable architectural issues for the TGF CRM system.

---

## 1. Complete Primary Architecture Source Files

### File: `src/lib/db/contactService.js`

```javascript
import {
  collection, addDoc, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, query, where,
  serverTimestamp, writeBatch, onSnapshot,
  limit, Timestamp, orderBy,
  deleteField, documentId, runTransaction
} from "firebase/firestore";
import { db } from "../firebase.js";
import { isKhojiField } from "../khojiHelper.js";
import {
  formatContactName, isIgnoredField, findMatchingAttenderState,
  combineContactHistories, normalizePhone, extractIndividualPhones,
  getByteSize, trackFirestoreRead, trackFirestoreWrite, sanitizeForFirestore,
  checkHasUndefinedFields
} from "./core.js";
import {
  getIDBCache, setIDBCache, dupCheckCacheMap,
  getDupCheckCache, setDupCheckCache, updateLocalAttenderCache,
  updateLocalRegistrationsCache, fetchPartitionCacheForColdBoot
} from "./cacheService.js";
import {
  getActiveTags, registerActiveTag, INCOMING_PROGRAM_ID, INCOMING_PROGRAM_NAME,
  OUTGOING_PROGRAM_ID, OUTGOING_PROGRAM_NAME
} from "./programService.js";
import { registerRegistrationMonth } from "./adminService.js";
import { queuePendingWrite, flushPendingWrites } from "./syncService.js";

export const parseTags = (tagInput) => {
  if (!tagInput) return [];
  if (Array.isArray(tagInput)) {
    return tagInput.flatMap(t => parseTags(String(t)));
  }
  const str = String(tagInput).trim();
  if (!str) return [];
  return str
    .split(/[,;\n#]+/)
    .map(t => t.trim().replace(/^#+/, ""))
    .filter(t => t.length > 0);
};

export const remapProgramContacts = async (programId, columnMappings, skipEmptySettings) => {
  const snap = await getDocs(
    query(collection(db, "contacts"), where("programId", "==", programId))
  );
  const SYSTEM_KEYS = new Set([
    "id", "programid", "programname", "assignedto", "assignedname",
    "calltype", "status", "remark", "callbackdate", "iscallbackdue",
    "createdat", "updatedat", "history", "callbackstatus", "objectionreason",
    "registeredat", "conversionsource", "convertedby", "_callbackdue", "_deleted", "_isnew",
    "_contactrefid", "_mappedfields", "sub program", "subprogram", "ghl_id", "normalizedphone", "normalizedmobile", "isassigned"
  ]);

  const STANDARD_FIELDS = new Set(["Name", "Phone", "Email", "City", "State", "Khoji", "Source", "Tags"]);
  let totalUpdated = 0;
  const MAX_BATCH = 499;
  const batchWriteOps = [];

  const activeMappedFields = [];
  Object.entries(columnMappings).forEach(([col, target]) => {
    if (col === "Sub Program" || target === "Ignore") return;
    activeMappedFields.push(target);
  });

  snap.docs.forEach(contactDoc => {
    const contactData = contactDoc.data();
    const contactUpdate = {};
    const contactMappedFields = [...activeMappedFields];

    // Always carry system/meta keys untouched, or initialize them if missing
    activeMappedFields.forEach(f => {
      const lookup = getCaseInsensitiveProp(contactData, f);
      if (!lookup.found) {
        contactUpdate[f] = "";
      }
    });

    Object.entries(contactData).forEach(([key, val]) => {
      const keyLower = key.toLowerCase();
      if (SYSTEM_KEYS.has(keyLower)) return;

      const mappingLookup = getCaseInsensitiveProp(columnMappings, key);
      const strVal = val === null || val === undefined ? "" : String(val).trim();

      if (!mappingLookup.found) {
        // Keep standard fields in mapped fields if present
        const isStandard = Array.from(STANDARD_FIELDS).some(f => f.toLowerCase() === keyLower);
        if (isStandard) {
          const canonicalStandard = Array.from(STANDARD_FIELDS).find(f => f.toLowerCase() === keyLower);
          contactMappedFields.push(canonicalStandard);
        } else {
          // Delete other fields to ignore by default
          contactUpdate[key] = deleteField();
        }
        return;
      }

      const canonicalKey = mappingLookup.key;
      const target = mappingLookup.val;
      const skipEmptyLookup = getCaseInsensitiveProp(skipEmptySettings, key);
      const skipEmpty = skipEmptyLookup.found ? !!skipEmptyLookup.val : false;

      if (target === "Ignore" || (skipEmpty && !strVal)) {
        contactUpdate[canonicalKey] = deleteField();
        if (key !== canonicalKey) {
          contactUpdate[key] = deleteField();
        }
        const idx = contactMappedFields.indexOf(target);
        if (idx !== -1) contactMappedFields.splice(idx, 1);
        return;
      }

      contactUpdate[target] = strVal || val;
      if (key !== target) {
        contactUpdate[key] = deleteField();
      }
    });

    contactUpdate._mappedFields = Array.from(new Set(contactMappedFields));

    // Recompute normalizedPhone and normalizedMobile safely (without evaluating Firestore delete field token)
    const newPhoneLookup = getCaseInsensitiveProp(contactUpdate, "Phone");
    const newMobileLookup = getCaseInsensitiveProp(contactUpdate, "Mobile");
    const oldPhoneLookup = getCaseInsensitiveProp(contactData, "Phone");
    const oldMobileLookup = getCaseInsensitiveProp(contactData, "Mobile");
    
    let phoneVal = "";
    if (newPhoneLookup.found && typeof newPhoneLookup.val === "string" && newPhoneLookup.val.trim()) {
      phoneVal = newPhoneLookup.val;
    } else if (oldPhoneLookup.found && typeof oldPhoneLookup.val === "string" && oldPhoneLookup.val.trim()) {
      phoneVal = oldPhoneLookup.val;
    }
    if (phoneVal) {
      contactUpdate.normalizedPhone = normalizePhone(String(phoneVal));
    }

    let mobileVal = "";
    if (newMobileLookup.found && typeof newMobileLookup.val === "string" && newMobileLookup.val.trim()) {
      mobileVal = newMobileLookup.val;
    } else if (oldMobileLookup.found && typeof oldMobileLookup.val === "string" && oldMobileLookup.val.trim()) {
      mobileVal = oldMobileLookup.val;
    }
    if (mobileVal) {
      contactUpdate.normalizedMobile = normalizePhone(String(mobileVal));
    }

    const allPhones = [
      ...extractIndividualPhones(phoneVal),
      ...extractIndividualPhones(mobileVal)
    ];
    if (allPhones.length > 0) {
      contactUpdate.normalizedPhones = Array.from(new Set(allPhones));
    }

    contactUpdate.updatedAt = serverTimestamp();

    batchWriteOps.push({
      ref: contactDoc.ref,
      data: contactUpdate
    });
    totalUpdated++;
  });

  // Commit in batches of MAX_BATCH
  for (let i = 0; i < batchWriteOps.length; i += MAX_BATCH) {
    const batch = writeBatch(db);
    batchWriteOps.slice(i, i + MAX_BATCH).forEach(op => {
      batch.update(op.ref, op.data);
    });
    await batch.commit();
  }

  return totalUpdated;
};


export const formatContactDoc = (docSnap) => {
  if (!docSnap || !docSnap.exists()) return {};
  const data = docSnap.data();
  // Merge any stale Tags string into the array (migration safety)
  const tagsFromArr = Array.isArray(data.tags) ? data.tags : [];
  const tagsFromStr = data.Tags ? parseTags(String(data.Tags)) : [];
  const allTags = Array.from(new Set([...tagsFromArr, ...tagsFromStr])).sort();
  const { Tags: _removed, ...rest } = data;
  return {
    id: docSnap.id,
    ...rest,
    tags: allTags,
    Tags: allTags.join(", ")   // virtual — for UI display only, not stored in Firestore
  };
};

const cleanImportRow = (row) => {
  if (row._mappedFields && Array.isArray(row._mappedFields)) {
    const clean = {
      Name: "",
      Phone: "",
      Mobile: "",
      Email: "",
      City: "",
      State: "",
      Khoji: "",
      Source: ""
    };
    if (row["Sub Program"] !== undefined) {
      clean["Sub Program"] = row["Sub Program"];
    }
    if (row.GHL_ID !== undefined) {
      clean.GHL_ID = String(row.GHL_ID).trim();
    } else if (row.ghl_id !== undefined) {
      clean.GHL_ID = String(row.ghl_id).trim();
    }
    row._mappedFields.forEach(field => {
      if (["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Source"].includes(field)) {
        clean[field] = row[field] !== undefined && row[field] !== null ? String(row[field]) : "";
      } else if (field === "Tags" && row[field]) {
        clean._tagsRaw = parseTags(String(row[field]));
      }
    });
    clean._mappedFields = row._mappedFields.filter(f => ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Source", "Tags"].includes(f));
    
    // Always ensure normalizedPhone and normalizedMobile are populated
    clean.normalizedPhone = normalizePhone(clean.Phone || "");
    clean.normalizedMobile = normalizePhone(clean.Mobile || "");
    clean.normalizedPhones = Array.from(new Set([...extractIndividualPhones(clean.Phone), ...extractIndividualPhones(clean.Mobile)]));
    
    return clean;
  }

  const clean = {
    Name: "",
    Phone: "",
    Mobile: "",
    Email: "",
    City: "",
    State: "",
    Khoji: "",
    Source: ""
  };
  
  if (row["Sub Program"] !== undefined) {
    clean["Sub Program"] = row["Sub Program"];
  }
  if (row.GHL_ID !== undefined) {
    clean.GHL_ID = String(row.GHL_ID).trim();
  } else if (row.ghl_id !== undefined) {
    clean.GHL_ID = String(row.ghl_id).trim();
  }

  const mappedFields = [];

  // Parse standard fields (by matching lowercase keys)
  Object.entries(row).forEach(([key, val]) => {
    const k = key.trim().toLowerCase();
    const strVal = val === null || val === undefined ? "" : String(val).trim();
    if (!strVal) return;

    if (["ghl_id", "ghl id", "ghlid"].includes(k)) {
      clean.GHL_ID = strVal;
    }
    else if (["name", "caller", "caller name", "lead name", "lead", "name of caller"].includes(k) || k === "first name" || k === "last name") {
      if (k === "last name" && clean.Name) {
        clean.Name = `${clean.Name} ${strVal}`.trim();
      } else if (clean.Name) {
        if (strVal.length > clean.Name.length) clean.Name = strVal;
      } else {
        clean.Name = strVal;
      }
      mappedFields.push("Name");
    }
    else if (["mobile", "mobile no", "mobile number"].includes(k)) {
      clean.Mobile = strVal;
      mappedFields.push("Mobile");
    }
    else if (["phone", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "contact no", "contact_no"].includes(k)) {
      clean.Phone = strVal;
      mappedFields.push("Phone");
    }
    else if (["email", "mail", "e-mail", "email id", "emailaddress"].includes(k)) {
      clean.Email = strVal;
      mappedFields.push("Email");
    }
    else if (["city", "khoji city", "place", "city name", "location"].includes(k)) {
      clean.City = strVal;
      mappedFields.push("City");
    }
    else if (["state", "state name", "province", "region"].includes(k)) {
      clean.State = strVal;
      mappedFields.push("State");
    }
    else if (isKhojiField(k)) {
      clean.Khoji = strVal;
      mappedFields.push("Khoji");
    }
    else if (["tags", "tag"].includes(k)) {
      // Parse tags immediately into array — never store as string
      clean._tagsRaw = parseTags(strVal);
      mappedFields.push("Tags");
    }
    else if (["source of informiton", "source of information"].includes(k)) {
      clean.Source = strVal;
      mappedFields.push("Source");
    }
  });

  if (mappedFields.length > 0) {
    clean._mappedFields = Array.from(new Set(mappedFields));
  }

  // Always ensure normalizedPhone and normalizedMobile are populated
  clean.normalizedPhone = normalizePhone(clean.Phone || "");
  clean.normalizedMobile = normalizePhone(clean.Mobile || "");
  clean.normalizedPhones = Array.from(new Set([...extractIndividualPhones(clean.Phone), ...extractIndividualPhones(clean.Mobile)]));

  return clean;
};

// ─────────────────────────────────────────────
// CONTACTS (MASTER POOL - FLAT DOCUMENT MODEL)
// ─────────────────────────────────────────────

export const importContacts = async (tag, rows) => {
  const MAX_BATCH_OPS = 499;
  let imported = 0;
  
  // Track GHL IDs and phone/mobile numbers processed in this import to prevent internal duplicates in the Excel/GHL sheet
  const processedGhlIds = new Set();
  const processedPhones = new Set();
  const uniqueRowsToImport = [];

  rows.forEach(r => {
    const cleaned = cleanImportRow(r);
    
    // Check local duplicate by GHL_ID
    if (cleaned.GHL_ID) {
      if (processedGhlIds.has(cleaned.GHL_ID)) {
        return; // Skip duplicate within the same sheet
      }
      processedGhlIds.add(cleaned.GHL_ID);
    }

    // Check local duplicate by normalizedPhone and normalizedMobile (cross-matching within the same sheet)
    const normPhone = normalizePhone(cleaned.Phone || "");
    const normMobile = normalizePhone(cleaned.Mobile || "");
    
    if (normPhone) {
      if (processedPhones.has(normPhone)) {
        return; // Skip duplicate within the same sheet
      }
    }
    if (normMobile) {
      if (processedPhones.has(normMobile)) {
        return; // Skip duplicate within the same sheet
      }
    }
    
    if (normPhone) processedPhones.add(normPhone);
    if (normMobile) processedPhones.add(normMobile);
    
    uniqueRowsToImport.push(cleaned);
  });

  // Query Firestore in batches of 30 to check for existing contacts GLOBALLY by GHL_ID
  const existingContactsByGhl = new Map(); // GHL_ID -> Array<{ref, data}>
  const ghlIdsList = Array.from(processedGhlIds).filter(Boolean);
  for (let i = 0; i < ghlIdsList.length; i += 30) {
    const ghlBatch = ghlIdsList.slice(i, i + 30);
    const q = query(
      collection(db, "contacts"),
      where("GHL_ID", "in", ghlBatch)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(docSnap => {
      const data = formatContactDoc(docSnap);
      if (data.GHL_ID) {
        if (!existingContactsByGhl.has(data.GHL_ID)) {
          existingContactsByGhl.set(data.GHL_ID, []);
        }
        existingContactsByGhl.get(data.GHL_ID).push({ ref: docSnap.ref, data });
      }
    });
  }

  // Query Firestore in batches of 30 to check for existing contacts GLOBALLY by normalizedPhones array
  const existingContactsByPhone = new Map(); // normalizedNumber -> Array<{ref, data}>
  const normPhonesList = Array.from(processedPhones).filter(Boolean);
  for (let i = 0; i < normPhonesList.length; i += 30) {
    const phoneBatch = normPhonesList.slice(i, i + 30);
    
    const q = query(
      collection(db, "contacts"),
      where("normalizedPhones", "array-contains-any", phoneBatch)
    );
    
    const snap = await getDocs(q);
    
    snap.docs.forEach(docSnap => {
      const data = formatContactDoc(docSnap);
      // Index under whichever normalized number matches our search batch, with fallback support for older fields
      const phones = Array.isArray(data.normalizedPhones)
        ? data.normalizedPhones
        : [data.normalizedPhone, data.normalizedMobile].filter(Boolean);

      phones.forEach(p => {
        if (phoneBatch.includes(p)) {
          if (!existingContactsByPhone.has(p)) {
            existingContactsByPhone.set(p, []);
          }
          const list = existingContactsByPhone.get(p);
          if (!list.some(item => item.ref.id === docSnap.ref.id)) {
            list.push({ ref: docSnap.ref, data });
          }
        }
      });
    });
  }

  const batchWriteOps = [];

  uniqueRowsToImport.forEach(cleaned => {
    // Find matching existing contacts, prioritizing GHL_ID first, then normalizedPhone/normalizedMobile
    let existingList = [];
    if (cleaned.GHL_ID && existingContactsByGhl.has(cleaned.GHL_ID)) {
      existingList = existingContactsByGhl.get(cleaned.GHL_ID);
    } else {
      const normPhone = normalizePhone(cleaned.Phone || "");
      const normMobile = normalizePhone(cleaned.Mobile || "");
      if (normPhone && existingContactsByPhone.has(normPhone)) {
        existingList = existingContactsByPhone.get(normPhone);
      } else if (normMobile && existingContactsByPhone.has(normMobile)) {
        existingList = existingContactsByPhone.get(normMobile);
      }
    }

    if (existingList.length > 0) {
      existingList.forEach(existing => {
        // Merge new fields into the existing contact document
        const updatePayload = {};
        let needsUpdate = false;

        Object.entries(cleaned).forEach(([k, val]) => {
          // Skip internal helpers and tag fields (handled separately)
          if (k.startsWith("_") || k === "Tags" || k === "tags") return;
          const strVal = val === null || val === undefined ? "" : String(val).trim();
          if (!strVal) return;

          const existingVal = existing.data[k] === null || existing.data[k] === undefined ? "" : String(existing.data[k]).trim();
          if (!existingVal && strVal) {
            updatePayload[k] = strVal;
            needsUpdate = true;
          }
        });

        // Merge _mappedFields metadata
        const existingMapped = existing.data._mappedFields || [];
        const contactMapped = cleaned._mappedFields || [];
        const combinedMapped = Array.from(new Set([...existingMapped, ...contactMapped]));
        if (combinedMapped.length > existingMapped.length) {
          updatePayload._mappedFields = combinedMapped;
          needsUpdate = true;
        }

        // Merge tags (tags array is the SINGLE source of truth)
        const tagsSet = new Set();

        // Absorb existing tags (array + legacy Tags string)
        const existingTagsArr = Array.isArray(existing.data.tags) ? existing.data.tags : [];
        existingTagsArr.forEach(t => parseTags(String(t)).forEach(x => tagsSet.add(x)));
        if (existing.data.Tags) parseTags(existing.data.Tags).forEach(x => tagsSet.add(x));
        if (existing.data.tag) parseTags(existing.data.tag).forEach(x => tagsSet.add(x));

        // Add import tag + tags from the sheet column
        parseTags(tag).forEach(x => tagsSet.add(x));
        (cleaned._tagsRaw || []).forEach(x => tagsSet.add(x));

        const mergedTags = Array.from(tagsSet).sort();
        const existingSorted = [...existingTagsArr].map(t => String(t).trim()).sort();

        if (JSON.stringify(mergedTags) !== JSON.stringify(existingSorted) || existing.data.Tags) {
          updatePayload.tags = mergedTags;
          updatePayload.Tags = deleteField(); // clean up legacy field
          needsUpdate = true;
        }

        // If incoming has GHL_ID but existing doesn't, update it
        if (cleaned.GHL_ID && !existing.data.GHL_ID) {
          updatePayload.GHL_ID = cleaned.GHL_ID;
          needsUpdate = true;
        }

        // Restore soft-deleted contacts if re-imported
        if (existing.data._deleted) {
          updatePayload._deleted = deleteField();
          needsUpdate = true;
        }

        if (needsUpdate) {
          updatePayload.updatedAt = serverTimestamp();
          batchWriteOps.push({
            type: "update",
            ref: existing.ref,
            data: updatePayload
          });
        }
      });
    } else {
      // Create a new flat contact document — tags array is the ONLY tag field
      const contactRef = doc(collection(db, "contacts"));

      const tagsSet = new Set();
      parseTags(tag).forEach(x => tagsSet.add(x));
      (cleaned._tagsRaw || []).forEach(x => tagsSet.add(x));
      const finalTags = Array.from(tagsSet).sort();

      // Strip temp helpers from what we write to Firestore
      const { _tagsRaw, Tags, ...contactFields } = cleaned;

      const newContact = {
        ...contactFields,
        tags: finalTags,
        isAssigned: false,
        assignedTo: null,
        assignedName: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Backwards compatibility:
        programId: tag,
        programName: tag,
        "Sub Program": tag,
        subProgram: tag
      };
      
      batchWriteOps.push({
        type: "set",
        ref: contactRef,
        data: newContact
      });
      imported++;
    }
  });

  // Commit batch operations
  for (let i = 0; i < batchWriteOps.length; i += MAX_BATCH_OPS) {
    const batch = writeBatch(db);
    const slice = batchWriteOps.slice(i, i + MAX_BATCH_OPS);
    slice.forEach(op => {
      if (op.type === "update") {
        batch.update(op.ref, op.data);
      } else {
        batch.set(op.ref, op.data);
      }
    });
    await batch.commit();
  }

  // Update total program stat & subPrograms to maintain backwards compatibility
  const progRef = doc(db, "programs", tag);
  try {
    const progSnap = await getDoc(progRef);
    const countBefore = progSnap.exists() ? (progSnap.data().contactCount || 0) : 0;
    const updateData = {
      name: tag,
      contactCount: countBefore + imported,
      updatedAt: serverTimestamp()
    };
    await setDoc(progRef, updateData, { merge: true });
  } catch (e) {
    console.warn("Failed to update program metadata:", e);
  }

  // Automatically register the active tag
  await registerActiveTag(tag);

  return imported;
};


export const getProgramContactStats = async (tag) => {
  const q = query(
    collection(db, "contacts"),
    where("tags", "array-contains", tag)
  );
  const snap = await getDocs(q);
  const docs = snap.docs.map(d => d.data()).filter(d => !d._deleted);
  const totalCount = docs.length;

  const stats = {
    programName: tag,
    total: totalCount,
    available: 0,
    assigned: 0,
    done: 0,
    callback_scheduled: 0,
    pending: 0,
    called: 0,
    converted: 0
  };

  let poolAssignedCount = 0;

  docs.forEach(data => {
    const s = data.status ? String(data.status).trim() : "";
    if (s !== "" && s.toLowerCase() !== "pending") stats.called++;
    if (s === "Reg.Done") stats.converted++;

    if (data.isAssigned) {
      const isFromPool = data.callType !== "incoming" && data.callType !== "incoming f";
      if (isFromPool) poolAssignedCount++;

      if (data._callbackDue || data.callbackDate) {
        stats.callback_scheduled++;
      } else if (!data.status || data.status === "Pending") {
        stats.assigned++;
      } else {
        stats.done++;
      }
    }
  });

  stats.pending = docs.filter(d => !d.status || d.status === "Pending").length;
  stats.available = Math.max(0, stats.total - poolAssignedCount);
  return stats;
};

// Global Duplicate Detection (checks only assigned contacts with 200ms cancelable debounce & 10-digit min length)
let currentDebounceController = null;


export const checkGlobalDuplicate = async (phone, excludeContactId = null) => {
  if (!phone) return null;
  const digitsOnly = String(phone).replace(/\D/g, "");
  // Minimum 10-digit requirement before firing Firestore query
  if (digitsOnly.length < 10) return null;

  const numbersToCheck = extractIndividualPhones(phone);
  if (numbersToCheck.length === 0) return null;
  
  // Cancel any preceding pending debounce timer if a new key was typed
  if (currentDebounceController) {
    currentDebounceController.cancelled = true;
  }
  const myController = { cancelled: false };
  currentDebounceController = myController;

  // 200ms debounce timer
  await new Promise(resolve => setTimeout(resolve, 200));
  const promises = [];
  numbersToCheck.forEach(norm => {
    promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm))));
    promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhone", "==", norm))));
    promises.push(getDocs(query(collection(db, "contacts"), where("normalizedMobile", "==", norm))));
  });

  const snaps = await Promise.all(promises);
  let totalDocsReturned = 0;
  snaps.forEach(s => totalDocsReturned += s.docs.length);
  
  trackFirestoreRead({
    collection: "contacts",
    operation: "query",
    query: `normalizedPhones/Phone/Mobile in [${numbersToCheck.join(", ")}]`,
    documentsReturned: totalDocsReturned,
    reason: "checkGlobalDuplicate",
    source: "edit/checkGlobalDuplicate"
  });
  
  const matchesMap = new Map();
  snaps.forEach(snap => {
    snap.docs.forEach(d => {
      matchesMap.set(d.id, { id: d.id, ...d.data() });
    });
  });
  
  const matches = Array.from(matchesMap.values())
    .filter(d => d._deleted !== true && d.id !== excludeContactId);
    
  if (matches.length === 0) {
    return null;
  }

  // Collect all unique tags across every duplicate record
  const allTagsSet = new Set();
  matches.forEach(m => {
    const arr = Array.isArray(m.tags) ? m.tags : [];
    arr.forEach(t => String(t).split(",").map(x => x.trim()).filter(Boolean).forEach(x => allTagsSet.add(x)));
    if (m.Tags) String(m.Tags).split(",").map(x => x.trim()).filter(Boolean).forEach(x => allTagsSet.add(x));
  });

  const res = {
    count: matches.length,
    allTags: Array.from(allTagsSet).sort(),
    matches: matches,
    first: matches[0],                   // backward-compat
    programName: matches[0]?.programName // backward-compat
  };

  return res;
};
// ─────────────────────────────────────────────
// ATTENDERS & AUTH PASSWORDS
// ─────────────────────────────────────────────

export const getAttenderContactCount = async (attenderId) => {
  const q = query(
    collection(db, "contacts"),
    and(
      where("isAssigned", "==", true),
      or(
        where("assignedTo", "==", attenderId),
        where("assignedTo", "array-contains", attenderId)
      )
    )
  );
  const snap = await getDocs(q);
  return snap.docs.filter(d => !d.data()._deleted).length;
};


// ─────────────────────────────────────────────
// QUEUE — Assign N contacts to attender
// ─────────────────────────────────────────────

export const assignContactsToAttender = async (tag, programName, attenderId, attenderName, count, subProgramName = null) => {
  let candidates = [];
  let lastDoc = null;
  let attempts = 0;
  const maxAttempts = 10; // Scan up to 10,000 documents to satisfy requested count

  while (candidates.length < count && attempts < maxAttempts) {
    let q;
    if (lastDoc) {
      q = query(
        collection(db, "contacts"),
        where("tags", "array-contains", tag),
        where("isAssigned", "==", false),
        startAfter(lastDoc),
        limit(1000)
      );
    } else {
      q = query(
        collection(db, "contacts"),
        where("tags", "array-contains", tag),
        where("isAssigned", "==", false),
        limit(1000)
      );
    }

    const snap = await getDocs(q);
    if (snap.empty) break;

    lastDoc = snap.docs[snap.docs.length - 1];
    attempts++;

    const batch = snap.docs
      .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
      .filter(c => c.isAssigned === false && !c._deleted);

    const filteredBatch = subProgramName
      ? batch.filter(c => {
          const sp = c["Sub Program"] || c.subProgram || "";
          return sp.trim().toLowerCase() === subProgramName.trim().toLowerCase();
        })
      : batch;

    candidates.push(...filteredBatch);
  }

  if (candidates.length === 0) return 0;

  // Take up to count contacts
  const targetContacts = candidates.slice(0, count);
  if (targetContacts.length === 0) return 0;

  const allAssignedIds = [];
  const CHUNK_SIZE = 200; // max 200 contacts (200 reads + 200 writes = 400 ops, safely under 500 limit)

  for (let i = 0; i < targetContacts.length; i += CHUNK_SIZE) {
    const chunk = targetContacts.slice(i, i + CHUNK_SIZE);
    
    // Perform updates inside a transaction for thread-safety
    const txResult = await runTransaction(db, async (transaction) => {
      // 1. Perform all reads first for this chunk
      const freshSnaps = [];
      for (const contact of chunk) {
        const freshSnap = await transaction.get(contact.ref);
        freshSnaps.push(freshSnap);
      }

      // 2. Perform all writes next for this chunk
      const assignedIds = [];
      for (const freshSnap of freshSnaps) {
        if (!freshSnap.exists()) continue;
        const freshData = freshSnap.data();
        if (freshData.isAssigned === false) {
          const freshStates = freshData.attenderStates || {};
          freshStates[attenderId] = {
            status: "",
            remark: "",
            callType: "outgoing",
            history: [],
            callbackDate: null,
            objectionReason: "",
            lastCalledAt: null,
            firstCalledAt: null,
            attenderName: attenderName,
            updatedAt: new Date().toISOString()
          };

          transaction.update(freshSnap.ref, {
            isAssigned: true,
            assignedTo: [attenderId],
            assignedName: attenderName,
            attenderId: attenderId, // for compatibility
            attenderName: attenderName, // for compatibility
            callType: "outgoing",
            assignedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            attenderStates: freshStates
          });
          assignedIds.push(freshSnap.id);
        }
      }
      return assignedIds;
    });

    if (Array.isArray(txResult)) {
      allAssignedIds.push(...txResult);
    }
  }

  const totalAssigned = allAssignedIds.length;
  if (totalAssigned > 0) {
    await updateCacheContacts(allAssignedIds);
  }
  return totalAssigned;
};

// ─────────────────────────────────────────────
// CALL LOGS — Attender's Personal Sheet
// ─────────────────────────────────────────────

// In-memory registry of active partition snapshots to eliminate getDocs reads during updates
const globalActivePartitionsCache = {};


export const updateCallLogDirectFirebase = async (logId, updates, attenderId = null, attenderName = null, existingContact = null) => {
  const contactRef = doc(db, "contacts", logId);
  
  let previousStatus = "";
  let logData = {};

  if (existingContact) {
    logData = existingContact;
    console.log(
      "%c⚡ [0-READ CACHE HIT - updateCallLogDirectFirebase]",
      "background: #065f46; color: #34d399; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
      `Bypassed getDoc using existingContact for "${logData.Name || logId}" (${logId}) | 0 Firestore Reads`
    );
  } else {
    try {
      const logSnap = await getDoc(contactRef);
      console.log(
        `[FIRESTORE READ]\ncollection: contacts\noperation: getDoc\ndocument: ${logId}\ndocuments_returned: ${logSnap.exists() ? 1 : 0}\nestimated_read_cost: 1\nreason: updateCallLogDirectFirebase`
      );
      if (logSnap.exists()) {
        logData = logSnap.data();
      }
    } catch (e) {
      console.warn("Failed to fetch contact data in updateCallLogDirectFirebase", e);
    }
  }

  if (attenderId && logData.attenderStates?.[attenderId]?.status !== undefined) {
    previousStatus = logData.attenderStates[attenderId].status || "";
  } else {
    previousStatus = logData.status || "";
  }

  // Format Name if modified
  const nameKeys = ["Name", "name", "caller", "caller name", "lead name", "lead", "name of caller"];
  const updatedNameKey = Object.keys(updates).find(k => nameKeys.includes(k) || k.toLowerCase().includes("name"));
  if (updatedNameKey && typeof updates[updatedNameKey] === "string" && updatedNameKey.toLowerCase() !== "attendername" && updatedNameKey.toLowerCase() !== "programname") {
    updates[updatedNameKey] = formatContactName(updates[updatedNameKey]);
  }

  // Update normalizedPhone and normalizedMobile if phone/mobile fields are modified
  const phoneFields = ["Phone", "phone number", "phone", "whatsapp"];
  const mobileFields = ["Mobile", "mobile number", "mobile no", "mobile"];
  
  const updatedPhoneKey = Object.keys(updates).find(k => phoneFields.includes(k) || k.toLowerCase().includes("phone"));
  const updatedMobileKey = Object.keys(updates).find(k => mobileFields.includes(k) || k.toLowerCase().includes("mobile"));
  
  if (updatedPhoneKey) {
    updates.normalizedPhone = normalizePhone(updates[updatedPhoneKey]);
  }
  if (updatedMobileKey) {
    updates.normalizedMobile = normalizePhone(updates[updatedMobileKey]);
  }
  if (updatedPhoneKey || updatedMobileKey) {
    const phVal = updatedPhoneKey ? updates[updatedPhoneKey] : (logData.Phone || logData.phone || "");
    const mbVal = updatedMobileKey ? updates[updatedMobileKey] : (logData.Mobile || logData.mobile || "");
    updates.normalizedPhones = Array.from(new Set([...extractIndividualPhones(phVal), ...extractIndividualPhones(mbVal)]));
  }

  // When Tags string is edited (from EditModal), convert to tags array and remove Tags field
  if (updates.Tags !== undefined) {
    updates.tags = parseTags(String(updates.Tags || "")).sort();
    updates.Tags = deleteField(); // remove legacy string — array is the source of truth
  }
  // Also handle a raw tags array update — ensure no stale Tags string survives
  if (updates.tags !== undefined && updates.Tags === undefined) {
    updates.Tags = deleteField();
  }

  if (updates.status === "Reg.Done") {
    updates.callbackDate = null;
    updates.callbackStatus = null;
  }

  // Split updates into shared (top-level) and attender-specific (nested)
  const sharedUpdates = {};
  const attenderSpecificUpdates = {};

  const attenderSpecificFields = [
    "status", "remark", "callType", "history", "callbackDate", "callbackStatus",
    "objectionReason", "lastCalledAt", "firstCalledAt", "registeredYearMonth",
    "Source", "Called For", "source", "calledFor", "called_for", "sourse"
  ];

  Object.keys(updates).forEach(key => {
    if (attenderSpecificFields.includes(key)) {
      attenderSpecificUpdates[key] = updates[key];
    } else {
      sharedUpdates[key] = updates[key];
    }
  });

  const finalUpdatePayload = {
    ...sharedUpdates,
    updatedAt: serverTimestamp()
  };
  // If we have an attenderId, put the attenderSpecificUpdates into the attenderStates map
  if (attenderId) {
    // If registeredYearMonth is being set to Reg.Done or removed, we update it here
    if (attenderSpecificUpdates.status === "Reg.Done" && previousStatus !== "Reg.Done") {
      const utc = new Date().getTime() + (new Date().getTimezoneOffset() * 60000);
      const istDate = new Date(utc + (3600000 * 5.5));
      const yearMonth = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, "0")}`;
      attenderSpecificUpdates.registeredYearMonth = yearMonth;
      finalUpdatePayload.registeredYearMonth = yearMonth;
    } else if (previousStatus === "Reg.Done" && attenderSpecificUpdates.status !== undefined && attenderSpecificUpdates.status !== "Reg.Done") {
      // Solution 2: Only remove top-level registeredYearMonth if no other attender has registered this lead
      let hasOtherRegistration = false;
      if (logData.attenderStates) {
        Object.keys(logData.attenderStates).forEach(aId => {
          if (aId !== attenderId && logData.attenderStates[aId]?.status === "Reg.Done") {
            hasOtherRegistration = true;
          }
        });
      }
      if (!hasOtherRegistration) {
        attenderSpecificUpdates.registeredYearMonth = deleteField();
        finalUpdatePayload.registeredYearMonth = deleteField();
      }
    }

    // Set attenderName and update time for last-edited tracking within attenderStates
    attenderSpecificUpdates.attenderName = attenderName || logData.attenderStates?.[attenderId]?.attenderName || "Attender";
    attenderSpecificUpdates.updatedAt = new Date().toISOString();

    // Use dot notation to merge only this attender's keys
    Object.keys(attenderSpecificUpdates).forEach(k => {
      finalUpdatePayload[`attenderStates.${attenderId}.${k}`] = attenderSpecificUpdates[k];
    });

    // Also update top-level compatibility fields if they are updated by this user
    if (attenderSpecificUpdates.status !== undefined) {
      let finalStatus = attenderSpecificUpdates.status;

      // Solution 2: Prevent downgrade if another attender has registered this lead
      if (finalStatus !== "Reg.Done") {
        let hasOtherRegistration = false;
        if (logData.attenderStates) {
          Object.keys(logData.attenderStates).forEach(aId => {
            if (aId !== attenderId && logData.attenderStates[aId]?.status === "Reg.Done") {
              hasOtherRegistration = true;
            }
          });
        }
        if (hasOtherRegistration) {
          finalStatus = "Reg.Done";
        }
      }
      finalUpdatePayload.status = finalStatus;
    }

    if (attenderSpecificUpdates.remark !== undefined) finalUpdatePayload.remark = attenderSpecificUpdates.remark;
    if (attenderSpecificUpdates.callbackDate !== undefined) finalUpdatePayload.callbackDate = attenderSpecificUpdates.callbackDate;
    if (attenderSpecificUpdates.callType !== undefined) finalUpdatePayload.callType = attenderSpecificUpdates.callType;
    if (attenderSpecificUpdates.history !== undefined) finalUpdatePayload.history = attenderSpecificUpdates.history;

    const sourceVal = attenderSpecificUpdates.Source ?? attenderSpecificUpdates.source ?? attenderSpecificUpdates.sourse;
    if (sourceVal !== undefined) {
      finalUpdatePayload.Source = sourceVal;
      finalUpdatePayload.source = sourceVal;
      finalUpdatePayload[`attenderStates.${attenderId}.Source`] = sourceVal;
      finalUpdatePayload[`attenderStates.${attenderId}.source`] = sourceVal;
    }

    const calledForVal = attenderSpecificUpdates["Called For"] ?? attenderSpecificUpdates.calledFor ?? attenderSpecificUpdates.called_for;
    if (calledForVal !== undefined) {
      finalUpdatePayload["Called For"] = calledForVal;
      finalUpdatePayload.calledFor = calledForVal;
      finalUpdatePayload[`attenderStates.${attenderId}.Called For`] = calledForVal;
      finalUpdatePayload[`attenderStates.${attenderId}.calledFor`] = calledForVal;
    }
    
    // Track who did the last edit
    finalUpdatePayload.lastEditedBy = attenderSpecificUpdates.attenderName;
    finalUpdatePayload.lastEditedAt = new Date().toISOString();

    // Also ensure this attender is in the assignedTo array so the lead appears in their call sheet
    const prevAssigned = Array.isArray(logData.assignedTo)
      ? [...logData.assignedTo]
      : (logData.assignedTo ? [logData.assignedTo] : []);
    if (!prevAssigned.includes(attenderId)) {
      prevAssigned.push(attenderId);
    }
    finalUpdatePayload.assignedTo = prevAssigned;
    finalUpdatePayload.isAssigned = true;
    sharedUpdates.assignedTo = prevAssigned;
    sharedUpdates.isAssigned = true;
  } else {
    Object.assign(finalUpdatePayload, attenderSpecificUpdates);
  }

  // Strip out undefined fields
  Object.keys(finalUpdatePayload).forEach(key => {
    if (finalUpdatePayload[key] === undefined) {
      delete finalUpdatePayload[key];
    }
  });

  // Separate root-level/custom fields from deep attenderStates updates.
  // This is because updateDoc/batch.update parses keys as paths (crashing on special chars like '/' in custom headers),
  // whereas setDoc/batch.set with merge: true does not parse keys (but fails to parse dot-notation nested maps).
  const rootPayload = {};
  const deepUpdates = {};

  Object.keys(finalUpdatePayload).forEach(key => {
    if (key.startsWith("attenderStates.")) {
      deepUpdates[key] = finalUpdatePayload[key];
    } else {
      rootPayload[key] = finalUpdatePayload[key];
    }
  });

  const mergedAttenderStates = { ...(logData.attenderStates || {}) };
  if (attenderId) {
    mergedAttenderStates[attenderId] = {
      ...(mergedAttenderStates[attenderId] || {}),
      ...attenderSpecificUpdates
    };
  }
  const freshData = {
    ...logData,
    ...sharedUpdates,
    attenderStates: mergedAttenderStates,
    updatedAt: new Date()
  };

  // Execute atomically using a writeBatch to update contacts, callCenterCache, and registrationsCache together
  const cleanRootPayload = sanitizeForFirestore(rootPayload);
  const cleanDeepUpdates = sanitizeForFirestore(deepUpdates);
  console.log(`[FIRESTORE BATCH WRITE] Contact ID: ${logId}`, { rootPayload: cleanRootPayload, deepUpdates: cleanDeepUpdates });
  
  const batch = writeBatch(db);
  if (Object.keys(cleanRootPayload).length > 0) {
    batch.set(contactRef, cleanRootPayload, { merge: true });
  }
  if (Object.keys(cleanDeepUpdates).length > 0) {
    batch.update(contactRef, cleanDeepUpdates);
  }

  // 2. Dual Write: callCenterCache partition document
  const currentMonth = getMonthStr(new Date());

  // Track document paths being written in this batch
  const batchPaths = [`contacts/${logId}`, `callCenterCache/${currentMonth}`];
  const cacheRef = doc(db, "callCenterCache", currentMonth);
  const prunedForCache = sanitizeForFirestore(pruneContactForCacheForMonth({ id: logId, ...freshData }, currentMonth));
  batch.set(cacheRef, { contacts: { [logId]: prunedForCache } }, { merge: true });

  let isRegDone = updates.status === "Reg.Done" || freshData.status === "Reg.Done";
  let registrationId = null;
  let regPayload = null;

  // 3. Dual Write: registrations + registrationsCache if status is Reg.Done
  if (isRegDone) {
    const calledForVal = freshData["Called For"] || freshData.calledFor || freshData.called_for || freshData.programName || "Incoming Calls";
    const cleanedCalledFor = String(calledForVal).trim().replace(/[^a-zA-Z0-9]/g, "_");
    registrationId = `${logId}_${cleanedCalledFor}`;
    const regRef = doc(db, "registrations", registrationId);
    const regCacheRef = doc(db, "registrationsCache", currentMonth);

    const rawRegPayload = {
      ...freshData,
      id: logId,
      registrationId,
      registeredYearMonth: currentMonth,
      registeredAt: serverTimestamp(),
      conversionSource: freshData.Source || freshData.sourse || "Direct",
      convertedBy: attenderName || freshData.attenderName || "Unknown",
      programName: freshData.programName || "Incoming Calls"
    };

    const hasUndefinedFields = checkHasUndefinedFields(rawRegPayload);
    regPayload = sanitizeForFirestore(rawRegPayload);

    console.log("[REGISTRATION BATCH]", {
      registrationId,
      payload: regPayload,
      hasUndefinedFields
    });

    batch.set(regRef, regPayload, { merge: true });
    batch.set(regCacheRef, { registrations: { [registrationId]: regPayload } }, { merge: true });
    batchPaths.push(`registrations/${registrationId}`, `registrationsCache/${currentMonth}`);
    registerRegistrationMonth(currentMonth).catch(() => {});
    updateLocalRegistrationsCache(regPayload).catch(() => {});
  }

  try {
    await batch.commit();

    if (isRegDone && registrationId) {
      console.log("[REGISTRATION BATCH SUCCESS]", {
        registrationId,
        writes: [`registrations/${registrationId}`, `registrationsCache/${currentMonth}`]
      });
    }

    trackFirestoreWrite({
      operation: "batch",
      paths: batchPaths,
      writeCount: batchPaths.length,
      reason: `updateCallLog ("${freshData.Name || logId}")`,
      contactId: logId
    });
  } catch (error) {
    if (isRegDone) {
      console.error("[REGISTRATION BATCH FAILED]", error);
    }
    throw error;
  }

  // Handle "Reg.Done" registrations collection sync (only when status/program changed, saving 1 read per save)
  const registrationSyncRequired = 
    updates.status === "Reg.Done" || 
    previousStatus === "Reg.Done" || 
    updates["Called For"] !== undefined ||
    updates.calledFor !== undefined ||
    updates.called_for !== undefined;

  if (registrationSyncRequired || freshData._deleted) {
    try {
      if (!freshData || freshData._deleted) {
        // If contact is deleted, clean up all its registration snapshots
        const q = query(
          collection(db, "registrations"),
          where(documentId(), ">=", logId),
          where(documentId(), "<=", logId + "\uf8ff")
        );
        const existingRegsSnap = await getDocs(q);
        for (const regDoc of existingRegsSnap.docs) {
          await deleteDoc(regDoc.ref);
        }
      } else {
      // Gather all historical entries to find all valid Reg.Done programs
      const allHistory = [];
      if (Array.isArray(freshData.history)) {
        allHistory.push(...freshData.history);
      }
      if (freshData.attenderStates) {
        Object.values(freshData.attenderStates).forEach(state => {
          if (Array.isArray(state.history)) {
            allHistory.push(...state.history);
          }
        });
      }

      // Identify all programs for which this contact has registered (status = "Reg.Done")
      const registeredPrograms = [];
      allHistory.forEach(h => {
        if (h.status === "Reg.Done") {
          const prog = h.calledFor || h.programName || freshData["Called For"] || freshData.calledFor || freshData.programName || "Incoming Calls";
          const cleanProg = String(prog).trim();
          if (cleanProg && !registeredPrograms.some(p => p.name.toLowerCase() === cleanProg.toLowerCase())) {
            registeredPrograms.push({
              name: cleanProg,
              timestamp: h.timestamp || null,
              attenderName: h.attenderName || "Unknown",
              source: h.source || freshData.Source || freshData.source || "Direct"
            });
          }
        }
      });

      // Legacy/Fallback: check if current status is Reg.Done
      const currentProg = freshData["Called For"] || freshData.calledFor || freshData.called_for || freshData.programName || "Incoming Calls";
      if (freshData.status === "Reg.Done" && currentProg) {
        const cleanProg = String(currentProg).trim();
        if (!registeredPrograms.some(p => p.name.toLowerCase() === cleanProg.toLowerCase())) {
          registeredPrograms.push({
            name: cleanProg,
            timestamp: freshData.registeredAt || freshData.updatedAt || null,
            attenderName: freshData.attenderName || freshData.assignedName || "Unknown",
            source: freshData.Source || freshData.source || "Direct"
          });
        }
      }
      if (freshData.attenderStates) {
        Object.values(freshData.attenderStates).forEach(state => {
          if (state.status === "Reg.Done") {
            const stateProg = state["Called For"] || state.calledFor || currentProg || "Unknown";
            const cleanProg = String(stateProg).trim();
            if (!registeredPrograms.some(p => p.name.toLowerCase() === cleanProg.toLowerCase())) {
              registeredPrograms.push({
                name: cleanProg,
                timestamp: state.lastCalledAt || state.updatedAt || null,
                attenderName: state.attenderName || "Unknown",
                source: state.Source || state.source || freshData.Source || freshData.source || "Direct"
              });
            }
          }
        });
      }

      // Fetch all existing registration documents for this contact
      const q = query(
        collection(db, "registrations"),
        where(documentId(), ">=", logId),
        where(documentId(), "<=", logId + "\uf8ff")
      );
      const existingRegsSnap = await getDocs(q);
      const existingRegMap = {};
      existingRegsSnap.docs.forEach(docSnap => {
        existingRegMap[docSnap.id] = docSnap.ref;
      });

      const activeRegIds = new Set();

      // Write or update active registrations
      for (const rp of registeredPrograms) {
        const cleanedCalledFor = String(rp.name).trim().replace(/[^a-zA-Z0-9]/g, "_");
        const registrationId = `${logId}_${cleanedCalledFor}`;
        activeRegIds.add(registrationId);

        // Determine registration month (IST)
        const regDate = rp.timestamp 
          ? (typeof rp.timestamp.toDate === "function" ? rp.timestamp.toDate() : new Date(rp.timestamp)) 
          : new Date();
        const utc = regDate.getTime() + (regDate.getTimezoneOffset() * 60000);
        const istDate = new Date(utc + (3600000 * 5.5));
        const yearMonth = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, "0")}`;

        const payload = {
          ...freshData,
          status: "Reg.Done",
          registeredYearMonth: yearMonth,
          registeredAt: rp.timestamp || serverTimestamp(),
          conversionSource: rp.source || "Direct",
          convertedBy: rp.attenderName || "Unknown",
          calledFor: rp.name,
          programName: freshData.programName || rp.name || "Unknown"
        };

        const cleanPayload = sanitizeForFirestore(payload);

        await setDoc(doc(db, "registrations", registrationId), cleanPayload, { merge: true });
        trackFirestoreWrite({
          operation: "setDoc",
          paths: [`registrations/${registrationId}`],
          writeCount: 1,
          reason: "syncRegistrationForContact",
          contactId: logId
        });
        await registerRegistrationMonth(yearMonth);
        updateLocalRegistrationsCache({ ...payload, registrationId }).catch(() => {});
      }

      // Delete any outdated/orphan registrations for this contact
      for (const [id, ref] of Object.entries(existingRegMap)) {
        if (!activeRegIds.has(id)) {
          await deleteDoc(ref);
          trackFirestoreWrite({
            operation: "deleteDoc",
            paths: [`registrations/${id}`],
            writeCount: 1,
            reason: "syncRegistrationForContact (orphan cleanup)",
            contactId: logId
          });
        }
      }
    }
  } catch (e) {
    console.error("Error during registration sync:", e);
  }
}
// Option A Scoped Sync: Contacts collection is the direct source of truth (0 extra callCenterCache reads/writes)
};


export const updateCallLog = async (logId, updates, attenderId = null, attenderName = null, existingContact = null) => {
  console.log(`[UPDATE CALL LOG] Initiating instant 0ms local save for contactId: ${logId}`);
  // 1. Instantly update local IndexedDB cache for 0ms UI response
  if (attenderId) {
    await updateLocalAttenderCache(attenderId, { ...existingContact, ...updates, id: logId });
  }

  // 2. Trigger direct write to Firebase asynchronously in the background
  updateCallLogDirectFirebase(logId, updates, attenderId, attenderName, existingContact)
    .then(() => {
      console.log(`[UPDATE CALL LOG SUCCESS] Firebase write completed for contactId: ${logId}`);
    })
    .catch(err => {
      console.warn("⚠️ Firebase write deferred to pending queue:", err?.message || err);
      queuePendingWrite("updateCallLog", { logId, updates, attenderId, attenderName, existingContact });
    });

  return { success: true, synced: false, localId: logId, updatedLead: { ...existingContact, ...updates, id: logId } };
};

// ─────────────────────────────────────────────
// Remove a single attender's access to a contact
// without affecting any other attender's data.
// Removes the attender from assignedTo[] and clears
// their attenderStates entry.
// ─────────────────────────────────────────────

export const removeAttenderFromContact = async (contactId, attenderId) => {
  const contactRef = doc(db, "contacts", contactId);
  const snap = await getDoc(contactRef);
  if (!snap.exists()) return;
  const data = snap.data();

  let newAssignedTo = null;
  let isAssignedVal = false;
  let assignedNameVal = null;
  let attenderIdVal = null;
  let attenderNameVal = null;

  if (Array.isArray(data.assignedTo)) {
    const filtered = data.assignedTo.filter(id => id !== attenderId);
    if (filtered.length > 0) {
      newAssignedTo = filtered;
      isAssignedVal = true;
      const firstId = filtered[0];
      const state = data.attenderStates?.[firstId] || {};
      assignedNameVal = state.attenderName || data.assignedName || "Attender";
      attenderIdVal = firstId;
      attenderNameVal = assignedNameVal;
    }
  } else if (data.assignedTo && data.assignedTo !== attenderId) {
    newAssignedTo = data.assignedTo;
    isAssignedVal = true;
    assignedNameVal = data.assignedName;
    attenderIdVal = data.attenderId;
    attenderNameVal = data.attenderName;
  }

  await updateDoc(contactRef, {
    isAssigned: isAssignedVal,
    assignedTo: newAssignedTo,
    assignedName: assignedNameVal,
    attenderId: attenderIdVal,
    attenderName: attenderNameVal,
    [`attenderStates.${attenderId}._hidden`]: true,
  });
  await updateCacheContacts([contactId]);
};

// ────────────────────────────────────────────
// CALL LOGS — Attender's Personal Sheet
// ─────────────────────────────────────────────

// Add a manual incoming or outgoing call entry

export const addIncomingCallLogDirectFirebase = async (attenderId, attenderName, data, programId = null, programName = null) => {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const isIncoming = data.callType === "incoming" || data.callType === "incoming f";
  const defaultProgramName = isIncoming ? "Incoming Calls" : "Outgoing Calls";
  const defaultProgramId = isIncoming ? "incoming-calls" : "outgoing-calls";

  const finalProgramName = programName || defaultProgramName;
  const finalProgramId = programId || defaultProgramId;

  const tagsSet = new Set();
  (Array.isArray(data.tags) ? data.tags : []).forEach(t => parseTags(String(t)).forEach(x => tagsSet.add(x)));
  if (data.Tags) parseTags(data.Tags).forEach(x => tagsSet.add(x));
  tagsSet.add(finalProgramName);
  const finalTags = Array.from(tagsSet).sort();

  // Never store Tags string — only the array
  const { Tags: _ignored, tags: _ignored2, ...rest } = data;

  const normPhone = normalizePhone(rest.Phone || rest["Cont No"] || rest.phone || rest.Number || "");
  const normMobile = normalizePhone(rest.Mobile || "");
  const finalNormalizedPhones = Array.from(new Set([
    ...extractIndividualPhones(rest.Phone || rest["Cont No"] || rest.phone || rest.Number || ""),
    ...extractIndividualPhones(rest.Mobile || "")
  ]));

  let docRef = null;
  let isExisting = false;
  let existingDocId = null;
  let existingData = {};

  if (finalNormalizedPhones.length > 0) {
    try {
      const q3 = query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", finalNormalizedPhones));
      const timeoutLookup = new Promise(resolve => setTimeout(() => resolve({ empty: true, docs: [] }), 1500));
      const snap3 = await Promise.race([getDocs(q3), timeoutLookup]);
      
      const mergedDocs = snap3.docs || [];
      console.log(
        `[FIRESTORE READ]\ncollection: contacts\noperation: query\nquery: normalizedPhones array-contains-any [${finalNormalizedPhones.join(", ")}]\ndocuments_returned: ${mergedDocs.length}\nestimated_read_cost: ${mergedDocs.length}\nreason: addIncomingCallLog (Phone Lookup)`
      );
      const existingSnap = { empty: mergedDocs.length === 0, docs: mergedDocs };

      if (!existingSnap.empty) {
        // Find ANY existing active document
        const matchDoc = existingSnap.docs.find(docSnap => docSnap.data()._deleted !== true) || existingSnap.docs[0];
        if (matchDoc) {
          isExisting = true;
          existingDocId = matchDoc.id;
          existingData = matchDoc.data();
        }
      }
    } catch (e) {
      console.warn("[addIncomingCallLog] Phone/Mobile lookup failed:", e);
    }
  }

  // Calculate new assignedTo array
  const prevAssigned = isExisting
    ? (Array.isArray(existingData.assignedTo)
        ? existingData.assignedTo
        : (existingData.assignedTo ? [existingData.assignedTo] : []))
    : [];
  const assignedToSet = new Set(prevAssigned.filter(Boolean));
  if (attenderId) {
    assignedToSet.add(attenderId);
  }
  const newAssignedTo = Array.from(assignedToSet);

  // Initialize or fetch attender-specific state
  const prevStates = isExisting ? (existingData.attenderStates || {}) : {};
  const currentAttState = attenderId ? (prevStates[attenderId] || {}) : {};
  
  const callTimeISO = data.callTimestamp ? new Date(data.callTimestamp).toISOString() : new Date().toISOString();

  // Create history entry
  const historyEntry = {
    timestamp: callTimeISO,
    attenderId,
    attenderName,
    status: data.status || "Call Log Added",
    remark: data.remark || "",
    calledFor: data["Called For"] || data.calledFor || "",
    source: data.Source || data.source || data.Sourse || data.sourse || "",
    callType: data.callType || "incoming"
  };

  // Merge history for this attender
  const prevHistory = Array.isArray(currentAttState.history) ? currentAttState.history : [];
  const newHistory = [...prevHistory, historyEntry];

  const targetCallbackStatus = data.status === "Reg.Done" ? null : (data.callbackStatus !== undefined ? data.callbackStatus : (currentAttState.callbackStatus || ""));
  const targetCallbackDate = data.status === "Reg.Done" ? null : (data.callbackDate !== undefined ? data.callbackDate : (currentAttState.callbackDate || null));

  // Update attender-specific states
  const updatedStates = { ...prevStates };
  if (attenderId) {
    updatedStates[attenderId] = {
      ...currentAttState,
      status: data.status !== undefined ? data.status : (currentAttState.status || ""),
      remark: data.remark !== undefined ? data.remark : (currentAttState.remark || ""),
      callType: data.callType || currentAttState.callType || "incoming",
      history: newHistory,
      callbackDate: targetCallbackDate,
      callbackStatus: targetCallbackStatus,
      objectionReason: data.objectionReason !== undefined ? data.objectionReason : (currentAttState.objectionReason || ""),
      Source: data.Source !== undefined ? data.Source : (currentAttState.Source || ""),
      "Called For": data["Called For"] !== undefined ? data["Called For"] : (currentAttState["Called For"] || ""),
      lastCalledAt: callTimeISO,
      firstCalledAt: currentAttState.firstCalledAt || callTimeISO,
      attenderName: attenderName,
      updatedAt: new Date().toISOString()
    };
  }

  // Format Name:
  const rawName = rest.Name || existingData.Name || "";
  const formattedName = formatContactName(rawName);

  // Build the unified log document data
  const baseProfile = {
    Name: formattedName,
    Email: rest.Email || existingData.Email || "",
    City: rest.City || existingData.City || "",
    State: rest.State || existingData.State || "",
    Mobile: rest.Mobile || existingData.Mobile || "",
    Phone: rest.Phone || existingData.Phone || "",
    Khoji: rest.Khoji || existingData.Khoji || "",
    Source: rest.Source || existingData.Source || "",
    "Called For": rest["Called For"] || existingData["Called For"] || "",
    "Program / Tag Mapping": rest["Program / Tag Mapping"] || existingData["Program / Tag Mapping"] || "",
    GHL_ID: rest.GHL_ID || existingData.GHL_ID || "",
    normalizedPhone: normPhone || existingData.normalizedPhone || "",
    normalizedMobile: normMobile || existingData.normalizedMobile || "",
    normalizedPhones: Array.from(new Set([
      ...finalNormalizedPhones,
      ...(Array.isArray(existingData.normalizedPhones) ? existingData.normalizedPhones : [])
    ]))
  };

  // Merge tags
  const mergedTagsSet = new Set(finalTags);
  if (isExisting && Array.isArray(existingData.tags)) {
    existingData.tags.forEach(t => mergedTagsSet.add(t));
  }
  const mergedTags = Array.from(mergedTagsSet).sort();

  const logPayload = {
    ...existingData,
    ...baseProfile,
    ...Object.keys(rest).reduce((acc, k) => {
      const attFields = ["status", "remark", "callType", "callbackDate", "objectionReason"];
      if (!attFields.includes(k) && !Object.keys(baseProfile).includes(k)) {
        acc[k] = rest[k];
      }
      return acc;
    }, {}),
    isAssigned: true,
    assignedTo: newAssignedTo,
    assignedName: attenderName,
    attenderId: attenderId, // compatibility
    attenderName: attenderName, // compatibility
    lastEditedBy: attenderName,
    lastEditedAt: new Date().toISOString(),
    lastCalledAt: new Date().toISOString(),
    callType: data.callType || currentAttState.callType || "incoming",
    status: data.status !== undefined ? data.status : (currentAttState.status || "Call Log Added"),
    remark: data.remark !== undefined ? data.remark : (currentAttState.remark || ""),
    callbackDate: targetCallbackDate,
    callbackStatus: targetCallbackStatus,
    objectionReason: data.objectionReason !== undefined ? data.objectionReason : (currentAttState.objectionReason || ""),
    tags: mergedTags,
    attenderStates: updatedStates,
    updatedAt: new Date().toISOString(),
    programId: finalProgramId,
    programName: finalProgramName,
    "Sub Program": finalProgramName,
    subProgram: finalProgramName,
    isManualEntry: true
  };

  if (isExisting && existingData.createdAt) {
    logPayload.createdAt = existingData.createdAt;
  } else {
    logPayload.createdAt = new Date().toISOString();
  }

  if (data.status === "Reg.Done") {
    logPayload.registeredYearMonth = yearMonth;
    logPayload.callbackDate = null;
    logPayload.callbackStatus = null;
  }

  // Strip out undefined fields
  Object.keys(logPayload).forEach(key => {
    if (logPayload[key] === undefined) {
      delete logPayload[key];
    }
  });

  const batch = writeBatch(db);
  let finalId = existingDocId;

  const batchPaths = [];

  if (isExisting && existingDocId) {
    const contactRef = doc(db, "contacts", existingDocId);
    const { attenderStates, ...restPayload } = logPayload;
    const dotPayload = {
      ...restPayload,
      _deleted: deleteField(),
      [`attenderStates.${attenderId}`]: updatedStates[attenderId]
    };
    batch.set(contactRef, dotPayload, { merge: true });
    docRef = { id: existingDocId };
    batchPaths.push(`contacts/${existingDocId}`);
  } else {
    const newDocRef = doc(collection(db, "contacts"));
    finalId = newDocRef.id;
    docRef = { id: finalId };
    batch.set(newDocRef, sanitizeForFirestore(logPayload));
    batchPaths.push(`contacts/${finalId}`);
  }

  // Dual Write to Admin Read Model (callCenterCache partition)
  const prunedCacheContact = sanitizeForFirestore(pruneContactForCacheForMonth({ id: finalId, ...logPayload }, yearMonth));
  const cacheRef = doc(db, "callCenterCache", yearMonth);
  batch.set(cacheRef, { contacts: { [finalId]: prunedCacheContact } }, { merge: true });
  batchPaths.push(`callCenterCache/${yearMonth}`);

  let isAddRegDone = data.status === "Reg.Done";
  let addRegId = null;

  // Dual Write if Reg.Done (registrations MASTER + registrationsCache ADMIN READ MODEL)
  if (isAddRegDone) {
    const rawPayload = {
      ...logPayload,
      id: finalId,
      registeredYearMonth: yearMonth,
      registeredAt: serverTimestamp(),
      conversionSource: logPayload.Source || logPayload.Sourse || "Direct",
      convertedBy: attenderName || "Unknown",
      programName: logPayload.programName || "Incoming Calls"
    };

    const hasUndefinedFields = checkHasUndefinedFields(rawPayload);
    const payload = sanitizeForFirestore(rawPayload);

    const calledForVal = payload["Called For"] || payload.calledFor || payload.called_for || payload.programName || "Incoming Calls";
    const cleanedCalledFor = String(calledForVal).trim().replace(/[^a-zA-Z0-9]/g, "_");
    addRegId = `${finalId}_${cleanedCalledFor}`;

    console.log("[REGISTRATION BATCH]", {
      registrationId: addRegId,
      payload,
      hasUndefinedFields
    });

    const regRef = doc(db, "registrations", addRegId);
    const regCacheRef = doc(db, "registrationsCache", yearMonth);

    batch.set(regRef, payload, { merge: true });
    batch.set(regCacheRef, { registrations: { [addRegId]: payload } }, { merge: true });
    batchPaths.push(`registrations/${addRegId}`, `registrationsCache/${yearMonth}`);
    registerRegistrationMonth(yearMonth).catch(() => {});
    updateLocalRegistrationsCache({ ...payload, registrationId: addRegId }).catch(() => {});
  }

  // Commit all writes atomically in ONE single network call!
  try {
    await batch.commit();

    if (isAddRegDone && addRegId) {
      console.log("[REGISTRATION BATCH SUCCESS]", {
        registrationId: addRegId,
        writes: [`registrations/${addRegId}`, `registrationsCache/${yearMonth}`]
      });
    }

    trackFirestoreWrite({
      operation: "batch",
      paths: batchPaths,
      writeCount: batchPaths.length,
      reason: `addIncomingCallLog ("${logPayload.Name || finalId}")`,
      contactId: finalId
    });
  } catch (error) {
    if (isAddRegDone) {
      console.error("[REGISTRATION BATCH FAILED]", error);
    }
    throw error;
  }

  // Register tag in active tags collection
  await registerActiveTag(finalProgramName);

  if (attenderId && finalId) {
    const freshCacheLead = {
      ...logPayload,
      id: finalId,
      Name: logPayload.Name || data.Name || data.name || "New Lead",
      Phone: logPayload.Phone || data.Phone || data.phone || "",
      status: logPayload.status || data.status || "Call Log Added",
      createdAt: logPayload.createdAt || new Date().toISOString()
    };
    await updateLocalAttenderCache(attenderId, freshCacheLead).catch(() => {});
  }

  return docRef.id;
};


export const addIncomingCallLog = async (attenderId, attenderName, data, programId = null, programName = null) => {
  const localId = `local_inc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const nowISO = new Date().toISOString();
  const targetStatus = data.status !== undefined && data.status !== null && String(data.status).trim() !== "" 
    ? data.status 
    : "Call Log Added";

  const newLeadDoc = {
    ...data,
    id: localId,
    Name: formatContactName(data.Name || data.name || "New Lead"),
    Phone: data.Phone || data.phone || "",
    callType: data.callType || "incoming",
    status: targetStatus,
    remark: data.remark || "",
    callbackDate: data.callbackDate || null,
    callbackStatus: data.callbackStatus || null,
    objectionReason: data.objectionReason || "",
    lastCalledAt: nowISO,
    updatedAt: nowISO,
    createdAt: nowISO,
    assignedTo: attenderId ? [attenderId] : [],
    assignedName: attenderName || "",
    attenderId: attenderId || "",
    attenderName: attenderName || "",
    attenderStates: attenderId ? {
      [attenderId]: {
        attenderId,
        attenderName,
        status: targetStatus,
        remark: data.remark || "",
        callType: data.callType || "incoming",
        lastCalledAt: nowISO,
        updatedAt: nowISO
      }
    } : {}
  };

  // 1. Instantly update local IndexedDB cache for 0ms UI load
  if (attenderId) {
    await updateLocalAttenderCache(attenderId, newLeadDoc);
  }

  // 2. Trigger direct write to Firebase asynchronously in background
  addIncomingCallLogDirectFirebase(attenderId, attenderName, data, programId, programName)
    .then(docId => {
      console.log(`[ADD INC SUCCESS] Firebase write completed for new lead: ${docId}`);
      if (attenderId && docId) {
        updateLocalAttenderCache(attenderId, { ...newLeadDoc, id: docId });
      }
    })
    .catch(err => {
      console.warn("⚠️ Firebase write deferred to pending queue:", err?.message || err);
      queuePendingWrite("addIncomingCallLog", { attenderId, attenderName, data, programId, programName });
    });

  return localId;
};

// Global search contacts by exact phone number, name prefix, or email prefix

export const processPendingWriteItem = async (item) => {
  if (!item) return;
  if (item.type === "updateCallLog" && item.logId) {
    await updateCallLogDirectFirebase(item.logId, item.updates, item.attenderId, item.attenderName, item.existingContact);
  } else if (item.type === "addIncomingCallLog") {
    await addIncomingCallLogDirectFirebase(item.attenderId, item.attenderName, item.data, item.programId, item.programName);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushPendingWrites(processPendingWriteItem);
  });
}

export const globalSearchContacts = async (queryStr) => {
  if (!queryStr || !queryStr.trim()) return [];
  const term = queryStr.trim();
  const termLower = term.toLowerCase();

  console.log(`[GLOBAL SEARCH] Executing targeted index queries for term: "${term}"`);

  const queries = [];

  // 1. Search by exact phone match (using normalized form)
  const norm = normalizePhone(term);
  const isPureDigits = /^\d+$/.test(term);

  if (norm.length >= 4) {
    queries.push(
      getDocs(
        query(
          collection(db, "contacts"),
          where("normalizedPhones", "array-contains", norm)
        )
      )
    );
  }

  // 2. Search by Name prefix (only if not pure digits)
  if (!isPureDigits && term.length >= 2) {
    queries.push(
      getDocs(
        query(
          collection(db, "contacts"),
          where("Name", ">=", term),
          where("Name", "<=", term + "\uf8ff"),
          limit(20)
        )
      )
    );
    const capitalized = term.charAt(0).toUpperCase() + term.slice(1);
    if (capitalized !== term) {
      queries.push(
        getDocs(
          query(
            collection(db, "contacts"),
            where("Name", ">=", capitalized),
            where("Name", "<=", capitalized + "\uf8ff"),
            limit(20)
          )
        )
      );
    }
  }

  // 3. Search by Email prefix (only if term includes @)
  if (term.includes("@")) {
    queries.push(
      getDocs(
        query(
          collection(db, "contacts"),
          where("Email", ">=", termLower),
          where("Email", "<=", termLower + "\uf8ff"),
          limit(20)
        )
      )
    );
  }

  try {
    const snapshots = await Promise.all(queries);
    const resultsMap = new Map();

    snapshots.forEach(snap => {
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (!data._deleted) {
          resultsMap.set(docSnap.id, { id: docSnap.id, ...data });
        }
      });
    });

    console.log(`[GLOBAL SEARCH SUCCESS] Query batch returned ${resultsMap.size} unique contact(s)`);
    return Array.from(resultsMap.values());
  } catch (e) {
    console.error("[GLOBAL SEARCH ERROR] Global search failed:", e);
    return [];
  }
};
// On-Demand Targeted Search: Queries master contacts collection (0 callCenterCache full collection reads)

export const searchAttenderContacts = async (queryStr, attenderId, attenderName) => {
  if (!queryStr || !queryStr.trim() || queryStr.trim().length < 2) return [];
  const term = queryStr.trim();

  console.log(`[TARGETED SEARCH START] Querying contacts master collection for: "${term}" | Attender: ${attenderName || attenderId}`);

  try {
    // Search master contacts collection using targeted field indexes
    const globalResults = await globalSearchContacts(term);
    console.log(`[TARGETED SEARCH FIREBASE] Master contacts search returned ${globalResults.length} document(s)`);

    // Filter strictly for this attender's assigned leads
    const allResultsMap = new Map();
    globalResults.forEach(item => {
      if (!item || !item.id) return;
      
        const matchedStateObj = findMatchingAttenderState(item.attenderStates, attenderId, attenderName);
        const isAssignedToMe = (attenderId && (
          item.attenderId === attenderId || 
          item.assignedTo === attenderId || 
          (Array.isArray(item.assignedTo) && item.assignedTo.includes(attenderId)) ||
          Boolean(matchedStateObj)
        )) || (attenderName && (
          item.assignedName === attenderName || 
          item.attenderName === attenderName || 
          item.assignedTo === attenderName ||
          (Array.isArray(item.assignedTo) && item.assignedTo.includes(attenderName)) ||
          Boolean(matchedStateObj)
        ));

        if (isAssignedToMe) {
          const attState = matchedStateObj || {};

        allResultsMap.set(item.id, {
          id: item.id,
          ...item,
          status: attState.status !== undefined ? attState.status : (item.status || ""),
          remark: attState.remark !== undefined ? attState.remark : (item.remark || ""),
          callType: String(attState.callType !== undefined ? attState.callType : (item.callType || "outgoing")).toLowerCase(),
          history: attState.history !== undefined ? attState.history : (item.history || []),
          callbackDate: attState.callbackDate !== undefined ? attState.callbackDate : (item.callbackDate || null),
          callbackStatus: attState.callbackStatus !== undefined ? attState.callbackStatus : (item.callbackStatus || ""),
          objectionReason: attState.objectionReason !== undefined ? attState.objectionReason : (item.objectionReason || ""),
          lastCalledAt: attState.lastCalledAt !== undefined ? attState.lastCalledAt : (item.lastCalledAt || null),
          Source: attState.Source !== undefined ? attState.Source : (item.Source || item.Sourse || ""),
          "Called For": attState["Called For"] !== undefined ? attState["Called For"] : (item["Called For"] || ""),
          attenderId: attenderId,
          attenderName: attState.attenderName || item.assignedName || item.attenderName || ""
        });
      }
    });

    const finalResults = Array.from(allResultsMap.values());
    console.log(`[TARGETED SEARCH COMPLETE] Matched ${finalResults.length} lead(s) assigned to ${attenderName || attenderId}`);
    return finalResults;
  } catch (err) {
    console.error("[TARGETED SEARCH ERROR] searchAttenderContacts error:", err);
    return [];
  }
};

// Targeted Historical Cache Fetcher: Reads ONLY required monthly callCenterCache partition docs and caches them in IndexedDB with 1-Week TTL

export const fetchHistoricalCachePartition = async (monthStr, attenderId, attenderName) => {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return [];

  // 1. Check local IndexedDB cache first (1-Week / 7-Day TTL)
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const cacheKey = `tgf_historical_cache_${monthStr}_${attenderId}`;
  console.log(`[HISTORICAL CACHE CHECK] Checking local IndexedDB cache for month: ${monthStr}`);
  try {
    const localData = await getIDBCache(cacheKey);
    if (localData) {
      const logs = Array.isArray(localData) ? localData : localData.logs;
      const timestamp = localData.timestamp || 0;
      const ageMs = Date.now() - timestamp;

      if (Array.isArray(logs) && logs.length > 0 && (timestamp === 0 || ageMs < ONE_WEEK_MS)) {
        console.log(`[HISTORICAL CACHE LOCAL LOAD SUCCESS] Served ${logs.length} leads for ${monthStr} from IndexedDB (0 Firebase reads | Cache age: ${timestamp ? Math.round(ageMs / 3600000) + 'h / 168h TTL' : 'active'})`);
        return logs;
      } else if (timestamp && ageMs >= ONE_WEEK_MS) {
        console.log(`[HISTORICAL CACHE EXPIRED] Local cache for ${monthStr} is older than 7 days (1 Week TTL). Purging and re-fetching from Firebase.`);
      }
    }
  } catch (e) {
    console.warn("[HISTORICAL CACHE WARN] Error reading historical IndexedDB cache:", e);
  }

  // 2. Targeted Firestore query: fetch ALL partition docs for monthStr (e.g., 2026-05_part1, 2026-05_part2)
  console.log(`[HISTORICAL FIREBASE READ] Fetching all targeted partition docs from Firestore for month: ${monthStr}`);
  try {
    const q = query(
      collection(db, "callCenterCache"),
      where(documentId(), ">=", monthStr),
      where(documentId(), "<=", monthStr + "\uf8ff")
    );
    const snap = await getDocs(q);
    console.log(`[HISTORICAL FIREBASE READ SUCCESS] Retrieved ${snap.docs.length} partition doc(s) for month: ${monthStr}`);

    const contactsMap = {};

    snap.docs.forEach(docSnap => {
      const docContacts = docSnap.data().contacts || {};
      Object.entries(docContacts).forEach(([id, rawData]) => {
        if (!rawData || rawData._deleted) return;
        const matchedStateObj = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName);
        const isAssignedToMe = (attenderId && (
          rawData.attenderId === attenderId || 
          rawData.assignedTo === attenderId || 
          (Array.isArray(rawData.assignedTo) && rawData.assignedTo.includes(attenderId)) ||
          Boolean(matchedStateObj)
        )) || (attenderName && (
          rawData.assignedName === attenderName || 
          rawData.attenderName === attenderName || 
          rawData.assignedTo === attenderName ||
          (Array.isArray(rawData.assignedTo) && rawData.assignedTo.includes(attenderName)) ||
          Boolean(matchedStateObj)
        ));

        if (isAssignedToMe) {
          const attState = matchedStateObj || {};

          contactsMap[id] = {
            id,
            ...rawData,
            _rawData: rawData,
            status: attState.status !== undefined ? attState.status : (rawData.status || ""),
            remark: attState.remark !== undefined ? attState.remark : (rawData.remark || ""),
            callType: String(attState.callType !== undefined ? attState.callType : (rawData.callType || "outgoing")).toLowerCase(),
            history: attState.history !== undefined ? attState.history : (rawData.history || []),
            callbackDate: attState.callbackDate !== undefined ? attState.callbackDate : (rawData.callbackDate || null),
            callbackStatus: attState.callbackStatus !== undefined ? attState.callbackStatus : (rawData.callbackStatus || ""),
            objectionReason: attState.objectionReason !== undefined ? attState.objectionReason : (rawData.objectionReason || ""),
            lastCalledAt: attState.lastCalledAt !== undefined ? attState.lastCalledAt : (rawData.lastCalledAt || null),
            Source: attState.Source !== undefined ? attState.Source : (rawData.Source || rawData.Sourse || ""),
            "Called For": attState["Called For"] !== undefined ? attState["Called For"] : (rawData["Called For"] || ""),
            attenderId,
            attenderName: attState.attenderName || rawData.assignedName || rawData.attenderName || ""
          };
        }
      });
    });

    const historicalLogs = Object.values(contactsMap);
    console.log(`[HISTORICAL CACHE STORE] Storing ${historicalLogs.length} leads into IndexedDB for month: ${monthStr} (1-Week TTL)`);
    if (historicalLogs.length > 0) {
      await setIDBCache(cacheKey, { timestamp: Date.now(), logs: historicalLogs }).catch(err => console.warn("Failed to store historical cache:", err));
    }
    return historicalLogs;
  } catch (err) {
    console.error("fetchHistoricalCachePartition error:", err);
    return [];
  }
};

// Claim a contact document and reassign it to a new attender

export const claimContact = async (contactId, attenderId, attenderName) => {
  const contactRef = doc(db, "contacts", contactId);
  
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contactRef);
    if (!snap.exists()) {
      throw new Error("Contact does not exist.");
    }
    
    const data = snap.data();
    const historyEntry = {
      timestamp: new Date().toISOString(),
      attenderId,
      attenderName,
      status: "Claimed Lead",
      remark: `Lead claimed by ${attenderName} (previously assigned to: ${data.assignedName || "Unassigned"})`,
      callType: "outgoing"
    };

    // Calculate new assignedTo array
    const prevAssigned = Array.isArray(data.assignedTo) 
      ? data.assignedTo 
      : (data.assignedTo ? [data.assignedTo] : []);
    const newAssignedSet = new Set(prevAssigned);
    newAssignedSet.add(attenderId);

    // Initialize or merge attenderState for this claiming attender
    const newStates = data.attenderStates || {};
    newStates[attenderId] = {
      status: "",
      remark: "",
      callType: "outgoing",
      history: [historyEntry],
      callbackDate: null,
      objectionReason: "",
      lastCalledAt: new Date().toISOString(),
      firstCalledAt: new Date().toISOString(),
      attenderName: attenderName,
      updatedAt: new Date().toISOString()
    };
    
    transaction.update(contactRef, {
      isAssigned: true,
      assignedTo: Array.from(newAssignedSet),
      assignedName: attenderName,
      attenderId: attenderId, // compatibility
      attenderName: attenderName, // compatibility
      callType: "outgoing",
      status: "", // Reset status for compatibility/overall last-edited view
      remark: "", // Reset remark
      callbackDate: null, 
      isCallbackDue: false,
      attenderStates: newStates,
      _deleted: deleteField(), // Ensure contact is active/undeleted when claimed
      updatedAt: serverTimestamp()
    });
  });
  await updateCacheContacts([contactId]);
};

// Claim a contact that only exists in the CRM by creating it in Firebase first

export const claimCRMContact = async (crmContact, attenderId, attenderName) => {
  const normPhone = normalizePhone(crmContact.Phone || "");
  const normMobile = normalizePhone(crmContact.Mobile || "");
  const finalNormalizedPhones = Array.from(new Set([
    ...extractIndividualPhones(crmContact.Phone || ""),
    ...extractIndividualPhones(crmContact.Mobile || "")
  ]));

  let existingId = null;
  if (finalNormalizedPhones.length > 0) {
    try {
      const q3 = query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", finalNormalizedPhones));
      const snap3 = await getDocs(q3);
      const mergedDocs = snap3.docs;
      const matchDoc = mergedDocs.find(docSnap => docSnap.data()._deleted !== true) || mergedDocs[0];
      if (matchDoc) {
        existingId = matchDoc.id;
      }
    } catch (e) {
      console.warn("[claimCRMContact] duplicate lookup failed:", e);
    }
  }

  if (existingId) {
    return await claimContact(existingId, attenderId, attenderName);
  }

  const historyEntry = {
    timestamp: new Date().toISOString(),
    attenderId,
    attenderName,
    status: "Claimed Lead",
    remark: `Lead claimed from CRM by ${attenderName}`,
    callType: "outgoing"
  };

  const newStates = {
    [attenderId]: {
      status: "",
      remark: "",
      callType: "outgoing",
      history: [historyEntry],
      callbackDate: null,
      objectionReason: "",
      lastCalledAt: new Date().toISOString(),
      firstCalledAt: new Date().toISOString(),
      attenderName: attenderName,
      updatedAt: new Date().toISOString()
    }
  };

  const tagsSet = new Set();
  if (crmContact.Tags) {
    parseTags(crmContact.Tags).forEach(x => tagsSet.add(x));
  }
  if (Array.isArray(crmContact.tags)) {
    crmContact.tags.forEach(x => {
      if (x) tagsSet.add(String(x).trim());
    });
  }
  const finalTags = Array.from(tagsSet).filter(Boolean).sort();

  const docData = {
    Name: formatContactName(crmContact.Name || ""),
    Phone: crmContact.Phone || "",
    Mobile: crmContact.Mobile || "",
    Email: crmContact.Email || "",
    City: crmContact.City || "",
    State: crmContact.State || "",
    Khoji: crmContact.Khoji || "",
    Source: crmContact.Source || "GHL CRM",
    GHL_ID: crmContact.GHL_ID || "",
    normalizedPhone: normPhone || "",
    normalizedMobile: normMobile || "",
    normalizedPhones: finalNormalizedPhones,
    isAssigned: true,
    assignedTo: [attenderId],
    assignedName: attenderName,
    attenderId: attenderId,
    attenderName: attenderName,
    callType: "outgoing",
    status: "",
    remark: "",
    callbackDate: null,
    isCallbackDue: false,
    attenderStates: newStates,
    tags: finalTags,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isManualEntry: false
  };

  const docRef = await addDoc(collection(db, "contacts"), docData);
  await updateCacheContacts([docRef.id]);
  return docRef.id;
};

// ─────────────────────────────────────────────
// REASSIGN — Move unworked contacts back to pool
// ─────────────────────────────────────────────

export const reassignContactsToPool = async (tag, attenderId, count, mode = "Pending") => {
  const q = query(
    collection(db, "contacts"),
    or(
      where("assignedTo", "==", attenderId),
      where("assignedTo", "array-contains", attenderId)
    )
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  // Filter client-side by tag and mode/status based on the specific attender's state
  let candidates = snap.docs
    .map(d => {
      const rawData = d.data();
      const attState = rawData.attenderStates?.[attenderId] || {};
      return {
        id: d.id,
        ref: d.ref,
        ...rawData,
        status: attState.status !== undefined ? attState.status : (rawData.status || ""),
        callbackDate: attState.callbackDate !== undefined ? attState.callbackDate : (rawData.callbackDate || null)
      };
    })
    .filter(c => !c._deleted);

  if (tag && tag !== "ALL") {
    candidates = candidates.filter(c => Array.isArray(c.tags) && c.tags.includes(tag));
  }

  if (mode === "Pending") {
    candidates = candidates.filter(c => !c.status || c.status === "Pending");
  } else if (mode === "Callbacks") {
    candidates = candidates.filter(c => !!c.callbackDate);
  }

  // Limit count
  const toProcess = candidates.slice(0, count);
  if (toProcess.length === 0) return 0;

  const batch = writeBatch(db);
  toProcess.forEach(c => {
    let newAssignedTo = null;
    let isAssignedVal = false;
    let assignedNameVal = null;
    let attenderIdVal = null;
    let attenderNameVal = null;

    if (Array.isArray(c.assignedTo)) {
      const filtered = c.assignedTo.filter(id => id !== attenderId);
      if (filtered.length > 0) {
        newAssignedTo = filtered;
        isAssignedVal = true;
        const firstId = filtered[0];
        const state = c.attenderStates?.[firstId] || {};
        assignedNameVal = state.attenderName || c.assignedName || "Attender";
        attenderIdVal = firstId;
        attenderNameVal = assignedNameVal;
      }
    } else if (c.assignedTo && c.assignedTo !== attenderId) {
      newAssignedTo = c.assignedTo;
      isAssignedVal = true;
      assignedNameVal = c.assignedName;
      attenderIdVal = c.attenderId;
      attenderNameVal = c.attenderName;
    }

    batch.update(c.ref, {
      isAssigned: isAssignedVal,
      assignedTo: newAssignedTo,
      assignedName: assignedNameVal,
      attenderId: attenderIdVal,
      attenderName: attenderNameVal,
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
  if (toProcess.length > 0) {
    await updateCacheContacts(toProcess.map(c => c.id));
  }
  return toProcess.length;
};

// ─────────────────────────────────────────────
// REASSIGN — Move contacts between attenders
// ─────────────────────────────────────────────

export const reassignContactsBetweenAttenders = async (tag, fromAttenderId, toAttenderId, count, mode = "Pending") => {
  // Fetch target attender to get their name
  let toAttenderName = "Attender";
  try {
    const attSnap = await getDoc(doc(db, "attenders", toAttenderId));
    if (attSnap.exists()) {
      toAttenderName = attSnap.data().name || "Attender";
    }
  } catch (e) {
    console.warn("Failed to fetch target attender details:", e);
  }

  const q = query(
    collection(db, "contacts"),
    or(
      where("assignedTo", "==", fromAttenderId),
      where("assignedTo", "array-contains", fromAttenderId)
    )
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  // Filter client-side by tag and mode/status based on the specific fromAttender's state
  let candidates = snap.docs
    .map(d => {
      const rawData = d.data();
      const attState = rawData.attenderStates?.[fromAttenderId] || {};
      return {
        id: d.id,
        ref: d.ref,
        ...rawData,
        status: attState.status !== undefined ? attState.status : (rawData.status || ""),
        callbackDate: attState.callbackDate !== undefined ? attState.callbackDate : (rawData.callbackDate || null)
      };
    })
    .filter(c => !c._deleted);

  if (tag && tag !== "ALL") {
    candidates = candidates.filter(c => Array.isArray(c.tags) && c.tags.includes(tag));
  }

  if (mode === "Pending") {
    candidates = candidates.filter(c => !c.status || c.status === "Pending");
  } else if (mode === "Callbacks") {
    candidates = candidates.filter(c => !!c.callbackDate);
  }

  // Limit count
  const toProcess = candidates.slice(0, count);
  if (toProcess.length === 0) return 0;

  const batch = writeBatch(db);
  toProcess.forEach(c => {
    let newAssignedTo = toAttenderId;
    if (Array.isArray(c.assignedTo)) {
      const filtered = c.assignedTo.filter(id => id !== fromAttenderId);
      if (!filtered.includes(toAttenderId)) {
        filtered.push(toAttenderId);
      }
      newAssignedTo = filtered;
    } else if (c.assignedTo === fromAttenderId) {
      newAssignedTo = [toAttenderId];
    } else if (c.assignedTo) {
      newAssignedTo = [c.assignedTo, toAttenderId];
    }

    // Also update `attenderStates`: transfer/copy the fromAttenderId's state to toAttenderId
    const updatedStates = c.attenderStates || {};
    if (updatedStates[fromAttenderId]) {
      updatedStates[toAttenderId] = {
        ...updatedStates[fromAttenderId],
        attenderName: toAttenderName,
        updatedAt: new Date().toISOString()
      };
      delete updatedStates[fromAttenderId];
    }

    batch.update(c.ref, {
      assignedTo: newAssignedTo,
      assignedName: toAttenderName,
      attenderId: toAttenderId,
      attenderName: toAttenderName,
      attenderStates: updatedStates,
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
  if (toProcess.length > 0) {
    await updateCacheContacts(toProcess.map(c => c.id));
  }
  return toProcess.length;
};

// ─────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────

const safeTimestampNumber = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "object" && ts.seconds !== undefined) return ts.seconds * 1000;
  const time = new Date(ts).getTime();
  return isNaN(time) ? Date.now() : time;
};

const getMonthStr = (ts) => {
  if (!ts) return null;
  let d;
  if (typeof ts.toDate === "function") {
    d = ts.toDate();
  } else if (typeof ts === "object" && ts.seconds !== undefined) {
    d = new Date(ts.seconds * 1000);
  } else {
    d = new Date(ts);
  }
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getCutoffMonth = (numMonths = 3) => {
  const d = new Date();
  d.setMonth(d.getMonth() - (numMonths - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const pruneContactForCacheForMonth = (c, monthStr) => {
  const pruned = {
    id: c.id,
    Name: c.Name || c.name || "",
    Phone: c.Phone || c.phone || c.Mobile || c.mobile || "",
    Mobile: c.Mobile || c.mobile || c.Phone || c.phone || "",
    tags: c.tags || [],
    programId: c.programId || "",
    programName: c.programName || "",
    Source: c.Source || c.source || "",
    "Called For": c["Called For"] || c.calledFor || "",
    City: c.City || c.city || "",
    State: c.State || c.state || "",
    Email: c.Email || c.email || "",
    Khoji: c.Khoji || "",
    isAssigned: c.isAssigned === true,
    assignedTo: Array.isArray(c.assignedTo) ? c.assignedTo : (c.assignedTo ? [c.assignedTo] : []),
    assignedName: c.assignedName || "",
    _deleted: c._deleted === true,
    
    // Top-level compatibility fields
    status: c.status || "",
    remark: c.remark || "",
    callType: c.callType || "outgoing",
    callbackDate: c.callbackDate || null,
    isCallbackDue: c.isCallbackDue === true,
    attenderId: c.attenderId || "",
    attenderName: c.attenderName || "",
    lastCalledAt: c.lastCalledAt || null,
    history: [],
    
    createdAt: safeTimestampNumber(c.createdAt),
    updatedAt: safeTimestampNumber(c.updatedAt)
  };

  // Only keep history attempts that belong to this month
  const targetHistory = [];
  if (c.history) {
    c.history.forEach(h => {
      const hTs = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null;
      if (hTs && getMonthStr(hTs) === monthStr) {
        targetHistory.push(h);
      }
    });
  }
  pruned.history = targetHistory;
  
  if (c.attenderStates) {
    pruned.attenderStates = {};
    Object.entries(c.attenderStates).forEach(([attId, state]) => {
      const prunedHistory = (state.history || []).map(h => ({
        timestamp: h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate().toISOString() : (h.timestamp.toMillis ? new Date(h.timestamp.toMillis()).toISOString() : String(h.timestamp))) : null,
        status: h.status || "",
        remark: h.remark || "",
        callType: h.callType || state.callType || "outgoing"
      })).filter(h => {
        const hTs = h.timestamp ? new Date(h.timestamp) : null;
        return hTs && getMonthStr(hTs) === monthStr;
      });
      
      pruned.attenderStates[attId] = {
        attenderName: state.attenderName || "",
        status: state.status || "",
        remark: state.remark || "",
        callType: state.callType || "outgoing",
        history: prunedHistory,
        callbackDate: state.callbackDate || null,
        objectionReason: state.objectionReason || "",
        lastCalledAt: state.lastCalledAt || null,
        firstCalledAt: state.firstCalledAt || null,
        updatedAt: state.updatedAt || "",
        Source: state.Source || state.source || "",
        "Called For": state["Called For"] || state.calledFor || ""
      };
    });
  }

  // Strip empty strings, nulls, and empty maps to eliminate redundant Firestore index entries
  const stripEmptyValues = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map(stripEmptyValues).filter(item => item !== null && item !== undefined && item !== "");
    }
    const clean = {};
    Object.entries(obj).forEach(([key, val]) => {
      if (val === "" || val === null || val === undefined) return;
      if (Array.isArray(val) && val.length === 0) return;
      if (typeof val === "object" && Object.keys(val).length === 0) return;
      clean[key] = typeof val === "object" ? stripEmptyValues(val) : val;
    });
    return clean;
  };

  return stripEmptyValues(pruned);
};



let cachedDryRunResult = null;


export const getAttenderCallLogs = async (attenderId, tag) => {
  const q = query(
    collection(db, "contacts"),
    or(
      where("assignedTo", "==", attenderId),
      where("assignedTo", "array-contains", attenderId)
    )
  );
  const snap = await getDocs(q);
  let logs = snap.docs.map(d => {
    const rawData = d.data();
    const attState = rawData.attenderStates?.[attenderId] || {};
    return {
      id: d.id,
      ...rawData,
      // Overlay attender-specific state fields if present in attenderStates
      status: attState.status !== undefined ? attState.status : (rawData.status || ""),
      remark: attState.remark !== undefined ? attState.remark : (rawData.remark || ""),
      callType: attState.callType !== undefined ? attState.callType : (rawData.callType || "outgoing"),
      history: attState.history !== undefined ? attState.history : (rawData.history || []),
      callbackDate: attState.callbackDate !== undefined ? attState.callbackDate : (rawData.callbackDate || null),
      objectionReason: attState.objectionReason !== undefined ? attState.objectionReason : (rawData.objectionReason || ""),
      lastCalledAt: attState.lastCalledAt !== undefined ? attState.lastCalledAt : (rawData.lastCalledAt || null),
      firstCalledAt: attState.firstCalledAt !== undefined ? attState.firstCalledAt : (rawData.firstCalledAt || null),
      registeredYearMonth: attState.registeredYearMonth !== undefined ? attState.registeredYearMonth : (rawData.registeredYearMonth || null),
      
      attenderId: attenderId,
      attenderName: attState.attenderName || rawData.assignedName || rawData.attenderName || ""
    };
  }).filter(c => !c._deleted);
  if (tag && tag !== "ALL") {
    logs = logs.filter(c => Array.isArray(c.tags) && c.tags.includes(tag));
  }
  return logs;
};

// Get all call logs for an entire program (for Excel export)

export const getProgramCallLogs = async (tag) => {
  const q = query(
    collection(db, "contacts"),
    where("tags", "array-contains", tag)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.isAssigned === true && !c._deleted);
};

// ─────────────────────────────────────────────
// ABHIVYAKTI REPORT
// ─────────────────────────────────────────────
// Helper to dynamically track registered months

export const saveExcelToCloud = async ({ data, columns, colsMap, fileName, activeSheet }) => {
  const dataStr = JSON.stringify(data);
  const columnsStr = JSON.stringify(columns);
  const colsMapStr = JSON.stringify(colsMap);

  // L6 fix: Firestore has a 1MB document limit — pre-check payload size
  const estimatedSize = new Blob([dataStr, columnsStr, colsMapStr]).size;
  if (estimatedSize > 900000) { // 900KB safety margin
    throw new Error(`Excel data too large for cloud storage (${Math.round(estimatedSize / 1024)}KB). Maximum is ~900KB. Try splitting into smaller sheets.`);
  }

  const docRef = doc(db, "excelSheets", "current");
  await setDoc(docRef, {
    data: dataStr,
    columns: columnsStr,
    colsMap: colsMapStr,
    fileName: fileName || "",
    activeSheet: activeSheet || "",
    updatedAt: serverTimestamp()
  });
};


export const loadExcelFromCloud = async () => {
  const docRef = doc(db, "excelSheets", "current");
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    data: JSON.parse(d.data),
    columns: JSON.parse(d.columns),
    colsMap: JSON.parse(d.colsMap),
    fileName: d.fileName || "",
    activeSheet: d.activeSheet || ""
  };
};


export const deleteExcelFromCloud = async () => {
  const docRef = doc(db, "excelSheets", "current");
  await deleteDoc(docRef);
};

// ─────────────────────────────────────────────
// CALL CENTER SETTINGS OPTIONS
// ─────────────────────────────────────────────

const DEFAULT_STATUS_OPTIONS = [
  "Interested",
  "Reg.Done",
  "Not interested",
  "NA",
  "Busy",
  "Call Cut",
  "switched off",
  "Invalid No",
  "Already Reg.d",
  "Info given",
  "Next time",
  "reminder",
  "Query",
  "Called by mistake",
  "Not possible",
  "Shivir done",
  "no answer"
];

const DEFAULT_SOURCE_OPTIONS = [
  "Facebook",
  "Instagram",
  "WhatsApp",
  "YouTube",
  "Google",
  "Website",
  "Books",
  "Call Centre",
  "Program",
  "Khoji",
  "Other",
  "NA"
];

const DEFAULT_CALLED_FOR_OPTIONS = [
  "Other",
  "TGF Info",
  "CBT Avd",
  "CBT Basic",
  "Off MA",
  "On MA",
  "On MA Hindi",
  "On MA Eng.",
  "Dhyan",
  "Nisarg Dhyan",
  "BUP",
  "BUT",
  "Hair Program",
  "Hair Avd",
  "Pranayam",
  "Pranayam Avd",
  "Program",
  "Shravan",
  "App",
  "Special MA",
  "Spiritual H",
  "Swasthya Shivir",
  "Ashram Visit",
  "Mini Shivir",
  "Kids Shivir",
  "Reminder",
  "Yoga 1 Month",
  "Yoga 3 Month",
  "Yoga 6 Month",
  "Yoga 1 Yr",
  "SHSH",
  "Digestive Basic",
  "Digestive Avd",
  "Spine Basic",
  "Spine Avd"
];

```

---

### File: `src/lib/db/core.js`

```javascript
import {
  collection, addDoc, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, query, where,
  serverTimestamp, writeBatch, onSnapshot,
  limit, Timestamp, orderBy,
  deleteField, documentId
} from "firebase/firestore";
import { db } from "../firebase.js";
import { isKhojiField } from "../khojiHelper.js";

export const formatContactName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .split(/\s+/)
    .map(word => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

// ─────────────────────────────────────────────
// IGNORED FIELDS DEFINITIONS
// ─────────────────────────────────────────────
const IGNORED_FIELDS = new Set([
  "consent", "consent in hindi", "current date", "current_date",
  "21day current date", "21day_current date", "21day challenge day", "21day_challenge_day",
  "date added", "date_added", "program name", "razorpay", "program payment status",
  "payment status", "payment event", "khoji status", "possibility",
  "understand that this is an offline event and agree to attend in person",
  "have completed 15 days of meditation nonstop without fail",
  "confirm that i will definitely attend this event",
  "acknowledgement",
  "event startdate", "event type", "base amount",
  "program_payment_status", "payment_status", "payment_event", "khoji_status",
  "event_startdate", "event_type", "base_amount",
  "d2e payment status", "d2e_payment_status", "total registrations", "total_registrations",
  "organization type", "organization_type", "total number of registration", "total_number_of_registration",
  "total number of registrations", "total_number_of_registrations",
  "a serious business person", "form ai tools", "form_ai_tools",
  "ai टूल से", "from ai tools", "aapne kaise convice kiya",
  "actual online event count", "adhar card", "age", "your age",
  "attended", "not attended-reason", "attendy", "attender",
  "be 100% honest", "stopping you", "closed airport to venue",
  "company", "consent in gujarati", "cont no", "mobile number",
  "estimated budget", "event address", "event day", "event name", "event details",
  "guest category", "guest designation", "guest email id", "guest name",
  "have you done maha aasmani param gyan shivir", "how did you hear about us",
  "how would you like to attend the retreat", "ioc-ppc", "incremental challenge day",
  "khoji id", "khoji, new", "khoji/ new", "last run time",
  "ma not possible reason", "mahaasmani", "middle name", "number of students",
  "organization", "other video editing tool", "pan card number", "person - label",
  "person - phone", "person - closed deals", "person - open deals", "person - next activity date",
  "position/title", "position", "title", "profession", "profession details", "profession info",
  "prog. feedback", "projected budget", "registration_count_group", "registration count group",
  "school name", "select service", "shivir done", "shivir name", "shivir/event category",
  "shivir_code", "source of information", "specialization", "specific month",
  "tejasthan", "what is your tejstan/center name", "tell me briefly about your business",
  "tentative date of the mini shivir", "the preferred language of the retreat",
  "todays_date_25daychallenge", "todays date 25daychallenge", "type of the event",
  "what are you looking to achieve or explore", "what do you want to get out of this call",
  "what interests you the most about joining this retreat", "what is stopping you from hitting results",
  "what is your time slot", "what makes you different from the other applications",
  "whats the business", "whats your message", "when you want to attend the event",
  "where will you attend the program", "which mini shivir did you attend",
  "your area of living", "your city name", "your current monthly revenue",
  "your health issues", "your message", "your selfless service is a gift",
  "zone", "अन्य टूल", "other tool", "अपना प्रश्न यहाँ लिखें",
  "आप कितने समय से अध्यात्म की खोज में हैं", "ग्राफ़िक डिजाइनिंग", "graphic designing",
  "फोटोग्राफी और वीडियो शूटिंग", "photography & video shooting", "वीडियो एडिटिंग", "video editing",
  "वेबसाइट और लैंडिंग पेज", "website & landing page",
  "date", "content", "enter trainer name", "how would you like to attend the shivir", "how would you like to attend"
]);

export const isIgnoredField = (key) => {
  if (!key) return true;
  const k = key.toLowerCase().trim().replace(/_/g, " ");
  if (IGNORED_FIELDS.has(k)) return true;
  for (const ignored of IGNORED_FIELDS) {
    if (ignored !== "date" && ignored !== "content" && k.includes(ignored)) {
      return true;
    }
  }
  return false;
};

export function findMatchingAttenderState(attenderStates, attenderId, attenderName) {
  if (!attenderStates || typeof attenderStates !== "object") return null;

  const idLower = attenderId ? String(attenderId).toLowerCase().trim() : "";
  const nameLower = attenderName ? String(attenderName).toLowerCase().trim() : "";

  const matches = [];

  for (const [key, stateObj] of Object.entries(attenderStates)) {
    if (!stateObj || typeof stateObj !== "object") continue;

    const keyLower = String(key).toLowerCase().trim();
    const stId = stateObj.attenderId ? String(stateObj.attenderId).toLowerCase().trim() : "";
    const stName = stateObj.attenderName ? String(stateObj.attenderName).toLowerCase().trim() : "";

    let isMatch = false;
    if (idLower && (keyLower === idLower || stId === idLower)) {
      isMatch = true;
    } else if (nameLower) {
      if (keyLower === nameLower || stName === nameLower) {
        isMatch = true;
      } else if (stName && (stName.includes(nameLower) || nameLower.includes(stName))) {
        isMatch = true;
      } else if (keyLower && (keyLower.includes(nameLower) || nameLower.includes(keyLower))) {
        isMatch = true;
      }
    }

    if (isMatch) {
      matches.push({ key, stateObj });
    }
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].stateObj;

  const getTimeMs = (val) => {
    if (!val) return 0;
    if (typeof val.toDate === "function") return val.toDate().getTime();
    if (val.seconds !== undefined) return val.seconds * 1000;
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  matches.sort((a, b) => {
    const tA = getTimeMs(a.stateObj.updatedAt || a.stateObj.lastCalledAt);
    const tB = getTimeMs(b.stateObj.updatedAt || b.stateObj.lastCalledAt);
    return tA - tB;
  });

  const mergedHistory = [];
  const seenHistoryKeys = new Set();
  let mergedState = {};

  matches.forEach(({ stateObj }) => {
    mergedState = { ...mergedState, ...stateObj };

    const hList = Array.isArray(stateObj.history) ? stateObj.history : [];
    hList.forEach(h => {
      const hTime = getTimeMs(h.timestamp);
      const hKey = `${hTime}_${h.remark || ""}_${h.status || ""}_${h.attenderName || ""}`;
      if (!seenHistoryKeys.has(hKey)) {
        seenHistoryKeys.add(hKey);
        mergedHistory.push(h);
      }
    });

    if (stateObj.remark && String(stateObj.remark).trim()) {
      const rStr = String(stateObj.remark).trim();
      const rKey = `${getTimeMs(stateObj.lastCalledAt || stateObj.updatedAt)}_${rStr}_${stateObj.status || ""}_${stateObj.attenderName || ""}`;
      if (!seenHistoryKeys.has(rKey) && !mergedHistory.some(h => h.remark === rStr)) {
        seenHistoryKeys.add(rKey);
        mergedHistory.push({
          status: stateObj.status || "",
          remark: rStr,
          calledFor: stateObj["Called For"] || stateObj.calledFor || "",
          source: stateObj.Source || stateObj.source || "",
          callType: stateObj.callType || "outgoing",
          attenderName: stateObj.attenderName || attenderName || "Attender",
          timestamp: stateObj.lastCalledAt || stateObj.updatedAt || new Date().toISOString()
        });
      }
    }
  });

  mergedHistory.sort((a, b) => getTimeMs(a.timestamp) - getTimeMs(b.timestamp));
  mergedState.history = mergedHistory;

  return mergedState;
}

export function combineContactHistories(rawData, attState = {}, attenderName = "") {
  if (!rawData && !attState) return [];
  const rawList = [];

  const getTimeMs = (val) => {
    if (!val) return 0;
    if (typeof val.toDate === "function") return val.toDate().getTime();
    if (val.seconds !== undefined) return val.seconds * 1000;
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const addHistoryItem = (h, fallbackName = "") => {
    if (!h || typeof h !== "object") return;
    const rTrim = String(h.remark || "").trim();
    const sTrim = String(h.status || "").trim();
    if (!rTrim && (!sTrim || sTrim === "Pending") && !h.timestamp && !h.date) return;

    const attName = h.attenderName || (attState && attState.attenderName) || fallbackName || attenderName || "Attender";

    rawList.push({
      status: sTrim,
      remark: rTrim,
      calledFor: h.calledFor || h.called_for || h["Called For"] || (attState && (attState["Called For"] || attState.calledFor)) || (rawData && rawData["Called For"]) || "",
      source: h.source || h.sourse || h.Source || (attState && (attState.Source || attState.source)) || (rawData && rawData.Source) || "",
      callType: h.callType || (attState && attState.callType) || (rawData && rawData.callType) || "outgoing",
      attenderName: attName,
      timestamp: h.timestamp || h.date || h.createdAt || h.updatedAt || h.lastCalledAt || new Date().toISOString()
    });
  };

  if (rawData && Array.isArray(rawData.history)) {
    rawData.history.forEach(h => addHistoryItem(h, rawData.assignedName || rawData.attenderName));
  }

  if (attState && Array.isArray(attState.history)) {
    attState.history.forEach(h => addHistoryItem(h, attState.attenderName));
  }

  if (attState && attState.remark && String(attState.remark).trim()) {
    addHistoryItem({
      status: attState.status || "",
      remark: attState.remark,
      calledFor: attState["Called For"] || attState.calledFor,
      source: attState.Source || attState.source,
      callType: attState.callType,
      attenderName: attState.attenderName,
      timestamp: attState.lastCalledAt || attState.updatedAt
    }, attState.attenderName);
  }

  if (rawData && rawData.remark && String(rawData.remark).trim()) {
    addHistoryItem({
      status: rawData.status || "",
      remark: rawData.remark,
      calledFor: rawData["Called For"],
      source: rawData.Source,
      callType: rawData.callType,
      attenderName: rawData.assignedName || rawData.attenderName,
      timestamp: rawData.lastCalledAt || rawData.updatedAt || rawData.createdAt
    }, rawData.assignedName || rawData.attenderName);
  }

  rawList.sort((a, b) => getTimeMs(a.timestamp) - getTimeMs(b.timestamp));

  const unique = [];
  const clean = s => String(s || "").trim().toLowerCase();

  rawList.forEach(item => {
    const itemRemark = clean(item.remark);
    const itemStatus = clean(item.status);
    const itemMs = getTimeMs(item.timestamp);

    const isDuplicate = unique.some(ex => {
      const exRemark = clean(ex.remark);
      const exStatus = clean(ex.status);
      const exMs = getTimeMs(ex.timestamp);

      const timeDiff = (itemMs > 0 && exMs > 0) ? Math.abs(itemMs - exMs) : 0;
      const isTimeUnknown = itemMs === 0 || exMs === 0;

      if (itemRemark && exRemark && itemRemark === exRemark) {
        if (isTimeUnknown || timeDiff < 1800000) return true;
      }

      if (itemStatus && exStatus && itemStatus === exStatus && itemMs > 0 && exMs > 0) {
        if (timeDiff < 180000) return true;
      }
      return false;
    });

    if (!isDuplicate) {
      unique.push(item);
    }
  });

  return unique;
}

export const normalizePhone = (phoneStr) => {
  if (!phoneStr) return "";
  let str = String(phoneStr).trim();
  str = str.replace(/@s\.whatsapp\.net/gi, "");
  str = str.replace(/\.0$/g, "");

  const multiSplit = str.split(/[,;\/\s+]+/);
  for (const part of multiSplit) {
    const digits = part.replace(/\D/g, "");
    if (digits.length >= 10) {
      return digits.slice(-10);
    }
  }

  const allDigits = str.replace(/\D/g, "");
  if (allDigits.length >= 10) {
    return allDigits.slice(-10);
  }

  return allDigits;
};

export const extractIndividualPhones = (phoneStr) => {
  if (!phoneStr) return [];
  let str = String(phoneStr).trim();
  str = str.replace(/@s\.whatsapp\.net/gi, "");
  str = str.replace(/\.0$/g, "");

  const parts = str.split(/[,;\/\s+]+/);
  const results = new Set();

  parts.forEach(part => {
    const digits = part.replace(/\D/g, "");
    if (digits.length >= 10) {
      results.add(digits.slice(-10));
    } else if (digits.length > 0) {
      results.add(digits);
    }
  });

  const fullDigits = str.replace(/\D/g, "");
  if (fullDigits.length >= 10) {
    results.add(fullDigits.slice(-10));
  }

  return Array.from(results);
};

export const getMonthStr = (dateObj) => {
  if (!dateObj) return "";
  if (typeof dateObj === "string" && dateObj.match(/^\d{4}-\d{2}/)) {
    return dateObj.slice(0, 7);
  }
  let d;
  if (dateObj && typeof dateObj.toDate === "function") {
    d = dateObj.toDate();
  } else if (dateObj && typeof dateObj === "object" && dateObj.seconds !== undefined) {
    d = new Date(dateObj.seconds * 1000);
  } else {
    d = new Date(dateObj);
  }
  if (!d || isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const getByteSize = (obj) => {
  if (!obj) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch (e) {
    try {
      return JSON.stringify(obj).length;
    } catch (err) {
      return 0;
    }
  }
};

// ─────────────────────────────────────────────
// SESSION COUNTER & COST AUDIT TRACKING
// ─────────────────────────────────────────────
if (typeof window !== "undefined" && !window.__CRM_FIRESTORE_STATS__) {
  window.__CRM_FIRESTORE_STATS__ = {
    reads: 0,
    writes: 0,
    readOperations: [],
    writeOperations: []
  };
}

export const trackFirestoreRead = (details) => {
  const docsReturned = details.documentsReturned !== undefined ? details.documentsReturned : 1;
  if (typeof window !== "undefined" && window.__CRM_FIRESTORE_STATS__) {
    window.__CRM_FIRESTORE_STATS__.reads += docsReturned;
    window.__CRM_FIRESTORE_STATS__.readOperations.push({
      time: new Date().toISOString(),
      ...details
    });
  }
  console.log(`[FIRESTORE READ]`, details);
};

export const trackFirestoreWrite = (details) => {
  const writeCount = details.writeCount || (Array.isArray(details.paths) ? details.paths.length : 1);
  if (typeof window !== "undefined" && window.__CRM_FIRESTORE_STATS__) {
    window.__CRM_FIRESTORE_STATS__.writes += writeCount;
    window.__CRM_FIRESTORE_STATS__.writeOperations.push({
      time: new Date().toISOString(),
      ...details,
      writeCount
    });
  }
  console.log(`[FIRESTORE WRITE]`, { ...details, writeCount });
};

export const sanitizeForFirestore = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)).filter(item => item !== undefined);
  }
  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val && typeof val === "object" && !(val instanceof Date) && typeof val.toDate !== "function" && typeof val.toMillis !== "function" && val._methodName !== "deleteField") {
      clean[key] = sanitizeForFirestore(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
};

export const checkHasUndefinedFields = (obj) => {
  if (!obj || typeof obj !== "object") return false;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) return true;
    if (v && typeof v === "object" && !(v instanceof Date) && typeof v.toDate !== "function" && typeof v.toMillis !== "function" && checkHasUndefinedFields(v)) {
      return true;
    }
  }
  return false;
};


```

---

### File: `src/lib/db/syncService.js`

```javascript
import {
  collection, query, where, onSnapshot, doc, getDoc, setDoc, or
} from "firebase/firestore";
import { db } from "../firebase.js";
import { findMatchingAttenderState, trackFirestoreRead } from "./core.js";
import { getIDBCache, setIDBCache, updateLocalAttenderCache, fetchPartitionCacheForColdBoot } from "./cacheService.js";

// Clean Zero-Background-Listener subscribeToCallLogs (0 Reads on Reload)
export const subscribeToCallLogs = (...args) => {
  let tag = null, attenderId = null, attenderName = null, callback = null;
  if (typeof args[args.length - 1] === "function") {
    callback = args.pop();
  }

  if (args.length === 1) {
    attenderId = args[0];
  } else if (args.length === 2) {
    const firstArgStr = String(args[0] || "");
    if (firstArgStr === "ALL" || firstArgStr === "null" || firstArgStr === "undefined" || firstArgStr.includes("Calls")) {
      tag = args[0];
      attenderId = args[1];
    } else {
      attenderId = args[0];
      attenderName = args[1];
    }
  } else if (args.length >= 3) {
    tag = args[0];
    attenderId = args[1];
    attenderName = args[2];
  }

  const cacheKey = `tgf_attender_logs_${attenderId}`;

  // Emit 100% of leads instantly from IndexedDB (0ms UI load, 0 background snapshot reads)
  if (attenderId) {
    getIDBCache(cacheKey).then(async cachedLogs => {
      let logsToProcess = cachedLogs;
      if (!Array.isArray(logsToProcess) || logsToProcess.length === 0) {
        console.log(`[COLD BOOT INITIAL LOAD] IndexedDB empty for ${attenderId}. Fetching partition docs...`);
        logsToProcess = await fetchPartitionCacheForColdBoot(attenderId, attenderName, 6);
      } else {
        console.log(`[ZERO-READ LOAD] Served ${logsToProcess.length} leads from IndexedDB for ${attenderId} (0 Reads on Reload)`);
      }

      if (Array.isArray(logsToProcess)) {
        logsToProcess.forEach(doc => {
          if (doc && doc.id && doc._isNew) delete doc._isNew;
        });
      }

      let filtered = logsToProcess;
      if (tag && tag !== "ALL") {
        filtered = logsToProcess.filter(log => Array.isArray(log.tags) && log.tags.includes(tag));
      }
      if (callback) callback(filtered);
    }).catch(err => {
      console.warn("Failed to load attender logs from IndexedDB:", err);
    });
  }

  return () => {};
};

// On-Demand Fetcher for Shared Leads (Triggers 1, 2, and 3)
export const fetchFreshSharedLead = async (lead, attenderId, attenderName, forceRefresh = false) => {
  if (!lead || !lead.id) return lead;
  
  const historyAttendersCount = Array.isArray(lead.history)
    ? new Set(lead.history.map(h => (h.attenderName || h.attenderId || h.by || h.editedBy || "").trim()).filter(Boolean)).size
    : 0;

  const isShared = (Array.isArray(lead.assignedTo) && lead.assignedTo.length > 1) ||
                   (lead.attenderStates && Object.keys(lead.attenderStates).length > 1) ||
                   lead.isSharedLead === true ||
                   historyAttendersCount > 1;
  const leadName = lead.Name || lead.name || "Lead";
  const localCacheExists = !!lead;
  const cacheAgeMs = lead?._lastFetchedAt ? Date.now() - lead._lastFetchedAt : null;
  const willFetchFromFirestore = (isShared || forceRefresh) && !(lead._lastFetchedAt && (Date.now() - lead._lastFetchedAt) < 60000 && !forceRefresh);

  console.log(
    `[LEAD FETCH DECISION]`,
    {
      contactId: lead?.id || lead?.docId,
      name: leadName,
      isShared,
      forceRefresh,
      localCacheExists,
      cacheAgeMs,
      ACTION: willFetchFromFirestore ? "FIRESTORE_READ" : "LOCAL_CACHE"
    }
  );

  // If not shared AND not force-refreshed, serve 100% from IndexedDB (0 Reads)
  if (!isShared && !forceRefresh) {
    console.log(
      `[LEAD FETCH → IDB]`,
      {
        contactId: lead?.id,
        reason: "cache_sufficient",
        isShared,
        forceRefresh
      }
    );
    return lead;
  }

  // Prevent useless reads: If fetched less than 60 seconds ago and not forced, use cache (0 Reads)
  const now = Date.now();
  if (!forceRefresh && lead._lastFetchedAt && (now - lead._lastFetchedAt) < 60000) {
    console.log(
      `[LEAD FETCH → IDB]`,
      {
        contactId: lead?.id,
        reason: "cache_sufficient",
        isShared,
        forceRefresh
      }
    );
    return lead;
  }

  try {
    console.log(
      `[LEAD FETCH → FIRESTORE]`,
      {
        contactId: lead?.id,
        reason: "fetchFreshSharedLead",
        isShared,
        forceRefresh
      }
    );

    const docRef = doc(db, "contacts", lead.id);
    const docSnap = await getDoc(docRef);

    trackFirestoreRead({
      collection: "contacts",
      operation: "getDoc",
      document: lead.id,
      documentsReturned: docSnap.exists() ? 1 : 0,
      reason: "fetchFreshSharedLead",
      source: "modal/fetchFreshSharedLead"
    });

    if (!docSnap.exists()) return lead;

    const rawData = docSnap.data();
    const matchedStateObj = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName);
    const attState = matchedStateObj || {};

    const lastHistTime = Array.isArray(rawData.history) && rawData.history.length > 0 
      ? (rawData.history[rawData.history.length - 1]?.timestamp || rawData.history[rawData.history.length - 1]?.date)
      : null;
    const newLastCalledAt = attState.lastCalledAt || rawData.lastCalledAt || attState.updatedAt || rawData.updatedAt || lastHistTime || rawData.createdAt || null;

    const calledForVal = attState["Called For"] || attState.calledFor || rawData["Called For"] || rawData.calledFor || rawData.programId || rawData.programName || "";
    const sourceVal = attState.Source || attState.source || rawData.Source || rawData.source || "";
    const statusVal = attState.status || rawData.status || "Pending";
    const remarkVal = attState.remark || rawData.remark || "";
    const fullHistory = Array.isArray(rawData.history) && rawData.history.length > 0
      ? rawData.history
      : (Array.isArray(attState.history) ? attState.history : []);

    const freshLead = {
      ...rawData,
      id: lead.id,
      status: statusVal,
      remark: remarkVal,
      "Called For": calledForVal,
      calledFor: calledForVal,
      programId: calledForVal,
      Source: sourceVal,
      source: sourceVal,
      tags: Array.isArray(rawData.tags) ? rawData.tags : (Array.isArray(rawData.Tags) ? rawData.Tags : []),
      callType: attState.callType || rawData.callType || "outgoing",
      history: fullHistory,
      callbackDate: attState.callbackDate || rawData.callbackDate || attState.callback_date || rawData.callback_date || null,
      callbackTime: attState.callbackTime || rawData.callbackTime || attState.callback_time || rawData.callback_time || null,
      callbackStatus: attState.callbackStatus || rawData.callbackStatus || null,
      lastCalledAt: newLastCalledAt,
      attenderState: attState,
      _lastFetchedAt: Date.now()
    };
    delete freshLead._isNew;

    if (attenderId) {
      updateLocalAttenderCache(attenderId, freshLead).catch(() => {});
    }

    return freshLead;
  } catch (err) {
    console.warn(`[ON-DEMAND FETCH FAILED] Could not fetch shared lead ${lead.id}:`, err);
    return lead;
  }
};

// WRITE QUEUE COALESCING (Offline / Low-Connectivity Atomic Queue)
const PENDING_WRITES_KEY = "tgf_pending_writes_v1";

export const getPendingWrites = async () => {
  return (await getIDBCache(PENDING_WRITES_KEY)) || [];
};

export const queuePendingWrite = async (typeOrObj, payload) => {
  let writeItem = {};
  if (typeof typeOrObj === "string") {
    writeItem = {
      type: typeOrObj,
      ...(payload || {}),
      id: payload?.logId || payload?.id || payload?.data?.phone || `pending_${Date.now()}`
    };
  } else if (typeOrObj && typeof typeOrObj === "object") {
    writeItem = {
      ...typeOrObj,
      id: typeOrObj.logId || typeOrObj.id || `pending_${Date.now()}`
    };
  }

  if (!writeItem.id) return;
  const currentQueue = await getPendingWrites();

  // Coalesce rapid writes for the same contact/logId
  const existingIdx = currentQueue.findIndex(w => w.id === writeItem.id || (w.logId && writeItem.logId && w.logId === writeItem.logId));

  if (existingIdx >= 0) {
    const existing = currentQueue[existingIdx];
    const mergedUpdates = {
      ...(existing.updates || {}),
      ...(writeItem.updates || {})
    };

    if (existing.updates?.attenderStates || writeItem.updates?.attenderStates) {
      mergedUpdates.attenderStates = {
        ...(existing.updates?.attenderStates || {}),
        ...(writeItem.updates?.attenderStates || {})
      };
    }

    currentQueue[existingIdx] = {
      ...existing,
      ...writeItem,
      updates: mergedUpdates,
      timestamp: Date.now()
    };
    console.log(`⚡ [WRITE COALESCED] Merged rapid offline updates for contact: ${writeItem.id}`);
  } else {
    currentQueue.push({
      ...writeItem,
      timestamp: Date.now()
    });
    console.log(`📥 [WRITE QUEUED] Queued offline write for contact: ${writeItem.id}`);
  }

  await setIDBCache(PENDING_WRITES_KEY, currentQueue);
};

export const clearPendingWriteItem = async (id) => {
  const currentQueue = await getPendingWrites();
  const filtered = currentQueue.filter(w => w.id !== id);
  await setIDBCache(PENDING_WRITES_KEY, filtered);
};

export const flushPendingWrites = async (directFirebaseHandler) => {
  const pending = await getPendingWrites();
  if (!Array.isArray(pending) || pending.length === 0) return;
  
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("Device is currently offline. Retaining pending write queue...");
    return;
  }

  console.log(`🔄 [FLUSH QUEUE] Flushing ${pending.length} pending offline write(s)...`);

  for (const item of pending) {
    try {
      if (typeof directFirebaseHandler === "function") {
        await directFirebaseHandler(item);
      }
      await clearPendingWriteItem(item.id);
      console.log(`✅ [FLUSH SUCCESS] Synced pending write for contact: ${item.id}`);
    } catch (err) {
      console.error(`❌ [FLUSH ERROR] Failed to flush write for ${item.id}:`, err);
    }
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("Network online detected! Triggering pending write flush...");
    flushPendingWrites();
  });
}


```

---

### File: `src/lib/db/adminService.js`

```javascript
import {
  collection, addDoc, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, query, where,
  serverTimestamp, writeBatch, onSnapshot,
  limit, Timestamp, orderBy,
  deleteField, documentId, runTransaction
} from "firebase/firestore";
import { db } from "../firebase.js";
import {
  formatContactName, isIgnoredField, findMatchingAttenderState,
  combineContactHistories, normalizePhone, extractIndividualPhones,
  getMonthStr, getByteSize, trackFirestoreRead, trackFirestoreWrite
} from "./core.js";
import {
  getIDBCache, setIDBCache, fetchPartitionCacheForColdBoot
} from "./cacheService.js";
import {
  getActiveTags, INCOMING_PROGRAM_ID, INCOMING_PROGRAM_NAME,
  OUTGOING_PROGRAM_ID, OUTGOING_PROGRAM_NAME
} from "./programService.js";
import { subscribeToCallLogs } from "./syncService.js";

export const populateGlobalActivePartitionsCache = (snapDocs) => {
  if (!Array.isArray(snapDocs)) return;
  snapDocs.forEach(d => {
    if (!d || d.id === "contacts") return;
    const match = d.id.match(/^(\d{4}-\d{2})/);
    if (match) {
      const monthKey = match[1];
      if (!globalActivePartitionsCache[monthKey]) {
        globalActivePartitionsCache[monthKey] = {};
      }
      globalActivePartitionsCache[monthKey][d.id] = d.data() || { contacts: {} };
    }
  });
};

// Cold Boot Partition Cache Fetcher: Reads callCenterCache partition docs (~2-3 reads/month) when local IndexedDB is empty

export const rebuildCallCenterCache = async (isDryRun = false, forceFetchMaster = true) => {
  console.log(`[CACHE CONSOLIDATION] Starting cache consolidation (Dry Run: ${isDryRun}, Force Master: ${forceFetchMaster})...`);
  try {
    // If not a dry run and we have a fresh dry-run result from < 2 minutes ago, reuse it with 0 READS!
    if (!isDryRun && !forceFetchMaster && cachedDryRunResult && (Date.now() - cachedDryRunResult.timestamp < 120000)) {
      console.log("⚡ [CACHE REBUILD] Reusing fresh dry-run calculation from memory (0 READS COST!)...");
      const { partsToSet, cacheSnapDocs, totalContactsConsolidated } = cachedDryRunResult;
      cachedDryRunResult = null; // Reset cache after use

      if (cacheSnapDocs && cacheSnapDocs.length > 0) {
        console.log(`[CACHE REBUILD STEP A] Purging ${cacheSnapDocs.length} old cache documents...`);
        for (const d of cacheSnapDocs) {
          try {
            await deleteDoc(d.ref);
            console.log(`  ✓ Deleted old doc "${d.id}"`);
          } catch (delErr) {
            console.warn(`  ⚠️ Could not delete old doc "${d.id}":`, delErr);
          }
        }
      }

      console.log(`[CACHE REBUILD STEP B] Writing ${partsToSet.length} new parts to Firestore...`);
      for (const item of partsToSet) {
        try {
          console.log(`  ➔ Writing doc "${item.docId}" (${item.count} contacts, ${item.sizeKb} KB)...`);
          await setDoc(doc(db, "callCenterCache", item.docId), item.data);
          console.log(`  ✓ Saved doc "${item.docId}" successfully!`);
        } catch (docErr) {
          console.error(`❌ [CACHE REBUILD FAILED ON DOC "${item.docId}"] Count: ${item.count}, Size: ${item.sizeKb} KB:`, docErr);
          throw new Error(`Partition write failed on "${item.docId}" (${item.sizeKb} KB): ${docErr.message || docErr}`);
        }
      }

      await setDoc(doc(db, "callCenterCache", "placeholder"), { isPlaceholder: true });

      return {
        status: "success",
        totalContacts: totalContactsConsolidated,
        newPartsCount: partsToSet.length
      };
    }
    const cacheColl = collection(db, "callCenterCache");
    const cacheSnap = await getDocs(cacheColl);

    const monthlyData = {};

    const validCacheDocs = cacheSnap.docs.filter(d => d.id !== "contacts" && d.id !== "placeholder" && /^\d{4}-\d{2}/.test(d.id));
    const existingCacheMonths = new Set();

    if (!forceFetchMaster && validCacheDocs.length > 0) {
      console.log(`[CACHE CONSOLIDATION] Ultra-low read: Loading from ${validCacheDocs.length} existing cache partition docs...`);
      validCacheDocs.forEach(d => {
        const match = d.id.match(/^(\d{4}-\d{2})/);
        if (!match) return;
        const monthStr = match[1];
        existingCacheMonths.add(monthStr);
        if (!monthlyData[monthStr]) monthlyData[monthStr] = {};

        const contacts = d.data().contacts || {};
        Object.entries(contacts).forEach(([cId, cData]) => {
          monthlyData[monthStr][cId] = pruneContactForCacheForMonth({ id: cId, ...cData }, monthStr);
        });
      });
    }

    const currentMonth = getMonthStr(new Date());
    // If forced, cache empty, or missing recent month partitions, fetch master contacts to backfill
    if (forceFetchMaster || validCacheDocs.length === 0 || !existingCacheMonths.has(currentMonth)) {
      console.log("[CACHE CONSOLIDATION] Fetching fresh master contacts collection from Firestore...");
      const allContactsSnap = await getDocs(collection(db, "contacts"));
      allContactsSnap.docs.forEach(d => {
        const data = d.data();
        if (data._deleted) return;
        const isAssigned = data.isAssigned === true || 
                           !!data.attenderId || 
                           (Array.isArray(data.attenderIds) && data.attenderIds.length > 0) ||
                           (data.attenderStates && Object.keys(data.attenderStates).length > 0);

        if (!isAssigned) return;

        const contactMonths = new Set();

        const addIfValidMonth = (ts) => {
          if (!ts) return;
          try {
            const m = getMonthStr(ts);
            if (m) contactMonths.add(m);
          } catch (e) {}
        };

        addIfValidMonth(data.createdAt);
        addIfValidMonth(data.updatedAt);
        addIfValidMonth(data.lastCalledAt);

        if (data.attenderStates) {
          Object.values(data.attenderStates).forEach(state => {
            addIfValidMonth(state.lastCalledAt);
            addIfValidMonth(state.updatedAt);
            addIfValidMonth(state.firstCalledAt);
            (state.history || []).forEach(h => {
              addIfValidMonth(h.timestamp);
            });
          });
        }

        (data.history || []).forEach(h => {
          addIfValidMonth(h.timestamp);
        });
        
        contactMonths.forEach(month => {
          if (!monthlyData[month]) {
            monthlyData[month] = {};
          }
          monthlyData[month][d.id] = pruneContactForCacheForMonth({ id: d.id, ...data }, month);
        });
      });
    }
    
    const partsToSet = [];
    const cutoffMonth = getCutoffMonth(3);
    let totalNewPartsCount = 0;
    let totalContactsConsolidated = 0;

    // Pack partition documents up to ~600 KB / 380 contacts ceiling per document
    const MAX_PARTITION_CONTACTS = 380;
    const MAX_PARTITION_BYTES = 600 * 1024;

    Object.entries(monthlyData).forEach(([month, contactsMap]) => {
      if (month < cutoffMonth) return;
      const contactEntries = Object.entries(contactsMap);
      totalContactsConsolidated += contactEntries.length;

      if (contactEntries.length > 0) {
        let partNum = 1;
        let currentPartContacts = {};
        
        contactEntries.forEach(([id, contact]) => {
          const testPart = { contacts: { ...currentPartContacts, [id]: contact } };
          const estimatedSize = getByteSize(testPart);
          const currentCount = Object.keys(currentPartContacts).length;
          
          if (estimatedSize > MAX_PARTITION_BYTES || currentCount >= MAX_PARTITION_CONTACTS) {
            partsToSet.push({
              docId: `${month}_part${partNum}`,
              data: { contacts: currentPartContacts },
              count: currentCount,
              sizeKb: Math.round(getByteSize({ contacts: currentPartContacts }) / 1024)
            });
            partNum++;
            totalNewPartsCount++;
            currentPartContacts = { [id]: contact };
          } else {
            currentPartContacts[id] = contact;
          }
        });

        if (Object.keys(currentPartContacts).length > 0) {
          partsToSet.push({
            docId: `${month}_part${partNum}`,
            data: { contacts: currentPartContacts },
            count: Object.keys(currentPartContacts).length,
            sizeKb: Math.round(getByteSize({ contacts: currentPartContacts }) / 1024)
          });
          totalNewPartsCount++;
        }
      } else {
        partsToSet.push({
          docId: `${month}_part1`,
          data: { contacts: {} },
          count: 0,
          sizeKb: 0
        });
        totalNewPartsCount++;
      }
    });

    console.log(`[CACHE REBUILD PRE-FLIGHT CHECK] Prepared ${partsToSet.length} partition documents:`);
    partsToSet.forEach(p => {
      console.log(`  ➔ Doc ID: ${p.docId} | Contacts: ${p.count} | Size: ${p.sizeKb} KB`);
    });

    if (isDryRun) {
      console.log("✅ [DRY RUN AUDIT SUCCESS] 0 Writes performed! Partition structure stored in memory for 2 minutes.");
      cachedDryRunResult = {
        partsToSet,
        cacheSnapDocs: cacheSnap.docs,
        totalContactsConsolidated,
        timestamp: Date.now()
      };
      return {
        status: "dry_run_success",
        isDryRun: true,
        totalContacts: totalContactsConsolidated,
        newPartsCount: partsToSet.length,
        partsToSet: partsToSet.map(p => ({ docId: p.docId, count: p.count, sizeKb: p.sizeKb }))
      };
    }

    // Step A: Purge old cache partition docs via individual standalone deleteDoc requests (0 transaction overhead)
    if (cacheSnap.docs.length > 0) {
      console.log(`[CACHE REBUILD STEP A] Purging ${cacheSnap.docs.length} old cache documents...`);
      for (const d of cacheSnap.docs) {
        try {
          await deleteDoc(d.ref);
          console.log(`  ✓ Deleted old doc "${d.id}"`);
        } catch (delErr) {
          console.warn(`  ⚠️ Could not delete old doc "${d.id}":`, delErr);
        }
      }
    }

    // Step B: Write new partition docs as individual, standalone setDoc operations (0 transaction overhead)
    console.log(`[CACHE REBUILD STEP B] Writing ${partsToSet.length} new parts to Firestore...`);
    for (const item of partsToSet) {
      try {
        console.log(`  ➔ Writing doc "${item.docId}" (${item.count} contacts, ${item.sizeKb} KB)...`);
        await setDoc(doc(db, "callCenterCache", item.docId), item.data);
        console.log(`  ✓ Saved doc "${item.docId}" successfully!`);
      } catch (docErr) {
        console.error(`❌ [CACHE REBUILD FAILED ON DOC "${item.docId}"] Count: ${item.count}, Size: ${item.sizeKb} KB:`, docErr);
        throw new Error(`Partition write failed on "${item.docId}" (${item.sizeKb} KB): ${docErr.message || docErr}`);
      }
    }

    // Step C: Set placeholder marker document
    await setDoc(doc(db, "callCenterCache", "placeholder"), { isPlaceholder: true });

    // Server Count Verification (1 read cost)
    let masterCount = 0;
    try {
      const q = query(collection(db, "contacts"), where("isAssigned", "==", true));
      const countSnap = await getCountFromServer(q);
      masterCount = countSnap.data().count;
    } catch (err) {
      console.warn("getCountFromServer verification skipped:", err);
    }

    console.log(`✅ [CACHE REBUILD SUCCESS] Consolidated ${totalContactsConsolidated} contacts into ${totalNewPartsCount} parts. Master Count: ${masterCount}`);
    return {
      status: "success",
      totalContacts: totalContactsConsolidated,
      newPartsCount: totalNewPartsCount,
      masterCount
    };
  } catch (err) {
    console.error("❌ [CACHE REBUILD CRITICAL ERROR]:", err);
    throw new Error(`Cache rebuild failed: ${err.message || err}`);
  }
};


export const exportCallCenterCacheToJson = async () => {
  console.log("[CACHE EXPORT] Downloading all cache documents...");
  const cacheColl = collection(db, "callCenterCache");
  const cacheSnap = await getDocs(cacheColl);
  const exportData = {};
  
  cacheSnap.docs.forEach(d => {
    exportData[d.id] = d.data();
  });
  
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tgf_call_center_cache_export_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log(`[CACHE EXPORT SUCCESS] Saved ${Object.keys(exportData).length} documents.`);
  return { docCount: Object.keys(exportData).length, byteSize: jsonStr.length };
};


export const getCachePartitionsDetail = async () => {
  const cacheColl = collection(db, "callCenterCache");
  const snap = await getDocs(cacheColl);
  const details = [];
  snap.docs.forEach(d => {
    if (d.id === "placeholder" || d.id === "contacts" || !/^\d{4}-\d{2}/.test(d.id)) return;
    const data = d.data();
    const contacts = data.contacts || {};
    const count = Object.keys(contacts).length;
    const sizeKb = Math.round(getByteSize(data) / 1024);
    const monthMatch = d.id.match(/^(\d{4}-\d{2})/);
    const month = monthMatch ? monthMatch[1] : "";
    details.push({
      docId: d.id,
      month,
      count,
      sizeKb,
      isSafe: sizeKb < 450 && count < 200
    });
  });
  details.sort((a, b) => a.docId.localeCompare(b.docId));
  return details;
};


export const mergePartitionPair = async (targetDocId, sourceDocId) => {
  console.log(`[PARTITION MERGE] Attempting to merge ${sourceDocId} into ${targetDocId}...`);
  const targetRef = doc(db, "callCenterCache", targetDocId);
  const sourceRef = doc(db, "callCenterCache", sourceDocId);
  
  const targetSnap = await getDoc(targetRef);
  const sourceSnap = await getDoc(sourceRef);
  
  if (!targetSnap.exists() || !sourceSnap.exists()) {
    throw new Error(`One or both documents do not exist: ${targetDocId}, ${sourceDocId}`);
  }
  
  const targetContacts = targetSnap.data().contacts || {};
  const sourceContacts = sourceSnap.data().contacts || {};
  
  const mergedContacts = { ...targetContacts, ...sourceContacts };
  const mergedData = { contacts: mergedContacts };
  const mergedSizeKb = Math.round(getByteSize(mergedData) / 1024);
  const mergedCount = Object.keys(mergedContacts).length;
  
  if (mergedSizeKb > 850) {
    return {
      success: false,
      reason: `Combined size (${mergedSizeKb} KB) exceeds 850 KB limit.`
    };
  }
  
  try {
    // Attempt setDoc to target document
    await setDoc(targetRef, mergedData);
    // If setDoc succeeds, delete source document
    await deleteDoc(sourceRef);
    console.log(`✓ [PARTITION MERGE SUCCESS] Merged ${sourceDocId} into ${targetDocId} (${mergedCount} contacts, ${mergedSizeKb} KB)`);
    return {
      success: true,
      targetDocId,
      sourceDocId,
      mergedCount,
      mergedSizeKb
    };
  } catch (err) {
    console.error(`❌ [PARTITION MERGE FAILED FOR ${targetDocId} + ${sourceDocId}]:`, err);
    return {
      success: false,
      reason: err.message || "Firestore rejected merged payload (too many index entries)."
    };
  }
};


export const mergeAllCompatiblePartitionsOneByOne = async () => {
  console.log("[PARTITION MERGE PROCESS] Starting 1-by-1 safe partition merging...");
  const partitions = await getCachePartitionsDetail();
  
  const monthGroups = {};
  partitions.forEach(p => {
    if (!monthGroups[p.month]) monthGroups[p.month] = [];
    monthGroups[p.month].push(p);
  });
  
  const results = [];
  let mergedTotalCount = 0;
  
  for (const [month, parts] of Object.entries(monthGroups)) {
    if (parts.length <= 1) continue;
    
    let i = 0;
    while (i < parts.length - 1) {
      const target = parts[i];
      const source = parts[i + 1];
      
      const mergeRes = await mergePartitionPair(target.docId, source.docId);
      if (mergeRes.success) {
        results.push(`✓ Merged ${source.docId} into ${target.docId} (${mergeRes.mergedCount} contacts, ${mergeRes.mergedSizeKb} KB)`);
        mergedTotalCount++;
        parts[i] = {
          docId: target.docId,
          month,
          count: mergeRes.mergedCount,
          sizeKb: mergeRes.mergedSizeKb
        };
        parts.splice(i + 1, 1);
      } else {
        console.log(`Skipping merge for ${target.docId} + ${source.docId}: ${mergeRes.reason}`);
        results.push(`⚠️ Skipped ${target.docId} + ${source.docId}: ${mergeRes.reason}`);
        i++;
      }
    }
  }

  // Renumber remaining partition documents sequentially (_part1, _part2, _part3...)
  for (const [month, parts] of Object.entries(monthGroups)) {
    for (let idx = 0; idx < parts.length; idx++) {
      const expectedDocId = `${month}_part${idx + 1}`;
      const current = parts[idx];
      if (current.docId !== expectedDocId) {
        try {
          console.log(`[PARTITION RENUMBER] Renumbering ${current.docId} to ${expectedDocId}...`);
          const oldRef = doc(db, "callCenterCache", current.docId);
          const newRef = doc(db, "callCenterCache", expectedDocId);
          const oldSnap = await getDoc(oldRef);
          if (oldSnap.exists()) {
            await setDoc(newRef, oldSnap.data());
            await deleteDoc(oldRef);
            current.docId = expectedDocId;
          }
        } catch (renumberErr) {
          console.warn(`Could not renumber ${current.docId} to ${expectedDocId}:`, renumberErr);
        }
      }
    }
  }
  
  return {
    mergedTotalCount,
    results
  };
};


export const updateContactInActiveCache = async (month, contactId, prunedContact, knownPartId = null) => {
  if (knownPartId) {
    try {
      console.log(`[FIRESTORE WRITE - updateContactInActiveCache] Direct updateDoc to target part: ${knownPartId} | contactId: ${contactId}`);
      const ref = doc(db, "callCenterCache", knownPartId);
      if (prunedContact === null) {
        await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });
        if (globalActivePartitionsCache[month]?.[knownPartId]?.contacts) {
          delete globalActivePartitionsCache[month][knownPartId].contacts[contactId];
        }
        return;
      } else {
        const memoryData = globalActivePartitionsCache[month]?.[knownPartId]?.contacts || {};
        const updatedContacts = { ...memoryData, [contactId]: prunedContact };
        const newSize = getByteSize({ contacts: updatedContacts });

        if (newSize < 850 * 1024) {
          await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });
          if (globalActivePartitionsCache[month]?.[knownPartId]) {
            if (!globalActivePartitionsCache[month][knownPartId].contacts) {
              globalActivePartitionsCache[month][knownPartId].contacts = {};
            }
            globalActivePartitionsCache[month][knownPartId].contacts[contactId] = prunedContact;
          }
          return;
        } else {
          console.warn(`Known partition ${knownPartId} exceeded 850KB ceiling (${Math.round(newSize/1024)}KB). Falling back to shift to latest partition...`);
        }
      }
    } catch (err) {
      console.warn("Direct update to knownPartId failed, falling back to in-memory/query search:", err);
    }
  }

  // 1. ZERO-READ OPTIMIZATION: Use active in-memory snapshot cache if available
  const memoryParts = globalActivePartitionsCache[month];
  if (memoryParts && Object.keys(memoryParts).length > 0) {
    console.log(`[ZERO-READ CACHE UPDATE] Using in-memory partition snapshot for month: ${month} (0 Firestore Reads!)`);
    let targetPartId = null;
    let chosenPartId = null;
    let maxPartNum = 0;

    Object.entries(memoryParts).forEach(([partId, partData]) => {
      const match = partId.match(/_part(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxPartNum) maxPartNum = num;
      } else {
        maxPartNum = Math.max(maxPartNum, 1);
      }

      const contacts = partData.contacts || {};
      if (contacts[contactId]) {
        targetPartId = partId;
      }
    });

    if (targetPartId) {
      const ref = doc(db, "callCenterCache", targetPartId);
      if (prunedContact === null) {
        await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });
        if (globalActivePartitionsCache[month][targetPartId]?.contacts) {
          delete globalActivePartitionsCache[month][targetPartId].contacts[contactId];
        }
      } else {
        const data = globalActivePartitionsCache[month][targetPartId] || {};
        const updatedContacts = { ...(data.contacts || {}), [contactId]: prunedContact };
        const newSize = getByteSize({ contacts: updatedContacts });

        if (newSize < 850 * 1024) {
          await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });
          globalActivePartitionsCache[month][targetPartId].contacts[contactId] = prunedContact;
        } else {
          // Remove from this part and move strictly to the LATEST part
          await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });
          delete globalActivePartitionsCache[month][targetPartId].contacts[contactId];

          let latestPartId = maxPartNum > 0 ? `${month}_part${maxPartNum}` : `${month}_part1`;
          let latestPartData = memoryParts[latestPartId];
          if (latestPartData && latestPartId !== targetPartId) {
            const dContacts = latestPartData.contacts || {};
            const testContacts = { ...dContacts, [contactId]: prunedContact };
            const testSize = getByteSize({ contacts: testContacts });
            if (testSize < 850 * 1024) {
              chosenPartId = latestPartId;
            }
          }

          if (chosenPartId) {
            const chosenRef = doc(db, "callCenterCache", chosenPartId);
            await updateDoc(chosenRef, { [`contacts.${contactId}`]: prunedContact });
            if (!globalActivePartitionsCache[month][chosenPartId].contacts) {
              globalActivePartitionsCache[month][chosenPartId].contacts = {};
            }
            globalActivePartitionsCache[month][chosenPartId].contacts[contactId] = prunedContact;
          } else {
            const newPartNum = maxPartNum > 0 ? maxPartNum + 1 : 1;
            const newPartId = `${month}_part${newPartNum}`;
            const newRef = doc(db, "callCenterCache", newPartId);
            await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });
            globalActivePartitionsCache[month][newPartId] = { contacts: { [contactId]: prunedContact } };
          }
        }
      }
      return;
    } else {
      if (prunedContact === null) return;

      // For a brand new lead, target ONLY the latest partition (highest part number)
      let latestPartId = maxPartNum > 0 ? `${month}_part${maxPartNum}` : `${month}_part1`;
      let latestPartData = memoryParts[latestPartId];
      if (latestPartData) {
        const dContacts = latestPartData.contacts || {};
        const testContacts = { ...dContacts, [contactId]: prunedContact };
        const testSize = getByteSize({ contacts: testContacts });
        if (testSize < 850 * 1024) {
          chosenPartId = latestPartId;
        }
      }

      if (chosenPartId) {
        const chosenRef = doc(db, "callCenterCache", chosenPartId);
        await updateDoc(chosenRef, { [`contacts.${contactId}`]: prunedContact });
        if (!globalActivePartitionsCache[month][chosenPartId].contacts) {
          globalActivePartitionsCache[month][chosenPartId].contacts = {};
        }
        globalActivePartitionsCache[month][chosenPartId].contacts[contactId] = prunedContact;
      } else {
        const newPartNum = maxPartNum > 0 ? maxPartNum + 1 : 1;
        const newPartId = `${month}_part${newPartNum}`;
        const newRef = doc(db, "callCenterCache", newPartId);
        await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });
        globalActivePartitionsCache[month][newPartId] = { contacts: { [contactId]: prunedContact } };
      }
      return;
    }
  }

  // 2. FALLBACK ONLY IF IN-MEMORY SNAPSHOT NOT LOADED
  const cacheColl = collection(db, "callCenterCache");

  // Query parts belonging to this month to locate existing contact or get latest partition
  const monthQuery = query(
    cacheColl,
    where(documentId(), ">=", month),
    where(documentId(), "<=", month + "\uf8ff")
  );
  console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache querying cache parts (fallback) for month: ${month}`);
  const snap = await getDocs(monthQuery);
  console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache completed | partsFound: ${snap.docs.length}`);

  let targetDoc = null;
  let latestDoc = null;
  let maxPartNum = 0;

  snap.docs.forEach(d => {
    if (d.id === month || d.id.startsWith(`${month}_part`)) {
      const match = d.id.match(/_part(\d+)$/);
      const num = match ? parseInt(match[1]) : 1;
      if (num >= maxPartNum) {
        maxPartNum = num;
        latestDoc = d;
      }

      const contacts = d.data().contacts || {};
      if (contacts[contactId]) {
        targetDoc = d;
      }
    }
  });

  if (targetDoc) {
    // Existing contact found in a specific partition document (e.g. part1) -> update it directly
    const ref = doc(db, "callCenterCache", targetDoc.id);
    if (prunedContact === null) {
      await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });
    } else {
      const data = targetDoc.data();
      const updatedContacts = { ...(data.contacts || {}), [contactId]: prunedContact };
      const newSize = getByteSize({ contacts: updatedContacts });

      if (newSize < 850 * 1024) {
        await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });
      } else {
        // Exceeds limit! Delete from current part and move to latest doc
        await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });

        if (latestDoc && latestDoc.id !== targetDoc.id) {
          const lContacts = latestDoc.data().contacts || {};
          const testContacts = { ...lContacts, [contactId]: prunedContact };
          const testSize = getByteSize({ contacts: testContacts });

          if (testSize < 850 * 1024) {
            const chosenRef = doc(db, "callCenterCache", latestDoc.id);
            await updateDoc(chosenRef, { [`contacts.${contactId}`]: prunedContact });
            return;
          }
        }

        const newPartId = `${month}_part${maxPartNum + 1}`;
        const newRef = doc(db, "callCenterCache", newPartId);
        await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });
      }
    }
  } else {
    // Brand new lead not found in any partition -> target ONLY the latest partition doc
    if (prunedContact === null) return;

    if (latestDoc) {
      const dContacts = latestDoc.data().contacts || {};
      const testContacts = { ...dContacts, [contactId]: prunedContact };
      const testSize = getByteSize({ contacts: testContacts });

      if (testSize < 850 * 1024) {
        const ref = doc(db, "callCenterCache", latestDoc.id);
        await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });
      } else {
        // Latest partition is full -> create next partition
        const newPartId = `${month}_part${maxPartNum + 1}`;
        const ref = doc(db, "callCenterCache", newPartId);
        await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });
      }
    } else {
      // No partition doc exists yet for this month -> create part1
      const newPartId = `${month}_part1`;
      const ref = doc(db, "callCenterCache", newPartId);
      await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });
    }
  }
};


export const updateContactInLockedReport = async (month, contactId, prunedContact) => {
  const lockedColl = collection(db, "lockedMonthlyReports");
  const q = query(lockedColl, where("month", "==", month));
  const snap = await getDocs(q);
  
  let targetDoc = null;
  
  // Find if the contact already exists in one of the parts
  for (const d of snap.docs) {
    const contacts = d.data().contacts || {};
    if (contacts[contactId]) {
      targetDoc = d;
      break;
    }
  }
  
  if (targetDoc) {
    const ref = doc(db, "lockedMonthlyReports", targetDoc.id);
    if (prunedContact === null) {
      await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });
    } else {
      // Check size limit (850 KB)
      const data = targetDoc.data();
      const updatedContacts = { ...data.contacts, [contactId]: prunedContact };
      const newSize = getByteSize({ contacts: updatedContacts });
      
      if (newSize < 850 * 1024) {
        await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });
      } else {
        // Exceeds limit! Remove from this part and find another
        await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });
        
        let chosenDoc = null;
        let maxPartNum = 0;
        
        snap.docs.forEach(d => {
          if (d.id === targetDoc.id) return;
          
          const match = d.id.match(/_part(\d+)$/);
          if (match) {
            const num = parseInt(match[1]);
            if (num > maxPartNum) maxPartNum = num;
          }
          
          const dContacts = d.data().contacts || {};
          const testContacts = { ...dContacts, [contactId]: prunedContact };
          const testSize = getByteSize({ contacts: testContacts });
          if (testSize < 850 * 1024 && !chosenDoc) {
            chosenDoc = d;
          }
        });
        
        if (chosenDoc) {
          const chosenRef = doc(db, "lockedMonthlyReports", chosenDoc.id);
          await updateDoc(chosenRef, { [`contacts.${contactId}`]: prunedContact });
        } else {
          const newPartId = `${month}_part${maxPartNum + 1}`;
          const ref = doc(db, "lockedMonthlyReports", newPartId);
          await setDoc(ref, {
            month,
            lockedAt: new Date().toISOString(),
            lockedBy: "System",
            status: "completed",
            contacts: {
              [contactId]: prunedContact
            }
          });
        }
      }
    }
  } else {
    // Contact doesn't exist in any part
    if (prunedContact === null) return; // Nothing to delete
    
    let chosenDoc = null;
    let maxPartNum = 0;
    
    snap.docs.forEach(d => {
      const match = d.id.match(/_part(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxPartNum) maxPartNum = num;
      }
      
      const dContacts = d.data().contacts || {};
      const testContacts = { ...dContacts, [contactId]: prunedContact };
      const testSize = getByteSize({ contacts: testContacts });
      if (testSize < 850 * 1024 && !chosenDoc) {
        chosenDoc = d;
      }
    });
    
    if (chosenDoc) {
      const ref = doc(db, "lockedMonthlyReports", chosenDoc.id);
      await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });
    } else {
      const newPartId = `${month}_part${maxPartNum + 1}`;
      const ref = doc(db, "lockedMonthlyReports", newPartId);
      await setDoc(ref, {
        month,
        lockedAt: new Date().toISOString(),
        lockedBy: "System",
        status: "completed",
        contacts: {
          [contactId]: prunedContact
        }
      });
    }
  }
};


export const updateCacheContacts = async (contactIds, inMemoryDataMap = {}, knownPartIdMap = {}) => {
  if (!contactIds || contactIds.length === 0) return;

  try {
    const currentMonth = getMonthStr(new Date());

    // 1. Fetch raw docs for contacts not provided in inMemoryDataMap
    const missingIds = contactIds.filter(id => !inMemoryDataMap[id]);
    const fetchedDataMap = {};

    if (missingIds.length > 0) {
      const fetchPromises = missingIds.map(id => getDoc(doc(db, "contacts", id)));
      const snaps = await Promise.all(fetchPromises);
      snaps.forEach(snap => {
        if (snap.exists()) {
          fetchedDataMap[snap.id] = { id: snap.id, ...snap.data() };
        } else {
          fetchedDataMap[snap.id] = { id: snap.id, _deleted: true };
        }
      });
    }

    // 2. Map contacts to their historical/active months
    const monthlyUpdatesMap = {};

    contactIds.forEach(id => {
      const raw = inMemoryDataMap[id] || fetchedDataMap[id];
      if (!raw) return;

      const isLive = raw.isAssigned === true && !raw._deleted;
      const contactMonths = new Set();

      if (isLive) {
        // ALWAYS include currentMonth for live assigned contacts so they appear in active cache partition
        contactMonths.add(currentMonth);

        const createdMonth = getMonthStr(raw.createdAt) || currentMonth;
        contactMonths.add(createdMonth);

        if (raw.attenderStates) {
          Object.values(raw.attenderStates).forEach(state => {
            const stateMonth = getMonthStr(state.lastCalledAt || state.updatedAt);
            if (stateMonth) contactMonths.add(stateMonth);
            (state.history || []).forEach(h => {
              const hTs = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null;
              const hMonth = getMonthStr(hTs);
              if (hMonth) contactMonths.add(hMonth);
            });
          });
        }

        (raw.history || []).forEach(h => {
          const hTs = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null;
          const hMonth = getMonthStr(hTs);
          if (hMonth) contactMonths.add(hMonth);
        });
      } else {
        contactMonths.add(currentMonth);
      }

      contactMonths.forEach(month => {
        if (!monthlyUpdatesMap[month]) {
          monthlyUpdatesMap[month] = {};
        }
        if (isLive) {
          monthlyUpdatesMap[month][`contacts.${id}`] = pruneContactForCacheForMonth({ id, ...raw }, month);
        } else {
          monthlyUpdatesMap[month][`contacts.${id}`] = deleteField();
        }
      });
    });

    console.log("%c⚡ [FIRESTORE WRITE - Partition Cache]", "background: #701a75; color: #f0abfc; font-weight: bold; padding: 2px 6px; border-radius: 4px;", `Syncing ${contactIds.length} contact(s) to "callCenterCache" partition doc(s) for month(s): ${Object.keys(monthlyUpdatesMap).join(", ")}`);

    // 3. Apply updates to each month document
    const cutoffMonth = getCutoffMonth(3);
    const updatePromises = Object.entries(monthlyUpdatesMap).map(async ([month, updates]) => {
      const isCompletedMonth = month < currentMonth;
      const isLockedMonth = month < cutoffMonth;
      
      if (isCompletedMonth) {
        // If it's a completed month, update the locked report snapshot parts
        for (const [key, val] of Object.entries(updates)) {
          const contactId = key.split(".")[1];
          const isDeleteVal = !(val && val.id);
          await updateContactInLockedReport(month, contactId, isDeleteVal ? null : val);
        }
      }
      
      // Also update the active cache if it's not locked/deleted yet
      if (!isLockedMonth) {
        for (const [key, val] of Object.entries(updates)) {
          const contactId = key.split(".")[1];
          const isDeleteVal = !(val && val.id);
          await updateContactInActiveCache(month, contactId, isDeleteVal ? null : val, knownPartIdMap[contactId] || null);
        }
      }
    });

    await Promise.all(updatePromises);
  } catch (err) {
    console.error("updateCacheContacts error:", err);
  }
};


export const verifyCallCenterCache = async () => {
  try {
    const liveSnap = await getDocs(collection(db, "contacts"));
    const currentMonth = getMonthStr(new Date());
    
    const liveMonthlyData = {};
    liveSnap.docs.forEach(d => {
      const data = d.data();
      if (data._deleted) return;
      
      const isAssigned = data.isAssigned === true || 
                         !!data.attenderId || 
                         (Array.isArray(data.attenderIds) && data.attenderIds.length > 0) ||
                         (data.attenderStates && Object.keys(data.attenderStates).length > 0);

      if (!isAssigned) return;
      
      const contactMonths = new Set();

      const addIfValidMonth = (ts) => {
        if (!ts) return;
        try {
          const m = getMonthStr(ts);
          if (m) contactMonths.add(m);
        } catch (e) {}
      };

      addIfValidMonth(data.createdAt);
      addIfValidMonth(data.updatedAt);
      addIfValidMonth(data.lastCalledAt);

      if (data.attenderStates) {
        Object.values(data.attenderStates).forEach(state => {
          addIfValidMonth(state.lastCalledAt);
          addIfValidMonth(state.updatedAt);
          addIfValidMonth(state.firstCalledAt);
          (state.history || []).forEach(h => {
            addIfValidMonth(h.timestamp);
          });
        });
      }

      (data.history || []).forEach(h => {
        addIfValidMonth(h.timestamp);
      });
      
      contactMonths.forEach(month => {
        if (!liveMonthlyData[month]) {
          liveMonthlyData[month] = {};
        }
        liveMonthlyData[month][d.id] = pruneContactForCacheForMonth({ id: d.id, ...data }, month);
      });
    });
    
    const cacheColl = collection(db, "callCenterCache");
    const cacheSnap = await getDocs(cacheColl);
    const cacheMonthlyData = {};
    cacheSnap.docs.filter(d => d.id !== "contacts").forEach(d => {
      const monthKey = d.id.split("_")[0];
      if (!cacheMonthlyData[monthKey]) {
        cacheMonthlyData[monthKey] = {};
      }
      Object.assign(cacheMonthlyData[monthKey], d.data().contacts || {});
    });
    
    const liveMonths = Object.keys(liveMonthlyData);
    const cacheMonths = Object.keys(cacheMonthlyData);
    
    let mismatches = [];
    
    cacheMonths.forEach(m => {
      if (!liveMonthlyData[m]) {
        if (Object.keys(cacheMonthlyData[m]).length > 0) {
          mismatches.push(`Cache month ${m} has contacts, but it is not active in live database.`);
        }
      }
    });
    
    liveMonths.forEach(month => {
      const liveContactsMap = liveMonthlyData[month];
      const cacheContactsMap = cacheMonthlyData[month] || {};
      
      const liveKeys = Object.keys(liveContactsMap);
      const cacheKeys = Object.keys(cacheContactsMap);
      
      if (liveKeys.length !== cacheKeys.length) {
        mismatches.push(`Month ${month} count mismatch: Live has ${liveKeys.length} contacts, Cache has ${cacheKeys.length}`);
      }
      
      liveKeys.forEach(id => {
        const liveC = liveContactsMap[id];
        const cacheC = cacheContactsMap[id];
        if (!cacheC) {
          mismatches.push(`Month ${month}: Contact ID ${id} is missing from cache.`);
          return;
        }
        
        const liveStatus = liveC.status || "";
        const cacheStatus = cacheC.status || "";
        if (liveStatus !== cacheStatus) {
          mismatches.push(`Month ${month}, Contact ${id} status mismatch: Live "${liveStatus}" vs Cached "${cacheStatus}"`);
        }
        const liveSource = liveC.Source || liveC.source || "";
        const cacheSource = cacheC.Source || cacheC.source || "";
        if (liveSource !== cacheSource) {
          mismatches.push(`Month ${month}, Contact ${id} source mismatch: Live "${liveSource}" vs Cached "${cacheSource}"`);
        }
        const liveCalledFor = liveC["Called For"] || liveC.calledFor || "";
        const cacheCalledFor = cacheC["Called For"] || cacheC.calledFor || "";
        if (liveCalledFor !== cacheCalledFor) {
          mismatches.push(`Month ${month}, Contact ${id} calledFor mismatch: Live "${liveCalledFor}" vs Cached "${cacheCalledFor}"`);
        }
        
        const liveHistoryLen = (liveC.history || []).length;
        const cachedHistoryLen = (cacheC.history || []).length;
        if (liveHistoryLen !== cachedHistoryLen) {
          mismatches.push(`Month ${month}, Contact ${id} history count mismatch: Live ${liveHistoryLen} vs Cached ${cachedHistoryLen}`);
        }
      });
    });
    
    if (mismatches.length > 0) {
      return {
        status: "mismatch",
        message: `Found ${mismatches.length} discrepancies between database and cache across months.`,
        mismatches: mismatches.slice(0, 10)
      };
    }
    
    return {
      status: "healthy",
      message: `All monthly cache documents are 100% healthy! All contacts and history items match perfectly.`,
      liveCount: liveSnap.docs.length
    };
  } catch (err) {
    console.error("verifyCallCenterCache error:", err);
    return { status: "error", message: "Failed to verify cache: " + err.message };
  }
};


export const getMonthRange = (option) => {
  const current = new Date();
  const currentMonthStr = getMonthStr(current);
  
  if (!option) {
    return { startMonth: currentMonthStr, endMonth: currentMonthStr };
  }
  
  if (option === "last-3-months") {
    const start = new Date();
    start.setMonth(start.getMonth() - 2);
    return { startMonth: getMonthStr(start), endMonth: currentMonthStr };
  }
  
  if (option === "last-6-months") {
    const start = new Date();
    start.setMonth(start.getMonth() - 5);
    return { startMonth: getMonthStr(start), endMonth: currentMonthStr };
  }
  
  if (option === "ALL") {
    return { startMonth: "0000-00", endMonth: currentMonthStr };
  }
  
  // Specific month like "2026-07"
  return { startMonth: option, endMonth: option };
};


export const subscribeToAllCallLogs = (tag, scopeOption, callback) => {
  let targetOption = scopeOption;
  let finalCallback = callback;
  if (typeof scopeOption === "function") {
    finalCallback = scopeOption;
    targetOption = getMonthStr(new Date());
  } else if (!targetOption) {
    targetOption = getMonthStr(new Date());
  }

  const cacheKey = `tgf_admin_logs_v3_${targetOption}_${tag || "ALL"}`;

  // 1. Immediately emit cached admin logs from IndexedDB if available (0ms, 0 Firebase reads)
  getIDBCache(cacheKey).then(cachedLogs => {
    if (Array.isArray(cachedLogs) && cachedLogs.length > 0) {
      finalCallback(cachedLogs);
    }
  }).catch(err => {
    console.warn("Failed to load admin call logs from IndexedDB:", err);
  });

  const { startMonth, endMonth } = getMonthRange(targetOption);

  // Query from 3 months prior to ensure leads imported in earlier months but called in targetMonth are loaded
  const now = new Date();
  const prev3Date = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const prev3MonthStr = `${prev3Date.getFullYear()}-${String(prev3Date.getMonth() + 1).padStart(2, "0")}`;
  const queryStartMonth = (targetOption === "ALL" || !targetOption) ? "0000-00" : (targetOption < prev3MonthStr ? targetOption : prev3MonthStr);

  let lockedDocs = [];
  let cacheSnap = null;
  
  const triggerCallback = () => {
    if (!cacheSnap) return;
    
    const activeDocs = cacheSnap.docs.filter(d => d.id !== "contacts" && /^\d{4}-\d{2}(_part\d+)?$/.test(d.id));
    const activeIds = new Set(activeDocs.map(d => d.id.split("_")[0]));
    
    // Combine active cache docs and locked docs in the range
    const finalDocs = [
      ...activeDocs,
      ...lockedDocs.filter(d => {
        const docMonth = d.data().month || d.id.split("_")[0];
        return !activeIds.has(docMonth);
      })
    ];
    
    finalDocs.sort((a, b) => a.id.localeCompare(b.id));
    
    const getTimeMs = (val) => {
      if (!val) return 0;
      if (typeof val.toDate === "function") return val.toDate().getTime();
      if (val.seconds !== undefined) return val.seconds * 1000;
      const d = new Date(val);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const contactsMap = {};
    finalDocs.forEach(docSnap => {
      const docContacts = docSnap.data().contacts || {};
      Object.entries(docContacts).forEach(([id, c]) => {
        const existing = contactsMap[id];
        if (!existing) {
          contactsMap[id] = { ...c };
        } else {
          const newTime = getTimeMs(c.updatedAt || c.lastCalledAt);
          const existingTime = getTimeMs(existing.updatedAt || existing.lastCalledAt);
          
          // Deduplicate top-level history
          const topHistMap = new Map();
          (existing.history || []).forEach(h => {
            const tsMs = getTimeMs(h.timestamp || h.date);
            const k = `${tsMs}_${h.status}_${h.remark}`;
            topHistMap.set(k, h);
          });
          (c.history || []).forEach(h => {
            const tsMs = getTimeMs(h.timestamp || h.date);
            const k = `${tsMs}_${h.status}_${h.remark}`;
            topHistMap.set(k, h);
          });

          // Merge attenderStates with deduplicated history per attender
          const mergedStates = { ...(existing.attenderStates || {}), ...(c.attenderStates || {}) };
          if (existing.attenderStates && c.attenderStates) {
            Object.keys(mergedStates).forEach(attId => {
              const stOld = existing.attenderStates[attId];
              const stNew = c.attenderStates[attId];
              if (stOld && stNew) {
                const tOld = getTimeMs(stOld.updatedAt || stOld.lastCalledAt);
                const tNew = getTimeMs(stNew.updatedAt || stNew.lastCalledAt);
                const winner = tNew >= tOld ? stNew : stOld;
                
                const stateHistMap = new Map();
                (stOld.history || []).forEach(h => {
                  const tsMs = getTimeMs(h.timestamp || h.date);
                  const k = `${tsMs}_${h.status}_${h.remark}`;
                  stateHistMap.set(k, h);
                });
                (stNew.history || []).forEach(h => {
                  const tsMs = getTimeMs(h.timestamp || h.date);
                  const k = `${tsMs}_${h.status}_${h.remark}`;
                  stateHistMap.set(k, h);
                });

                mergedStates[attId] = {
                  ...winner,
                  history: Array.from(stateHistMap.values())
                };
              }
            });
          }

          const baseObj = newTime >= existingTime ? c : existing;
          contactsMap[id] = {
            ...baseObj,
            history: Array.from(topHistMap.values()),
            attenderStates: mergedStates
          };
        }
      });
    });
    
    let logs = Object.values(contactsMap);
    
    if (tag && tag !== "ALL") {
      logs = logs.filter(log => Array.isArray(log.tags) && log.tags.includes(tag));
    }
    
    logs = logs.filter(c => c.isAssigned === true && !c._deleted);
    
    logs.sort((a, b) => {
      const ta = a.createdAt || 0;
      const tb = b.createdAt || 0;
      return ta - tb;
    });

    setIDBCache(cacheKey, logs).catch(err => console.warn("Failed to save admin logs to IDB:", err));
    finalCallback(logs);
  };

  // Fetch the locked monthly reports in range (served from IndexedDB cache first for 0 reads)
  const lockedCacheKey = `tgf_locked_reports_${queryStartMonth}_${endMonth}`;
  getIDBCache(lockedCacheKey).then(cachedLocked => {
    if (Array.isArray(cachedLocked) && cachedLocked.length > 0) {
      console.log(`[ADMIN IDB CACHE] Loaded ${cachedLocked.length} lockedMonthlyReports from IndexedDB (0 Reads)`);
      lockedDocs = cachedLocked.map(d => ({
        id: d.id,
        data: () => d
      }));
      triggerCallback();
    } else {
      const lockedQuery = query(
        collection(db, "lockedMonthlyReports"),
        where(documentId(), ">=", queryStartMonth),
        where(documentId(), "<=", endMonth + "\uf8ff")
      );
      console.log(`[ADMIN FIRESTORE READ - getDocs] subscribeToAllCallLogs checking lockedMonthlyReports | range: ${queryStartMonth} to ${endMonth}`);
      getDocs(lockedQuery).then(snap => {
        console.log(`[ADMIN FIRESTORE READ - getDocs] lockedMonthlyReports completed | docsCount: ${snap.docs.length}`);
        lockedDocs = snap.docs;
        const plainLocked = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIDBCache(lockedCacheKey, plainLocked).catch(err => console.warn("Failed to cache locked reports:", err));
        triggerCallback();
      }).catch(err => {
        console.error("subscribeToAllCallLogs locked fetch error:", err);
        triggerCallback();
      });
    }
  }).catch(() => {
    triggerCallback();
  });
  
  const cacheQuery = query(
    collection(db, "callCenterCache"),
    where(documentId(), ">=", queryStartMonth),
    where(documentId(), "<=", endMonth + "\uf8ff")
  );

  console.log(`[ADMIN CACHE QUERY]`, {
    startMonth: queryStartMonth,
    endMonth,
    queryType: "callCenterCache",
    expectedMonths: [queryStartMonth, endMonth]
  });

  const unsubCache = onSnapshot(cacheQuery, async (snap) => {
    const docIds = snap.docs.map(d => d.id);
    const addedCount = snap.docChanges().filter(c => c.type === "added").length;
    const modifiedCount = snap.docChanges().filter(c => c.type === "modified").length;
    const removedCount = snap.docChanges().filter(c => c.type === "removed").length;

    console.log(`[ADMIN CACHE SNAPSHOT]`, {
      source: snap.metadata.fromCache ? "IDB/LOCAL_CACHE" : "FIRESTORE",
      docsReturned: snap.docs.length,
      documentIds: docIds,
      changes: {
        added: addedCount,
        modified: modifiedCount,
        removed: removedCount
      }
    });

    if (!snap.metadata.fromCache && snap.docs.length > 0) {
      trackFirestoreRead({
        collection: "callCenterCache",
        operation: "onSnapshot",
        documentsReturned: snap.docs.length,
        reason: "subscribeToAllCallLogs",
        source: "admin/callCenterCache"
      });
    }

    if (snap.empty && lockedDocs.length === 0) {
      try {
        const cached = await getIDBCache(cacheKey);
        if (Array.isArray(cached) && cached.length > 0) {
          console.log(
            "%c⚡ [0-READ CACHE HIT - subscribeToAllCallLogs]",
            "background: #065f46; color: #34d399; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
            `Served ${cached.length} logs from IndexedDB | 0 Firestore Reads`
          );
          finalCallback(cached);
          return;
        }
      } catch (e) {}
      
      console.log(`[subscribeToAllCallLogs] No callCenterCache partition docs found for ${targetOption}. Returning empty list (0 contacts query).`);
      finalCallback([]);
      return;
    }
    
    cacheSnap = snap;
    triggerCallback();
  }, async err => {
    console.error("subscribeToAllCallLogs snapshot error:", err);
    try {
      const cached = await getIDBCache(cacheKey);
      if (Array.isArray(cached) && cached.length > 0) {
        console.log(`⚡ [ADMIN IDB ZERO-READ CACHE ON ERROR] Served ${cached.length} logs from IndexedDB (0 Firestore Reads)`);
        finalCallback(cached);
        return;
      }
    } catch (e) {}
    finalCallback([]);
  });

  return () => {
    console.log(`[FIRESTORE LISTENER]\ncollection: callCenterCache\nlistener: STOP`);
    unsubCache();
  };
};


export const runAutoLockAndPurgeCheck = async () => {
  try {
    console.log("[Auto-Lock] Starting lock and purge background checks...");
    const cacheColl = collection(db, "callCenterCache");
    const snap = await getDocs(cacheColl);
    const activeDocIds = snap.docs.map(d => d.id).filter(id => id !== "contacts" && /^\d{4}-\d{2}(_part\d+)?$/.test(id));
    const currentMonth = getMonthStr(new Date());
    const cutoffMonth = getCutoffMonth(3);
    const completedMonths = activeDocIds
      .map(id => id.split("_")[0])
      .filter(m => m < currentMonth)
      .filter((v, i, a) => a.indexOf(v) === i); // unique
    
    if (completedMonths.length > 0) {
      const lockedSnap = await getDocs(collection(db, "lockedMonthlyReports"));
      const lockedMonths = new Set(lockedSnap.docs.map(d => d.id));

      for (const month of completedMonths) {
        const isOldCache = month < cutoffMonth;
        if (isOldCache) {
          console.log(`[Auto-Purge] Old cache detected: ${month}. Triggering lock & purge...`);
          try {
            await lockAndPurgeMonthlyReport(month, "Auto-System", true);
          } catch (err) {
            console.error(`[Auto-Purge] Failed to purge cache for ${month}:`, err);
          }
        } else {
          // Completed but within 3-month window: ensure snapshot exists
          const hasSnapshot = lockedMonths.has(month);
          if (!hasSnapshot) {
            console.log(`[Auto-Snapshot] Completed month detected within window: ${month}. Generating snapshot...`);
            try {
              await lockAndPurgeMonthlyReport(month, "Auto-System", false);
            } catch (err) {
              console.error(`[Auto-Snapshot] Failed to snapshot month ${month}:`, err);
            }
          }
        }
      }
    }
    console.log("[Auto-Lock] Checks completed successfully.");
  } catch (err) {
    console.error("runAutoLockAndPurgeCheck failed:", err);
  }
};

// Get all call logs for any attender (admin view)

export const registerRegistrationMonth = async (yearMonth) => {
  if (!yearMonth) return;
  const clean = yearMonth.trim();
  if (!clean) return;
  try {
    await setDoc(doc(db, "registrationMonths", clean), {
      month: clean,
      createdAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error("Failed to register registration month:", e);
  }
};

// Fetch all unique registeredYearMonth values from registrations (Optimized)

export const getRegistrationMonths = async () => {
  try {
    const q = query(collection(db, "registrationMonths"));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      return snap.docs.map(d => d.id).sort((a, b) => b.localeCompare(a));
    }

    // Migration fallback: if registrationMonths is empty, build it from registrations
    console.log("Migration: Populating registrationMonths from existing registrations...");
    const regQ = query(collection(db, "registrations"));
    const regSnap = await getDocs(regQ);
    const monthsSet = new Set();
    
    regSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.registeredYearMonth && !data._deleted) {
        monthsSet.add(data.registeredYearMonth);
      }
    });

    const batchPromises = Array.from(monthsSet).map(m =>
      setDoc(doc(db, "registrationMonths", m), {
        month: m,
        createdAt: serverTimestamp()
      }, { merge: true })
    );
    
    if (batchPromises.length > 0) {
      await Promise.all(batchPromises);
    }

    const sorted = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
    if (sorted.length === 0) {
      const now = new Date();
      sorted.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    }
    return sorted;
  } catch (err) {
    console.error("getRegistrationMonths error:", err);
    const now = new Date();
    return [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`];
  }
};

// ─────────────────────────────────────────────
// INDEXEDDB ASYNC STORAGE (5MB+ Large Cache Support)
// ─────────────────────────────────────────────
const IDB_NAME = "TGF_AppCache";
const IDB_STORE = "registrations_cache";

const openIDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject("IndexedDB unavailable");
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};


export const purgeStaleHistoricalCache = async (maxKeepMonths = 6) => {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const keysReq = store.getAllKeys();

    keysReq.onsuccess = () => {
      const keys = keysReq.result || [];
      const now = new Date();
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(now.getFullYear(), now.getMonth() - maxKeepMonths, 1);
      const cutoffStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, "0")}`;

      keys.forEach(key => {
        if (typeof key === "string" && key.startsWith("tgf_historical_cache_")) {
          const match = key.match(/tgf_historical_cache_(\d{4}-\d{2})_/);
          const getReq = store.get(key);
          getReq.onsuccess = () => {
            const entry = getReq.result;
            const monthStr = match ? match[1] : null;
            const isStaleMonth = monthStr && monthStr < cutoffStr;
            const isExpiredTTL = entry && entry.timestamp && (Date.now() - entry.timestamp > ONE_WEEK_MS);

            if (isStaleMonth || isExpiredTTL) {
              console.log(`[CACHE PURGE] Deleting historical cache key: ${key} (${isExpiredTTL ? "1-Week TTL Expired" : "Older than cutoff"})`);
              const delTx = db.transaction(IDB_STORE, "readwrite");
              delTx.objectStore(IDB_STORE).delete(key);
            }
          };
        }
      });
    };
  } catch (e) {
    console.warn("Failed to purge stale historical cache:", e);
  }
};

// ─────────────────────────────────────────────
// OFFLINE & QUOTA PENDING WRITES QUEUE ENGINE
// ─────────────────────────────────────────────
const PENDING_WRITES_KEY = "tgf_pending_writes_queue";


export const updateRegistrationInActiveCache = async (monthStr, registrationId, regPayload) => {
  if (!monthStr || !registrationId) return;
  try {
    const docRef = doc(db, "registrationsCache", monthStr);
    const snap = await getDoc(docRef);
    let regs = {};
    if (snap.exists()) {
      regs = snap.data().registrations || {};
    }
    if (regPayload === null || (regPayload && regPayload._deleted)) {
      delete regs[registrationId];
    } else {
      regs[registrationId] = { id: registrationId, ...regPayload };
    }
    const count = Object.keys(regs).length;
    await setDoc(docRef, {
      month: monthStr,
      registrations: regs,
      count,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("updateRegistrationInActiveCache error:", err);
  }
};

export const rebuildRegistrationsCache = async (isDryRun = false) => {
  console.log(`[REGISTRATIONS CACHE CONSOLIDATION] Starting rebuild (Dry Run: ${isDryRun})...`);
  const snap = await getDocs(collection(db, "registrations"));
  const totalRegistrations = snap.docs.length;
  const monthlyGroups = {};

  snap.docs.forEach(docSnap => {
    const data = docSnap.data();
    if (data._deleted) return;

    let monthStr = data.registeredYearMonth;
    if (!monthStr || !monthStr.match(/^\d{4}-\d{2}$/)) {
      monthStr = getMonthStr(data.registeredAt || data.createdAt || new Date());
    }
    if (!monthStr) monthStr = getMonthStr(new Date());

    if (!monthlyGroups[monthStr]) {
      monthlyGroups[monthStr] = {};
    }
    monthlyGroups[monthStr][docSnap.id] = { id: docSnap.id, ...data };
  });

  const partsToSet = [];
  Object.entries(monthlyGroups).forEach(([month, regsMap]) => {
    const regCount = Object.keys(regsMap).length;
    const payload = {
      month,
      registrations: regsMap,
      count: regCount,
      updatedAt: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(payload);
    const sizeKb = parseFloat((new Blob([jsonStr]).size / 1024).toFixed(2));
    partsToSet.push({
      docId: month,
      count: regCount,
      sizeKb,
      payload
    });
  });

  if (!isDryRun) {
    for (const part of partsToSet) {
      await setDoc(doc(db, "registrationsCache", part.docId), part.payload);
    }
  }

  return {
    totalRegistrations,
    newPartsCount: partsToSet.length,
    partsToSet,
    status: "success"
  };
};

export const verifyRegistrationsCache = async () => {
  try {
    const [liveSnap, cacheSnap] = await Promise.all([
      getDocs(collection(db, "registrations")),
      getDocs(collection(db, "registrationsCache"))
    ]);

    const liveCount = liveSnap.docs.filter(d => !d.data()._deleted).length;
    let cacheRegCount = 0;
    cacheSnap.docs.forEach(d => {
      const data = d.data();
      if (data && data.registrations) {
        cacheRegCount += Object.keys(data.registrations).length;
      }
    });

    const isHealthy = liveCount === cacheRegCount;
    return {
      status: isHealthy ? "healthy" : "mismatch",
      liveCount,
      cacheRegCount,
      partitionsCount: cacheSnap.docs.length,
      message: isHealthy 
        ? `Registrations Cache is fully healthy! Live: ${liveCount}, Cache: ${cacheRegCount}`
        : `Discrepancy detected: Live: ${liveCount}, Cache: ${cacheRegCount}`
    };
  } catch (err) {
    console.error("verifyRegistrationsCache error:", err);
    throw err;
  }
};

export const getRegistrationsCachePartitionsDetail = async () => {
  try {
    const snap = await getDocs(collection(db, "registrationsCache"));
    const list = [];
    snap.docs.forEach(d => {
      const data = d.data();
      const count = data.count || (data.registrations ? Object.keys(data.registrations).length : 0);
      const jsonStr = JSON.stringify({ id: d.id, ...data });
      const sizeKb = parseFloat((new Blob([jsonStr]).size / 1024).toFixed(2));
      list.push({
        docId: d.id,
        count,
        sizeKb
      });
    });
    list.sort((a, b) => b.docId.localeCompare(a.docId));
    return list;
  } catch (err) {
    console.error("getRegistrationsCachePartitionsDetail error:", err);
    return [];
  }
};

export const subscribeToRegistrations = (scopeOption, callback) => {
  let targetOption = scopeOption;
  let finalCallback = callback;
  if (typeof scopeOption === "function") {
    finalCallback = scopeOption;
    targetOption = getMonthStr(new Date());
  } else if (!targetOption) {
    targetOption = getMonthStr(new Date());
  }

  const cacheKey = `tgf_cache_registrations_${targetOption}`;

  // 1. Check IndexedDB first: If data is present in IndexedDB, serve it and DO NOT contact Firestore (0 READS!)
  getIDBCache(cacheKey).then(async cachedDocs => {
    const isHit = Array.isArray(cachedDocs) && cachedDocs.length > 0;
    console.log(`[REGISTRATION LOAD DECISION]`, {
      scope: targetOption,
      indexedDBHit: isHit,
      indexedDBCount: cachedDocs?.length || 0,
      ACTION: isHit ? "IDB" : "FIRESTORE"
    });

    if (isHit) {
      const hydrated = cachedDocs.map(doc => {
        if (!doc) return doc;
        const copy = { ...doc };
        if (copy.registeredAt && typeof copy.registeredAt === "object" && !copy.registeredAt.toMillis) {
          const sec = copy.registeredAt.seconds || 0;
          const nano = copy.registeredAt.nanoseconds || 0;
          copy.registeredAt = {
            ...copy.registeredAt,
            toDate: () => new Date(sec * 1000 + nano / 1e6),
            toMillis: () => sec * 1000 + Math.floor(nano / 1e6)
          };
        }
        return copy;
      });
      finalCallback(hydrated);
      return;
    }

    // 2. ONLY if IndexedDB is EMPTY: Fetch partition document once from Firestore
    const { startMonth, endMonth } = getMonthRange(targetOption);
    const cacheQuery = query(
      collection(db, "registrationsCache"),
      where(documentId(), ">=", startMonth),
      where(documentId(), "<=", endMonth + "\uf8ff")
    );

    try {
      const snap = await getDocs(cacheQuery);
      const partitionIds = snap.docs.map(d => d.id);

      console.log(`[REGISTRATION FIRESTORE READ]`, {
        partitions: partitionIds,
        partitionCount: partitionIds.length,
        estimatedReads: partitionIds.length
      });

      trackFirestoreRead({
        collection: "registrationsCache",
        operation: "getDocs",
        documentsReturned: partitionIds.length,
        reason: "subscribeToRegistrations",
        source: "admin/registrationsCache"
      });

      let docs = [];
      if (!snap.empty) {
        const regsMap = {};
        snap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const docRegs = data.registrations || {};
          Object.entries(docRegs).forEach(([id, r]) => {
            regsMap[id] = { id, ...r };
          });
        });
        docs = Object.values(regsMap).filter(r => !r._deleted);
      }

      console.log(`[REGISTRATION LOAD RESULT]`, {
        registrationsFetched: docs.length,
        partitionsRead: partitionIds,
        firestoreReads: partitionIds.length,
        savedToIndexedDB: true
      });

      docs.sort((a, b) => {
        const ta = a.registeredAt?.toMillis ? a.registeredAt.toMillis() : (a.registeredAt?.seconds ? a.registeredAt.seconds * 1000 : 0);
        const tb = b.registeredAt?.toMillis ? b.registeredAt.toMillis() : (b.registeredAt?.seconds ? b.registeredAt.seconds * 1000 : 0);
        return tb - ta;
      });

      await setIDBCache(cacheKey, docs);
      finalCallback(docs);
    } catch (err) {
      console.error("subscribeToRegistrations fetch error:", err);
    }
  }).catch(err => {
    console.warn("IndexedDB access error in subscribeToRegistrations:", err);
  });

  return () => {}; // Pure cache-first, no realtime listener subscription needed
};

/**
 * Manually force-refresh registrations from Firestore partition cache into IndexedDB
 */
export const refreshRegistrations = async (scopeOption, callback) => {
  let targetOption = scopeOption || getMonthStr(new Date());
  const cacheKey = `tgf_cache_registrations_${targetOption}`;
  const { startMonth, endMonth } = getMonthRange(targetOption);
  
  const cacheQuery = query(
    collection(db, "registrationsCache"),
    where(documentId(), ">=", startMonth),
    where(documentId(), "<=", endMonth + "\uf8ff")
  );

  const snap = await getDocs(cacheQuery);
  let docs = [];

  if (snap.empty) {
    const fallbackQ = query(
      collection(db, "registrations"),
      where("registeredYearMonth", ">=", startMonth),
      where("registeredYearMonth", "<=", endMonth)
    );
    const liveSnap = await getDocs(fallbackQ);
    docs = liveSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    const regsMap = {};
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const docRegs = data.registrations || {};
      Object.entries(docRegs).forEach(([id, r]) => {
        regsMap[id] = { id, ...r };
      });
    });
    docs = Object.values(regsMap).filter(r => !r._deleted);
  }

  docs.sort((a, b) => {
    const ta = a.registeredAt?.toMillis ? a.registeredAt.toMillis() : (a.registeredAt?.seconds ? a.registeredAt.seconds * 1000 : 0);
    const tb = b.registeredAt?.toMillis ? b.registeredAt.toMillis() : (b.registeredAt?.seconds ? b.registeredAt.seconds * 1000 : 0);
    return tb - ta;
  });

  await setIDBCache(cacheKey, docs);
  if (typeof callback === "function") callback(docs);
  return docs;
};

// ─────────────────────────────────────────────
// EXCEL CLOUD PERSISTENCE
// ─────────────────────────────────────────────



export const DEFAULT_CONNECTED_STATUSES = [
  "Info given", "Interested", "Reg.Done", "reminder", "Query", 
  "Already Reg.d", "Next time", "Shivir done", "Not possible", 
  "Pending", "Not interested", "Not Attended", "Call Log Added"
];


export const DEFAULT_NOT_CONNECTED_STATUSES = [
  "NA", "Busy", "Call Cut", "switched off", "Invalid No", 
  "Called by mistake", "No Network", "wrong no.", "no answer"
];


export const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    id: "tpl_1",
    title: "Happy Thoughts Greeting",
    emoji: "✨",
    text: "Happy Thoughts {Name} ji! Greetings from Tej Gyan Foundation."
  },
  {
    id: "tpl_2",
    title: "Shivir Information",
    emoji: "🌸",
    text: "Happy Thoughts {Name} ji! Greetings from Tej Gyan Foundation. Please let us know if you need any information regarding our upcoming Shivirs and meditation retreats."
  },
  {
    id: "tpl_3",
    title: "Registration Follow-up",
    emoji: "📝",
    text: "Happy Thoughts {Name} ji! Thank you for your interest in the Tej Gyan Foundation Shivir. Please complete your registration process at your earliest convenience."
  }
];


export const getSettingsOptions = async () => {
  const docRef = doc(db, "settings", "call_center_options");
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    return {
      statusOptions: data.statusOptions || DEFAULT_STATUS_OPTIONS,
      sourceOptions: data.sourceOptions || DEFAULT_SOURCE_OPTIONS,
      calledForOptions: data.calledForOptions || DEFAULT_CALLED_FOR_OPTIONS,
      connectedStatuses: data.connectedStatuses || DEFAULT_CONNECTED_STATUSES,
      notConnectedStatuses: data.notConnectedStatuses || DEFAULT_NOT_CONNECTED_STATUSES,
      optionalCompulsoryStatuses: data.optionalCompulsoryStatuses || data.notConnectedStatuses || DEFAULT_NOT_CONNECTED_STATUSES,
      whatsappTemplates: data.whatsappTemplates || DEFAULT_WHATSAPP_TEMPLATES
    };
  }
  
  // Create default options if not exists
  const defaults = {
    statusOptions: DEFAULT_STATUS_OPTIONS,
    sourceOptions: DEFAULT_SOURCE_OPTIONS,
    calledForOptions: DEFAULT_CALLED_FOR_OPTIONS,
    connectedStatuses: DEFAULT_CONNECTED_STATUSES,
    notConnectedStatuses: DEFAULT_NOT_CONNECTED_STATUSES,
    optionalCompulsoryStatuses: DEFAULT_NOT_CONNECTED_STATUSES,
    whatsappTemplates: DEFAULT_WHATSAPP_TEMPLATES
  };
  await setDoc(docRef, defaults, { merge: true });
  return defaults;
};


export const updateCallCenterOptions = async (updates) => {
  const docRef = doc(db, "settings", "call_center_options");
  await setDoc(docRef, updates, { merge: true });
};

let inMemoryOptions = null;
const optionsSubscribers = new Set();


export const subscribeToCallCenterOptions = (onUpdate) => {
  getSettingsOptions()
    .then(data => {
      if (data && typeof onUpdate === "function") onUpdate(data);
    })
    .catch(() => {});
  return () => {};
};




export const subscribeToRecentRegistrations = (callback) => {
  // Derive recent registrations directly from the shared callCenterCache snapshot (0 Extra Firestore Reads!)
  return subscribeToCallLogs(null, null, "ALL", (logs) => {
    if (!Array.isArray(logs)) return;
    const registeredList = [];
    logs.forEach(log => {
      let foundReg = false;
      if (log.attenderStates) {
        Object.entries(log.attenderStates).forEach(([aId, st]) => {
          if (st?.status === "Reg.Done") {
            foundReg = true;
            const calledFor = st["Called For"] || st.calledFor || log["Called For"] || log.calledFor || log.programName || "";
            const regTime = st.updatedAt || st.lastCalledAt || log.registeredAt || log.updatedAt || 0;
            registeredList.push({
              id: `${log.id}_${aId}_${String(calledFor).trim()}`,
              name: log.Name || log.name || log.caller || "Someone",
              convertedBy: st.attenderName || log.convertedBy || log.attenderName || "Attender",
              calledFor,
              timestamp: typeof regTime === "string" ? new Date(regTime).getTime() : (regTime?.toMillis ? regTime.toMillis() : (regTime?.seconds ? regTime.seconds * 1000 : Date.now()))
            });
          }
        });
      }
      // Top-level fallback if not captured in attenderStates
      if (!foundReg && log.status === "Reg.Done") {
        const calledFor = log["Called For"] || log.calledFor || log.programName || "";
        const regTime = log.registeredAt || log.updatedAt || log.createdAt || 0;
        registeredList.push({
          id: `${log.id}_${String(calledFor).trim()}`,
          name: log.Name || log.name || log.caller || "Someone",
          convertedBy: log.convertedBy || log.attenderName || log.assignedName || "Attender",
          calledFor,
          timestamp: typeof regTime === "string" ? new Date(regTime).getTime() : (regTime?.toMillis ? regTime.toMillis() : (regTime?.seconds ? regTime.seconds * 1000 : Date.now()))
        });
      }
    });

    registeredList.sort((a, b) => b.timestamp - a.timestamp);
    callback(registeredList.slice(0, 5));
  });
};


export const getActiveCacheMonths = async () => {
  const cacheColl = collection(db, "callCenterCache");
  const snap = await getDocs(cacheColl);
  const months = new Set();
  snap.docs.forEach(d => {
    const id = d.id;
    if (id !== "contacts" && /^\d{4}-\d{2}(_part\d+)?$/.test(id)) {
      const baseMonth = id.split("_")[0];
      months.add(baseMonth);
    }
  });
  return Array.from(months).sort((a, b) => b.localeCompare(a));
};


export const getLockedMonthlyReports = async () => {
  const lockedColl = collection(db, "lockedMonthlyReports");
  const snap = await getDocs(lockedColl);
  const grouped = {};
  
  snap.docs.forEach(d => {
    const data = d.data();
    const month = data.month || d.id.split("_")[0];
    if (!grouped[month]) {
      grouped[month] = {
        id: month,
        month: month,
        lockedAt: data.lockedAt,
        lockedBy: data.lockedBy || "System",
        parts: 0,
        contactCount: 0
      };
    }
    grouped[month].parts += 1;
    grouped[month].contactCount += Object.keys(data.contacts || {}).length;
    
    if (data.lockedAt && (!grouped[month].lockedAt || data.lockedAt < grouped[month].lockedAt)) {
      grouped[month].lockedAt = data.lockedAt;
    }
  });
  
  return Object.values(grouped).sort((a, b) => b.id.localeCompare(a.id));
};


export const lockAndPurgeMonthlyReport = async (monthStr, adminName = "Admin", purgeActive = false) => {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
    throw new Error("Invalid month format. Expected YYYY-MM.");
  }

  // Get all active cache parts for this month first
  const cacheColl = collection(db, "callCenterCache");
  const cacheSnap = await getDocs(cacheColl);
  const activeCacheDocRefs = [];
  cacheSnap.docs.forEach(d => {
    if (d.id === monthStr || d.id.startsWith(`${monthStr}_part`)) {
      activeCacheDocRefs.push(d.ref);
    }
  });

  const lockedColl = collection(db, "lockedMonthlyReports");
  const q = query(lockedColl, where("month", "==", monthStr));
  const existingPartsSnap = await getDocs(q);

  const existingContacts = {};
  let earliestLockedAt = new Date().toISOString();
  let firstLockedBy = adminName;

  existingPartsSnap.docs.forEach(d => {
    const data = d.data();
    if (data.lockedAt && data.lockedAt < earliestLockedAt) {
      earliestLockedAt = data.lockedAt;
    }
    if (data.lockedBy) {
      firstLockedBy = data.lockedBy;
    }
    const contacts = data.contacts || {};
    Object.assign(existingContacts, contacts);
  });

  let activeContacts;
  try {
    activeContacts = await runTransaction(db, async (transaction) => {
      if (activeCacheDocRefs.length === 0) {
        throw new Error(`No active cache data found for ${monthStr}.`);
      }

      const activeSnaps = await Promise.all(activeCacheDocRefs.map(ref => transaction.get(ref)));
      
      if (!activeSnaps.some(s => s.exists())) {
        throw new Error(`No active cache data found for ${monthStr}.`);
      }
      
      const mergedActive = {};
      activeSnaps.forEach(snap => {
        if (snap.exists()) {
          const contacts = snap.data().contacts || {};
          Object.assign(mergedActive, contacts);
        }
      });
      
      const mergedContacts = {
        ...existingContacts,
        ...mergedActive
      };
      
      const contactIds = Object.keys(mergedContacts);

      // Clear out all existing locked part documents in the transaction to prevent orphan parts
      existingPartsSnap.docs.forEach(docSnap => {
        transaction.delete(docSnap.ref);
      });
      
      if (contactIds.length > 0) {
        let partNum = 1;
        let currentPartContacts = {};
        
        contactIds.forEach(id => {
          const contact = mergedContacts[id];
          const testPart = {
            month: monthStr,
            lockedAt: earliestLockedAt,
            lockedBy: firstLockedBy,
            status: "completed",
            contacts: { ...currentPartContacts, [id]: contact }
          };
          const estimatedSize = getByteSize(testPart);
          
          if (estimatedSize > 850 * 1024) {
            // Commit current part
            const partId = `${monthStr}_part${partNum}`;
            const partRef = doc(db, "lockedMonthlyReports", partId);
            transaction.set(partRef, {
              month: monthStr,
              lockedAt: earliestLockedAt,
              lockedBy: firstLockedBy,
              status: "completed",
              contacts: currentPartContacts
            }, { merge: true });
            
            partNum++;
            currentPartContacts = { [id]: contact };
          } else {
            currentPartContacts[id] = contact;
          }
        });
        
        // Commit the last part
        const partId = `${monthStr}_part${partNum}`;
        const partRef = doc(db, "lockedMonthlyReports", partId);
        transaction.set(partRef, {
          month: monthStr,
          lockedAt: earliestLockedAt,
          lockedBy: firstLockedBy,
          status: "completed",
          contacts: currentPartContacts
        }, { merge: true });
      } else {
        const partRef = doc(db, "lockedMonthlyReports", `${monthStr}_part1`);
        transaction.set(partRef, {
          month: monthStr,
          lockedAt: earliestLockedAt,
          lockedBy: firstLockedBy,
          status: "completed",
          contacts: {}
        }, { merge: true });
      }
      
      // Delete all matching active cache parts only if purgeActive is true
      if (purgeActive) {
        activeCacheDocRefs.forEach(ref => {
          transaction.delete(ref);
        });
      }
      
      return mergedActive;
    });
  } catch (err) {
    console.warn(`[Lock & Purge] Month ${monthStr} skipped or already processed:`, err.message);
    return { success: false, skipped: true, reason: err.message };
  }

  // Purge history from contact documents only if purgeActive is true
  if (purgeActive) {
    const contactIds = Object.keys(activeContacts || {});
    if (contactIds.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < contactIds.length; i += batchSize) {
        const batchIds = contactIds.slice(i, i + batchSize);
        const batch = writeBatch(db);
        
        const fetchPromises = batchIds.map(async (id) => {
          const cRef = doc(db, "contacts", id);
          const snap = await getDoc(cRef);
          return { id, snap, cRef };
        });

        const snaps = await Promise.all(fetchPromises);

        snaps.forEach(({ id, snap, cRef }) => {
          if (!snap.exists()) return;
          const c = snap.data();
          
          const updates = {};
          let modified = false;

          // Clean legacy history
          if (c.history && Array.isArray(c.history)) {
            const originalLen = c.history.length;
            const filteredHistory = c.history.filter(h => {
              const hTs = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null;
              return !(hTs && getMonthStr(hTs) === monthStr);
            });
            if (filteredHistory.length !== originalLen) {
              updates.history = filteredHistory;
              modified = true;
            }
          }

          // Clean attenderStates history
          if (c.attenderStates) {
            const updatedAttenderStates = { ...c.attenderStates };
            let attenderModified = false;
            
            Object.keys(updatedAttenderStates).forEach(attId => {
              const state = updatedAttenderStates[attId];
              if (state.history && Array.isArray(state.history)) {
                const originalLen = state.history.length;
                const filteredHistory = state.history.filter(h => {
                  const hTs = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null;
                  return !(hTs && getMonthStr(hTs) === monthStr);
                });
                if (filteredHistory.length !== originalLen) {
                  updatedAttenderStates[attId] = {
                    ...state,
                    history: filteredHistory
                  };
                  attenderModified = true;
                }
              }
            });
            
            if (attenderModified) {
              updates.attenderStates = updatedAttenderStates;
              modified = true;
            }
          }

          if (modified) {
            updates.updatedAt = serverTimestamp();
            batch.update(cRef, updates);
          }
        });

        await batch.commit();
      }
    }
  }

  return { success: true, count: Object.keys(activeContacts || {}).length };
};

```

---

### File: `src/lib/db/cacheService.js`

```javascript
import {
  collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where, runTransaction, documentId
} from "firebase/firestore";
import { db } from "../firebase.js";
import { findMatchingAttenderState } from "./core.js";

// ─────────────────────────────────────────────
// INDEXEDDB LOCAL CACHE SYSTEM
// ─────────────────────────────────────────────
const IDB_NAME = "TGF_CallCenter_Cache";
const IDB_VERSION = 1;
const IDB_STORE = "kv_store";

export const openIDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported"));
    }
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains(IDB_STORE)) {
        dbInstance.createObjectStore(IDB_STORE);
      }
    };
  });
};

export const getIDBCache = async (key) => {
  try {
    const dbInstance = await openIDB();
    return new Promise((resolve) => {
      const tx = dbInstance.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
};

export const setIDBCache = async (key, val) => {
  try {
    const dbInstance = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(val, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return false;
  }
};

export const deleteIDBCache = async (key) => {
  try {
    const dbInstance = await openIDB();
    return new Promise((resolve) => {
      const tx = dbInstance.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
};

export const clearAllIDBCache = async () => {
  try {
    const dbInstance = await openIDB();
    return new Promise((resolve) => {
      const tx = dbInstance.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
};

// ─────────────────────────────────────────────
// IN-MEMORY DUPLICATE CHECK CACHE MAP (0 Reads)
// ─────────────────────────────────────────────
export const dupCheckCacheMap = new Map();

export const getDupCheckCache = (phone) => {
  if (!phone) return null;
  const entry = dupCheckCacheMap.get(phone);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > 300000) { // 5 minutes TTL
    dupCheckCacheMap.delete(phone);
    return null;
  }
  return entry.result;
};

export const setDupCheckCache = (phone, result) => {
  if (!phone) return;
  dupCheckCacheMap.set(phone, {
    result,
    timestamp: Date.now()
  });
};

// Helper: Safely normalize date values into JS Date objects
const toDateSafe = (val) => {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// Helper: Month string generator (YYYY-MM)
const getMonthStr = (dateObj) => {
  const d = toDateSafe(dateObj) || new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

// COLD BOOT: Fetch assigned contacts across callCenterCache partition docs
export const fetchPartitionCacheForColdBoot = async (attenderId, attenderName, monthsBack = 6) => {
  console.log(`[COLD BOOT PARTITION CACHE INIT] Querying callCenterCache partition docs for ${monthsBack} months (attenderId: ${attenderId}, attenderName: ${attenderName})...`);

  const now = new Date();
  const monthKeys = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(getMonthStr(d));
  }

  const fetchPromises = monthKeys.map(async (monthKey) => {
    try {
      const q = query(
        collection(db, "callCenterCache"),
        where(documentId(), ">=", monthKey),
        where(documentId(), "<=", monthKey + "\uf8ff")
      );
      const snap = await getDocs(q);
      return snap.docs;
    } catch (e) {
      console.warn(`Failed to fetch partition docs for ${monthKey}:`, e);
      return [];
    }
  });

  const partitionSnaps = await Promise.all(fetchPromises);
  const allPartitionDocs = partitionSnaps.flat();
  const totalPartitionDocsRead = allPartitionDocs.length;

  const idLower = attenderId ? String(attenderId).toLowerCase().trim() : "";
  const nameLower = attenderName ? String(attenderName).toLowerCase().trim() : "";

  const assignedMap = new Map();

  allPartitionDocs.forEach(docSnap => {
    const data = docSnap.data();
    if (!data || !data.contacts || typeof data.contacts !== "object") return;

    Object.entries(data.contacts).forEach(([cId, rawData]) => {
      if (!rawData || rawData._deleted) return;

      const matchedStateObj = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName);
      if (matchedStateObj && matchedStateObj._deleted) return;

      let isAssigned = false;
      if (matchedStateObj) {
        isAssigned = true;
      } else if (Array.isArray(rawData.assignedTo)) {
        isAssigned = rawData.assignedTo.some(a => {
          const aLower = String(a).toLowerCase().trim();
          return (idLower && aLower === idLower) || (nameLower && aLower === nameLower);
        });
      } else if (rawData.assignedTo) {
        const aLower = String(rawData.assignedTo).toLowerCase().trim();
        isAssigned = (idLower && aLower === idLower) || (nameLower && aLower === nameLower);
      }

      if (!isAssigned) return;

      const attState = matchedStateObj || {};
      const status = attState.status || rawData.status || "Pending";

      let tagsArr = [];
      if (Array.isArray(rawData.tags)) tagsArr = rawData.tags;
      else if (Array.isArray(rawData.Tags)) tagsArr = rawData.Tags;
      else if (typeof rawData.tags === "string") tagsArr = [rawData.tags];

      const progId = attState["Called For"] || attState.calledFor || rawData["Called For"] || rawData.calledFor || rawData.programId || rawData.programName || "";
      const source = attState.Source || attState.source || rawData.Source || rawData.source || "";
      const callType = attState.callType || rawData.callType || "outgoing";

      const history = attState.history || rawData.history || [];
      const remark = attState.remark || rawData.remark || "";
      const callbackDate = attState.callbackDate || rawData.callbackDate || attState.callback_date || rawData.callback_date || null;
      const callbackTime = attState.callbackTime || rawData.callbackTime || attState.callback_time || rawData.callback_time || null;
      const callbackStatus = attState.callbackStatus || rawData.callbackStatus || null;

      const lastHistTime = Array.isArray(rawData.history) && rawData.history.length > 0 
        ? (rawData.history[rawData.history.length - 1]?.timestamp || rawData.history[rawData.history.length - 1]?.date)
        : null;
      const lastCalledAt = attState.lastCalledAt || rawData.lastCalledAt || attState.updatedAt || rawData.updatedAt || lastHistTime || rawData.createdAt || null;

      const leadDoc = {
        ...rawData,
        id: cId,
        status,
        remark,
        tags: tagsArr,
        programId: progId,
        source,
        callType,
        history,
        callbackDate,
        callbackTime,
        callbackStatus,
        lastCalledAt,
        attenderState: attState
      };

      if (!assignedMap.has(cId)) {
        assignedMap.set(cId, leadDoc);
      } else {
        const existing = assignedMap.get(cId);
        const exTime = toDateSafe(existing.lastCalledAt)?.getTime() || 0;
        const newTime = toDateSafe(leadDoc.lastCalledAt)?.getTime() || 0;
        if (newTime > exTime) {
          assignedMap.set(cId, leadDoc);
        }
      }
    });
  });

  const uniqueAssignedLogs = Array.from(assignedMap.values());
  const nowMs = Date.now();

  const overdue = [];
  const rest = [];

  uniqueAssignedLogs.forEach(log => {
    if (log.callbackDate && (log.status === "Callback" || log.callbackStatus === "overdue" || log.callbackStatus === "pending")) {
      const cbDateObj = toDateSafe(log.callbackDate);
      if (cbDateObj) {
        if (cbDateObj.getTime() < nowMs) {
          log.callbackStatus = "overdue";
          log._callbackDue = true;
          overdue.push(log);
          return;
        }
      }
    }
    rest.push(log);
  });

  overdue.sort((a, b) => (toDateSafe(a.callbackDate)?.getTime() || 0) - (toDateSafe(b.callbackDate)?.getTime() || 0));
  rest.sort((a, b) => (toDateSafe(b.lastCalledAt)?.getTime() || 0) - (toDateSafe(a.lastCalledAt)?.getTime() || 0));

  const finalLogs = [...overdue, ...rest];

  console.log(`[COLD BOOT PARTITION CACHE SUCCESS] Fetched ${finalLogs.length} assigned contacts from callCenterCache across ${totalPartitionDocsRead} partition doc reads (0 individual contact doc reads!)`);

  if (attenderId && finalLogs.length > 0) {
    const cacheKey = `tgf_attender_logs_${attenderId}`;
    await setIDBCache(cacheKey, finalLogs).catch(() => {});
  }

  return finalLogs;
};

export const updateLocalAttenderCache = async (attenderId, updatedDoc) => {
  if (!attenderId || !updatedDoc || !updatedDoc.id) return;
  const cacheKey = `tgf_attender_logs_${attenderId}`;
  try {
    const existing = await getIDBCache(cacheKey);
    if (Array.isArray(existing)) {
      const idx = existing.findIndex(item => item.id === updatedDoc.id);
      let newArray = [];
      if (idx >= 0) {
        newArray = [...existing];
        newArray[idx] = { ...newArray[idx], ...updatedDoc };
      } else {
        newArray = [updatedDoc, ...existing];
      }
      await setIDBCache(cacheKey, newArray);
    }
  } catch (e) {
    console.warn("Failed to update local IDB attender cache:", e);
  }
};

export const updateLocalRegistrationsCache = async (registrationDoc) => {
  if (!registrationDoc || (!registrationDoc.registrationId && !registrationDoc.id)) return;
  const regId = registrationDoc.registrationId || registrationDoc.id;
  const month = registrationDoc.registeredYearMonth || getMonthStr(new Date());
  const cacheKeys = [`tgf_cache_registrations_ALL`, `tgf_cache_registrations_${month}`];

  for (const cacheKey of cacheKeys) {
    try {
      const existing = await getIDBCache(cacheKey);
      if (Array.isArray(existing)) {
        const idx = existing.findIndex(item => item.registrationId === regId || item.id === regId);
        let newArray = [];
        if (idx >= 0) {
          newArray = [...existing];
          newArray[idx] = { ...newArray[idx], ...registrationDoc };
        } else {
          newArray = [{ ...registrationDoc, registrationId: regId }, ...existing];
        }
        await setIDBCache(cacheKey, newArray);
      }
    } catch (e) {
      console.warn(`Failed to update local IDB registrations cache for ${cacheKey}:`, e);
    }
  }
};

export const clearLocalRegistrationsCache = async () => {
  try {
    const keys = [`tgf_cache_registrations_ALL`];
    for (const key of keys) {
      await deleteIDBCache(key).catch(() => {});
    }
  } catch (e) {}
};

```

---

### File: `src/lib/db/programService.js`

```javascript
import {
  collection, getDocs, doc, setDoc, deleteDoc, query, where, limit, serverTimestamp, Timestamp
} from "firebase/firestore";
import { db } from "../firebase.js";

// HARDCODED STATIC ACTIVE TAGS (0 Firestore Reads & 0 Writes)
const STATIC_ACTIVE_TAGS = ["Incoming Calls", "Outgoing Calls"];

export const getActiveTags = async (forceRefresh = false) => {
  return STATIC_ACTIVE_TAGS;
};

export const registerActiveTag = async (tag) => {
  // Static tags in use — 0 Firestore writes
  return;
};

export const removeActiveTag = async (tag) => {
  // Static tags in use — 0 Firestore writes
  return;
};

// Fixed ID for the dedicated "Incoming Calls" program — never changes
export const INCOMING_PROGRAM_ID = "incoming-calls";
export const INCOMING_PROGRAM_NAME = "Incoming Calls";

// Fixed ID for the dedicated "Outgoing Calls" program — never changes
export const OUTGOING_PROGRAM_ID = "outgoing-calls";
export const OUTGOING_PROGRAM_NAME = "Outgoing Calls";

// Upsert the Incoming Calls program document — no-op (0 Firestore writes)
export const ensureIncomingProgram = async () => {
  return;
};

// Upsert the Outgoing Calls program document — no-op (0 Firestore writes)
export const ensureOutgoingProgram = async () => {
  return;
};

export const getPrograms = async () => {
  const tags = await getActiveTags();
  const list = tags.map(t => ({
    id: t,
    name: t,
    contactCount: 0,
    createdAt: Timestamp.now()
  }));

  if (!list.some(p => p.id === INCOMING_PROGRAM_ID || p.name === INCOMING_PROGRAM_NAME)) {
    list.unshift({
      id: INCOMING_PROGRAM_ID,
      name: INCOMING_PROGRAM_NAME,
      isSystem: true,
      contactCount: 0,
      createdAt: Timestamp.now()
    });
  }

  if (!list.some(p => p.id === OUTGOING_PROGRAM_ID || p.name === OUTGOING_PROGRAM_NAME)) {
    list.unshift({
      id: OUTGOING_PROGRAM_ID,
      name: OUTGOING_PROGRAM_NAME,
      isSystem: true,
      contactCount: 0,
      createdAt: Timestamp.now()
    });
  }

  return list;
};

export const createProgram = async (name) => {
  await registerActiveTag(name);
  const ref = doc(db, "programs", name);
  await setDoc(ref, {
    name,
    createdAt: serverTimestamp(),
    contactCount: 0,
  }, { merge: true });
  return name;
};

export const deleteProgram = async (id) => {
  await removeActiveTag(id);
  await deleteDoc(doc(db, "programs", id));
};

// Read contacts of a program (for field-scanning before remapping)
export const getProgramChunkContacts = async (programId, limitCount = 100) => {
  const q = query(
    collection(db, "contacts"),
    where("programId", "==", programId),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

```

---

### File: `src/lib/db/authService.js`

```javascript
import {
  collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase.js";
import { getIDBCache, setIDBCache } from "./cacheService.js";

let inMemoryAttenders = null;

export const generateRandomPassword = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const invalidateAttendersCache = () => {
  inMemoryAttenders = null;
  try {
    if (typeof window !== "undefined" && window.indexedDB) {
      setIDBCache("tgf_cached_attenders", null).catch(() => {});
    }
  } catch (e) {}
};

export const getAttenders = async (forceRefresh = false) => {
  if (!forceRefresh && Array.isArray(inMemoryAttenders) && inMemoryAttenders.length > 0) {
    return inMemoryAttenders;
  }

  if (!forceRefresh) {
    try {
      const cached = await getIDBCache("tgf_cached_attenders");
      if (Array.isArray(cached) && cached.length > 0) {
        inMemoryAttenders = cached;
        return cached;
      }
    } catch (e) {}
  }

  const snap = await getDocs(collection(db, "attenders"));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Auto-migrate legacy attenders missing a password
  docs.forEach(a => {
    if (!a.password) {
      const generated = generateRandomPassword();
      a.password = generated;
      updateDoc(doc(db, "attenders", a.id), { password: generated }).catch(() => {});
    }
  });

  const sorted = docs.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
  inMemoryAttenders = sorted;
  setIDBCache("tgf_cached_attenders", sorted).catch(() => {});
  return sorted;
};

export const createAttender = async (name, customPassword = null) => {
  invalidateAttendersCache();
  const password = customPassword || generateRandomPassword();
  const ref = await addDoc(collection(db, "attenders"), {
    name,
    password,
    isActive: true,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, password };
};

export const updateAttender = async (id, data) => {
  invalidateAttendersCache();
  const payload = typeof data === "string" ? { name: data } : data;
  await updateDoc(doc(db, "attenders", id), payload);
};

export const deleteAttender = async (id) => {
  invalidateAttendersCache();
  await deleteDoc(doc(db, "attenders", id));
};

export const getAdminPassword = async () => {
  try {
    const adminDocRef = doc(db, "settings", "admin_auth");
    const snap = await getDoc(adminDocRef);
    if (snap.exists() && snap.data().password) {
      return snap.data().password;
    }
    const defaultPassword = "123456";
    await setDoc(adminDocRef, { password: defaultPassword, updatedAt: serverTimestamp() }, { merge: true });
    return defaultPassword;
  } catch (err) {
    console.error("Error fetching admin password:", err);
    return "123456";
  }
};

export const setAdminPassword = async (newPassword) => {
  const adminDocRef = doc(db, "settings", "admin_auth");
  await setDoc(adminDocRef, { password: newPassword, updatedAt: serverTimestamp() }, { merge: true });
};

```

---

### File: `src/lib/firebase.js`

```javascript
import { initializeApp } from "firebase/app";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  console.warn("Firestore persistent cache initialization failed, falling back to default cache:", error);
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;

```

---

## 2. Target Functions Caller Inventory

### Callers of `addIncomingCallLog`

#### Caller #1: `src/lib/db/contactService.js` (Line 1428)

```javascript
  let existingData = {};

  if (finalNormalizedPhones.length > 0) {
    try {
      const q3 = query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", finalNormalizedPhones));
      const timeoutLookup = new Promise(resolve => setTimeout(() => resolve({ empty: true, docs: [] }), 1500));
      const snap3 = await Promise.race([getDocs(q3), timeoutLookup]);
      
      const mergedDocs = snap3.docs || [];
      console.log(
        `[FIRESTORE READ]\ncollection: contacts\noperation: query\nquery: normalizedPhones array-contains-any [${finalNormalizedPhones.join(", ")}]\ndocuments_returned: ${mergedDocs.length}\nestimated_read_cost: ${mergedDocs.length}\nreason: addIncomingCallLog (Phone Lookup)`
      );
      const existingSnap = { empty: mergedDocs.length === 0, docs: mergedDocs };

      if (!existingSnap.empty) {
        // Find ANY existing active document
        const matchDoc = existingSnap.docs.find(docSnap => docSnap.data()._deleted !== true) || existingSnap.docs[0];
        if (matchDoc) {
          isExisting = true;
          existingDocId = matchDoc.id;
          existingData = matchDoc.data();
```

#### Caller #2: `src/lib/db/contactService.js` (Line 1442)

```javascript
      if (!existingSnap.empty) {
        // Find ANY existing active document
        const matchDoc = existingSnap.docs.find(docSnap => docSnap.data()._deleted !== true) || existingSnap.docs[0];
        if (matchDoc) {
          isExisting = true;
          existingDocId = matchDoc.id;
          existingData = matchDoc.data();
        }
      }
    } catch (e) {
      console.warn("[addIncomingCallLog] Phone/Mobile lookup failed:", e);
    }
  }

  // Calculate new assignedTo array
  const prevAssigned = isExisting
    ? (Array.isArray(existingData.assignedTo)
        ? existingData.assignedTo
        : (existingData.assignedTo ? [existingData.assignedTo] : []))
    : [];
  const assignedToSet = new Set(prevAssigned.filter(Boolean));
```

#### Caller #3: `src/lib/db/contactService.js` (Line 1672)

```javascript
      console.log("[REGISTRATION BATCH SUCCESS]", {
        registrationId: addRegId,
        writes: [`registrations/${addRegId}`, `registrationsCache/${yearMonth}`]
      });
    }

    trackFirestoreWrite({
      operation: "batch",
      paths: batchPaths,
      writeCount: batchPaths.length,
      reason: `addIncomingCallLog ("${logPayload.Name || finalId}")`,
      contactId: finalId
    });
  } catch (error) {
    if (isAddRegDone) {
      console.error("[REGISTRATION BATCH FAILED]", error);
    }
    throw error;
  }

  // Register tag in active tags collection
```

#### Caller #4: `src/lib/db/contactService.js` (Line 1745)

```javascript
      }
    } : {}
  };

  // 1. Instantly update local IndexedDB cache for 0ms UI load
  if (attenderId) {
    await updateLocalAttenderCache(attenderId, newLeadDoc);
  }

  // 2. Trigger direct write to Firebase asynchronously in background
  addIncomingCallLogDirectFirebase(attenderId, attenderName, data, programId, programName)
    .then(docId => {
      console.log(`[ADD INC SUCCESS] Firebase write completed for new lead: ${docId}`);
      if (attenderId && docId) {
        updateLocalAttenderCache(attenderId, { ...newLeadDoc, id: docId });
      }
    })
    .catch(err => {
      console.warn("⚠️ Firebase write deferred to pending queue:", err?.message || err);
      queuePendingWrite("addIncomingCallLog", { attenderId, attenderName, data, programId, programName });
    });
```

#### Caller #5: `src/lib/db/contactService.js` (Line 1754)

```javascript
  // 2. Trigger direct write to Firebase asynchronously in background
  addIncomingCallLogDirectFirebase(attenderId, attenderName, data, programId, programName)
    .then(docId => {
      console.log(`[ADD INC SUCCESS] Firebase write completed for new lead: ${docId}`);
      if (attenderId && docId) {
        updateLocalAttenderCache(attenderId, { ...newLeadDoc, id: docId });
      }
    })
    .catch(err => {
      console.warn("⚠️ Firebase write deferred to pending queue:", err?.message || err);
      queuePendingWrite("addIncomingCallLog", { attenderId, attenderName, data, programId, programName });
    });

  return localId;
};

// Global search contacts by exact phone number, name prefix, or email prefix

export const processPendingWriteItem = async (item) => {
  if (!item) return;
  if (item.type === "updateCallLog" && item.logId) {
```

#### Caller #6: `src/lib/db/contactService.js` (Line 1766)

```javascript

  return localId;
};

// Global search contacts by exact phone number, name prefix, or email prefix

export const processPendingWriteItem = async (item) => {
  if (!item) return;
  if (item.type === "updateCallLog" && item.logId) {
    await updateCallLogDirectFirebase(item.logId, item.updates, item.attenderId, item.attenderName, item.existingContact);
  } else if (item.type === "addIncomingCallLog") {
    await addIncomingCallLogDirectFirebase(item.attenderId, item.attenderName, item.data, item.programId, item.programName);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushPendingWrites(processPendingWriteItem);
  });
}

```

#### Caller #7: `src/lib/db/contactService.js` (Line 1767)

```javascript
  return localId;
};

// Global search contacts by exact phone number, name prefix, or email prefix

export const processPendingWriteItem = async (item) => {
  if (!item) return;
  if (item.type === "updateCallLog" && item.logId) {
    await updateCallLogDirectFirebase(item.logId, item.updates, item.attenderId, item.attenderName, item.existingContact);
  } else if (item.type === "addIncomingCallLog") {
    await addIncomingCallLogDirectFirebase(item.attenderId, item.attenderName, item.data, item.programId, item.programName);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushPendingWrites(processPendingWriteItem);
  });
}

export const globalSearchContacts = async (queryStr) => {
```

#### Caller #8: `src/page/call-center/admin/components/AllAttendersSheetTab.jsx` (Line 46)

```javascript
  isKhojiAffirmative,
  isKhojiNegative,
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  OBJECTION_REASONS,
  CALL_TYPE_OPTIONS,
  isUnansweredCallback
} from "../../attender/utils.js";
import { parseTimestamp, cleanExportRow, getAllCallEntries, getCallsDoneCount, getContactPhone } from "../utils.jsx";
import { normalizePhone, verifyCallCenterCache, addIncomingCallLog } from "../../../../lib/db";

// ── MultiSelect Dropdown Subcomponent ───────────────────────────────────────
function MultiSelectDropdown({ options, selected = [], onChange, placeholder, icon: Icon, allLabel = "All" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
```

#### Caller #9: `src/page/call-center/attender/AttenderView.jsx` (Line 12)

```javascript
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import {
  Phone, ArrowLeft, Plus, Download, Search, ChevronLeft, ChevronRight, ChevronDown,
  Edit3, X, Save, FileText, Calendar, Tag, User, MapPin, MessageSquare,
  Hash, Clock, PhoneOff, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame, SlidersHorizontal, FileSpreadsheet, CheckSquare,
  Bell, Sparkles, UserCheck
} from "lucide-react";
import {
  subscribeToCallLogs, updateCallLog, addIncomingCallLog,
  assignContactsToAttender, normalizePhone, getActiveTags,
  INCOMING_PROGRAM_ID, INCOMING_PROGRAM_NAME, ensureIncomingProgram,
  OUTGOING_PROGRAM_ID, OUTGOING_PROGRAM_NAME, ensureOutgoingProgram,
  globalSearchContacts, searchAttenderContacts, claimContact, removeAttenderFromContact, claimCRMContact,
  fetchHistoricalCachePartition, purgeStaleHistoricalCache, fetchFreshSharedLead
} from "../../../lib/db";
import { searchCRM } from "../../../lib/ghl";
import {
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
```

#### Caller #10: `src/page/call-center/attender/components/EditModal.jsx` (Line 10)

```javascript
import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Phone, Plus, X, Save, Tag, User, MapPin, MessageSquare,
  Hash, Clock, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame,
  ChevronDown, Check, Search, Users
} from "lucide-react";
import {
  addIncomingCallLog, updateCallLog, createProgram, checkGlobalDuplicate, findMatchingAttenderState, combineContactHistories
} from "../../../../lib/db";
import { searchCRMByPhone } from "../../../../lib/ghl";
import {
  STATUS_OPTIONS,
  OBJECTION_REASONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  CALL_TYPE_OPTIONS,
  isIgnoredField,
  getFieldWithFallback,
```

#### Caller #11: `src/page/call-center/attender/components/EditModal.jsx` (Line 1527)

```javascript
          delete updates.remark;
        }
      }

      const targetDocId = targetEdited.contactId || targetEdited.id || id;
      const isNewWithoutDoc = row._isNew && !targetEdited.contactId && !targetEdited.id;

      let savedDocId = targetDocId;
      if (isNewWithoutDoc) {
        delete updates._isNew;
        const resId = await addIncomingCallLog(
          activeAttenderId, activeAttenderName, updates, targetEdited.programId, targetEdited.programName
        );
        console.log("[EDIT MODAL SAVE] addIncomingCallLog result docId:", resId);
        savedDocId = resId;
      } else {
        const res = await updateCallLog(targetDocId, updates, activeAttenderId, activeAttenderName, row);
        console.log("[EDIT MODAL SAVE] updateCallLog result:", res);
        if (res?.updatedLead) {
          targetEdited = { ...targetEdited, ...res.updatedLead };
        }
```

#### Caller #12: `src/page/call-center/attender/components/EditModal.jsx` (Line 1530)

```javascript

      const targetDocId = targetEdited.contactId || targetEdited.id || id;
      const isNewWithoutDoc = row._isNew && !targetEdited.contactId && !targetEdited.id;

      let savedDocId = targetDocId;
      if (isNewWithoutDoc) {
        delete updates._isNew;
        const resId = await addIncomingCallLog(
          activeAttenderId, activeAttenderName, updates, targetEdited.programId, targetEdited.programName
        );
        console.log("[EDIT MODAL SAVE] addIncomingCallLog result docId:", resId);
        savedDocId = resId;
      } else {
        const res = await updateCallLog(targetDocId, updates, activeAttenderId, activeAttenderName, row);
        console.log("[EDIT MODAL SAVE] updateCallLog result:", res);
        if (res?.updatedLead) {
          targetEdited = { ...targetEdited, ...res.updatedLead };
        }
      }

      console.log("✅ Save successful!");
```

#### Caller #13: `src/page/call-center/attender/mobile/MobileEditModal.jsx` (Line 9)

```javascript
import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Phone, Plus, X, Tag, User, MapPin, MessageSquare,
  Hash, Clock, CheckCircle2, AlertCircle, Trash2,
  CalendarDays, Loader, Flame, Edit3, ArrowLeft, Users
} from "lucide-react";
import {
  addIncomingCallLog, updateCallLog, checkGlobalDuplicate, findMatchingAttenderState
} from "../../../../lib/db";
import { searchCRMByPhone } from "../../../../lib/ghl";
import {
  STATUS_OPTIONS,
  OBJECTION_REASONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  isKhojiField,
  getFieldWithFallback,
  formatContactName,
```

#### Caller #14: `src/page/call-center/attender/mobile/MobileEditModal.jsx` (Line 165)

```javascript
      if (updates.Name) updates.Name = formatContactName(updates.Name);

      delete updates.attenderStates;
      delete updates.assignedTo;
      delete updates.assignedName;

      updates.lastEditedBy = attenderName || "Unknown";

      if (row._isNew) {
        delete updates._isNew;
        await addIncomingCallLog(
          row.attenderId, row.attenderName, updates, targetEdited.programId, targetEdited.programName
        );
      } else {
        await updateCallLog(id, updates, attenderId, attenderName, row);
      }

      toast.success("Saved!", { duration: 3000, position: 'top-center' });
      if (onClose) onClose();
    } catch (err) {
      console.error("Save error:", err);
```

### Callers of `addIncomingCallLogDirectFirebase`

#### Caller #1: `src/lib/db/contactService.js` (Line 1745)

```javascript
      }
    } : {}
  };

  // 1. Instantly update local IndexedDB cache for 0ms UI load
  if (attenderId) {
    await updateLocalAttenderCache(attenderId, newLeadDoc);
  }

  // 2. Trigger direct write to Firebase asynchronously in background
  addIncomingCallLogDirectFirebase(attenderId, attenderName, data, programId, programName)
    .then(docId => {
      console.log(`[ADD INC SUCCESS] Firebase write completed for new lead: ${docId}`);
      if (attenderId && docId) {
        updateLocalAttenderCache(attenderId, { ...newLeadDoc, id: docId });
      }
    })
    .catch(err => {
      console.warn("⚠️ Firebase write deferred to pending queue:", err?.message || err);
      queuePendingWrite("addIncomingCallLog", { attenderId, attenderName, data, programId, programName });
    });
```

#### Caller #2: `src/lib/db/contactService.js` (Line 1767)

```javascript
  return localId;
};

// Global search contacts by exact phone number, name prefix, or email prefix

export const processPendingWriteItem = async (item) => {
  if (!item) return;
  if (item.type === "updateCallLog" && item.logId) {
    await updateCallLogDirectFirebase(item.logId, item.updates, item.attenderId, item.attenderName, item.existingContact);
  } else if (item.type === "addIncomingCallLog") {
    await addIncomingCallLogDirectFirebase(item.attenderId, item.attenderName, item.data, item.programId, item.programName);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushPendingWrites(processPendingWriteItem);
  });
}

export const globalSearchContacts = async (queryStr) => {
```

### Callers of `updateCallLog`

#### Caller #1: `src/lib/db/contactService.js` (Line 854)

```javascript

export const updateCallLogDirectFirebase = async (logId, updates, attenderId = null, attenderName = null, existingContact = null) => {
  const contactRef = doc(db, "contacts", logId);
  
  let previousStatus = "";
  let logData = {};

  if (existingContact) {
    logData = existingContact;
    console.log(
      "%c⚡ [0-READ CACHE HIT - updateCallLogDirectFirebase]",
      "background: #065f46; color: #34d399; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
      `Bypassed getDoc using existingContact for "${logData.Name || logId}" (${logId}) | 0 Firestore Reads`
    );
  } else {
    try {
      const logSnap = await getDoc(contactRef);
      console.log(
        `[FIRESTORE READ]\ncollection: contacts\noperation: getDoc\ndocument: ${logId}\ndocuments_returned: ${logSnap.exists() ? 1 : 0}\nestimated_read_cost: 1\nreason: updateCallLogDirectFirebase`
      );
      if (logSnap.exists()) {
```

#### Caller #2: `src/lib/db/contactService.js` (Line 862)

```javascript
    logData = existingContact;
    console.log(
      "%c⚡ [0-READ CACHE HIT - updateCallLogDirectFirebase]",
      "background: #065f46; color: #34d399; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
      `Bypassed getDoc using existingContact for "${logData.Name || logId}" (${logId}) | 0 Firestore Reads`
    );
  } else {
    try {
      const logSnap = await getDoc(contactRef);
      console.log(
        `[FIRESTORE READ]\ncollection: contacts\noperation: getDoc\ndocument: ${logId}\ndocuments_returned: ${logSnap.exists() ? 1 : 0}\nestimated_read_cost: 1\nreason: updateCallLogDirectFirebase`
      );
      if (logSnap.exists()) {
        logData = logSnap.data();
      }
    } catch (e) {
      console.warn("Failed to fetch contact data in updateCallLogDirectFirebase", e);
    }
  }

  if (attenderId && logData.attenderStates?.[attenderId]?.status !== undefined) {
```

#### Caller #3: `src/lib/db/contactService.js` (Line 868)

```javascript
  } else {
    try {
      const logSnap = await getDoc(contactRef);
      console.log(
        `[FIRESTORE READ]\ncollection: contacts\noperation: getDoc\ndocument: ${logId}\ndocuments_returned: ${logSnap.exists() ? 1 : 0}\nestimated_read_cost: 1\nreason: updateCallLogDirectFirebase`
      );
      if (logSnap.exists()) {
        logData = logSnap.data();
      }
    } catch (e) {
      console.warn("Failed to fetch contact data in updateCallLogDirectFirebase", e);
    }
  }

  if (attenderId && logData.attenderStates?.[attenderId]?.status !== undefined) {
    previousStatus = logData.attenderStates[attenderId].status || "";
  } else {
    previousStatus = logData.status || "";
  }

  // Format Name if modified
```

#### Caller #4: `src/lib/db/contactService.js` (Line 1146)

```javascript
      console.log("[REGISTRATION BATCH SUCCESS]", {
        registrationId,
        writes: [`registrations/${registrationId}`, `registrationsCache/${currentMonth}`]
      });
    }

    trackFirestoreWrite({
      operation: "batch",
      paths: batchPaths,
      writeCount: batchPaths.length,
      reason: `updateCallLog ("${freshData.Name || logId}")`,
      contactId: logId
    });
  } catch (error) {
    if (isRegDone) {
      console.error("[REGISTRATION BATCH FAILED]", error);
    }
    throw error;
  }

  // Handle "Reg.Done" registrations collection sync (only when status/program changed, saving 1 read per save)
```

#### Caller #5: `src/lib/db/contactService.js` (Line 1321)

```javascript


export const updateCallLog = async (logId, updates, attenderId = null, attenderName = null, existingContact = null) => {
  console.log(`[UPDATE CALL LOG] Initiating instant 0ms local save for contactId: ${logId}`);
  // 1. Instantly update local IndexedDB cache for 0ms UI response
  if (attenderId) {
    await updateLocalAttenderCache(attenderId, { ...existingContact, ...updates, id: logId });
  }

  // 2. Trigger direct write to Firebase asynchronously in the background
  updateCallLogDirectFirebase(logId, updates, attenderId, attenderName, existingContact)
    .then(() => {
      console.log(`[UPDATE CALL LOG SUCCESS] Firebase write completed for contactId: ${logId}`);
    })
    .catch(err => {
      console.warn("⚠️ Firebase write deferred to pending queue:", err?.message || err);
      queuePendingWrite("updateCallLog", { logId, updates, attenderId, attenderName, existingContact });
    });

  return { success: true, synced: false, localId: logId, updatedLead: { ...existingContact, ...updates, id: logId } };
};
```

#### Caller #6: `src/lib/db/contactService.js` (Line 1327)

```javascript
    await updateLocalAttenderCache(attenderId, { ...existingContact, ...updates, id: logId });
  }

  // 2. Trigger direct write to Firebase asynchronously in the background
  updateCallLogDirectFirebase(logId, updates, attenderId, attenderName, existingContact)
    .then(() => {
      console.log(`[UPDATE CALL LOG SUCCESS] Firebase write completed for contactId: ${logId}`);
    })
    .catch(err => {
      console.warn("⚠️ Firebase write deferred to pending queue:", err?.message || err);
      queuePendingWrite("updateCallLog", { logId, updates, attenderId, attenderName, existingContact });
    });

  return { success: true, synced: false, localId: logId, updatedLead: { ...existingContact, ...updates, id: logId } };
};

// ─────────────────────────────────────────────
// Remove a single attender's access to a contact
// without affecting any other attender's data.
// Removes the attender from assignedTo[] and clears
// their attenderStates entry.
```

#### Caller #7: `src/lib/db/contactService.js` (Line 1764)

```javascript
      queuePendingWrite("addIncomingCallLog", { attenderId, attenderName, data, programId, programName });
    });

  return localId;
};

// Global search contacts by exact phone number, name prefix, or email prefix

export const processPendingWriteItem = async (item) => {
  if (!item) return;
  if (item.type === "updateCallLog" && item.logId) {
    await updateCallLogDirectFirebase(item.logId, item.updates, item.attenderId, item.attenderName, item.existingContact);
  } else if (item.type === "addIncomingCallLog") {
    await addIncomingCallLogDirectFirebase(item.attenderId, item.attenderName, item.data, item.programId, item.programName);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushPendingWrites(processPendingWriteItem);
  });
```

#### Caller #8: `src/lib/db/contactService.js` (Line 1765)

```javascript
    });

  return localId;
};

// Global search contacts by exact phone number, name prefix, or email prefix

export const processPendingWriteItem = async (item) => {
  if (!item) return;
  if (item.type === "updateCallLog" && item.logId) {
    await updateCallLogDirectFirebase(item.logId, item.updates, item.attenderId, item.attenderName, item.existingContact);
  } else if (item.type === "addIncomingCallLog") {
    await addIncomingCallLogDirectFirebase(item.attenderId, item.attenderName, item.data, item.programId, item.programName);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushPendingWrites(processPendingWriteItem);
  });
}
```

#### Caller #9: `src/page/call-center/attender/AttenderView.jsx` (Line 12)

```javascript
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import {
  Phone, ArrowLeft, Plus, Download, Search, ChevronLeft, ChevronRight, ChevronDown,
  Edit3, X, Save, FileText, Calendar, Tag, User, MapPin, MessageSquare,
  Hash, Clock, PhoneOff, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame, SlidersHorizontal, FileSpreadsheet, CheckSquare,
  Bell, Sparkles, UserCheck
} from "lucide-react";
import {
  subscribeToCallLogs, updateCallLog, addIncomingCallLog,
  assignContactsToAttender, normalizePhone, getActiveTags,
  INCOMING_PROGRAM_ID, INCOMING_PROGRAM_NAME, ensureIncomingProgram,
  OUTGOING_PROGRAM_ID, OUTGOING_PROGRAM_NAME, ensureOutgoingProgram,
  globalSearchContacts, searchAttenderContacts, claimContact, removeAttenderFromContact, claimCRMContact,
  fetchHistoricalCachePartition, purgeStaleHistoricalCache, fetchFreshSharedLead
} from "../../../lib/db";
import { searchCRM } from "../../../lib/ghl";
import {
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
```

#### Caller #10: `src/page/call-center/attender/components/edit-modal/EditHistoryModal.jsx` (Line 6)

```javascript
import React, { useState } from "react";
import { X, Trash2, Save } from "lucide-react";
import { doc } from "firebase/firestore";
import { db } from "../../../../../lib/firebase";
import { toast } from "react-hot-toast";
import { updateCallLog } from "../../../../../lib/db";
import SearchableDropdown from "./SearchableDropdown";
import {
  STATUS_OPTIONS,
  CALL_TYPE_OPTIONS,
  CALLED_FOR_OPTIONS,
  SOURCE_OPTIONS
} from "../../utils";

// Helper to convert date to datetime-local string format YYYY-MM-DDTHH:MM
const getDatetimeLocalString = (ts) => {
```

#### Caller #11: `src/page/call-center/attender/components/edit-modal/EditHistoryModal.jsx` (Line 182)

```javascript
          history: cleanedHistory,
          status: latestStatus,
          remark: latestRemark,
          callType: latestCallType
        };
        if (calledForField) updatedRow[calledForField] = latestCalledFor;
        if (sourceField) updatedRow[sourceField] = latestSource;
        onSave(updatedRow, true);
      }

      // If not a brand new contact, persist using updateCallLog to trigger all registration & cache sync pipelines
      if (!row._isNew && row.id) {
        const updates = {
          history: cleanedHistory,
          status: latestStatus,
          remark: latestRemark,
          callType: latestCallType
        };
        if (calledForField) {
          updates[calledForField] = latestCalledFor;
        }
```

#### Caller #12: `src/page/call-center/attender/components/edit-modal/EditHistoryModal.jsx` (Line 196)

```javascript
          status: latestStatus,
          remark: latestRemark,
          callType: latestCallType
        };
        if (calledForField) {
          updates[calledForField] = latestCalledFor;
        }
        if (sourceField) {
          updates[sourceField] = latestSource;
        }
        await updateCallLog(row.id, updates, attenderId || null, edited.attenderName || "Admin", row);
      }

      toast.success("Call history logs updated successfully!", { id: toastId });
      onClose(); // close history modal
      if (onParentClose) onParentClose(); // close outer EditModal — no extra Save needed
    } catch (err) {
      console.error("Failed to save history logs:", err);
      toast.error("Failed to save history: " + err.message, { id: toastId });
    } finally {
      setSaving(false);
```

#### Caller #13: `src/page/call-center/attender/components/EditModal.jsx` (Line 10)

```javascript
import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Phone, Plus, X, Save, Tag, User, MapPin, MessageSquare,
  Hash, Clock, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame,
  ChevronDown, Check, Search, Users
} from "lucide-react";
import {
  addIncomingCallLog, updateCallLog, createProgram, checkGlobalDuplicate, findMatchingAttenderState, combineContactHistories
} from "../../../../lib/db";
import { searchCRMByPhone } from "../../../../lib/ghl";
import {
  STATUS_OPTIONS,
  OBJECTION_REASONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  CALL_TYPE_OPTIONS,
  isIgnoredField,
  getFieldWithFallback,
```

#### Caller #14: `src/page/call-center/attender/components/EditModal.jsx` (Line 1333)

```javascript
    isSubmittingRef.current = true;
    setSaving(true);

    try {
      const { id, _callbackDue, ...rest } = targetEdited;
      const updates = { ...rest };
      if (updates.Name) {
        updates.Name = formatContactName(updates.Name);
      }
      // Never send attenderStates or internal bookkeeping back to Firestore as a whole object.
      // updateCallLog manages attenderStates internally via dot-notation (merge-safe).
      // Sending it here would overwrite the entire map, erasing other attenders' data.
      delete updates.attenderStates;
      delete updates.assignedTo;
      delete updates.assignedName;
      delete updates.assignedAt;
      delete updates.isAssigned;
      delete updates.lastEditedBy;
      delete updates.lastEditedAt;
      delete updates.normalizedPhone;
      delete updates.normalizedMobile;
```

#### Caller #15: `src/page/call-center/attender/components/EditModal.jsx` (Line 1533)

```javascript

      let savedDocId = targetDocId;
      if (isNewWithoutDoc) {
        delete updates._isNew;
        const resId = await addIncomingCallLog(
          activeAttenderId, activeAttenderName, updates, targetEdited.programId, targetEdited.programName
        );
        console.log("[EDIT MODAL SAVE] addIncomingCallLog result docId:", resId);
        savedDocId = resId;
      } else {
        const res = await updateCallLog(targetDocId, updates, activeAttenderId, activeAttenderName, row);
        console.log("[EDIT MODAL SAVE] updateCallLog result:", res);
        if (res?.updatedLead) {
          targetEdited = { ...targetEdited, ...res.updatedLead };
        }
      }

      console.log("✅ Save successful!");
      toast.success("Saved!", { duration: 4000, position: 'top-center' });

      if (onSave) onSave({ ...targetEdited, ...updates, id: savedDocId }, false);
```

#### Caller #16: `src/page/call-center/attender/components/EditModal.jsx` (Line 1534)

```javascript
      let savedDocId = targetDocId;
      if (isNewWithoutDoc) {
        delete updates._isNew;
        const resId = await addIncomingCallLog(
          activeAttenderId, activeAttenderName, updates, targetEdited.programId, targetEdited.programName
        );
        console.log("[EDIT MODAL SAVE] addIncomingCallLog result docId:", resId);
        savedDocId = resId;
      } else {
        const res = await updateCallLog(targetDocId, updates, activeAttenderId, activeAttenderName, row);
        console.log("[EDIT MODAL SAVE] updateCallLog result:", res);
        if (res?.updatedLead) {
          targetEdited = { ...targetEdited, ...res.updatedLead };
        }
      }

      console.log("✅ Save successful!");
      toast.success("Saved!", { duration: 4000, position: 'top-center' });

      if (onSave) onSave({ ...targetEdited, ...updates, id: savedDocId }, false);
      if (onClose) onClose();
```

#### Caller #17: `src/page/call-center/attender/mobile/MobileEditModal.jsx` (Line 9)

```javascript
import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Phone, Plus, X, Tag, User, MapPin, MessageSquare,
  Hash, Clock, CheckCircle2, AlertCircle, Trash2,
  CalendarDays, Loader, Flame, Edit3, ArrowLeft, Users
} from "lucide-react";
import {
  addIncomingCallLog, updateCallLog, checkGlobalDuplicate, findMatchingAttenderState
} from "../../../../lib/db";
import { searchCRMByPhone } from "../../../../lib/ghl";
import {
  STATUS_OPTIONS,
  OBJECTION_REASONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  isKhojiField,
  getFieldWithFallback,
  formatContactName,
```

#### Caller #18: `src/page/call-center/attender/mobile/MobileEditModal.jsx` (Line 169)

```javascript
      delete updates.assignedName;

      updates.lastEditedBy = attenderName || "Unknown";

      if (row._isNew) {
        delete updates._isNew;
        await addIncomingCallLog(
          row.attenderId, row.attenderName, updates, targetEdited.programId, targetEdited.programName
        );
      } else {
        await updateCallLog(id, updates, attenderId, attenderName, row);
      }

      toast.success("Saved!", { duration: 3000, position: 'top-center' });
      if (onClose) onClose();
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Save failed. Please check connection.", { duration: 4000, position: 'top-center' });
    } finally {
      setSaving(false);
      isSavingRef.current = false;
```

### Callers of `updateCallLogDirectFirebase`

#### Caller #1: `src/lib/db/contactService.js` (Line 854)

```javascript

export const updateCallLogDirectFirebase = async (logId, updates, attenderId = null, attenderName = null, existingContact = null) => {
  const contactRef = doc(db, "contacts", logId);
  
  let previousStatus = "";
  let logData = {};

  if (existingContact) {
    logData = existingContact;
    console.log(
      "%c⚡ [0-READ CACHE HIT - updateCallLogDirectFirebase]",
      "background: #065f46; color: #34d399; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
      `Bypassed getDoc using existingContact for "${logData.Name || logId}" (${logId}) | 0 Firestore Reads`
    );
  } else {
    try {
      const logSnap = await getDoc(contactRef);
      console.log(
        `[FIRESTORE READ]\ncollection: contacts\noperation: getDoc\ndocument: ${logId}\ndocuments_returned: ${logSnap.exists() ? 1 : 0}\nestimated_read_cost: 1\nreason: updateCallLogDirectFirebase`
      );
      if (logSnap.exists()) {
```

#### Caller #2: `src/lib/db/contactService.js` (Line 862)

```javascript
    logData = existingContact;
    console.log(
      "%c⚡ [0-READ CACHE HIT - updateCallLogDirectFirebase]",
      "background: #065f46; color: #34d399; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
      `Bypassed getDoc using existingContact for "${logData.Name || logId}" (${logId}) | 0 Firestore Reads`
    );
  } else {
    try {
      const logSnap = await getDoc(contactRef);
      console.log(
        `[FIRESTORE READ]\ncollection: contacts\noperation: getDoc\ndocument: ${logId}\ndocuments_returned: ${logSnap.exists() ? 1 : 0}\nestimated_read_cost: 1\nreason: updateCallLogDirectFirebase`
      );
      if (logSnap.exists()) {
        logData = logSnap.data();
      }
    } catch (e) {
      console.warn("Failed to fetch contact data in updateCallLogDirectFirebase", e);
    }
  }

  if (attenderId && logData.attenderStates?.[attenderId]?.status !== undefined) {
```

#### Caller #3: `src/lib/db/contactService.js` (Line 868)

```javascript
  } else {
    try {
      const logSnap = await getDoc(contactRef);
      console.log(
        `[FIRESTORE READ]\ncollection: contacts\noperation: getDoc\ndocument: ${logId}\ndocuments_returned: ${logSnap.exists() ? 1 : 0}\nestimated_read_cost: 1\nreason: updateCallLogDirectFirebase`
      );
      if (logSnap.exists()) {
        logData = logSnap.data();
      }
    } catch (e) {
      console.warn("Failed to fetch contact data in updateCallLogDirectFirebase", e);
    }
  }

  if (attenderId && logData.attenderStates?.[attenderId]?.status !== undefined) {
    previousStatus = logData.attenderStates[attenderId].status || "";
  } else {
    previousStatus = logData.status || "";
  }

  // Format Name if modified
```

#### Caller #4: `src/lib/db/contactService.js` (Line 1321)

```javascript


export const updateCallLog = async (logId, updates, attenderId = null, attenderName = null, existingContact = null) => {
  console.log(`[UPDATE CALL LOG] Initiating instant 0ms local save for contactId: ${logId}`);
  // 1. Instantly update local IndexedDB cache for 0ms UI response
  if (attenderId) {
    await updateLocalAttenderCache(attenderId, { ...existingContact, ...updates, id: logId });
  }

  // 2. Trigger direct write to Firebase asynchronously in the background
  updateCallLogDirectFirebase(logId, updates, attenderId, attenderName, existingContact)
    .then(() => {
      console.log(`[UPDATE CALL LOG SUCCESS] Firebase write completed for contactId: ${logId}`);
    })
    .catch(err => {
      console.warn("⚠️ Firebase write deferred to pending queue:", err?.message || err);
      queuePendingWrite("updateCallLog", { logId, updates, attenderId, attenderName, existingContact });
    });

  return { success: true, synced: false, localId: logId, updatedLead: { ...existingContact, ...updates, id: logId } };
};
```

#### Caller #5: `src/lib/db/contactService.js` (Line 1765)

```javascript
    });

  return localId;
};

// Global search contacts by exact phone number, name prefix, or email prefix

export const processPendingWriteItem = async (item) => {
  if (!item) return;
  if (item.type === "updateCallLog" && item.logId) {
    await updateCallLogDirectFirebase(item.logId, item.updates, item.attenderId, item.attenderName, item.existingContact);
  } else if (item.type === "addIncomingCallLog") {
    await addIncomingCallLogDirectFirebase(item.attenderId, item.attenderName, item.data, item.programId, item.programName);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushPendingWrites(processPendingWriteItem);
  });
}
```

### Callers of `updateCacheContacts`

#### Caller #1: `src/lib/db/adminService.js` (Line 907)

```javascript
        for (const [key, val] of Object.entries(updates)) {
          const contactId = key.split(".")[1];
          const isDeleteVal = !(val && val.id);
          await updateContactInActiveCache(month, contactId, isDeleteVal ? null : val, knownPartIdMap[contactId] || null);
        }
      }
    });

    await Promise.all(updatePromises);
  } catch (err) {
    console.error("updateCacheContacts error:", err);
  }
};


export const verifyCallCenterCache = async () => {
  try {
    const liveSnap = await getDocs(collection(db, "contacts"));
    const currentMonth = getMonthStr(new Date());
    
    const liveMonthlyData = {};
```

#### Caller #2: `src/lib/db/contactService.js` (Line 832)

```javascript
      return assignedIds;
    });

    if (Array.isArray(txResult)) {
      allAssignedIds.push(...txResult);
    }
  }

  const totalAssigned = allAssignedIds.length;
  if (totalAssigned > 0) {
    await updateCacheContacts(allAssignedIds);
  }
  return totalAssigned;
};

// ─────────────────────────────────────────────
// CALL LOGS — Attender's Personal Sheet
// ─────────────────────────────────────────────

// In-memory registry of active partition snapshots to eliminate getDocs reads during updates
const globalActivePartitionsCache = {};
```

#### Caller #3: `src/lib/db/contactService.js` (Line 1379)

```javascript
  }

  await updateDoc(contactRef, {
    isAssigned: isAssignedVal,
    assignedTo: newAssignedTo,
    assignedName: assignedNameVal,
    attenderId: attenderIdVal,
    attenderName: attenderNameVal,
    [`attenderStates.${attenderId}._hidden`]: true,
  });
  await updateCacheContacts([contactId]);
};

// ────────────────────────────────────────────
// CALL LOGS — Attender's Personal Sheet
// ─────────────────────────────────────────────

// Add a manual incoming or outgoing call entry

export const addIncomingCallLogDirectFirebase = async (attenderId, attenderName, data, programId = null, programName = null) => {
  const now = new Date();
```

#### Caller #4: `src/lib/db/contactService.js` (Line 2078)

```javascript
      callType: "outgoing",
      status: "", // Reset status for compatibility/overall last-edited view
      remark: "", // Reset remark
      callbackDate: null, 
      isCallbackDue: false,
      attenderStates: newStates,
      _deleted: deleteField(), // Ensure contact is active/undeleted when claimed
      updatedAt: serverTimestamp()
    });
  });
  await updateCacheContacts([contactId]);
};

// Claim a contact that only exists in the CRM by creating it in Firebase first

export const claimCRMContact = async (crmContact, attenderId, attenderName) => {
  const normPhone = normalizePhone(crmContact.Phone || "");
  const normMobile = normalizePhone(crmContact.Mobile || "");
  const finalNormalizedPhones = Array.from(new Set([
    ...extractIndividualPhones(crmContact.Phone || ""),
    ...extractIndividualPhones(crmContact.Mobile || "")
```

#### Caller #5: `src/lib/db/contactService.js` (Line 2176)

```javascript
    callbackDate: null,
    isCallbackDue: false,
    attenderStates: newStates,
    tags: finalTags,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isManualEntry: false
  };

  const docRef = await addDoc(collection(db, "contacts"), docData);
  await updateCacheContacts([docRef.id]);
  return docRef.id;
};

// ─────────────────────────────────────────────
// REASSIGN — Move unworked contacts back to pool
// ─────────────────────────────────────────────

export const reassignContactsToPool = async (tag, attenderId, count, mode = "Pending") => {
  const q = query(
    collection(db, "contacts"),
```

#### Caller #6: `src/lib/db/contactService.js` (Line 2263)

```javascript
      assignedTo: newAssignedTo,
      assignedName: assignedNameVal,
      attenderId: attenderIdVal,
      attenderName: attenderNameVal,
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
  if (toProcess.length > 0) {
    await updateCacheContacts(toProcess.map(c => c.id));
  }
  return toProcess.length;
};

// ─────────────────────────────────────────────
// REASSIGN — Move contacts between attenders
// ─────────────────────────────────────────────

export const reassignContactsBetweenAttenders = async (tag, fromAttenderId, toAttenderId, count, mode = "Pending") => {
  // Fetch target attender to get their name
```

#### Caller #7: `src/lib/db/contactService.js` (Line 2360)

```javascript
      assignedTo: newAssignedTo,
      assignedName: toAttenderName,
      attenderId: toAttenderId,
      attenderName: toAttenderName,
      attenderStates: updatedStates,
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
  if (toProcess.length > 0) {
    await updateCacheContacts(toProcess.map(c => c.id));
  }
  return toProcess.length;
};

// ─────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────

const safeTimestampNumber = (ts) => {
  if (!ts) return 0;
```

### Callers of `updateContactInActiveCache`

#### Caller #1: `src/lib/db/adminService.js` (Line 465)

```javascript
  return {
    mergedTotalCount,
    results
  };
};


export const updateContactInActiveCache = async (month, contactId, prunedContact, knownPartId = null) => {
  if (knownPartId) {
    try {
      console.log(`[FIRESTORE WRITE - updateContactInActiveCache] Direct updateDoc to target part: ${knownPartId} | contactId: ${contactId}`);
      const ref = doc(db, "callCenterCache", knownPartId);
      if (prunedContact === null) {
        await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });
        if (globalActivePartitionsCache[month]?.[knownPartId]?.contacts) {
          delete globalActivePartitionsCache[month][knownPartId].contacts[contactId];
        }
        return;
      } else {
        const memoryData = globalActivePartitionsCache[month]?.[knownPartId]?.contacts || {};
        const updatedContacts = { ...memoryData, [contactId]: prunedContact };
```

#### Caller #2: `src/lib/db/adminService.js` (Line 609)

```javascript

  // 2. FALLBACK ONLY IF IN-MEMORY SNAPSHOT NOT LOADED
  const cacheColl = collection(db, "callCenterCache");

  // Query parts belonging to this month to locate existing contact or get latest partition
  const monthQuery = query(
    cacheColl,
    where(documentId(), ">=", month),
    where(documentId(), "<=", month + "\uf8ff")
  );
  console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache querying cache parts (fallback) for month: ${month}`);
  const snap = await getDocs(monthQuery);
  console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache completed | partsFound: ${snap.docs.length}`);

  let targetDoc = null;
  let latestDoc = null;
  let maxPartNum = 0;

  snap.docs.forEach(d => {
    if (d.id === month || d.id.startsWith(`${month}_part`)) {
      const match = d.id.match(/_part(\d+)$/);
```

#### Caller #3: `src/lib/db/adminService.js` (Line 611)

```javascript
  const cacheColl = collection(db, "callCenterCache");

  // Query parts belonging to this month to locate existing contact or get latest partition
  const monthQuery = query(
    cacheColl,
    where(documentId(), ">=", month),
    where(documentId(), "<=", month + "\uf8ff")
  );
  console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache querying cache parts (fallback) for month: ${month}`);
  const snap = await getDocs(monthQuery);
  console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache completed | partsFound: ${snap.docs.length}`);

  let targetDoc = null;
  let latestDoc = null;
  let maxPartNum = 0;

  snap.docs.forEach(d => {
    if (d.id === month || d.id.startsWith(`${month}_part`)) {
      const match = d.id.match(/_part(\d+)$/);
      const num = match ? parseInt(match[1]) : 1;
      if (num >= maxPartNum) {
```

#### Caller #4: `src/lib/db/adminService.js` (Line 900)

```javascript
          const isDeleteVal = !(val && val.id);
          await updateContactInLockedReport(month, contactId, isDeleteVal ? null : val);
        }
      }
      
      // Also update the active cache if it's not locked/deleted yet
      if (!isLockedMonth) {
        for (const [key, val] of Object.entries(updates)) {
          const contactId = key.split(".")[1];
          const isDeleteVal = !(val && val.id);
          await updateContactInActiveCache(month, contactId, isDeleteVal ? null : val, knownPartIdMap[contactId] || null);
        }
      }
    });

    await Promise.all(updatePromises);
  } catch (err) {
    console.error("updateCacheContacts error:", err);
  }
};

```

### Callers of `updateRegistrationInActiveCache`

#### Caller #1: `src/lib/db/adminService.js` (Line 1536)

```javascript
      regs[registrationId] = { id: registrationId, ...regPayload };
    }
    const count = Object.keys(regs).length;
    await setDoc(docRef, {
      month: monthStr,
      registrations: regs,
      count,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("updateRegistrationInActiveCache error:", err);
  }
};

export const rebuildRegistrationsCache = async (isDryRun = false) => {
  console.log(`[REGISTRATIONS CACHE CONSOLIDATION] Starting rebuild (Dry Run: ${isDryRun})...`);
  const snap = await getDocs(collection(db, "registrations"));
  const totalRegistrations = snap.docs.length;
  const monthlyGroups = {};

  snap.docs.forEach(docSnap => {
```

### Callers of `registerRegistrationMonth`

#### Caller #1: `src/lib/db/contactService.js` (Line 25)

```javascript
} from "./core.js";
import {
  getIDBCache, setIDBCache, dupCheckCacheMap,
  getDupCheckCache, setDupCheckCache, updateLocalAttenderCache,
  updateLocalRegistrationsCache, fetchPartitionCacheForColdBoot
} from "./cacheService.js";
import {
  getActiveTags, registerActiveTag, INCOMING_PROGRAM_ID, INCOMING_PROGRAM_NAME,
  OUTGOING_PROGRAM_ID, OUTGOING_PROGRAM_NAME
} from "./programService.js";
import { registerRegistrationMonth } from "./adminService.js";
import { queuePendingWrite, flushPendingWrites } from "./syncService.js";

export const parseTags = (tagInput) => {
  if (!tagInput) return [];
  if (Array.isArray(tagInput)) {
    return tagInput.flatMap(t => parseTags(String(t)));
  }
  const str = String(tagInput).trim();
  if (!str) return [];
  return str
```

#### Caller #2: `src/lib/db/contactService.js` (Line 1128)

```javascript

    console.log("[REGISTRATION BATCH]", {
      registrationId,
      payload: regPayload,
      hasUndefinedFields
    });

    batch.set(regRef, regPayload, { merge: true });
    batch.set(regCacheRef, { registrations: { [registrationId]: regPayload } }, { merge: true });
    batchPaths.push(`registrations/${registrationId}`, `registrationsCache/${currentMonth}`);
    registerRegistrationMonth(currentMonth).catch(() => {});
    updateLocalRegistrationsCache(regPayload).catch(() => {});
  }

  try {
    await batch.commit();

    if (isRegDone && registrationId) {
      console.log("[REGISTRATION BATCH SUCCESS]", {
        registrationId,
        writes: [`registrations/${registrationId}`, `registrationsCache/${currentMonth}`]
```

#### Caller #3: `src/lib/db/contactService.js` (Line 1287)

```javascript
        const cleanPayload = sanitizeForFirestore(payload);

        await setDoc(doc(db, "registrations", registrationId), cleanPayload, { merge: true });
        trackFirestoreWrite({
          operation: "setDoc",
          paths: [`registrations/${registrationId}`],
          writeCount: 1,
          reason: "syncRegistrationForContact",
          contactId: logId
        });
        await registerRegistrationMonth(yearMonth);
        updateLocalRegistrationsCache({ ...payload, registrationId }).catch(() => {});
      }

      // Delete any outdated/orphan registrations for this contact
      for (const [id, ref] of Object.entries(existingRegMap)) {
        if (!activeRegIds.has(id)) {
          await deleteDoc(ref);
          trackFirestoreWrite({
            operation: "deleteDoc",
            paths: [`registrations/${id}`],
```

#### Caller #4: `src/lib/db/contactService.js` (Line 1653)

```javascript
      payload,
      hasUndefinedFields
    });

    const regRef = doc(db, "registrations", addRegId);
    const regCacheRef = doc(db, "registrationsCache", yearMonth);

    batch.set(regRef, payload, { merge: true });
    batch.set(regCacheRef, { registrations: { [addRegId]: payload } }, { merge: true });
    batchPaths.push(`registrations/${addRegId}`, `registrationsCache/${yearMonth}`);
    registerRegistrationMonth(yearMonth).catch(() => {});
    updateLocalRegistrationsCache({ ...payload, registrationId: addRegId }).catch(() => {});
  }

  // Commit all writes atomically in ONE single network call!
  try {
    await batch.commit();

    if (isAddRegDone && addRegId) {
      console.log("[REGISTRATION BATCH SUCCESS]", {
        registrationId: addRegId,
```

### Callers of `subscribeToAllCallLogs`

#### Caller #1: `src/lib/db/adminService.js` (Line 1238)

```javascript
        id: d.id,
        data: () => d
      }));
      triggerCallback();
    } else {
      const lockedQuery = query(
        collection(db, "lockedMonthlyReports"),
        where(documentId(), ">=", queryStartMonth),
        where(documentId(), "<=", endMonth + "\uf8ff")
      );
      console.log(`[ADMIN FIRESTORE READ - getDocs] subscribeToAllCallLogs checking lockedMonthlyReports | range: ${queryStartMonth} to ${endMonth}`);
      getDocs(lockedQuery).then(snap => {
        console.log(`[ADMIN FIRESTORE READ - getDocs] lockedMonthlyReports completed | docsCount: ${snap.docs.length}`);
        lockedDocs = snap.docs;
        const plainLocked = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIDBCache(lockedCacheKey, plainLocked).catch(err => console.warn("Failed to cache locked reports:", err));
        triggerCallback();
      }).catch(err => {
        console.error("subscribeToAllCallLogs locked fetch error:", err);
        triggerCallback();
      });
```

#### Caller #2: `src/lib/db/adminService.js` (Line 1246)

```javascript
        where(documentId(), "<=", endMonth + "\uf8ff")
      );
      console.log(`[ADMIN FIRESTORE READ - getDocs] subscribeToAllCallLogs checking lockedMonthlyReports | range: ${queryStartMonth} to ${endMonth}`);
      getDocs(lockedQuery).then(snap => {
        console.log(`[ADMIN FIRESTORE READ - getDocs] lockedMonthlyReports completed | docsCount: ${snap.docs.length}`);
        lockedDocs = snap.docs;
        const plainLocked = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIDBCache(lockedCacheKey, plainLocked).catch(err => console.warn("Failed to cache locked reports:", err));
        triggerCallback();
      }).catch(err => {
        console.error("subscribeToAllCallLogs locked fetch error:", err);
        triggerCallback();
      });
    }
  }).catch(() => {
    triggerCallback();
  });
  
  const cacheQuery = query(
    collection(db, "callCenterCache"),
    where(documentId(), ">=", queryStartMonth),
```

#### Caller #3: `src/lib/db/adminService.js` (Line 1289)

```javascript
        modified: modifiedCount,
        removed: removedCount
      }
    });

    if (!snap.metadata.fromCache && snap.docs.length > 0) {
      trackFirestoreRead({
        collection: "callCenterCache",
        operation: "onSnapshot",
        documentsReturned: snap.docs.length,
        reason: "subscribeToAllCallLogs",
        source: "admin/callCenterCache"
      });
    }

    if (snap.empty && lockedDocs.length === 0) {
      try {
        const cached = await getIDBCache(cacheKey);
        if (Array.isArray(cached) && cached.length > 0) {
          console.log(
            "%c⚡ [0-READ CACHE HIT - subscribeToAllCallLogs]",
```

#### Caller #4: `src/lib/db/adminService.js` (Line 1299)

```javascript
        reason: "subscribeToAllCallLogs",
        source: "admin/callCenterCache"
      });
    }

    if (snap.empty && lockedDocs.length === 0) {
      try {
        const cached = await getIDBCache(cacheKey);
        if (Array.isArray(cached) && cached.length > 0) {
          console.log(
            "%c⚡ [0-READ CACHE HIT - subscribeToAllCallLogs]",
            "background: #065f46; color: #34d399; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
            `Served ${cached.length} logs from IndexedDB | 0 Firestore Reads`
          );
          finalCallback(cached);
          return;
        }
      } catch (e) {}
      
      console.log(`[subscribeToAllCallLogs] No callCenterCache partition docs found for ${targetOption}. Returning empty list (0 contacts query).`);
      finalCallback([]);
```

#### Caller #5: `src/lib/db/adminService.js` (Line 1308)

```javascript
          console.log(
            "%c⚡ [0-READ CACHE HIT - subscribeToAllCallLogs]",
            "background: #065f46; color: #34d399; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
            `Served ${cached.length} logs from IndexedDB | 0 Firestore Reads`
          );
          finalCallback(cached);
          return;
        }
      } catch (e) {}
      
      console.log(`[subscribeToAllCallLogs] No callCenterCache partition docs found for ${targetOption}. Returning empty list (0 contacts query).`);
      finalCallback([]);
      return;
    }
    
    cacheSnap = snap;
    triggerCallback();
  }, async err => {
    console.error("subscribeToAllCallLogs snapshot error:", err);
    try {
      const cached = await getIDBCache(cacheKey);
```

#### Caller #6: `src/lib/db/adminService.js` (Line 1316)

```javascript
      } catch (e) {}
      
      console.log(`[subscribeToAllCallLogs] No callCenterCache partition docs found for ${targetOption}. Returning empty list (0 contacts query).`);
      finalCallback([]);
      return;
    }
    
    cacheSnap = snap;
    triggerCallback();
  }, async err => {
    console.error("subscribeToAllCallLogs snapshot error:", err);
    try {
      const cached = await getIDBCache(cacheKey);
      if (Array.isArray(cached) && cached.length > 0) {
        console.log(`⚡ [ADMIN IDB ZERO-READ CACHE ON ERROR] Served ${cached.length} logs from IndexedDB (0 Firestore Reads)`);
        finalCallback(cached);
        return;
      }
    } catch (e) {}
    finalCallback([]);
  });
```

#### Caller #7: `src/page/call-center/admin/AdminPanel.jsx` (Line 4)

```javascript
import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Settings, ArrowLeft, ChevronRight, Loader } from "lucide-react";
import { getPrograms, getAttenders, getSettingsOptions, subscribeToAllCallLogs, subscribeToRegistrations, getRegistrationMonths, runAutoLockAndPurgeCheck } from "../../../lib/db";
import { updateDynamicOptions } from "../attender/utils";
import ImportContacts from "../ImportContacts";
import { TAB_ITEMS } from "./utils.jsx";
import DashboardTab from "./components/DashboardTab";
import MonthlyReportTab from "./components/MonthlyReportTab";
import ProgramsTab from "./components/ProgramsTab";
import AttendersTab from "./components/AttendersTab";
import AbhivyaktiTab from "./components/AbhivyaktiTab";
import SettingsTab from "./components/SettingsTab";
import AllAttendersSheetTab from "./components/AllAttendersSheetTab";
```

#### Caller #8: `src/page/call-center/admin/AdminPanel.jsx` (Line 50)

```javascript
          updateDynamicOptions(data);
        }
      })
      .catch(() => {});
  }, []);

  // Hoisted subscription to all call logs
  useEffect(() => {
    if (!selectedMonth) return;
    setCallLogsLoading(true);
    const unsubLogs = subscribeToAllCallLogs("ALL", selectedMonth, (logs) => {
      setCallLogs(logs);
      setCallLogsLoading(false);
    });
    return () => {
      if (unsubLogs) unsubLogs();
    };
  }, [selectedMonth]);

  // Hoisted month loading logic
  useEffect(() => {
```

#### Caller #9: `src/page/call-center/admin/components/DashboardTab.jsx` (Line 5)

```javascript
import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import { BarChart3, Download, Search, X, ChevronDown, Check } from "lucide-react";
import { subscribeToAllCallLogs } from "../../../../lib/db";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { COLORS, cleanExportRow, CONNECTED_STATUSES, NOT_CONNECTED_STATUSES, parseTimestamp, getCanonicalStatus } from "../utils.jsx";
import { isKhojiAffirmative, isKhojiNegative } from "../../attender/utils.js";

// ── Multi-select dropdown ──────────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder, allLabel = "All" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

```

#### Caller #10: `src/page/call-center/admin/components/MonthlyReportTab.jsx` (Line 7)

```javascript
import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Download, ChevronRight, ChevronDown, Calendar, TrendingUp, UserCheck, Smile, Info, Search, X, Check
} from "lucide-react";
import { subscribeToAllCallLogs } from "../../../../lib/db";
import { CONNECTED_STATUSES, NOT_CONNECTED_STATUSES, parseTimestamp, getCanonicalStatus, getContactPhone, getContactName, getContactCity, getContactKhoji } from "../utils.jsx";
import { isKhojiAffirmative, isKhojiNegative } from "../../attender/utils.js";

function MonthlySection({ title, subtitle, action, children, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-300">
      <div className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer select-none">
        <div onClick={() => setIsOpen(!isOpen)} className="flex-1">
          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">{title}</h3>
```

### Callers of `subscribeToRegistrations`

#### Caller #1: `src/lib/db/adminService.js` (Line 1713)

```javascript
      console.log(`[REGISTRATION FIRESTORE READ]`, {
        partitions: partitionIds,
        partitionCount: partitionIds.length,
        estimatedReads: partitionIds.length
      });

      trackFirestoreRead({
        collection: "registrationsCache",
        operation: "getDocs",
        documentsReturned: partitionIds.length,
        reason: "subscribeToRegistrations",
        source: "admin/registrationsCache"
      });

      let docs = [];
      if (!snap.empty) {
        const regsMap = {};
        snap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const docRegs = data.registrations || {};
          Object.entries(docRegs).forEach(([id, r]) => {
```

#### Caller #2: `src/lib/db/adminService.js` (Line 1746)

```javascript

      docs.sort((a, b) => {
        const ta = a.registeredAt?.toMillis ? a.registeredAt.toMillis() : (a.registeredAt?.seconds ? a.registeredAt.seconds * 1000 : 0);
        const tb = b.registeredAt?.toMillis ? b.registeredAt.toMillis() : (b.registeredAt?.seconds ? b.registeredAt.seconds * 1000 : 0);
        return tb - ta;
      });

      await setIDBCache(cacheKey, docs);
      finalCallback(docs);
    } catch (err) {
      console.error("subscribeToRegistrations fetch error:", err);
    }
  }).catch(err => {
    console.warn("IndexedDB access error in subscribeToRegistrations:", err);
  });

  return () => {}; // Pure cache-first, no realtime listener subscription needed
};

/**
 * Manually force-refresh registrations from Firestore partition cache into IndexedDB
```

#### Caller #3: `src/lib/db/adminService.js` (Line 1749)

```javascript
        const tb = b.registeredAt?.toMillis ? b.registeredAt.toMillis() : (b.registeredAt?.seconds ? b.registeredAt.seconds * 1000 : 0);
        return tb - ta;
      });

      await setIDBCache(cacheKey, docs);
      finalCallback(docs);
    } catch (err) {
      console.error("subscribeToRegistrations fetch error:", err);
    }
  }).catch(err => {
    console.warn("IndexedDB access error in subscribeToRegistrations:", err);
  });

  return () => {}; // Pure cache-first, no realtime listener subscription needed
};

/**
 * Manually force-refresh registrations from Firestore partition cache into IndexedDB
 */
export const refreshRegistrations = async (scopeOption, callback) => {
  let targetOption = scopeOption || getMonthStr(new Date());
```

#### Caller #4: `src/page/call-center/admin/AdminPanel.jsx` (Line 4)

```javascript
import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Settings, ArrowLeft, ChevronRight, Loader } from "lucide-react";
import { getPrograms, getAttenders, getSettingsOptions, subscribeToAllCallLogs, subscribeToRegistrations, getRegistrationMonths, runAutoLockAndPurgeCheck } from "../../../lib/db";
import { updateDynamicOptions } from "../attender/utils";
import ImportContacts from "../ImportContacts";
import { TAB_ITEMS } from "./utils.jsx";
import DashboardTab from "./components/DashboardTab";
import MonthlyReportTab from "./components/MonthlyReportTab";
import ProgramsTab from "./components/ProgramsTab";
import AttendersTab from "./components/AttendersTab";
import AbhivyaktiTab from "./components/AbhivyaktiTab";
import SettingsTab from "./components/SettingsTab";
import AllAttendersSheetTab from "./components/AllAttendersSheetTab";
```

#### Caller #5: `src/page/call-center/admin/AdminPanel.jsx` (Line 80)

```javascript
        console.error("Failed to load registration months", err);
      }
    };
    loadMonths();
  }, []);

  // Hoisted subscription to registrations — ALL months scope cached in IndexedDB
  useEffect(() => {
    if (activeTab !== "abhivyakti") return;
    setRegistrationsLoading(true);
    const unsubRegs = subscribeToRegistrations("ALL", (data) => {
      setRegistrations(data);
      setRegistrationsLoading(false);
    });
    return () => {
      if (unsubRegs) unsubRegs();
    };
  }, [activeTab]);

  const loadAll = async () => {
    setIsLoading(true);
```

### Callers of `fetchFreshSharedLead`

#### Caller #1: `src/lib/db/syncService.js` (Line 128)

```javascript
      }
    );
    return lead;
  }

  try {
    console.log(
      `[LEAD FETCH → FIRESTORE]`,
      {
        contactId: lead?.id,
        reason: "fetchFreshSharedLead",
        isShared,
        forceRefresh
      }
    );

    const docRef = doc(db, "contacts", lead.id);
    const docSnap = await getDoc(docRef);

    trackFirestoreRead({
      collection: "contacts",
```

#### Caller #2: `src/lib/db/syncService.js` (Line 142)

```javascript
    );

    const docRef = doc(db, "contacts", lead.id);
    const docSnap = await getDoc(docRef);

    trackFirestoreRead({
      collection: "contacts",
      operation: "getDoc",
      document: lead.id,
      documentsReturned: docSnap.exists() ? 1 : 0,
      reason: "fetchFreshSharedLead",
      source: "modal/fetchFreshSharedLead"
    });

    if (!docSnap.exists()) return lead;

    const rawData = docSnap.data();
    const matchedStateObj = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName);
    const attState = matchedStateObj || {};

    const lastHistTime = Array.isArray(rawData.history) && rawData.history.length > 0 
```

#### Caller #3: `src/lib/db/syncService.js` (Line 143)

```javascript

    const docRef = doc(db, "contacts", lead.id);
    const docSnap = await getDoc(docRef);

    trackFirestoreRead({
      collection: "contacts",
      operation: "getDoc",
      document: lead.id,
      documentsReturned: docSnap.exists() ? 1 : 0,
      reason: "fetchFreshSharedLead",
      source: "modal/fetchFreshSharedLead"
    });

    if (!docSnap.exists()) return lead;

    const rawData = docSnap.data();
    const matchedStateObj = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName);
    const attState = matchedStateObj || {};

    const lastHistTime = Array.isArray(rawData.history) && rawData.history.length > 0 
      ? (rawData.history[rawData.history.length - 1]?.timestamp || rawData.history[rawData.history.length - 1]?.date)
```

#### Caller #4: `src/page/call-center/attender/AttenderView.jsx` (Line 17)

```javascript
  Hash, Clock, PhoneOff, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame, SlidersHorizontal, FileSpreadsheet, CheckSquare,
  Bell, Sparkles, UserCheck
} from "lucide-react";
import {
  subscribeToCallLogs, updateCallLog, addIncomingCallLog,
  assignContactsToAttender, normalizePhone, getActiveTags,
  INCOMING_PROGRAM_ID, INCOMING_PROGRAM_NAME, ensureIncomingProgram,
  OUTGOING_PROGRAM_ID, OUTGOING_PROGRAM_NAME, ensureOutgoingProgram,
  globalSearchContacts, searchAttenderContacts, claimContact, removeAttenderFromContact, claimCRMContact,
  fetchHistoricalCachePartition, purgeStaleHistoricalCache, fetchFreshSharedLead
} from "../../../lib/db";
import { searchCRM } from "../../../lib/ghl";
import {
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  CONNECTED_STATUSES,
  NOT_CONNECTED_STATUSES,
  getFieldWithFallback,
  getKhojiValue,
```

#### Caller #5: `src/page/call-center/attender/AttenderView.jsx` (Line 313)

```javascript
      "| attenderStates keys:",
      Object.keys(row.attenderStates || {}),
      "| history length:",
      Array.isArray(row.history) ? row.history.length : 0
    );

    setEditingRow(row); // 0ms Instant Modal Render from local cache

    // Fetch fresh copy for shared leads (0 Reads for solo leads or fresh cache)
    if (row.id && !row._isNew) {
      const fresh = await fetchFreshSharedLead(row, attenderId, attenderName, false);
      if (fresh) {
        setEditingRow(fresh);
        setCallLogs(prev => prev.map(l => l.id === fresh.id ? { ...l, ...fresh } : l));
      }
    }
  }, [attenderId, attenderName]);

  // Trigger 3: Handle Manual Single-Lead Refresh
  const handleRefreshSingleLead = useCallback(async (row) => {
    if (!row || !row.id) return;
```

#### Caller #6: `src/page/call-center/attender/AttenderView.jsx` (Line 330)

```javascript

  // Trigger 3: Handle Manual Single-Lead Refresh
  const handleRefreshSingleLead = useCallback(async (row) => {
    if (!row || !row.id) return;
    const leadName = row.Name || row.name || "Lead";
    console.log(
      `%c🔄 [MANUAL SYNC TRIGGERED] Manual refresh requested for shared lead "${leadName}" (${row.id})`,
      "background: #0284c7; color: #e0f2fe; font-weight: bold; padding: 3px 8px; border-radius: 4px;"
    );
    toast.loading(`Syncing latest details for ${leadName}...`, { id: `sync-${row.id}` });
    const fresh = await fetchFreshSharedLead(row, attenderId, attenderName, true);
    if (fresh) {
      setCallLogs(prev => prev.map(l => l.id === fresh.id ? { ...l, ...fresh } : l));
      toast.success(`Updated details for ${leadName}!`, { id: `sync-${row.id}` });
    } else {
      toast.dismiss(`sync-${row.id}`);
    }
  }, [attenderId, attenderName]);

  // Trigger 2: Triggered when user clicks "Search" button or presses Enter in Search bar
  const handleTriggerSearch = useCallback(async (overrideQuery) => {
```

#### Caller #7: `src/page/call-center/attender/AttenderView.jsx` (Line 359)

```javascript
      const phone = String(log.Phone || log.phone || log.Mobile || log.mobile || "");
      const normPhone = normalizePhone(phone);
      const email = String(log.Email || log.email || "").toLowerCase();
      return name.includes(qLower) || (norm.length >= 4 && normPhone.includes(norm)) || email.includes(qLower);
    });

    if (localMatch) {
      console.log("[TRIGGER 2 SEARCH] Local match found in memory/IndexedDB");
      if (Array.isArray(localMatch.assignedTo) && localMatch.assignedTo.length > 1) {
        console.log(`[TRIGGER 2 SEARCH REFRESH] Fetching fresh copy of shared lead ${localMatch.id}...`);
        const fresh = await fetchFreshSharedLead(localMatch, attenderId, attenderName);
        if (fresh) {
          setCallLogs(prev => prev.map(l => l.id === fresh.id ? { ...l, ...fresh } : l));
        }
      }
      return;
    }

    // Fallback to targeted master contacts query
    try {
      const extraResults = await searchAttenderContacts(q, attenderId, attenderName);
```

### Callers of `syncSharedLead`

*No external callers found in repository.* 

---

## 3. Comprehensive Firebase Operations Inventory

| File | Line | Function | Operation | Collection | Code Line Snippet |
| --- | --- | --- | --- | --- | --- |
| `src/lib/db/adminService.js` | 2 | `Top-Level / Module` | `getDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/adminService.js` | 2 | `Top-Level / Module` | `getDocs` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/adminService.js` | 2 | `Top-Level / Module` | `setDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/adminService.js` | 2 | `Top-Level / Module` | `addDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/adminService.js` | 3 | `Top-Level / Module` | `updateDoc` | `N/A` | `updateDoc, deleteDoc, query, where,` |
| `src/lib/db/adminService.js` | 3 | `Top-Level / Module` | `deleteDoc` | `N/A` | `updateDoc, deleteDoc, query, where,` |
| `src/lib/db/adminService.js` | 4 | `Top-Level / Module` | `onSnapshot` | `N/A` | `serverTimestamp, writeBatch, onSnapshot,` |
| `src/lib/db/adminService.js` | 4 | `Top-Level / Module` | `writeBatch` | `N/A` | `serverTimestamp, writeBatch, onSnapshot,` |
| `src/lib/db/adminService.js` | 6 | `Top-Level / Module` | `runTransaction` | `N/A` | `deleteField, documentId, runTransaction` |
| `src/lib/db/adminService.js` | 53 | `rebuildCallCenterCache` | `deleteDoc` | `N/A` | `await deleteDoc(d.ref);` |
| `src/lib/db/adminService.js` | 65 | `rebuildCallCenterCache` | `setDoc` | `callCenterCache` | `await setDoc(doc(db, "callCenterCache", item.docId), item.data);` |
| `src/lib/db/adminService.js` | 65 | `rebuildCallCenterCache` | `doc(` | `callCenterCache` | `await setDoc(doc(db, "callCenterCache", item.docId), item.data);` |
| `src/lib/db/adminService.js` | 73 | `rebuildCallCenterCache` | `setDoc` | `callCenterCache` | `await setDoc(doc(db, "callCenterCache", "placeholder"), { isPlaceholder: true });` |
| `src/lib/db/adminService.js` | 73 | `rebuildCallCenterCache` | `doc(` | `callCenterCache` | `await setDoc(doc(db, "callCenterCache", "placeholder"), { isPlaceholder: true });` |
| `src/lib/db/adminService.js` | 81 | `rebuildCallCenterCache` | `collection(` | `callCenterCache` | `const cacheColl = collection(db, "callCenterCache");` |
| `src/lib/db/adminService.js` | 82 | `rebuildCallCenterCache` | `getDoc` | `N/A` | `const cacheSnap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 82 | `rebuildCallCenterCache` | `getDocs` | `N/A` | `const cacheSnap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 109 | `rebuildCallCenterCache` | `getDoc` | `contacts` | `const allContactsSnap = await getDocs(collection(db, "contacts"));` |
| `src/lib/db/adminService.js` | 109 | `rebuildCallCenterCache` | `getDocs` | `contacts` | `const allContactsSnap = await getDocs(collection(db, "contacts"));` |
| `src/lib/db/adminService.js` | 109 | `rebuildCallCenterCache` | `collection(` | `contacts` | `const allContactsSnap = await getDocs(collection(db, "contacts"));` |
| `src/lib/db/adminService.js` | 238 | `addIfValidMonth` | `deleteDoc` | `N/A` | `// Step A: Purge old cache partition docs via individual standalone deleteDoc requests (0 transaction overhead)` |
| `src/lib/db/adminService.js` | 243 | `addIfValidMonth` | `deleteDoc` | `N/A` | `await deleteDoc(d.ref);` |
| `src/lib/db/adminService.js` | 251 | `addIfValidMonth` | `setDoc` | `N/A` | `// Step B: Write new partition docs as individual, standalone setDoc operations (0 transaction overhead)` |
| `src/lib/db/adminService.js` | 256 | `addIfValidMonth` | `setDoc` | `callCenterCache` | `await setDoc(doc(db, "callCenterCache", item.docId), item.data);` |
| `src/lib/db/adminService.js` | 256 | `addIfValidMonth` | `doc(` | `callCenterCache` | `await setDoc(doc(db, "callCenterCache", item.docId), item.data);` |
| `src/lib/db/adminService.js` | 265 | `addIfValidMonth` | `setDoc` | `callCenterCache` | `await setDoc(doc(db, "callCenterCache", "placeholder"), { isPlaceholder: true });` |
| `src/lib/db/adminService.js` | 265 | `addIfValidMonth` | `doc(` | `callCenterCache` | `await setDoc(doc(db, "callCenterCache", "placeholder"), { isPlaceholder: true });` |
| `src/lib/db/adminService.js` | 270 | `addIfValidMonth` | `collection(` | `contacts` | `const q = query(collection(db, "contacts"), where("isAssigned", "==", true));` |
| `src/lib/db/adminService.js` | 270 | `addIfValidMonth` | `query(` | `contacts` | `const q = query(collection(db, "contacts"), where("isAssigned", "==", true));` |
| `src/lib/db/adminService.js` | 270 | `addIfValidMonth` | `where(` | `contacts` | `const q = query(collection(db, "contacts"), where("isAssigned", "==", true));` |
| `src/lib/db/adminService.js` | 271 | `addIfValidMonth` | `getCountFromServer` | `N/A` | `const countSnap = await getCountFromServer(q);` |
| `src/lib/db/adminService.js` | 274 | `addIfValidMonth` | `getCountFromServer` | `N/A` | `console.warn("getCountFromServer verification skipped:", err);` |
| `src/lib/db/adminService.js` | 293 | `exportCallCenterCacheToJson` | `collection(` | `callCenterCache` | `const cacheColl = collection(db, "callCenterCache");` |
| `src/lib/db/adminService.js` | 294 | `exportCallCenterCacheToJson` | `getDoc` | `N/A` | `const cacheSnap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 294 | `exportCallCenterCacheToJson` | `getDocs` | `N/A` | `const cacheSnap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 318 | `getCachePartitionsDetail` | `collection(` | `callCenterCache` | `const cacheColl = collection(db, "callCenterCache");` |
| `src/lib/db/adminService.js` | 319 | `getCachePartitionsDetail` | `getDoc` | `N/A` | `const snap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 319 | `getCachePartitionsDetail` | `getDocs` | `N/A` | `const snap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 342 | `mergePartitionPair` | `getDoc` | `N/A` | `export const mergePartitionPair = async (targetDocId, sourceDocId) => {` |
| `src/lib/db/adminService.js` | 343 | `mergePartitionPair` | `getDoc` | `N/A` | `console.log(`[PARTITION MERGE] Attempting to merge ${sourceDocId} into ${targetDocId}...`);` |
| `src/lib/db/adminService.js` | 344 | `mergePartitionPair` | `getDoc` | `callCenterCache` | `const targetRef = doc(db, "callCenterCache", targetDocId);` |
| `src/lib/db/adminService.js` | 344 | `mergePartitionPair` | `doc(` | `callCenterCache` | `const targetRef = doc(db, "callCenterCache", targetDocId);` |
| `src/lib/db/adminService.js` | 345 | `mergePartitionPair` | `doc(` | `callCenterCache` | `const sourceRef = doc(db, "callCenterCache", sourceDocId);` |
| `src/lib/db/adminService.js` | 347 | `mergePartitionPair` | `getDoc` | `N/A` | `const targetSnap = await getDoc(targetRef);` |
| `src/lib/db/adminService.js` | 348 | `mergePartitionPair` | `getDoc` | `N/A` | `const sourceSnap = await getDoc(sourceRef);` |
| `src/lib/db/adminService.js` | 351 | `mergePartitionPair` | `getDoc` | `N/A` | `throw new Error(`One or both documents do not exist: ${targetDocId}, ${sourceDocId}`);` |
| `src/lib/db/adminService.js` | 370 | `mergePartitionPair` | `setDoc` | `N/A` | `// Attempt setDoc to target document` |
| `src/lib/db/adminService.js` | 371 | `mergePartitionPair` | `setDoc` | `N/A` | `await setDoc(targetRef, mergedData);` |
| `src/lib/db/adminService.js` | 372 | `mergePartitionPair` | `setDoc` | `N/A` | `// If setDoc succeeds, delete source document` |
| `src/lib/db/adminService.js` | 373 | `mergePartitionPair` | `deleteDoc` | `N/A` | `await deleteDoc(sourceRef);` |
| `src/lib/db/adminService.js` | 374 | `mergePartitionPair` | `getDoc` | `N/A` | `console.log(`✓ [PARTITION MERGE SUCCESS] Merged ${sourceDocId} into ${targetDocId} (${mergedCount} contacts, ${mergedSizeKb} KB)`);` |
| `src/lib/db/adminService.js` | 377 | `mergePartitionPair` | `getDoc` | `N/A` | `targetDocId,` |
| `src/lib/db/adminService.js` | 383 | `mergePartitionPair` | `getDoc` | `N/A` | `console.error(`❌ [PARTITION MERGE FAILED FOR ${targetDocId} + ${sourceDocId}]:`, err);` |
| `src/lib/db/adminService.js` | 440 | `mergeAllCompatiblePartitionsOneByOne` | `doc(` | `callCenterCache` | `const oldRef = doc(db, "callCenterCache", current.docId);` |
| `src/lib/db/adminService.js` | 441 | `mergeAllCompatiblePartitionsOneByOne` | `doc(` | `callCenterCache` | `const newRef = doc(db, "callCenterCache", expectedDocId);` |
| `src/lib/db/adminService.js` | 442 | `mergeAllCompatiblePartitionsOneByOne` | `getDoc` | `N/A` | `const oldSnap = await getDoc(oldRef);` |
| `src/lib/db/adminService.js` | 444 | `mergeAllCompatiblePartitionsOneByOne` | `setDoc` | `N/A` | `await setDoc(newRef, oldSnap.data());` |
| `src/lib/db/adminService.js` | 445 | `mergeAllCompatiblePartitionsOneByOne` | `deleteDoc` | `N/A` | `await deleteDoc(oldRef);` |
| `src/lib/db/adminService.js` | 465 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `console.log(`[FIRESTORE WRITE - updateContactInActiveCache] Direct updateDoc to target part: ${knownPartId} \| contactId: ${contactId}`);` |
| `src/lib/db/adminService.js` | 466 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const ref = doc(db, "callCenterCache", knownPartId);` |
| `src/lib/db/adminService.js` | 468 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });` |
| `src/lib/db/adminService.js` | 479 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 520 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const ref = doc(db, "callCenterCache", targetPartId);` |
| `src/lib/db/adminService.js` | 522 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });` |
| `src/lib/db/adminService.js` | 532 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 536 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });` |
| `src/lib/db/adminService.js` | 551 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const chosenRef = doc(db, "callCenterCache", chosenPartId);` |
| `src/lib/db/adminService.js` | 552 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(chosenRef, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 560 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const newRef = doc(db, "callCenterCache", newPartId);` |
| `src/lib/db/adminService.js` | 561 | `updateContactInActiveCache` | `setDoc` | `N/A` | `await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });` |
| `src/lib/db/adminService.js` | 583 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const chosenRef = doc(db, "callCenterCache", chosenPartId);` |
| `src/lib/db/adminService.js` | 584 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(chosenRef, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 592 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const newRef = doc(db, "callCenterCache", newPartId);` |
| `src/lib/db/adminService.js` | 593 | `updateContactInActiveCache` | `setDoc` | `N/A` | `await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });` |
| `src/lib/db/adminService.js` | 601 | `updateContactInActiveCache` | `collection(` | `callCenterCache` | `const cacheColl = collection(db, "callCenterCache");` |
| `src/lib/db/adminService.js` | 604 | `updateContactInActiveCache` | `query(` | `N/A` | `const monthQuery = query(` |
| `src/lib/db/adminService.js` | 606 | `updateContactInActiveCache` | `where(` | `N/A` | `where(documentId(), ">=", month),` |
| `src/lib/db/adminService.js` | 607 | `updateContactInActiveCache` | `where(` | `N/A` | `where(documentId(), "<=", month + "\uf8ff")` |
| `src/lib/db/adminService.js` | 609 | `updateContactInActiveCache` | `getDoc` | `N/A` | `console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache querying cache parts (fallback) for month: ${month}`);` |
| `src/lib/db/adminService.js` | 609 | `updateContactInActiveCache` | `getDocs` | `N/A` | `console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache querying cache parts (fallback) for month: ${month}`);` |
| `src/lib/db/adminService.js` | 610 | `updateContactInActiveCache` | `getDoc` | `N/A` | `const snap = await getDocs(monthQuery);` |
| `src/lib/db/adminService.js` | 610 | `updateContactInActiveCache` | `getDocs` | `N/A` | `const snap = await getDocs(monthQuery);` |
| `src/lib/db/adminService.js` | 611 | `updateContactInActiveCache` | `getDoc` | `N/A` | `console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache completed \| partsFound: ${snap.docs.length}`);` |
| `src/lib/db/adminService.js` | 611 | `updateContactInActiveCache` | `getDocs` | `N/A` | `console.log(`[FIRESTORE READ - getDocs] updateContactInActiveCache completed \| partsFound: ${snap.docs.length}`);` |
| `src/lib/db/adminService.js` | 613 | `updateContactInActiveCache` | `getDoc` | `N/A` | `let targetDoc = null;` |
| `src/lib/db/adminService.js` | 628 | `updateContactInActiveCache` | `getDoc` | `N/A` | `targetDoc = d;` |
| `src/lib/db/adminService.js` | 633 | `updateContactInActiveCache` | `getDoc` | `N/A` | `if (targetDoc) {` |
| `src/lib/db/adminService.js` | 635 | `updateContactInActiveCache` | `getDoc` | `callCenterCache` | `const ref = doc(db, "callCenterCache", targetDoc.id);` |
| `src/lib/db/adminService.js` | 635 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const ref = doc(db, "callCenterCache", targetDoc.id);` |
| `src/lib/db/adminService.js` | 637 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });` |
| `src/lib/db/adminService.js` | 639 | `updateContactInActiveCache` | `getDoc` | `N/A` | `const data = targetDoc.data();` |
| `src/lib/db/adminService.js` | 644 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 647 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });` |
| `src/lib/db/adminService.js` | 649 | `updateContactInActiveCache` | `getDoc` | `N/A` | `if (latestDoc && latestDoc.id !== targetDoc.id) {` |
| `src/lib/db/adminService.js` | 655 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const chosenRef = doc(db, "callCenterCache", latestDoc.id);` |
| `src/lib/db/adminService.js` | 656 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(chosenRef, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 662 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const newRef = doc(db, "callCenterCache", newPartId);` |
| `src/lib/db/adminService.js` | 663 | `updateContactInActiveCache` | `setDoc` | `N/A` | `await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });` |
| `src/lib/db/adminService.js` | 676 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const ref = doc(db, "callCenterCache", latestDoc.id);` |
| `src/lib/db/adminService.js` | 677 | `updateContactInActiveCache` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 681 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const ref = doc(db, "callCenterCache", newPartId);` |
| `src/lib/db/adminService.js` | 682 | `updateContactInActiveCache` | `setDoc` | `N/A` | `await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });` |
| `src/lib/db/adminService.js` | 687 | `updateContactInActiveCache` | `doc(` | `callCenterCache` | `const ref = doc(db, "callCenterCache", newPartId);` |
| `src/lib/db/adminService.js` | 688 | `updateContactInActiveCache` | `setDoc` | `N/A` | `await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });` |
| `src/lib/db/adminService.js` | 695 | `updateContactInLockedReport` | `collection(` | `lockedMonthlyReports` | `const lockedColl = collection(db, "lockedMonthlyReports");` |
| `src/lib/db/adminService.js` | 696 | `updateContactInLockedReport` | `query(` | `N/A` | `const q = query(lockedColl, where("month", "==", month));` |
| `src/lib/db/adminService.js` | 696 | `updateContactInLockedReport` | `where(` | `N/A` | `const q = query(lockedColl, where("month", "==", month));` |
| `src/lib/db/adminService.js` | 697 | `updateContactInLockedReport` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/adminService.js` | 697 | `updateContactInLockedReport` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/adminService.js` | 699 | `updateContactInLockedReport` | `getDoc` | `N/A` | `let targetDoc = null;` |
| `src/lib/db/adminService.js` | 705 | `updateContactInLockedReport` | `getDoc` | `N/A` | `targetDoc = d;` |
| `src/lib/db/adminService.js` | 710 | `updateContactInLockedReport` | `getDoc` | `N/A` | `if (targetDoc) {` |
| `src/lib/db/adminService.js` | 711 | `updateContactInLockedReport` | `getDoc` | `lockedMonthlyReports` | `const ref = doc(db, "lockedMonthlyReports", targetDoc.id);` |
| `src/lib/db/adminService.js` | 711 | `updateContactInLockedReport` | `doc(` | `lockedMonthlyReports` | `const ref = doc(db, "lockedMonthlyReports", targetDoc.id);` |
| `src/lib/db/adminService.js` | 713 | `updateContactInLockedReport` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });` |
| `src/lib/db/adminService.js` | 716 | `updateContactInLockedReport` | `getDoc` | `N/A` | `const data = targetDoc.data();` |
| `src/lib/db/adminService.js` | 721 | `updateContactInLockedReport` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 724 | `updateContactInLockedReport` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });` |
| `src/lib/db/adminService.js` | 730 | `updateContactInLockedReport` | `getDoc` | `N/A` | `if (d.id === targetDoc.id) return;` |
| `src/lib/db/adminService.js` | 747 | `updateContactInLockedReport` | `doc(` | `lockedMonthlyReports` | `const chosenRef = doc(db, "lockedMonthlyReports", chosenDoc.id);` |
| `src/lib/db/adminService.js` | 748 | `updateContactInLockedReport` | `updateDoc` | `N/A` | `await updateDoc(chosenRef, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 751 | `updateContactInLockedReport` | `doc(` | `lockedMonthlyReports` | `const ref = doc(db, "lockedMonthlyReports", newPartId);` |
| `src/lib/db/adminService.js` | 752 | `updateContactInLockedReport` | `setDoc` | `N/A` | `await setDoc(ref, {` |
| `src/lib/db/adminService.js` | 787 | `updateContactInLockedReport` | `doc(` | `lockedMonthlyReports` | `const ref = doc(db, "lockedMonthlyReports", chosenDoc.id);` |
| `src/lib/db/adminService.js` | 788 | `updateContactInLockedReport` | `updateDoc` | `N/A` | `await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });` |
| `src/lib/db/adminService.js` | 791 | `updateContactInLockedReport` | `doc(` | `lockedMonthlyReports` | `const ref = doc(db, "lockedMonthlyReports", newPartId);` |
| `src/lib/db/adminService.js` | 792 | `updateContactInLockedReport` | `setDoc` | `N/A` | `await setDoc(ref, {` |
| `src/lib/db/adminService.js` | 817 | `updateCacheContacts` | `getDoc` | `contacts` | `const fetchPromises = missingIds.map(id => getDoc(doc(db, "contacts", id)));` |
| `src/lib/db/adminService.js` | 817 | `updateCacheContacts` | `doc(` | `contacts` | `const fetchPromises = missingIds.map(id => getDoc(doc(db, "contacts", id)));` |
| `src/lib/db/adminService.js` | 878 | `updateCacheContacts` | `doc(` | `N/A` | `console.log("%c⚡ [FIRESTORE WRITE - Partition Cache]", "background: #701a75; color: #f0abfc; font-weight: bold; padding: 2px 6px; border-radius: 4px;", `Syncing ${contactIds.length} contact(s) to "callCenterCache" partition doc(s) for month(s): ${Object.keys(monthlyUpdatesMap).join(", ")}`);` |
| `src/lib/db/adminService.js` | 914 | `verifyCallCenterCache` | `getDoc` | `contacts` | `const liveSnap = await getDocs(collection(db, "contacts"));` |
| `src/lib/db/adminService.js` | 914 | `verifyCallCenterCache` | `getDocs` | `contacts` | `const liveSnap = await getDocs(collection(db, "contacts"));` |
| `src/lib/db/adminService.js` | 914 | `verifyCallCenterCache` | `collection(` | `contacts` | `const liveSnap = await getDocs(collection(db, "contacts"));` |
| `src/lib/db/adminService.js` | 966 | `addIfValidMonth` | `collection(` | `callCenterCache` | `const cacheColl = collection(db, "callCenterCache");` |
| `src/lib/db/adminService.js` | 967 | `addIfValidMonth` | `getDoc` | `N/A` | `const cacheSnap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 967 | `addIfValidMonth` | `getDocs` | `N/A` | `const cacheSnap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 1233 | `getTimeMs` | `query(` | `N/A` | `const lockedQuery = query(` |
| `src/lib/db/adminService.js` | 1234 | `getTimeMs` | `collection(` | `lockedMonthlyReports` | `collection(db, "lockedMonthlyReports"),` |
| `src/lib/db/adminService.js` | 1235 | `getTimeMs` | `where(` | `N/A` | `where(documentId(), ">=", queryStartMonth),` |
| `src/lib/db/adminService.js` | 1236 | `getTimeMs` | `where(` | `N/A` | `where(documentId(), "<=", endMonth + "\uf8ff")` |
| `src/lib/db/adminService.js` | 1238 | `getTimeMs` | `getDoc` | `N/A` | `console.log(`[ADMIN FIRESTORE READ - getDocs] subscribeToAllCallLogs checking lockedMonthlyReports \| range: ${queryStartMonth} to ${endMonth}`);` |
| `src/lib/db/adminService.js` | 1238 | `getTimeMs` | `getDocs` | `N/A` | `console.log(`[ADMIN FIRESTORE READ - getDocs] subscribeToAllCallLogs checking lockedMonthlyReports \| range: ${queryStartMonth} to ${endMonth}`);` |
| `src/lib/db/adminService.js` | 1239 | `getTimeMs` | `getDoc` | `N/A` | `getDocs(lockedQuery).then(snap => {` |
| `src/lib/db/adminService.js` | 1239 | `getTimeMs` | `getDocs` | `N/A` | `getDocs(lockedQuery).then(snap => {` |
| `src/lib/db/adminService.js` | 1240 | `getTimeMs` | `getDoc` | `N/A` | `console.log(`[ADMIN FIRESTORE READ - getDocs] lockedMonthlyReports completed \| docsCount: ${snap.docs.length}`);` |
| `src/lib/db/adminService.js` | 1240 | `getTimeMs` | `getDocs` | `N/A` | `console.log(`[ADMIN FIRESTORE READ - getDocs] lockedMonthlyReports completed \| docsCount: ${snap.docs.length}`);` |
| `src/lib/db/adminService.js` | 1254 | `getTimeMs` | `query(` | `N/A` | `const cacheQuery = query(` |
| `src/lib/db/adminService.js` | 1255 | `getTimeMs` | `collection(` | `callCenterCache` | `collection(db, "callCenterCache"),` |
| `src/lib/db/adminService.js` | 1256 | `getTimeMs` | `where(` | `N/A` | `where(documentId(), ">=", queryStartMonth),` |
| `src/lib/db/adminService.js` | 1257 | `getTimeMs` | `where(` | `N/A` | `where(documentId(), "<=", endMonth + "\uf8ff")` |
| `src/lib/db/adminService.js` | 1267 | `getTimeMs` | `onSnapshot` | `N/A` | `const unsubCache = onSnapshot(cacheQuery, async (snap) => {` |
| `src/lib/db/adminService.js` | 1287 | `getTimeMs` | `onSnapshot` | `N/A` | `operation: "onSnapshot",` |
| `src/lib/db/adminService.js` | 1338 | `runAutoLockAndPurgeCheck` | `collection(` | `callCenterCache` | `const cacheColl = collection(db, "callCenterCache");` |
| `src/lib/db/adminService.js` | 1339 | `runAutoLockAndPurgeCheck` | `getDoc` | `N/A` | `const snap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 1339 | `runAutoLockAndPurgeCheck` | `getDocs` | `N/A` | `const snap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 1349 | `runAutoLockAndPurgeCheck` | `getDoc` | `lockedMonthlyReports` | `const lockedSnap = await getDocs(collection(db, "lockedMonthlyReports"));` |
| `src/lib/db/adminService.js` | 1349 | `runAutoLockAndPurgeCheck` | `getDocs` | `lockedMonthlyReports` | `const lockedSnap = await getDocs(collection(db, "lockedMonthlyReports"));` |
| `src/lib/db/adminService.js` | 1349 | `runAutoLockAndPurgeCheck` | `collection(` | `lockedMonthlyReports` | `const lockedSnap = await getDocs(collection(db, "lockedMonthlyReports"));` |
| `src/lib/db/adminService.js` | 1388 | `registerRegistrationMonth` | `setDoc` | `registrationMonths` | `await setDoc(doc(db, "registrationMonths", clean), {` |
| `src/lib/db/adminService.js` | 1388 | `registerRegistrationMonth` | `doc(` | `registrationMonths` | `await setDoc(doc(db, "registrationMonths", clean), {` |
| `src/lib/db/adminService.js` | 1401 | `getRegistrationMonths` | `collection(` | `registrationMonths` | `const q = query(collection(db, "registrationMonths"));` |
| `src/lib/db/adminService.js` | 1401 | `getRegistrationMonths` | `query(` | `registrationMonths` | `const q = query(collection(db, "registrationMonths"));` |
| `src/lib/db/adminService.js` | 1402 | `getRegistrationMonths` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/adminService.js` | 1402 | `getRegistrationMonths` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/adminService.js` | 1410 | `getRegistrationMonths` | `collection(` | `registrations` | `const regQ = query(collection(db, "registrations"));` |
| `src/lib/db/adminService.js` | 1410 | `getRegistrationMonths` | `query(` | `registrations` | `const regQ = query(collection(db, "registrations"));` |
| `src/lib/db/adminService.js` | 1411 | `getRegistrationMonths` | `getDoc` | `N/A` | `const regSnap = await getDocs(regQ);` |
| `src/lib/db/adminService.js` | 1411 | `getRegistrationMonths` | `getDocs` | `N/A` | `const regSnap = await getDocs(regQ);` |
| `src/lib/db/adminService.js` | 1422 | `getRegistrationMonths` | `setDoc` | `registrationMonths` | `setDoc(doc(db, "registrationMonths", m), {` |
| `src/lib/db/adminService.js` | 1422 | `getRegistrationMonths` | `doc(` | `registrationMonths` | `setDoc(doc(db, "registrationMonths", m), {` |
| `src/lib/db/adminService.js` | 1517 | `updateRegistrationInActiveCache` | `doc(` | `registrationsCache` | `const docRef = doc(db, "registrationsCache", monthStr);` |
| `src/lib/db/adminService.js` | 1518 | `updateRegistrationInActiveCache` | `getDoc` | `N/A` | `const snap = await getDoc(docRef);` |
| `src/lib/db/adminService.js` | 1529 | `updateRegistrationInActiveCache` | `setDoc` | `N/A` | `await setDoc(docRef, {` |
| `src/lib/db/adminService.js` | 1542 | `rebuildRegistrationsCache` | `getDoc` | `registrations` | `const snap = await getDocs(collection(db, "registrations"));` |
| `src/lib/db/adminService.js` | 1542 | `rebuildRegistrationsCache` | `getDocs` | `registrations` | `const snap = await getDocs(collection(db, "registrations"));` |
| `src/lib/db/adminService.js` | 1542 | `rebuildRegistrationsCache` | `collection(` | `registrations` | `const snap = await getDocs(collection(db, "registrations"));` |
| `src/lib/db/adminService.js` | 1583 | `rebuildRegistrationsCache` | `setDoc` | `registrationsCache` | `await setDoc(doc(db, "registrationsCache", part.docId), part.payload);` |
| `src/lib/db/adminService.js` | 1583 | `rebuildRegistrationsCache` | `doc(` | `registrationsCache` | `await setDoc(doc(db, "registrationsCache", part.docId), part.payload);` |
| `src/lib/db/adminService.js` | 1598 | `verifyRegistrationsCache` | `getDoc` | `registrations` | `getDocs(collection(db, "registrations")),` |
| `src/lib/db/adminService.js` | 1598 | `verifyRegistrationsCache` | `getDocs` | `registrations` | `getDocs(collection(db, "registrations")),` |
| `src/lib/db/adminService.js` | 1598 | `verifyRegistrationsCache` | `collection(` | `registrations` | `getDocs(collection(db, "registrations")),` |
| `src/lib/db/adminService.js` | 1599 | `verifyRegistrationsCache` | `getDoc` | `registrationsCache` | `getDocs(collection(db, "registrationsCache"))` |
| `src/lib/db/adminService.js` | 1599 | `verifyRegistrationsCache` | `getDocs` | `registrationsCache` | `getDocs(collection(db, "registrationsCache"))` |
| `src/lib/db/adminService.js` | 1599 | `verifyRegistrationsCache` | `collection(` | `registrationsCache` | `getDocs(collection(db, "registrationsCache"))` |
| `src/lib/db/adminService.js` | 1629 | `getRegistrationsCachePartitionsDetail` | `getDoc` | `registrationsCache` | `const snap = await getDocs(collection(db, "registrationsCache"));` |
| `src/lib/db/adminService.js` | 1629 | `getRegistrationsCachePartitionsDetail` | `getDocs` | `registrationsCache` | `const snap = await getDocs(collection(db, "registrationsCache"));` |
| `src/lib/db/adminService.js` | 1629 | `getRegistrationsCachePartitionsDetail` | `collection(` | `registrationsCache` | `const snap = await getDocs(collection(db, "registrationsCache"));` |
| `src/lib/db/adminService.js` | 1693 | `subscribeToRegistrations` | `query(` | `N/A` | `const cacheQuery = query(` |
| `src/lib/db/adminService.js` | 1694 | `subscribeToRegistrations` | `collection(` | `registrationsCache` | `collection(db, "registrationsCache"),` |
| `src/lib/db/adminService.js` | 1695 | `subscribeToRegistrations` | `where(` | `N/A` | `where(documentId(), ">=", startMonth),` |
| `src/lib/db/adminService.js` | 1696 | `subscribeToRegistrations` | `where(` | `N/A` | `where(documentId(), "<=", endMonth + "\uf8ff")` |
| `src/lib/db/adminService.js` | 1700 | `subscribeToRegistrations` | `getDoc` | `N/A` | `const snap = await getDocs(cacheQuery);` |
| `src/lib/db/adminService.js` | 1700 | `subscribeToRegistrations` | `getDocs` | `N/A` | `const snap = await getDocs(cacheQuery);` |
| `src/lib/db/adminService.js` | 1711 | `subscribeToRegistrations` | `getDoc` | `N/A` | `operation: "getDocs",` |
| `src/lib/db/adminService.js` | 1711 | `subscribeToRegistrations` | `getDocs` | `N/A` | `operation: "getDocs",` |
| `src/lib/db/adminService.js` | 1763 | `refreshRegistrations` | `query(` | `N/A` | `const cacheQuery = query(` |
| `src/lib/db/adminService.js` | 1764 | `refreshRegistrations` | `collection(` | `registrationsCache` | `collection(db, "registrationsCache"),` |
| `src/lib/db/adminService.js` | 1765 | `refreshRegistrations` | `where(` | `N/A` | `where(documentId(), ">=", startMonth),` |
| `src/lib/db/adminService.js` | 1766 | `refreshRegistrations` | `where(` | `N/A` | `where(documentId(), "<=", endMonth + "\uf8ff")` |
| `src/lib/db/adminService.js` | 1769 | `refreshRegistrations` | `getDoc` | `N/A` | `const snap = await getDocs(cacheQuery);` |
| `src/lib/db/adminService.js` | 1769 | `refreshRegistrations` | `getDocs` | `N/A` | `const snap = await getDocs(cacheQuery);` |
| `src/lib/db/adminService.js` | 1773 | `refreshRegistrations` | `query(` | `N/A` | `const fallbackQ = query(` |
| `src/lib/db/adminService.js` | 1774 | `refreshRegistrations` | `collection(` | `registrations` | `collection(db, "registrations"),` |
| `src/lib/db/adminService.js` | 1775 | `refreshRegistrations` | `where(` | `N/A` | `where("registeredYearMonth", ">=", startMonth),` |
| `src/lib/db/adminService.js` | 1776 | `refreshRegistrations` | `where(` | `N/A` | `where("registeredYearMonth", "<=", endMonth)` |
| `src/lib/db/adminService.js` | 1778 | `refreshRegistrations` | `getDoc` | `N/A` | `const liveSnap = await getDocs(fallbackQ);` |
| `src/lib/db/adminService.js` | 1778 | `refreshRegistrations` | `getDocs` | `N/A` | `const liveSnap = await getDocs(fallbackQ);` |
| `src/lib/db/adminService.js` | 1845 | `getSettingsOptions` | `doc(` | `settings` | `const docRef = doc(db, "settings", "call_center_options");` |
| `src/lib/db/adminService.js` | 1846 | `getSettingsOptions` | `getDoc` | `N/A` | `const snap = await getDoc(docRef);` |
| `src/lib/db/adminService.js` | 1870 | `getSettingsOptions` | `setDoc` | `N/A` | `await setDoc(docRef, defaults, { merge: true });` |
| `src/lib/db/adminService.js` | 1876 | `updateCallCenterOptions` | `doc(` | `settings` | `const docRef = doc(db, "settings", "call_center_options");` |
| `src/lib/db/adminService.js` | 1877 | `updateCallCenterOptions` | `setDoc` | `N/A` | `await setDoc(docRef, updates, { merge: true });` |
| `src/lib/db/adminService.js` | 1940 | `getActiveCacheMonths` | `collection(` | `callCenterCache` | `const cacheColl = collection(db, "callCenterCache");` |
| `src/lib/db/adminService.js` | 1941 | `getActiveCacheMonths` | `getDoc` | `N/A` | `const snap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 1941 | `getActiveCacheMonths` | `getDocs` | `N/A` | `const snap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 1955 | `getLockedMonthlyReports` | `collection(` | `lockedMonthlyReports` | `const lockedColl = collection(db, "lockedMonthlyReports");` |
| `src/lib/db/adminService.js` | 1956 | `getLockedMonthlyReports` | `getDoc` | `N/A` | `const snap = await getDocs(lockedColl);` |
| `src/lib/db/adminService.js` | 1956 | `getLockedMonthlyReports` | `getDocs` | `N/A` | `const snap = await getDocs(lockedColl);` |
| `src/lib/db/adminService.js` | 1990 | `lockAndPurgeMonthlyReport` | `collection(` | `callCenterCache` | `const cacheColl = collection(db, "callCenterCache");` |
| `src/lib/db/adminService.js` | 1991 | `lockAndPurgeMonthlyReport` | `getDoc` | `N/A` | `const cacheSnap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 1991 | `lockAndPurgeMonthlyReport` | `getDocs` | `N/A` | `const cacheSnap = await getDocs(cacheColl);` |
| `src/lib/db/adminService.js` | 1999 | `lockAndPurgeMonthlyReport` | `collection(` | `lockedMonthlyReports` | `const lockedColl = collection(db, "lockedMonthlyReports");` |
| `src/lib/db/adminService.js` | 2000 | `lockAndPurgeMonthlyReport` | `query(` | `N/A` | `const q = query(lockedColl, where("month", "==", monthStr));` |
| `src/lib/db/adminService.js` | 2000 | `lockAndPurgeMonthlyReport` | `where(` | `N/A` | `const q = query(lockedColl, where("month", "==", monthStr));` |
| `src/lib/db/adminService.js` | 2001 | `lockAndPurgeMonthlyReport` | `getDoc` | `N/A` | `const existingPartsSnap = await getDocs(q);` |
| `src/lib/db/adminService.js` | 2001 | `lockAndPurgeMonthlyReport` | `getDocs` | `N/A` | `const existingPartsSnap = await getDocs(q);` |
| `src/lib/db/adminService.js` | 2021 | `lockAndPurgeMonthlyReport` | `runTransaction` | `N/A` | `activeContacts = await runTransaction(db, async (transaction) => {` |
| `src/lib/db/adminService.js` | 2070 | `lockAndPurgeMonthlyReport` | `doc(` | `lockedMonthlyReports` | `const partRef = doc(db, "lockedMonthlyReports", partId);` |
| `src/lib/db/adminService.js` | 2088 | `lockAndPurgeMonthlyReport` | `doc(` | `lockedMonthlyReports` | `const partRef = doc(db, "lockedMonthlyReports", partId);` |
| `src/lib/db/adminService.js` | 2097 | `lockAndPurgeMonthlyReport` | `doc(` | `lockedMonthlyReports` | `const partRef = doc(db, "lockedMonthlyReports", `${monthStr}_part1`);` |
| `src/lib/db/adminService.js` | 2128 | `lockAndPurgeMonthlyReport` | `writeBatch` | `N/A` | `const batch = writeBatch(db);` |
| `src/lib/db/adminService.js` | 2131 | `lockAndPurgeMonthlyReport` | `doc(` | `contacts` | `const cRef = doc(db, "contacts", id);` |
| `src/lib/db/adminService.js` | 2132 | `lockAndPurgeMonthlyReport` | `getDoc` | `N/A` | `const snap = await getDoc(cRef);` |
| `src/lib/db/authService.js` | 2 | `Top-Level / Module` | `getDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp` |
| `src/lib/db/authService.js` | 2 | `Top-Level / Module` | `getDocs` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp` |
| `src/lib/db/authService.js` | 2 | `Top-Level / Module` | `setDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp` |
| `src/lib/db/authService.js` | 2 | `Top-Level / Module` | `addDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp` |
| `src/lib/db/authService.js` | 2 | `Top-Level / Module` | `updateDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp` |
| `src/lib/db/authService.js` | 2 | `Top-Level / Module` | `deleteDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp` |
| `src/lib/db/authService.js` | 37 | `getAttenders` | `getDoc` | `attenders` | `const snap = await getDocs(collection(db, "attenders"));` |
| `src/lib/db/authService.js` | 37 | `getAttenders` | `getDocs` | `attenders` | `const snap = await getDocs(collection(db, "attenders"));` |
| `src/lib/db/authService.js` | 37 | `getAttenders` | `collection(` | `attenders` | `const snap = await getDocs(collection(db, "attenders"));` |
| `src/lib/db/authService.js` | 45 | `getAttenders` | `updateDoc` | `attenders` | `updateDoc(doc(db, "attenders", a.id), { password: generated }).catch(() => {});` |
| `src/lib/db/authService.js` | 45 | `getAttenders` | `doc(` | `attenders` | `updateDoc(doc(db, "attenders", a.id), { password: generated }).catch(() => {});` |
| `src/lib/db/authService.js` | 58 | `createAttender` | `addDoc` | `attenders` | `const ref = await addDoc(collection(db, "attenders"), {` |
| `src/lib/db/authService.js` | 58 | `createAttender` | `collection(` | `attenders` | `const ref = await addDoc(collection(db, "attenders"), {` |
| `src/lib/db/authService.js` | 70 | `updateAttender` | `updateDoc` | `attenders` | `await updateDoc(doc(db, "attenders", id), payload);` |
| `src/lib/db/authService.js` | 70 | `updateAttender` | `doc(` | `attenders` | `await updateDoc(doc(db, "attenders", id), payload);` |
| `src/lib/db/authService.js` | 75 | `deleteAttender` | `deleteDoc` | `attenders` | `await deleteDoc(doc(db, "attenders", id));` |
| `src/lib/db/authService.js` | 75 | `deleteAttender` | `doc(` | `attenders` | `await deleteDoc(doc(db, "attenders", id));` |
| `src/lib/db/authService.js` | 80 | `getAdminPassword` | `doc(` | `settings` | `const adminDocRef = doc(db, "settings", "admin_auth");` |
| `src/lib/db/authService.js` | 81 | `getAdminPassword` | `getDoc` | `N/A` | `const snap = await getDoc(adminDocRef);` |
| `src/lib/db/authService.js` | 86 | `getAdminPassword` | `setDoc` | `N/A` | `await setDoc(adminDocRef, { password: defaultPassword, updatedAt: serverTimestamp() }, { merge: true });` |
| `src/lib/db/authService.js` | 95 | `setAdminPassword` | `doc(` | `settings` | `const adminDocRef = doc(db, "settings", "admin_auth");` |
| `src/lib/db/authService.js` | 96 | `setAdminPassword` | `setDoc` | `N/A` | `await setDoc(adminDocRef, { password: newPassword, updatedAt: serverTimestamp() }, { merge: true });` |
| `src/lib/db/cacheService.js` | 2 | `Top-Level / Module` | `getDoc` | `N/A` | `collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where, runTransaction, documentId` |
| `src/lib/db/cacheService.js` | 2 | `Top-Level / Module` | `getDocs` | `N/A` | `collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where, runTransaction, documentId` |
| `src/lib/db/cacheService.js` | 2 | `Top-Level / Module` | `setDoc` | `N/A` | `collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where, runTransaction, documentId` |
| `src/lib/db/cacheService.js` | 2 | `Top-Level / Module` | `updateDoc` | `N/A` | `collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where, runTransaction, documentId` |
| `src/lib/db/cacheService.js` | 2 | `Top-Level / Module` | `deleteDoc` | `N/A` | `collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where, runTransaction, documentId` |
| `src/lib/db/cacheService.js` | 2 | `Top-Level / Module` | `runTransaction` | `N/A` | `collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where, runTransaction, documentId` |
| `src/lib/db/cacheService.js` | 145 | `fetchPartitionCacheForColdBoot` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/cacheService.js` | 146 | `fetchPartitionCacheForColdBoot` | `collection(` | `callCenterCache` | `collection(db, "callCenterCache"),` |
| `src/lib/db/cacheService.js` | 147 | `fetchPartitionCacheForColdBoot` | `where(` | `N/A` | `where(documentId(), ">=", monthKey),` |
| `src/lib/db/cacheService.js` | 148 | `fetchPartitionCacheForColdBoot` | `where(` | `N/A` | `where(documentId(), "<=", monthKey + "\uf8ff")` |
| `src/lib/db/cacheService.js` | 150 | `fetchPartitionCacheForColdBoot` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/cacheService.js` | 150 | `fetchPartitionCacheForColdBoot` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 2 | `Top-Level / Module` | `getDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/contactService.js` | 2 | `Top-Level / Module` | `getDocs` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/contactService.js` | 2 | `Top-Level / Module` | `setDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/contactService.js` | 2 | `Top-Level / Module` | `addDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/contactService.js` | 3 | `Top-Level / Module` | `updateDoc` | `N/A` | `updateDoc, deleteDoc, query, where,` |
| `src/lib/db/contactService.js` | 3 | `Top-Level / Module` | `deleteDoc` | `N/A` | `updateDoc, deleteDoc, query, where,` |
| `src/lib/db/contactService.js` | 4 | `Top-Level / Module` | `onSnapshot` | `N/A` | `serverTimestamp, writeBatch, onSnapshot,` |
| `src/lib/db/contactService.js` | 4 | `Top-Level / Module` | `writeBatch` | `N/A` | `serverTimestamp, writeBatch, onSnapshot,` |
| `src/lib/db/contactService.js` | 6 | `Top-Level / Module` | `runTransaction` | `N/A` | `deleteField, documentId, runTransaction` |
| `src/lib/db/contactService.js` | 42 | `remapProgramContacts` | `getDoc` | `N/A` | `const snap = await getDocs(` |
| `src/lib/db/contactService.js` | 42 | `remapProgramContacts` | `getDocs` | `N/A` | `const snap = await getDocs(` |
| `src/lib/db/contactService.js` | 43 | `remapProgramContacts` | `collection(` | `contacts` | `query(collection(db, "contacts"), where("programId", "==", programId))` |
| `src/lib/db/contactService.js` | 43 | `remapProgramContacts` | `query(` | `contacts` | `query(collection(db, "contacts"), where("programId", "==", programId))` |
| `src/lib/db/contactService.js` | 43 | `remapProgramContacts` | `where(` | `contacts` | `query(collection(db, "contacts"), where("programId", "==", programId))` |
| `src/lib/db/contactService.js` | 165 | `remapProgramContacts` | `writeBatch` | `N/A` | `const batch = writeBatch(db);` |
| `src/lib/db/contactService.js` | 367 | `importContacts` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 368 | `importContacts` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 369 | `importContacts` | `where(` | `N/A` | `where("GHL_ID", "in", ghlBatch)` |
| `src/lib/db/contactService.js` | 371 | `importContacts` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 371 | `importContacts` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 389 | `importContacts` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 390 | `importContacts` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 391 | `importContacts` | `where(` | `N/A` | `where("normalizedPhones", "array-contains-any", phoneBatch)` |
| `src/lib/db/contactService.js` | 394 | `importContacts` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 394 | `importContacts` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 507 | `importContacts` | `collection(` | `contacts` | `const contactRef = doc(collection(db, "contacts"));` |
| `src/lib/db/contactService.js` | 507 | `importContacts` | `doc(` | `contacts` | `const contactRef = doc(collection(db, "contacts"));` |
| `src/lib/db/contactService.js` | 543 | `importContacts` | `writeBatch` | `N/A` | `const batch = writeBatch(db);` |
| `src/lib/db/contactService.js` | 556 | `importContacts` | `doc(` | `programs` | `const progRef = doc(db, "programs", tag);` |
| `src/lib/db/contactService.js` | 558 | `importContacts` | `getDoc` | `N/A` | `const progSnap = await getDoc(progRef);` |
| `src/lib/db/contactService.js` | 565 | `importContacts` | `setDoc` | `N/A` | `await setDoc(progRef, updateData, { merge: true });` |
| `src/lib/db/contactService.js` | 578 | `getProgramContactStats` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 579 | `getProgramContactStats` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 580 | `getProgramContactStats` | `where(` | `N/A` | `where("tags", "array-contains", tag)` |
| `src/lib/db/contactService.js` | 582 | `getProgramContactStats` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 582 | `getProgramContactStats` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 648 | `checkGlobalDuplicate` | `getDoc` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm))));` |
| `src/lib/db/contactService.js` | 648 | `checkGlobalDuplicate` | `getDocs` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm))));` |
| `src/lib/db/contactService.js` | 648 | `checkGlobalDuplicate` | `collection(` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm))));` |
| `src/lib/db/contactService.js` | 648 | `checkGlobalDuplicate` | `query(` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm))));` |
| `src/lib/db/contactService.js` | 648 | `checkGlobalDuplicate` | `where(` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm))));` |
| `src/lib/db/contactService.js` | 649 | `checkGlobalDuplicate` | `getDoc` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhone", "==", norm))));` |
| `src/lib/db/contactService.js` | 649 | `checkGlobalDuplicate` | `getDocs` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhone", "==", norm))));` |
| `src/lib/db/contactService.js` | 649 | `checkGlobalDuplicate` | `collection(` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhone", "==", norm))));` |
| `src/lib/db/contactService.js` | 649 | `checkGlobalDuplicate` | `query(` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhone", "==", norm))));` |
| `src/lib/db/contactService.js` | 649 | `checkGlobalDuplicate` | `where(` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhone", "==", norm))));` |
| `src/lib/db/contactService.js` | 650 | `checkGlobalDuplicate` | `getDoc` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedMobile", "==", norm))));` |
| `src/lib/db/contactService.js` | 650 | `checkGlobalDuplicate` | `getDocs` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedMobile", "==", norm))));` |
| `src/lib/db/contactService.js` | 650 | `checkGlobalDuplicate` | `collection(` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedMobile", "==", norm))));` |
| `src/lib/db/contactService.js` | 650 | `checkGlobalDuplicate` | `query(` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedMobile", "==", norm))));` |
| `src/lib/db/contactService.js` | 650 | `checkGlobalDuplicate` | `where(` | `contacts` | `promises.push(getDocs(query(collection(db, "contacts"), where("normalizedMobile", "==", norm))));` |
| `src/lib/db/contactService.js` | 703 | `getAttenderContactCount` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 704 | `getAttenderContactCount` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 706 | `getAttenderContactCount` | `where(` | `N/A` | `where("isAssigned", "==", true),` |
| `src/lib/db/contactService.js` | 708 | `getAttenderContactCount` | `where(` | `N/A` | `where("assignedTo", "==", attenderId),` |
| `src/lib/db/contactService.js` | 709 | `getAttenderContactCount` | `where(` | `N/A` | `where("assignedTo", "array-contains", attenderId)` |
| `src/lib/db/contactService.js` | 713 | `getAttenderContactCount` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 713 | `getAttenderContactCount` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 731 | `assignContactsToAttender` | `query(` | `N/A` | `q = query(` |
| `src/lib/db/contactService.js` | 732 | `assignContactsToAttender` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 733 | `assignContactsToAttender` | `where(` | `N/A` | `where("tags", "array-contains", tag),` |
| `src/lib/db/contactService.js` | 734 | `assignContactsToAttender` | `where(` | `N/A` | `where("isAssigned", "==", false),` |
| `src/lib/db/contactService.js` | 739 | `assignContactsToAttender` | `query(` | `N/A` | `q = query(` |
| `src/lib/db/contactService.js` | 740 | `assignContactsToAttender` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 741 | `assignContactsToAttender` | `where(` | `N/A` | `where("tags", "array-contains", tag),` |
| `src/lib/db/contactService.js` | 742 | `assignContactsToAttender` | `where(` | `N/A` | `where("isAssigned", "==", false),` |
| `src/lib/db/contactService.js` | 747 | `assignContactsToAttender` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 747 | `assignContactsToAttender` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 780 | `assignContactsToAttender` | `runTransaction` | `N/A` | `const txResult = await runTransaction(db, async (transaction) => {` |
| `src/lib/db/contactService.js` | 841 | `assignContactsToAttender` | `getDoc` | `N/A` | `// In-memory registry of active partition snapshots to eliminate getDocs reads during updates` |
| `src/lib/db/contactService.js` | 841 | `assignContactsToAttender` | `getDocs` | `N/A` | `// In-memory registry of active partition snapshots to eliminate getDocs reads during updates` |
| `src/lib/db/contactService.js` | 846 | `updateCallLogDirectFirebase` | `doc(` | `contacts` | `const contactRef = doc(db, "contacts", logId);` |
| `src/lib/db/contactService.js` | 856 | `updateCallLogDirectFirebase` | `getDoc` | `N/A` | ``Bypassed getDoc using existingContact for "${logData.Name \|\| logId}" (${logId}) \| 0 Firestore Reads`` |
| `src/lib/db/contactService.js` | 860 | `updateCallLogDirectFirebase` | `getDoc` | `N/A` | `const logSnap = await getDoc(contactRef);` |
| `src/lib/db/contactService.js` | 862 | `updateCallLogDirectFirebase` | `getDoc` | `N/A` | ``[FIRESTORE READ]\ncollection: contacts\noperation: getDoc\ndocument: ${logId}\ndocuments_returned: ${logSnap.exists() ? 1 : 0}\nestimated_read_cost: 1\nreason: updateCallLogDirectFirebase`` |
| `src/lib/db/contactService.js` | 1044 | `updateCallLogDirectFirebase` | `updateDoc` | `N/A` | `// This is because updateDoc/batch.update parses keys as paths (crashing on special chars like '/' in custom headers),` |
| `src/lib/db/contactService.js` | 1045 | `updateCallLogDirectFirebase` | `setDoc` | `N/A` | `// whereas setDoc/batch.set with merge: true does not parse keys (but fails to parse dot-notation nested maps).` |
| `src/lib/db/contactService.js` | 1071 | `updateCallLogDirectFirebase` | `writeBatch` | `N/A` | `// Execute atomically using a writeBatch to update contacts, callCenterCache, and registrationsCache together` |
| `src/lib/db/contactService.js` | 1076 | `updateCallLogDirectFirebase` | `writeBatch` | `N/A` | `const batch = writeBatch(db);` |
| `src/lib/db/contactService.js` | 1089 | `updateCallLogDirectFirebase` | `doc(` | `callCenterCache` | `const cacheRef = doc(db, "callCenterCache", currentMonth);` |
| `src/lib/db/contactService.js` | 1102 | `updateCallLogDirectFirebase` | `doc(` | `registrations` | `const regRef = doc(db, "registrations", registrationId);` |
| `src/lib/db/contactService.js` | 1103 | `updateCallLogDirectFirebase` | `doc(` | `registrationsCache` | `const regCacheRef = doc(db, "registrationsCache", currentMonth);` |
| `src/lib/db/contactService.js` | 1168 | `updateCallLogDirectFirebase` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 1169 | `updateCallLogDirectFirebase` | `collection(` | `registrations` | `collection(db, "registrations"),` |
| `src/lib/db/contactService.js` | 1170 | `updateCallLogDirectFirebase` | `where(` | `N/A` | `where(documentId(), ">=", logId),` |
| `src/lib/db/contactService.js` | 1171 | `updateCallLogDirectFirebase` | `where(` | `N/A` | `where(documentId(), "<=", logId + "\uf8ff")` |
| `src/lib/db/contactService.js` | 1173 | `updateCallLogDirectFirebase` | `getDoc` | `N/A` | `const existingRegsSnap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 1173 | `updateCallLogDirectFirebase` | `getDocs` | `N/A` | `const existingRegsSnap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 1175 | `updateCallLogDirectFirebase` | `deleteDoc` | `N/A` | `await deleteDoc(regDoc.ref);` |
| `src/lib/db/contactService.js` | 1239 | `updateCallLogDirectFirebase` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 1240 | `updateCallLogDirectFirebase` | `collection(` | `registrations` | `collection(db, "registrations"),` |
| `src/lib/db/contactService.js` | 1241 | `updateCallLogDirectFirebase` | `where(` | `N/A` | `where(documentId(), ">=", logId),` |
| `src/lib/db/contactService.js` | 1242 | `updateCallLogDirectFirebase` | `where(` | `N/A` | `where(documentId(), "<=", logId + "\uf8ff")` |
| `src/lib/db/contactService.js` | 1244 | `updateCallLogDirectFirebase` | `getDoc` | `N/A` | `const existingRegsSnap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 1244 | `updateCallLogDirectFirebase` | `getDocs` | `N/A` | `const existingRegsSnap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 1279 | `updateCallLogDirectFirebase` | `setDoc` | `registrations` | `await setDoc(doc(db, "registrations", registrationId), cleanPayload, { merge: true });` |
| `src/lib/db/contactService.js` | 1279 | `updateCallLogDirectFirebase` | `doc(` | `registrations` | `await setDoc(doc(db, "registrations", registrationId), cleanPayload, { merge: true });` |
| `src/lib/db/contactService.js` | 1281 | `updateCallLogDirectFirebase` | `setDoc` | `N/A` | `operation: "setDoc",` |
| `src/lib/db/contactService.js` | 1294 | `updateCallLogDirectFirebase` | `deleteDoc` | `N/A` | `await deleteDoc(ref);` |
| `src/lib/db/contactService.js` | 1296 | `updateCallLogDirectFirebase` | `deleteDoc` | `N/A` | `operation: "deleteDoc",` |
| `src/lib/db/contactService.js` | 1341 | `removeAttenderFromContact` | `doc(` | `contacts` | `const contactRef = doc(db, "contacts", contactId);` |
| `src/lib/db/contactService.js` | 1342 | `removeAttenderFromContact` | `getDoc` | `N/A` | `const snap = await getDoc(contactRef);` |
| `src/lib/db/contactService.js` | 1371 | `removeAttenderFromContact` | `updateDoc` | `N/A` | `await updateDoc(contactRef, {` |
| `src/lib/db/contactService.js` | 1422 | `addIncomingCallLogDirectFirebase` | `collection(` | `contacts` | `const q3 = query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", finalNormalizedPhones));` |
| `src/lib/db/contactService.js` | 1422 | `addIncomingCallLogDirectFirebase` | `query(` | `contacts` | `const q3 = query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", finalNormalizedPhones));` |
| `src/lib/db/contactService.js` | 1422 | `addIncomingCallLogDirectFirebase` | `where(` | `contacts` | `const q3 = query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", finalNormalizedPhones));` |
| `src/lib/db/contactService.js` | 1424 | `addIncomingCallLogDirectFirebase` | `getDoc` | `N/A` | `const snap3 = await Promise.race([getDocs(q3), timeoutLookup]);` |
| `src/lib/db/contactService.js` | 1424 | `addIncomingCallLogDirectFirebase` | `getDocs` | `N/A` | `const snap3 = await Promise.race([getDocs(q3), timeoutLookup]);` |
| `src/lib/db/contactService.js` | 1589 | `addIncomingCallLogDirectFirebase` | `writeBatch` | `N/A` | `const batch = writeBatch(db);` |
| `src/lib/db/contactService.js` | 1595 | `addIncomingCallLogDirectFirebase` | `doc(` | `contacts` | `const contactRef = doc(db, "contacts", existingDocId);` |
| `src/lib/db/contactService.js` | 1606 | `addIncomingCallLogDirectFirebase` | `collection(` | `contacts` | `const newDocRef = doc(collection(db, "contacts"));` |
| `src/lib/db/contactService.js` | 1606 | `addIncomingCallLogDirectFirebase` | `doc(` | `contacts` | `const newDocRef = doc(collection(db, "contacts"));` |
| `src/lib/db/contactService.js` | 1615 | `addIncomingCallLogDirectFirebase` | `doc(` | `callCenterCache` | `const cacheRef = doc(db, "callCenterCache", yearMonth);` |
| `src/lib/db/contactService.js` | 1647 | `addIncomingCallLogDirectFirebase` | `doc(` | `registrations` | `const regRef = doc(db, "registrations", addRegId);` |
| `src/lib/db/contactService.js` | 1648 | `addIncomingCallLogDirectFirebase` | `doc(` | `registrationsCache` | `const regCacheRef = doc(db, "registrationsCache", yearMonth);` |
| `src/lib/db/contactService.js` | 1792 | `globalSearchContacts` | `getDoc` | `N/A` | `getDocs(` |
| `src/lib/db/contactService.js` | 1792 | `globalSearchContacts` | `getDocs` | `N/A` | `getDocs(` |
| `src/lib/db/contactService.js` | 1793 | `globalSearchContacts` | `query(` | `N/A` | `query(` |
| `src/lib/db/contactService.js` | 1794 | `globalSearchContacts` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 1795 | `globalSearchContacts` | `where(` | `N/A` | `where("normalizedPhones", "array-contains", norm)` |
| `src/lib/db/contactService.js` | 1804 | `globalSearchContacts` | `getDoc` | `N/A` | `getDocs(` |
| `src/lib/db/contactService.js` | 1804 | `globalSearchContacts` | `getDocs` | `N/A` | `getDocs(` |
| `src/lib/db/contactService.js` | 1805 | `globalSearchContacts` | `query(` | `N/A` | `query(` |
| `src/lib/db/contactService.js` | 1806 | `globalSearchContacts` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 1807 | `globalSearchContacts` | `where(` | `N/A` | `where("Name", ">=", term),` |
| `src/lib/db/contactService.js` | 1808 | `globalSearchContacts` | `where(` | `N/A` | `where("Name", "<=", term + "\uf8ff"),` |
| `src/lib/db/contactService.js` | 1816 | `globalSearchContacts` | `getDoc` | `N/A` | `getDocs(` |
| `src/lib/db/contactService.js` | 1816 | `globalSearchContacts` | `getDocs` | `N/A` | `getDocs(` |
| `src/lib/db/contactService.js` | 1817 | `globalSearchContacts` | `query(` | `N/A` | `query(` |
| `src/lib/db/contactService.js` | 1818 | `globalSearchContacts` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 1819 | `globalSearchContacts` | `where(` | `N/A` | `where("Name", ">=", capitalized),` |
| `src/lib/db/contactService.js` | 1820 | `globalSearchContacts` | `where(` | `N/A` | `where("Name", "<=", capitalized + "\uf8ff"),` |
| `src/lib/db/contactService.js` | 1831 | `globalSearchContacts` | `getDoc` | `N/A` | `getDocs(` |
| `src/lib/db/contactService.js` | 1831 | `globalSearchContacts` | `getDocs` | `N/A` | `getDocs(` |
| `src/lib/db/contactService.js` | 1832 | `globalSearchContacts` | `query(` | `N/A` | `query(` |
| `src/lib/db/contactService.js` | 1833 | `globalSearchContacts` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 1834 | `globalSearchContacts` | `where(` | `N/A` | `where("Email", ">=", termLower),` |
| `src/lib/db/contactService.js` | 1835 | `globalSearchContacts` | `where(` | `N/A` | `where("Email", "<=", termLower + "\uf8ff"),` |
| `src/lib/db/contactService.js` | 1955 | `fetchHistoricalCachePartition` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 1956 | `fetchHistoricalCachePartition` | `collection(` | `callCenterCache` | `collection(db, "callCenterCache"),` |
| `src/lib/db/contactService.js` | 1957 | `fetchHistoricalCachePartition` | `where(` | `N/A` | `where(documentId(), ">=", monthStr),` |
| `src/lib/db/contactService.js` | 1958 | `fetchHistoricalCachePartition` | `where(` | `N/A` | `where(documentId(), "<=", monthStr + "\uf8ff")` |
| `src/lib/db/contactService.js` | 1960 | `fetchHistoricalCachePartition` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 1960 | `fetchHistoricalCachePartition` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 1961 | `fetchHistoricalCachePartition` | `doc(` | `N/A` | `console.log(`[HISTORICAL FIREBASE READ SUCCESS] Retrieved ${snap.docs.length} partition doc(s) for month: ${monthStr}`);` |
| `src/lib/db/contactService.js` | 2022 | `claimContact` | `doc(` | `contacts` | `const contactRef = doc(db, "contacts", contactId);` |
| `src/lib/db/contactService.js` | 2024 | `claimContact` | `runTransaction` | `N/A` | `await runTransaction(db, async (transaction) => {` |
| `src/lib/db/contactService.js` | 2094 | `claimCRMContact` | `collection(` | `contacts` | `const q3 = query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", finalNormalizedPhones));` |
| `src/lib/db/contactService.js` | 2094 | `claimCRMContact` | `query(` | `contacts` | `const q3 = query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", finalNormalizedPhones));` |
| `src/lib/db/contactService.js` | 2094 | `claimCRMContact` | `where(` | `contacts` | `const q3 = query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", finalNormalizedPhones));` |
| `src/lib/db/contactService.js` | 2095 | `claimCRMContact` | `getDoc` | `N/A` | `const snap3 = await getDocs(q3);` |
| `src/lib/db/contactService.js` | 2095 | `claimCRMContact` | `getDocs` | `N/A` | `const snap3 = await getDocs(q3);` |
| `src/lib/db/contactService.js` | 2175 | `claimCRMContact` | `addDoc` | `contacts` | `const docRef = await addDoc(collection(db, "contacts"), docData);` |
| `src/lib/db/contactService.js` | 2175 | `claimCRMContact` | `collection(` | `contacts` | `const docRef = await addDoc(collection(db, "contacts"), docData);` |
| `src/lib/db/contactService.js` | 2185 | `reassignContactsToPool` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 2186 | `reassignContactsToPool` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 2188 | `reassignContactsToPool` | `where(` | `N/A` | `where("assignedTo", "==", attenderId),` |
| `src/lib/db/contactService.js` | 2189 | `reassignContactsToPool` | `where(` | `N/A` | `where("assignedTo", "array-contains", attenderId)` |
| `src/lib/db/contactService.js` | 2192 | `reassignContactsToPool` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 2192 | `reassignContactsToPool` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 2224 | `reassignContactsToPool` | `writeBatch` | `N/A` | `const batch = writeBatch(db);` |
| `src/lib/db/contactService.js` | 2276 | `reassignContactsBetweenAttenders` | `getDoc` | `attenders` | `const attSnap = await getDoc(doc(db, "attenders", toAttenderId));` |
| `src/lib/db/contactService.js` | 2276 | `reassignContactsBetweenAttenders` | `doc(` | `attenders` | `const attSnap = await getDoc(doc(db, "attenders", toAttenderId));` |
| `src/lib/db/contactService.js` | 2284 | `reassignContactsBetweenAttenders` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 2285 | `reassignContactsBetweenAttenders` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 2287 | `reassignContactsBetweenAttenders` | `where(` | `N/A` | `where("assignedTo", "==", fromAttenderId),` |
| `src/lib/db/contactService.js` | 2288 | `reassignContactsBetweenAttenders` | `where(` | `N/A` | `where("assignedTo", "array-contains", fromAttenderId)` |
| `src/lib/db/contactService.js` | 2291 | `reassignContactsBetweenAttenders` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 2291 | `reassignContactsBetweenAttenders` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 2323 | `reassignContactsBetweenAttenders` | `writeBatch` | `N/A` | `const batch = writeBatch(db);` |
| `src/lib/db/contactService.js` | 2499 | `getAttenderCallLogs` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 2500 | `getAttenderCallLogs` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 2502 | `getAttenderCallLogs` | `where(` | `N/A` | `where("assignedTo", "==", attenderId),` |
| `src/lib/db/contactService.js` | 2503 | `getAttenderCallLogs` | `where(` | `N/A` | `where("assignedTo", "array-contains", attenderId)` |
| `src/lib/db/contactService.js` | 2506 | `getAttenderCallLogs` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 2506 | `getAttenderCallLogs` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 2537 | `getProgramCallLogs` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/contactService.js` | 2538 | `getProgramCallLogs` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/contactService.js` | 2539 | `getProgramCallLogs` | `where(` | `N/A` | `where("tags", "array-contains", tag)` |
| `src/lib/db/contactService.js` | 2541 | `getProgramCallLogs` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 2541 | `getProgramCallLogs` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/contactService.js` | 2563 | `saveExcelToCloud` | `doc(` | `excelSheets` | `const docRef = doc(db, "excelSheets", "current");` |
| `src/lib/db/contactService.js` | 2564 | `saveExcelToCloud` | `setDoc` | `N/A` | `await setDoc(docRef, {` |
| `src/lib/db/contactService.js` | 2576 | `loadExcelFromCloud` | `doc(` | `excelSheets` | `const docRef = doc(db, "excelSheets", "current");` |
| `src/lib/db/contactService.js` | 2577 | `loadExcelFromCloud` | `getDoc` | `N/A` | `const snap = await getDoc(docRef);` |
| `src/lib/db/contactService.js` | 2591 | `deleteExcelFromCloud` | `doc(` | `excelSheets` | `const docRef = doc(db, "excelSheets", "current");` |
| `src/lib/db/contactService.js` | 2592 | `deleteExcelFromCloud` | `deleteDoc` | `N/A` | `await deleteDoc(docRef);` |
| `src/lib/db/core.js` | 2 | `Top-Level / Module` | `getDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/core.js` | 2 | `Top-Level / Module` | `getDocs` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/core.js` | 2 | `Top-Level / Module` | `setDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/core.js` | 2 | `Top-Level / Module` | `addDoc` | `N/A` | `collection, addDoc, getDocs, getDoc, doc, setDoc,` |
| `src/lib/db/core.js` | 3 | `Top-Level / Module` | `updateDoc` | `N/A` | `updateDoc, deleteDoc, query, where,` |
| `src/lib/db/core.js` | 3 | `Top-Level / Module` | `deleteDoc` | `N/A` | `updateDoc, deleteDoc, query, where,` |
| `src/lib/db/core.js` | 4 | `Top-Level / Module` | `onSnapshot` | `N/A` | `serverTimestamp, writeBatch, onSnapshot,` |
| `src/lib/db/core.js` | 4 | `Top-Level / Module` | `writeBatch` | `N/A` | `serverTimestamp, writeBatch, onSnapshot,` |
| `src/lib/db/programService.js` | 2 | `Top-Level / Module` | `getDoc` | `N/A` | `collection, getDocs, doc, setDoc, deleteDoc, query, where, limit, serverTimestamp, Timestamp` |
| `src/lib/db/programService.js` | 2 | `Top-Level / Module` | `getDocs` | `N/A` | `collection, getDocs, doc, setDoc, deleteDoc, query, where, limit, serverTimestamp, Timestamp` |
| `src/lib/db/programService.js` | 2 | `Top-Level / Module` | `setDoc` | `N/A` | `collection, getDocs, doc, setDoc, deleteDoc, query, where, limit, serverTimestamp, Timestamp` |
| `src/lib/db/programService.js` | 2 | `Top-Level / Module` | `deleteDoc` | `N/A` | `collection, getDocs, doc, setDoc, deleteDoc, query, where, limit, serverTimestamp, Timestamp` |
| `src/lib/db/programService.js` | 75 | `createProgram` | `doc(` | `programs` | `const ref = doc(db, "programs", name);` |
| `src/lib/db/programService.js` | 76 | `createProgram` | `setDoc` | `N/A` | `await setDoc(ref, {` |
| `src/lib/db/programService.js` | 86 | `deleteProgram` | `deleteDoc` | `programs` | `await deleteDoc(doc(db, "programs", id));` |
| `src/lib/db/programService.js` | 86 | `deleteProgram` | `doc(` | `programs` | `await deleteDoc(doc(db, "programs", id));` |
| `src/lib/db/programService.js` | 91 | `getProgramChunkContacts` | `query(` | `N/A` | `const q = query(` |
| `src/lib/db/programService.js` | 92 | `getProgramChunkContacts` | `collection(` | `contacts` | `collection(db, "contacts"),` |
| `src/lib/db/programService.js` | 93 | `getProgramChunkContacts` | `where(` | `N/A` | `where("programId", "==", programId),` |
| `src/lib/db/programService.js` | 96 | `getProgramChunkContacts` | `getDoc` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/programService.js` | 96 | `getProgramChunkContacts` | `getDocs` | `N/A` | `const snap = await getDocs(q);` |
| `src/lib/db/syncService.js` | 2 | `Top-Level / Module` | `getDoc` | `N/A` | `collection, query, where, onSnapshot, doc, getDoc, setDoc, or` |
| `src/lib/db/syncService.js` | 2 | `Top-Level / Module` | `onSnapshot` | `N/A` | `collection, query, where, onSnapshot, doc, getDoc, setDoc, or` |
| `src/lib/db/syncService.js` | 2 | `Top-Level / Module` | `setDoc` | `N/A` | `collection, query, where, onSnapshot, doc, getDoc, setDoc, or` |
| `src/lib/db/syncService.js` | 134 | `willFetchFromFirestore` | `doc(` | `contacts` | `const docRef = doc(db, "contacts", lead.id);` |
| `src/lib/db/syncService.js` | 135 | `willFetchFromFirestore` | `getDoc` | `N/A` | `const docSnap = await getDoc(docRef);` |
| `src/lib/db/syncService.js` | 139 | `willFetchFromFirestore` | `getDoc` | `N/A` | `operation: "getDoc",` |
| `src/page/call-center/attender/components/EditModal.jsx` | 1521 | `diffMinutes` | `getDoc` | `N/A` | `const targetDocId = targetEdited.contactId \|\| targetEdited.id \|\| id;` |
| `src/page/call-center/attender/components/EditModal.jsx` | 1524 | `diffMinutes` | `getDoc` | `N/A` | `let savedDocId = targetDocId;` |
| `src/page/call-center/attender/components/EditModal.jsx` | 1533 | `diffMinutes` | `getDoc` | `N/A` | `const res = await updateCallLog(targetDocId, updates, activeAttenderId, activeAttenderName, row);` |

---

## 4. Comprehensive IndexedDB Operations Inventory


The application utilizes IndexedDB via **idb-keyval** and direct key-value patterns (`tgf_cache_...`, `tgf_admin_logs_...`, `tgf_registrations_...`, `tgf_dup_check_cache`).

### IndexedDB Storage Stores & Keys:
1. **Attender Lead Cache**: `tgf_cache_${attenderId}`
   - **File**: `src/lib/db/cacheService.js` (`getIDBCache`, `setIDBCache`)
   - **Data**: Array of contact lead objects assigned to the specific attender.
   - **Triggers**: Read on attender login / reload; updated on lead save/edit/add.

2. **Admin Call Center Cache**: `tgf_admin_logs_v3_${scope}_${tag}`
   - **File**: `src/lib/db/adminService.js` (`subscribeToAllCallLogs`)
   - **Data**: Array of compiled contact objects for the Admin panel.
   - **Triggers**: Read instantly when Admin opens Call Center; written when `callCenterCache` partition snapshot emits changes.

3. **Admin Registrations Cache**: `tgf_registrations_cache_v3_${scope}`
   - **File**: `src/lib/db/adminService.js` (`subscribeToRegistrations`)
   - **Data**: Array of registration objects.
   - **Triggers**: Read instantly when Admin opens Registrations tab; updated when `registrationsCache` snapshot updates or explicit refresh occurs.

4. **Duplicate Phone Cache**: `tgf_dup_check_cache`
   - **File**: `src/lib/db/cacheService.js` (`getDupCheckCache`, `setDupCheckCache`)
   - **Data**: Serialized map of normalized phone numbers to minimal lead records.
   - **Triggers**: Checked before creating or editing a lead to perform 0-read duplicate validation.

5. **Locked Monthly Reports Cache**: `tgf_locked_reports_${queryStartMonth}_${endMonth}`
   - **File**: `src/lib/db/adminService.js` (`subscribeToAllCallLogs`)
   - **Data**: Historical immutable monthly snapshot partition documents.
   - **Triggers**: Read during Admin startup to load cold historical data without billable reads.

6. **Offline Pending Writes Queue**: `tgf_pending_writes`
   - **File**: `src/lib/db/syncService.js` (`queuePendingWrite`, `flushPendingWrites`)
   - **Data**: Array of write operations queued while offline or when network errors occur.
   - **Triggers**: Enqueued on write failure; flushed when back online.

---

## 5. End-to-End Data Architecture Maps


### Attender Architecture Flow:
```
[ Attender UI (AttenderView / EditModal) ]
               │
               ▼
   [ IndexedDB: tgf_cache_{attenderId} ]
        (0ms Load / Zero-Read Hit)
               │
      (If forceRefresh / Miss)
               ▼
      [ Firestore: contacts/{id} ]
```

### Admin Call Center Architecture Flow:
```
[ Admin Panel (AdminPanel / DashboardTab) ]
               │
               ▼
[ IndexedDB: tgf_admin_logs_v3_{scope}_{tag} ]
        (Instant 0ms UI render)
               │
      (Snapshot Listener Active)
               ▼
[ Firestore: callCenterCache/{YYYY-MM} & {YYYY-MM_partN} ]
        (Emits changes -> Merges -> Updates IndexedDB)
```

### Admin Registration Architecture Flow:
```
[ Admin Panel (Abhivyakti / RegistrationsTab) ]
               │
               ▼
[ IndexedDB: tgf_registrations_cache_v3_{scope} ]
        (Instant 0ms UI render)
               │
      (If IDB empty / Manual Refresh)
               ▼
[ Firestore: registrationsCache/{YYYY-MM} & registrations/{id} ]
        (Fetches partition documents -> Updates IndexedDB)
```

---

## 6. Detailed End-to-End Operation Traces (A through G)


### Trace A: Attender Opens Existing Lead
1. **UI Click**: Attender clicks row in `ContactTable.jsx` or `MobileAttenderView.jsx`.
2. **Component Hook**: Calls `fetchFreshSharedLead(contactId, isShared, forceRefresh)` in `src/lib/db/syncService.js`.
3. **Cache Decision**:
   - Checks local lead cache in memory or IndexedDB.
   - If `forceRefresh === false` and local cache exists:
     - Emits `[LEAD FETCH DECISION]` with `ACTION: "LOCAL_CACHE"`.
     - Logs `[LEAD FETCH → IDB]`.
     - **0 Firestore Reads**.
   - If `forceRefresh === true` or cache missing:
     - Logs `[LEAD FETCH → FIRESTORE]`.
     - Calls `getDoc(doc(db, "contacts", contactId))`.
     - Returns document data and updates IndexedDB.

---

### Trace B: Attender Creates New Lead
1. **Form Submission**: Attender submits form in `AddCallLogModal.jsx`.
2. **Local Duplicate Check**:
   - Calls `checkLocalDuplicate(phoneNumbers)` in `cacheService.js` against IndexedDB / in-memory duplicate cache.
   - **0 Firestore Reads**.
3. **Firestore Duplicate Check**:
   - If local check returns clean, calls `checkGlobalDuplicate(phoneNumbers)` in `contactService.js`.
   - Executes `query(collection(db, "contacts"), where("normalizedPhones", "array-contains-any", ...))`.
   - Logs `[FIRESTORE READ]` for query execution.
4. **Atomic Batch Write**:
   - Calls `addIncomingCallLogDirectFirebase(data, attenderId)`.
   - Constructs `writeBatch(db)`.
   - Sanitizes payloads with `sanitizeForFirestore`.
   - **Write 1**: `contacts/{newDocId}`
   - **Write 2**: `callCenterCache/{YYYY-MM}` (partition doc update for current month)
   - **Write 3 & 4 (if status === 'Reg.Done')**:
     - Logs `[REGISTRATION BATCH]`.
     - `registrations/{newDocId}_{program}`
     - `registrationsCache/{YYYY-MM}`
   - Calls `await batch.commit()`.
   - Logs `[REGISTRATION BATCH SUCCESS]` and `[FIRESTORE WRITE]`.

---

### Trace C: Attender Edits Existing Lead
1. **Modal Load**: Lead data supplied from existing local state/IDB.
2. **Save Action**: Attender clicks Save in `EditModal.jsx`.
3. **Local Optimistic Update**: Immediately updates UI and IndexedDB (`0ms` UI latency).
4. **Direct Write Execution**:
   - Calls `updateCallLogDirectFirebase(logId, updates, attenderId, attenderName, existingContact)`.
   - Bypasses `getDoc()` by passing `existingContact` from local memory (**0 Firestore Reads**).
   - Sanitizes root payload and deep updates with `sanitizeForFirestore`.
   - Constructs `writeBatch(db)`.
   - **Write 1**: `contacts/{logId}` (update root fields or attender state)
   - **Write 2**: `callCenterCache/{YYYY-MM}` (partition doc update)
   - Calls `await batch.commit()`.

---

### Trace D: Attender Sets Status to "Reg.Done"
1. **Status Selection**: Attender sets status dropdown to "Reg.Done" and saves.
2. **Payload Construction**:
   - Merges `freshData` with `registeredYearMonth: currentMonth`, `registeredAt: serverTimestamp()`, `conversionSource`, `convertedBy`, `programName`.
   - Sanitizes payload using `sanitizeForFirestore`.
3. **Atomic Batch Write**:
   - Logs `[REGISTRATION BATCH]` with `hasUndefinedFields` check.
   - Sets `contacts/{logId}`.
   - Sets `callCenterCache/{YYYY-MM}`.
   - Sets `registrations/{logId}_{cleanedCalledFor}`.
   - Sets `registrationsCache/{YYYY-MM}`.
4. **Execution & Local Update**:
   - Calls `await batch.commit()`.
   - Logs `[REGISTRATION BATCH SUCCESS]`.
   - Calls `updateLocalRegistrationsCache(regPayload)` to update local IndexedDB immediately.

---

### Trace E: Admin Opens Call Center
1. **Component Initialization**: `AdminPanel.jsx` mounts.
2. **IndexedDB Cache Emission**:
   - Reads `tgf_admin_logs_v3_{scope}_{tag}` from IndexedDB.
   - Instantly renders UI with 0ms delay (**0 Firestore Reads**).
3. **Firestore Listener Registration**:
   - Calls `subscribeToAllCallLogs(tag, scopeOption, callback)` in `adminService.js`.
   - Computes month range (`queryStartMonth` to `endMonth`).
   - Executes query on `callCenterCache` collection:
     ```javascript
     query(
       collection(db, "callCenterCache"),
       where(documentId(), ">=", queryStartMonth),
       where(documentId(), "<=", endMonth + "\uf8ff")
     )
     ```
   - On snapshot emission, logs `[ADMIN CACHE SNAPSHOT]` and updates IndexedDB cache.

---

### Trace F: Admin Opens Registrations (Abhivyakti)
1. **Component Initialization**: `AbhivyaktiTab.jsx` mounts.
2. **IndexedDB Read**:
   - Calls `subscribeToRegistrations(scopeOption, callback)`.
   - Checks `tgf_registrations_cache_v3_{scope}` in IndexedDB.
   - Logs `[REGISTRATION LOAD DECISION]` with `indexedDBHit: true`.
3. **Fallback / Partition Load**:
   - If IndexedDB is empty or expired:
     - Logs `[REGISTRATION FIRESTORE READ]`.
     - Queries `registrationsCache` partition documents for active months.
     - Merges records and updates IndexedDB.

---

### Trace G: Admin Manual Refresh
1. **User Action**: Admin clicks "Refresh Data" button.
2. **Execution**:
   - Bypasses IndexedDB cache.
   - Re-queries `callCenterCache` and `registrationsCache` partition documents from Firestore.
   - Overwrites IndexedDB cache with fresh server documents.
   - Re-renders UI.

---

## 7. Partition Architecture Deep-Dive


### Document Naming & Partition Scheme
- **Base Partition ID**: `YYYY-MM` (e.g. `2026-08`)
- **Overflow Partition ID**: `YYYY-MM_part1`, `YYYY-MM_part2`, etc.

### Partition Creation & Threshold Algorithm (from `adminService.js`):
```javascript
// Partition Size Limit: 250 KB (Safe buffer below Firestore 1MB doc limit)
const MAX_PARTITION_SIZE_BYTES = 250 * 1024;

export const pruneContactForCacheForMonth = (contact, monthStr) => {
  // Prunes non-essential fields to keep partition documents lightweight
  const pruned = {
    id: contact.id || contact.docId,
    Name: contact.Name || contact.name || '',
    Phone: contact.Phone || contact.phone || '',
    status: contact.status || '',
    attenderName: contact.attenderName || '',
    updatedAt: contact.updatedAt || contact.createdAt || null,
    // Keeps history only for the target month
    history: (contact.history || []).filter(h => isDateInMonth(h.timestamp || h.date, monthStr))
  };
  return pruned;
};
```

### Partition Lookup & Merging:
When reading partitions in `subscribeToAllCallLogs`:
```javascript
const activeDocs = cacheSnap.docs.filter(d => d.id !== "contacts" && /^\d{4}-\d{2}(_part\d+)?$/.test(d.id));
const contactsMap = {};
activeDocs.forEach(docSnap => {
  const docContacts = docSnap.data().contacts || {};
  Object.entries(docContacts).forEach(([id, c]) => {
    // Merges attender states and deduplicates contact history across partitions
  });
});
```

---

## 8. Known Observable Architectural Issues & Code Smells


1. **[WRITE / PAYLOAD] Deferred Offline Writes on Unsupported Values**:
   - **Observation**: Before adding `sanitizeForFirestore`, fields with `undefined` values (e.g. `queryStatus: undefined`) caused Firestore `WriteBatch.set()` to throw `Unsupported field value: undefined`, causing batch failure and deferral to offline queue.
   - **Location**: `src/lib/db/contactService.js` (`updateCallLogDirectFirebase`).

2. **[READ / STALE DATA] Registration Cache Dependency on IndexedDB**:
   - **Observation**: `subscribeToRegistrations` checks IndexedDB first and skips Firestore if IndexedDB contains >0 records. If a registration is added from another browser, the current Admin session won't fetch it until IndexedDB is cleared or manually refreshed.
   - **Location**: `src/lib/db/adminService.js` (`subscribeToRegistrations`).

3. **[DUPLICATE LISTENER] Potential Multiple Snapshot Subscriptions**:
   - **Observation**: If `subscribeToAllCallLogs` is invoked repeatedly by re-mounting components without unsubscribing, multiple snapshot listeners on `callCenterCache` remain active.
   - **Location**: `src/page/call-center/admin/AdminPanel.jsx` & `src/lib/db/adminService.js`.

4. **[READ] Global Duplicate Phone Search Query**:
   - **Observation**: `checkGlobalDuplicate` queries the `contacts` collection using `array-contains-any` for normalized phone numbers. Each execution consumes billable reads equal to matching documents.
   - **Location**: `src/lib/db/contactService.js` (`checkGlobalDuplicate`).

5. **[CACHE / DESYNC] Shared Lead Cache Age Drift**:
   - **Observation**: In `fetchFreshSharedLead`, if `forceRefresh` is false, local cache is returned regardless of age unless explicitly invalidated.
   - **Location**: `src/lib/db/syncService.js` (`fetchFreshSharedLead`).
