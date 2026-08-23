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
  getByteSize
} from "./core.js";
import {
  getIDBCache, setIDBCache, dupCheckCacheMap,
  getDupCheckCache, setDupCheckCache, updateLocalAttenderCache,
  fetchPartitionCacheForColdBoot
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
  if (myController.cancelled) return null; // Superseded by newer keystroke

  const promises = [];
  console.log(`[FIRESTORE READ - checkGlobalDuplicate] Querying 'contacts' collection | variations: ${numbersToCheck.join(", ")} | queriesCount: ${numbersToCheck.length}`);
  numbersToCheck.forEach(norm => {
    promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm))));
    promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhone", "==", norm))));
    promises.push(getDocs(query(collection(db, "contacts"), where("normalizedMobile", "==", norm))));
  });
  
  const snaps = await Promise.all(promises);
  let totalDocsReturned = 0;
  snaps.forEach(s => totalDocsReturned += s.docs.length);
  console.log(`[FIRESTORE READ - checkGlobalDuplicate] Completed | totalDocsReturned: ${totalDocsReturned}`);
  
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

  try {
    const logSnap = await getDoc(contactRef);
    if (logSnap.exists()) {
      logData = logSnap.data();
    } else if (existingContact) {
      logData = existingContact;
    }
  } catch (e) {
    console.warn("Failed to fetch contact data in updateCallLog", e);
    if (existingContact) logData = existingContact;
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

  // Execute atomically using a writeBatch to prevent partial updates or duplicate snapshot triggers
  console.log(`[FIRESTORE BATCH WRITE] Contact ID: ${logId}`, { rootPayload, deepUpdates });
  const batch = writeBatch(db);
  if (Object.keys(rootPayload).length > 0) {
    batch.set(contactRef, rootPayload, { merge: true });
  }
  if (Object.keys(deepUpdates).length > 0) {
    batch.update(contactRef, deepUpdates);
  }
  await batch.commit();
  console.log(`[FIRESTORE BATCH WRITE SUCCESS] Contact ID: ${logId}`);

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
          const prog = h.calledFor || h.programName || freshData.programName || "Unknown";
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
      const currentProg = freshData["Called For"] || freshData.calledFor || "Unknown";
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

        Object.keys(payload).forEach(key => {
          if (payload[key] === undefined || payload[key] === deleteField() || (payload[key] && typeof payload[key] === "object" && payload[key]._methodName === "deleteField")) {
            delete payload[key];
          }
        });

        await setDoc(doc(db, "registrations", registrationId), payload, { merge: true });
        await registerRegistrationMonth(yearMonth);
      }

      // Delete any outdated/orphan registrations for this contact
      for (const [id, ref] of Object.entries(existingRegMap)) {
        if (!activeRegIds.has(id)) {
          await deleteDoc(ref);
          console.log("🗑️ Deleted unregistered/orphaned registration document:", id);
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
      console.log("%c🔥 [FIRESTORE READ - Phone Lookup]", "background: #064e3b; color: #34d399; font-weight: bold; padding: 2px 6px; border-radius: 4px;", `Queried "contacts" for duplicate phone check. Matches found: ${mergedDocs.length}`);
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
    callType: data.callType || "incoming",
    tags: mergedTags,
    attenderStates: updatedStates,
    updatedAt: serverTimestamp(),
    programId: finalProgramId,
    programName: finalProgramName,
    "Sub Program": finalProgramName,
    subProgram: finalProgramName,
    isManualEntry: true
  };

  if (isExisting && existingData.createdAt) {
    logPayload.createdAt = existingData.createdAt;
  } else {
    logPayload.createdAt = serverTimestamp();
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

  if (isExisting && existingDocId) {
    const contactRef = doc(db, "contacts", existingDocId);
    const { attenderStates, ...restPayload } = logPayload;
    const dotPayload = {
      ...restPayload,
      _deleted: deleteField(),
      [`attenderStates.${attenderId}`]: updatedStates[attenderId]
    };
    await setDoc(contactRef, dotPayload, { merge: true });
    docRef = { id: existingDocId };
    console.log("%c⚡ [FIRESTORE WRITE - Contact Update]", "background: #701a75; color: #f0abfc; font-weight: bold; padding: 2px 6px; border-radius: 4px;", `Updated existing lead in "contacts": ${existingDocId}`);
  } else {
    docRef = await addDoc(collection(db, "contacts"), logPayload);
    console.log("%c⚡ [FIRESTORE WRITE - New Contact]", "background: #701a75; color: #f0abfc; font-weight: bold; padding: 2px 6px; border-radius: 4px;", `Created new lead in "contacts": ${docRef.id}`);
  }



  // Handle "Reg.Done" registrations collection sync
  if (data.status === "Reg.Done") {
    try {
      const payload = {
        ...logPayload,
        id: docRef.id,
        registeredYearMonth: yearMonth,
        registeredAt: serverTimestamp(),
        conversionSource: logPayload.Source || logPayload.Sourse || "Direct",
        convertedBy: attenderName || "Unknown",
        programName: logPayload.programName || "Incoming Calls"
      };

      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      const calledForVal = payload["Called For"] || payload.calledFor || "Unknown";
      const cleanedCalledFor = String(calledForVal).trim().replace(/[^a-zA-Z0-9]/g, "_");
      const registrationId = `${docRef.id}_${cleanedCalledFor}`;

      await setDoc(doc(db, "registrations", registrationId), payload, { merge: true });
      console.log("%c⚡ [FIRESTORE WRITE - Registration]", "background: #701a75; color: #f0abfc; font-weight: bold; padding: 2px 6px; border-radius: 4px;", `Saved registration record in "registrations": ${registrationId}`);
      await registerRegistrationMonth(yearMonth);
    } catch (e) {
      console.error("Incoming registration write failed:", e);
    }
  }

  // Register tag in active tags collection
  await registerActiveTag(finalProgramName);

  return docRef.id;
};


export const addIncomingCallLog = async (attenderId, attenderName, data, programId = null, programName = null) => {
  const localId = `local_inc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  // 1. Instantly update local IndexedDB cache for 0ms UI load
  if (attenderId) {
    await updateLocalAttenderCache(attenderId, localId, {
      ...data,
      id: localId,
      Name: formatContactName(data.Name || data.name || "New Lead"),
      Phone: data.Phone || data.phone || "",
      callType: data.callType || "incoming",
      status: data.status || "Call Log Added",
      createdAt: new Date().toISOString()
    });
  }

  // 2. Trigger direct write to Firebase asynchronously in background
  addIncomingCallLogDirectFirebase(attenderId, attenderName, data, programId, programName)
    .then(docId => {
      console.log(`[ADD INC SUCCESS] Firebase write completed for new lead: ${docId}`);
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
