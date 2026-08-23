import { where, deleteField, writeBatch, Timestamp, getDoc, limit } from "firebase/firestore";
import { getIDBCache, setIDBCache } from "./cache";
import { DEFAULT_STATUS_OPTIONS, DEFAULT_SOURCE_OPTIONS, DEFAULT_CALLED_FOR_OPTIONS } from "./cache";
import { isKhojiField } from "../khojiHelper";
import { collection, getDocs, setDoc, doc,  deleteDoc, serverTimestamp, query,  onSnapshot } from "firebase/firestore";
import { db } from "../firebase.js";

const STATIC_ACTIVE_TAGS = ["Incoming Calls", "Outgoing Calls"];

export const getActiveTags = async () => {
  return STATIC_ACTIVE_TAGS;
};

// const registeredTagsCache = new Set();

export const registerActiveTag = async (tag) => {
  // Static tags in use — 0 Firestore writes
  return;
};

export const removeActiveTag = async (tag) => {
  // Static tags in use — 0 Firestore writes
  return;
};


export const INCOMING_PROGRAM_ID = "incoming-calls";
export const INCOMING_PROGRAM_NAME = "Incoming Calls";

// Fixed ID for the dedicated "Outgoing Calls" program — never changes
export const OUTGOING_PROGRAM_ID = "outgoing-calls";
export const OUTGOING_PROGRAM_NAME = "Outgoing Calls";

// let incomingProgramEnsured = false;
// let outgoingProgramEnsured = false;

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

const getCaseInsensitiveProp = (obj, propName) => {
  if (!obj) return { found: false };
  if (obj[propName] !== undefined) return { found: true, key: propName, val: obj[propName] };
  const keys = Object.keys(obj);
  const matchingKey = keys.find(k => k.toLowerCase() === propName.toLowerCase());
  if (matchingKey) {
    return { found: true, key: matchingKey, val: obj[matchingKey] };
  }
  return { found: false };
};

// Apply a new field mapping to all contacts in all chunks of a program.
// Also updates already assigned call logs for this program.
// columnMappings: { originalColName: "Name"|"Phone"|...|"Custom"|"Ignore" }
// skipEmptySettings: { originalColName: boolean }
// Returns number of contacts updated.
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

export const extractIndividualPhones = (phoneStr) => {
  if (!phoneStr) return [];
  const parts = String(phoneStr).split(/[\n/,;&]|\band\b/i);
  return parts
    .map(p => p.replace(/\D/g, "").trim())
    .map(p => p.length >= 10 ? p.slice(-10) : p)
    .filter(p => p.length >= 5);
};

export const normalizePhone = (phone) => {
  if (!phone) return "";
  const individual = extractIndividualPhones(phone);
  if (individual.length > 0) return individual[0];
  const cleaned = String(phone).replace(/\D/g, "").trim();
  if (cleaned.length >= 10) {
    return cleaned.slice(-10);
  }
  return cleaned;
};

// Parse a comma-separated tag string into a clean array of individual tag strings
export const parseTags = (rawStr) => {
  if (!rawStr) return [];
  return String(rawStr).split(",").map(t => t.trim()).filter(Boolean);
};

// Format a Firestore document snapshot into a plain contact object.
// Derives the virtual Tags (string) from the tags (array) — Tags is never stored in Firestore.
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
let optionsUnsubscribe = null;
const optionsSubscribers = new Set();

export const subscribeToCallCenterOptions = (onUpdate) => {
  optionsSubscribers.add(onUpdate);

  // 1. Immediately emit in-memory options if available
  if (inMemoryOptions) {
    onUpdate(inMemoryOptions);
  } else {
    // Read from IndexedDB local cache for 0ms initial load
    getIDBCache("tgf_call_center_options").then(cached => {
      if (cached && !inMemoryOptions) {
        inMemoryOptions = cached;
        onUpdate(cached);
      }
    }).catch(err => console.warn("Failed to load options from IDB:", err));
  }

  // 2. Start SINGLE global Firestore listener if not active yet
  if (!optionsUnsubscribe) {
    const docRef = doc(db, "settings", "call_center_options");
    optionsUnsubscribe = onSnapshot(docRef, (snap) => {
      console.log(
        "%c📡 [SNAPSHOT READ - call_center_options]",
        "background: #1e1b4b; color: #818cf8; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
        `Options document snapshot received | Exists: ${snap.exists()}`
      );
      let opts = null;
      if (snap.exists()) {
        const data = snap.data();
        opts = {
          statusOptions: data.statusOptions || DEFAULT_STATUS_OPTIONS,
          sourceOptions: data.sourceOptions || DEFAULT_SOURCE_OPTIONS,
          calledForOptions: data.calledForOptions || DEFAULT_CALLED_FOR_OPTIONS,
          connectedStatuses: data.connectedStatuses || DEFAULT_CONNECTED_STATUSES,
          notConnectedStatuses: data.notConnectedStatuses || DEFAULT_NOT_CONNECTED_STATUSES,
          optionalCompulsoryStatuses: data.optionalCompulsoryStatuses || data.notConnectedStatuses || DEFAULT_NOT_CONNECTED_STATUSES,
          whatsappTemplates: data.whatsappTemplates || DEFAULT_WHATSAPP_TEMPLATES
        };
      } else {
        opts = {
          statusOptions: DEFAULT_STATUS_OPTIONS,
          sourceOptions: DEFAULT_SOURCE_OPTIONS,
          calledForOptions: DEFAULT_CALLED_FOR_OPTIONS,
          connectedStatuses: DEFAULT_CONNECTED_STATUSES,
          notConnectedStatuses: DEFAULT_NOT_CONNECTED_STATUSES,
          optionalCompulsoryStatuses: DEFAULT_NOT_CONNECTED_STATUSES,
          whatsappTemplates: DEFAULT_WHATSAPP_TEMPLATES
        };
        setDoc(docRef, opts, { merge: true }).catch(e => console.error("Failed to init options:", e));
      }

      inMemoryOptions = opts;
      setIDBCache("tgf_call_center_options", opts).catch(e => console.warn("Failed to save options to IDB:", e));

      // Broadcast to all active subscribers
      optionsSubscribers.forEach(cb => {
        try { cb(opts); } catch (err) { console.error("Subscriber error:", err); }
      });
    }, err => console.error("subscribeToCallCenterOptions error:", err));
  }

  // Return unsubscriber function
  return () => {
    optionsSubscribers.delete(onUpdate);
    if (optionsSubscribers.size === 0 && optionsUnsubscribe) {
      optionsUnsubscribe();
      optionsUnsubscribe = null;
    }
  };
};




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


export function findMatchingAttenderState(attenderStates, attenderId, attenderName) {
  if (!attenderStates || typeof attenderStates !== "object") return null;

  const idLower = attenderId ? String(attenderId).toLowerCase().trim() : "";
  const nameLower = attenderName ? String(attenderName).toLowerCase().trim() : "";
  
  for (const key in attenderStates) {
    const state = attenderStates[key];
    const sId = state.attenderId ? String(state.attenderId).toLowerCase().trim() : "";
    const sName = state.attenderName ? String(state.attenderName).toLowerCase().trim() : "";
    
    if ((idLower && sId === idLower) || (nameLower && sName === nameLower)) {
      return state;
    }
  }
  return null;
}

export const combineContactHistories = (contact, attState, attenderName) => {
  if (!contact) return [];
  const history = Array.isArray(contact.history) ? [...contact.history] : [];
  return history.sort((a,b) => {
    const tA = typeof a.timestamp?.toMillis === 'function' ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime();
    const tB = typeof b.timestamp?.toMillis === 'function' ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime();
    return tB - tA;
  });
};


export const getProgramContactStats = async (tag) => {
  if (!tag) return { total: 0, pending: 0, completed: 0 };
  const snap = await getDocs(query(collection(db, "contacts"), where("tags", "array-contains", tag)));
  let total = 0, pending = 0, completed = 0;
  snap.forEach(d => {
     const data = d.data();
     if (!data._deleted) {
       total++;
       if (data.status === "Pending") pending++;
       else completed++;
     }
  });
  return { total, pending, completed };
};

