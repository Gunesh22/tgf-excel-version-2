import {
  collection, addDoc, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, query, where,
  serverTimestamp, writeBatch, onSnapshot,
  limit, Timestamp, runTransaction, arrayUnion, orderBy,
  deleteField, increment
} from "firebase/firestore";
import { db } from "./firebase";
import { isKhojiField } from "./khojiHelper";

// ─────────────────────────────────────────────
// IGNORED FIELDS DEFINITIONS
// ─────────────────────────────────────────────
const IGNORED_FIELDS = [
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
];

const isIgnoredField = (key) => {
  if (!key) return true;
  const k = key.toLowerCase().trim().replace(/_/g, " ");
  return IGNORED_FIELDS.some(ignored => {
    // Only allow substring matching for longer ignored terms,
    // require exact match for short terms like "date" and "content" to prevent blocking valid fields like "Registration Date"
    if (ignored === "date" || ignored === "content") {
      return k === ignored;
    }
    return k === ignored || k.includes(ignored);
  });
};

// ─────────────────────────────────────────────
// PROGRAMS (Folders)
// ─────────────────────────────────────────────

// ACTIVE TAGS METADATA
export const getActiveTags = async () => {
  try {
    const snap = await getDocs(collection(db, "activeTags"));
    return snap.docs.map(d => d.id).sort();
  } catch (e) {
    console.error("Failed to get active tags:", e);
    return [];
  }
};

export const registerActiveTag = async (tag) => {
  if (!tag) return;
  const cleanTag = tag.trim();
  if (!cleanTag) return;
  try {
    await setDoc(doc(db, "activeTags", cleanTag), {
      name: cleanTag,
      createdAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error("Failed to register active tag:", e);
  }
};

export const removeActiveTag = async (tag) => {
  if (!tag) return;
  try {
    await deleteDoc(doc(db, "activeTags", tag.trim()));
  } catch (e) {
    console.error("Failed to remove active tag:", e);
  }
};

// Fixed ID for the dedicated "Incoming Calls" program — never changes
export const INCOMING_PROGRAM_ID = "incoming-calls";
export const INCOMING_PROGRAM_NAME = "Incoming Calls";

// Upsert the Incoming Calls program document — safe to call multiple times
export const ensureIncomingProgram = async () => {
  await registerActiveTag("Incoming Calls");
  const ref = doc(db, "programs", INCOMING_PROGRAM_ID);
  await setDoc(ref, {
    name: INCOMING_PROGRAM_NAME,
    isSystem: true,       // marks it as a system/reserved program
    contactCount: 0,
    createdAt: serverTimestamp(),
  }, { merge: true });   // merge:true so we never overwrite existing data
};

export const getPrograms = async () => {
  const tags = await getActiveTags();
  const list = tags.map(t => ({
    id: t,
    name: t,
    contactCount: 0,
    createdAt: Timestamp.now()
  }));
  
  // Also fetch any existing programs from Firestore to merge counts and creation dates
  try {
    const snap = await getDocs(collection(db, "programs"));
    snap.docs.forEach(d => {
      const data = d.data();
      const existing = list.find(item => item.id === d.id);
      if (existing) {
        existing.contactCount = data.contactCount || 0;
        if (data.createdAt) existing.createdAt = data.createdAt;
      } else {
        list.push({
          id: d.id,
          name: data.name || d.id,
          contactCount: data.contactCount || 0,
          createdAt: data.createdAt || Timestamp.now()
        });
      }
    });
  } catch (e) {
    console.warn("Failed to merge programs list:", e);
  }

  // Ensure Incoming Calls is always in the list
  if (!list.some(p => p.id === INCOMING_PROGRAM_ID || p.name === INCOMING_PROGRAM_NAME)) {
    list.unshift({
      id: INCOMING_PROGRAM_ID,
      name: INCOMING_PROGRAM_NAME,
      isSystem: true,
      contactCount: 0,
      createdAt: Timestamp.now()
    });
  }

  return list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
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
    "_contactrefid", "_mappedfields", "sub program", "subprogram", "ghl_id", "normalizedphone", "isassigned"
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

    // Recompute normalizedPhone safely (without evaluating Firestore delete field token)
    const newPhoneLookup = getCaseInsensitiveProp(contactUpdate, "Phone");
    const newMobileLookup = getCaseInsensitiveProp(contactUpdate, "Mobile");
    const oldPhoneLookup = getCaseInsensitiveProp(contactData, "Phone");
    const oldMobileLookup = getCaseInsensitiveProp(contactData, "Mobile");
    let phoneVal = "";
    if (newPhoneLookup.found && typeof newPhoneLookup.val === "string" && newPhoneLookup.val.trim()) {
      phoneVal = newPhoneLookup.val;
    } else if (newMobileLookup.found && typeof newMobileLookup.val === "string" && newMobileLookup.val.trim()) {
      phoneVal = newMobileLookup.val;
    } else if (oldPhoneLookup.found && typeof oldPhoneLookup.val === "string" && oldPhoneLookup.val.trim()) {
      phoneVal = oldPhoneLookup.val;
    } else if (oldMobileLookup.found && typeof oldMobileLookup.val === "string" && oldMobileLookup.val.trim()) {
      phoneVal = oldMobileLookup.val;
    }
    if (phoneVal) {
      contactUpdate.normalizedPhone = normalizePhone(String(phoneVal));
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

export const normalizePhone = (phone) => {
  if (!phone) return "";
  const cleaned = String(phone).replace(/[\s\-\.\(\)\+]/g, "").trim();
  if (cleaned.length >= 10) {
    return cleaned.slice(-10);
  }
  return cleaned;
};

// Parse a comma-separated tag string into a clean array of individual tag strings
const parseTags = (rawStr) => {
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
    
    // Always ensure normalizedPhone is populated
    const phoneVal = clean.Phone || clean.Mobile || "";
    clean.normalizedPhone = normalizePhone(phoneVal);
    
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

  // Always ensure normalizedPhone is populated
  const phoneVal = clean.Phone || clean.Mobile || "";
  clean.normalizedPhone = normalizePhone(phoneVal);

  return clean;
};

// ─────────────────────────────────────────────
// CONTACTS (MASTER POOL - FLAT DOCUMENT MODEL)
// ─────────────────────────────────────────────
export const importContacts = async (param1, param2, param3, param4 = null) => {
  let tag = param1;
  let rows = param2;
  if (param3 !== undefined) {
    // Old signature: (programId, programName, rows, subPrograms)
    // Here, programName (param2) acts as the tag, and rows (param3) contains the contacts
    tag = param2;
    rows = param3;
  }

  const MAX_BATCH_OPS = 499;
  let imported = 0;
  
  // Track GHL IDs and phone numbers processed in this import to prevent internal duplicates in the Excel/GHL sheet
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

    // Check local duplicate by normalizedPhone
    const phoneVal = cleaned.Phone || cleaned.Mobile || "";
    const norm = normalizePhone(phoneVal);
    if (norm) {
      if (processedPhones.has(norm)) {
        return; // Skip duplicate within the same sheet
      }
      processedPhones.add(norm);
    }
    uniqueRowsToImport.push(cleaned);
  });

  // Query Firestore in batches of 30 to check for existing contacts GLOBALLY by GHL_ID
  const existingContactsByGhl = new Map(); // GHL_ID -> {ref, data}
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
        existingContactsByGhl.set(data.GHL_ID, { ref: docSnap.ref, data });
      }
    });
  }

  // Query Firestore in batches of 30 to check for existing contacts GLOBALLY by normalizedPhone
  const existingContactsByPhone = new Map(); // normalizedPhone -> {ref, data}
  const normPhonesList = Array.from(processedPhones).filter(Boolean);
  for (let i = 0; i < normPhonesList.length; i += 30) {
    const phoneBatch = normPhonesList.slice(i, i + 30);
    const q = query(
      collection(db, "contacts"),
      where("normalizedPhone", "in", phoneBatch)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(docSnap => {
      const data = formatContactDoc(docSnap);
      if (data.normalizedPhone) {
        existingContactsByPhone.set(data.normalizedPhone, { ref: docSnap.ref, data });
      }
    });
  }

  const batchWriteOps = [];

  uniqueRowsToImport.forEach(cleaned => {
    // Find matching existing contact, prioritizing GHL_ID first, then normalizedPhone
    let existing = null;
    if (cleaned.GHL_ID && existingContactsByGhl.has(cleaned.GHL_ID)) {
      existing = existingContactsByGhl.get(cleaned.GHL_ID);
    } else {
      const phoneVal = cleaned.Phone || cleaned.Mobile || "";
      const norm = normalizePhone(phoneVal);
      if (norm && existingContactsByPhone.has(norm)) {
        existing = existingContactsByPhone.get(norm);
      }
    }

    if (existing) {
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
  const progSnap = await getDoc(doc(db, "programs", tag));
  let total = 0;
  if (progSnap.exists()) {
    total = progSnap.data().contactCount || 0;
  }

  // Fetch all contacts containing this tag to compute stats
  const q = query(
    collection(db, "contacts"),
    where("tags", "array-contains", tag)
  );
  const snap = await getDocs(q);
  const docs = snap.docs.map(d => d.data()).filter(d => !d._deleted);
  const totalCount = docs.length;

  const stats = { total: total || totalCount, available: 0, assigned: 0, done: 0, callback_scheduled: 0 };
  let poolAssignedCount = 0;

  docs.forEach(data => {
    if (data.isAssigned) {
      const isFromPool = data.callType !== "incoming" && data.callType !== "incoming f";
      if (isFromPool) poolAssignedCount++;

      if (data._callbackDue || data.callbackDate) {
        stats.callback_scheduled++;
      } else if (!data.status) {
        stats.assigned++;
      } else {
        stats.done++;
      }
    }
  });

  stats.available = Math.max(0, stats.total - poolAssignedCount);
  return stats;
};

// Global Duplicate Detection (checks only assigned contacts)
export const checkGlobalDuplicate = async (phone, excludeContactId = null) => {
  if (!phone) return null;
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const q = query(
    collection(db, "contacts"),
    where("normalizedPhone", "==", norm)
  );
  const snap = await getDocs(q);
  const matches = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d._deleted !== true && d.id !== excludeContactId);
  if (matches.length === 0) return null;

  // Collect all unique tags across every duplicate record
  const allTagsSet = new Set();
  matches.forEach(m => {
    const arr = Array.isArray(m.tags) ? m.tags : [];
    arr.forEach(t => String(t).split(",").map(x => x.trim()).filter(Boolean).forEach(x => allTagsSet.add(x)));
    if (m.Tags) String(m.Tags).split(",").map(x => x.trim()).filter(Boolean).forEach(x => allTagsSet.add(x));
  });

  return {
    count: matches.length,
    allTags: Array.from(allTagsSet).sort(),
    matches: matches,
    first: matches[0],                   // backward-compat
    programName: matches[0]?.programName // backward-compat
  };
};
// ─────────────────────────────────────────────
// ATTENDERS
// ─────────────────────────────────────────────
export const getAttenders = async () => {
  const snap = await getDocs(collection(db, "attenders"));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
};

export const createAttender = async (name) => {
  const ref = await addDoc(collection(db, "attenders"), {
    name,
    isActive: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateAttender = async (id, data) => {
  await updateDoc(doc(db, "attenders", id), data);
};

export const deleteAttender = async (id) => {
  await deleteDoc(doc(db, "attenders", id));
};

// Count how many contacts are currently assigned to this attender (across all programs)
export const getAttenderContactCount = async (attenderId) => {
  const q = query(
    collection(db, "contacts"),
    where("assignedTo", "==", attenderId),
    where("isAssigned", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.filter(d => !d.data()._deleted).length;
};


// ─────────────────────────────────────────────
// QUEUE — Assign N contacts to attender
// ─────────────────────────────────────────────
export const assignContactsToAttender = async (tag, programName, attenderId, attenderName, count, subProgramName = null) => {
  // Query candidate pool containing the selected tag
  // We use a larger limit to ensure we find enough unassigned ones without requiring a composite index
  const q = query(
    collection(db, "contacts"),
    where("tags", "array-contains", tag),
    limit(1000)
  );

  const snap = await getDocs(q);
  if (snap.empty) return 0;

  // Filter client-side for unassigned and non-deleted contacts
  let candidates = snap.docs
    .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter(c => c.isAssigned === false && !c._deleted);

  // Filter client-side by sub-program if provided
  if (subProgramName) {
    candidates = candidates.filter(c => {
      const sp = c["Sub Program"] || c.subProgram || "";
      return sp.trim().toLowerCase() === subProgramName.trim().toLowerCase();
    });
  }

  // Take up to count contacts
  const targetContacts = candidates.slice(0, count);
  if (targetContacts.length === 0) return 0;

  let totalAssigned = 0;

  // Perform updates inside a transaction for thread-safety
  const txResult = await runTransaction(db, async (transaction) => {
    // 1. Perform all reads first
    const freshSnaps = [];
    for (const contact of targetContacts) {
      const freshSnap = await transaction.get(contact.ref);
      freshSnaps.push(freshSnap);
    }

    // 2. Perform all writes next
    let localAssigned = 0;
    for (const freshSnap of freshSnaps) {
      if (!freshSnap.exists()) continue;
      const freshData = freshSnap.data();
      if (freshData.isAssigned === false) {
        transaction.update(freshSnap.ref, {
          isAssigned: true,
          assignedTo: attenderId,
          assignedName: attenderName,
          attenderId: attenderId, // for compatibility
          attenderName: attenderName, // for compatibility
          callType: "outgoing",
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        localAssigned++;
      }
    }
    return localAssigned;
  });

  totalAssigned = txResult || 0;
  return totalAssigned;
};

// ─────────────────────────────────────────────
// CALL LOGS — Attender's Personal Sheet
// ─────────────────────────────────────────────

// Real-time subscription — queries by attenderId only (month-scoped on client)
export const subscribeToCallLogs = (...args) => {
  let tag = null, attenderId = null, callback = null;
  if (args.length === 3) {
    [tag, attenderId, callback] = args;
  } else {
    [attenderId, callback] = args;
  }

  const q = query(
    collection(db, "contacts"),
    where("assignedTo", "==", attenderId)
  );
  return onSnapshot(q, snap => {
    let logs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(log => !log._deleted);

    // Filter by tag client-side if a specific tag is provided
    if (tag && tag !== "ALL") {
      logs = logs.filter(log => Array.isArray(log.tags) && log.tags.includes(tag));
    }
      
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = [];
    const rest = [];
    logs.forEach(log => {
      if (log.callbackDate) {
        const cbDate = log.callbackDate.toDate ? log.callbackDate.toDate() : new Date(log.callbackDate);
        cbDate.setHours(0, 0, 0, 0);
        if (cbDate <= today) {
          overdue.push({ ...log, _callbackDue: true });
          return;
        }
      }
      rest.push(log);
    });
    callback([...overdue, ...rest]);
  }, err => console.error("subscribeToCallLogs error:", err));
};

export const updateCallLog = async (logId, updates, contactId = null) => {
  const contactRef = doc(db, "contacts", logId);
  
  let previousStatus = "";
  try {
    const logSnap = await getDoc(contactRef);
    if (logSnap.exists()) {
      previousStatus = logSnap.data().status || "";
    }
  } catch (e) {
    console.warn("Failed to fetch previous status", e);
  }

  // Update normalizedPhone if phone field is modified
  const phoneFields = ["Phone", "Cont No", "Number", "Mobile", "phone number", "phone", "whatsapp"];
  const updatedPhoneKey = Object.keys(updates).find(k => phoneFields.includes(k) || k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile"));
  if (updatedPhoneKey) {
    updates.normalizedPhone = normalizePhone(updates[updatedPhoneKey]);
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

  // Using setDoc with merge instead of updateDoc bypasses Firebase FieldPath validation, 
  // allowing us to save keys with slashes/dots like "Khoji/ New" from Excel files without crashing.
  await setDoc(contactRef, { ...updates, updatedAt: serverTimestamp() }, { merge: true });

  // If status is "Reg.Done", write to registrations (Abhivyakti Report)
  if (updates.status === "Reg.Done") {
    try {
      const logSnap = await getDoc(contactRef);
      const logData = logSnap.exists() ? logSnap.data() : {};
      
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      // Update registeredYearMonth on the contact document itself in Firestore so we can search/filter server-side
      await updateDoc(contactRef, { registeredYearMonth: yearMonth });

      const payload = {
        ...logData,
        registeredYearMonth: yearMonth,
        registeredAt: serverTimestamp(),
        conversionSource: logData.Source || logData.Sourse || "Direct",
        convertedBy: logData.assignedName || logData.attenderName || updates.assignedName || updates.attenderName || "Unknown",
        programName: logData.programName || updates.programName || "Unknown"
      };

      // Strip out ANY undefined fields because Firebase crashes on exactly 'undefined'
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      // Use setDoc with the logId to gracefully upsert and prevent duplicate entries 
      // if the attender opens and saves the same "Reg.Done" entry multiple times.
      await setDoc(doc(db, "registrations", logId), payload, { merge: true });
      await registerRegistrationMonth(yearMonth);
    } catch (e) {
      console.error("Registration write failed:", e);
    }
  } else if (previousStatus === "Reg.Done" && updates.status && updates.status !== "Reg.Done") {
    try {
      await deleteDoc(doc(db, "registrations", logId));
      // Revert the registeredYearMonth on the contact document too
      await updateDoc(contactRef, { registeredYearMonth: deleteField() });
      console.log("🗑️ Reverted registration deleted for log:", logId);
    } catch (e) {
      console.error("Registration deletion failed on revert:", e);
    }
  }
};

// ────────────────────────────────────────────
// CALL LOGS — Attender's Personal Sheet
// ─────────────────────────────────────────────

// Add a manual incoming or outgoing call entry
export const addIncomingCallLog = async (attenderId, attenderName, data, programId = null, programName = null) => {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const finalProgramName = programName || "Incoming Calls";
  const finalProgramId = programId || "Incoming Calls";

  const tagsSet = new Set();
  (Array.isArray(data.tags) ? data.tags : []).forEach(t => parseTags(String(t)).forEach(x => tagsSet.add(x)));
  if (data.Tags) parseTags(data.Tags).forEach(x => tagsSet.add(x));
  tagsSet.add(finalProgramName);
  const finalTags = Array.from(tagsSet).sort();

  // Never store Tags string — only the array
  const { Tags: _ignored, tags: _ignored2, ...rest } = data;

  const logData = {
    ...rest,
    isAssigned: true,
    assignedTo: attenderId,
    assignedName: attenderName,
    attenderId: attenderId, // compatibility
    attenderName: attenderName, // compatibility
    callType: data.callType || "incoming",
    tags: finalTags,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // compatibility:
    programId: finalProgramId,
    programName: finalProgramName,
    "Sub Program": finalProgramName,
    subProgram: finalProgramName
  };

  if (logData.status === "Reg.Done") {
    logData.registeredYearMonth = yearMonth;
  }

  // Strip out ANY undefined fields
  Object.keys(logData).forEach(key => {
    if (logData[key] === undefined) {
      delete logData[key];
    }
  });

  const phoneVal = logData.Phone || logData["Cont No"] || logData.phone || logData.Number || logData.Mobile || "";
  logData.normalizedPhone = normalizePhone(phoneVal);

  // ── Silent GHL_ID / Existing phone lookup and merge ──────────────────────
  let docRef = null;
  let isExisting = false;
  let existingDocId = null;

  if (logData.normalizedPhone) {
    try {
      const existingSnap = await getDocs(query(
        collection(db, "contacts"),
        where("normalizedPhone", "==", logData.normalizedPhone)
      ));
      if (!existingSnap.empty) {
        // Find the best document to update (e.g. one with GHL_ID, or just the first one)
        let targetDoc = existingSnap.docs[0];
        for (const docSnap of existingSnap.docs) {
          if (docSnap.data().GHL_ID) {
            targetDoc = docSnap;
            break;
          }
        }
        
        isExisting = true;
        existingDocId = targetDoc.id;
        const existingData = targetDoc.data();

        // Copy GHL_ID if any existing contact has one
        if (existingData.GHL_ID) {
          logData.GHL_ID = existingData.GHL_ID;
        }

        // Fill missing profile fields:
        // If the manual entry has a value, we can use it, or if it's empty, use the existing one
        const profileFields = ["Name", "Email", "City", "State", "Source", "Khoji", "Country", "Mobile", "Phone"];
        profileFields.forEach(f => {
          if (!logData[f] && existingData[f]) {
            logData[f] = existingData[f];
          }
        });

        // Merge tags
        const mergedTagsSet = new Set(logData.tags || []);
        const existingTags = Array.isArray(existingData.tags) ? existingData.tags : [];
        existingTags.forEach(t => parseTags(String(t)).forEach(x => mergedTagsSet.add(x)));
        logData.tags = Array.from(mergedTagsSet).sort();

        // Merge history array if both exist
        const existingHistory = Array.isArray(existingData.history) ? existingData.history : [];
        const newHistory = Array.isArray(logData.history) ? logData.history : [];
        const mergedHistory = [...existingHistory];
        newHistory.forEach(h => {
          const isDup = mergedHistory.some(eh => eh.remark === h.remark && eh.status === h.status && eh.timestamp === h.timestamp);
          if (!isDup) {
            mergedHistory.push(h);
          }
        });
        logData.history = mergedHistory;

        // Keep the original createdAt
        if (existingData.createdAt) {
          logData.createdAt = existingData.createdAt;
        }
      }
    } catch (e) {
      console.warn("[addIncomingCallLog] GHL_ID / phone lookup failed:", e);
    }
  }

  if (isExisting && existingDocId) {
    const contactRef = doc(db, "contacts", existingDocId);
    // Remove _deleted flag in case the existing contact was soft-deleted
    await setDoc(contactRef, { ...logData, _deleted: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    docRef = { id: existingDocId };
  } else {
    docRef = await addDoc(collection(db, "contacts"), logData);
  }

  // If status is "Reg.Done", write to registrations (Abhivyakti Report)
  if (logData.status === "Reg.Done") {
    try {
      const payload = {
        ...logData,
        id: docRef.id,
        registeredYearMonth: yearMonth,
        registeredAt: serverTimestamp(),
        conversionSource: logData.Source || logData.Sourse || "Direct",
        convertedBy: attenderName || "Unknown",
        programName: logData.programName || "Incoming Calls"
      };

      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      await setDoc(doc(db, "registrations", docRef.id), payload, { merge: true });
      await registerRegistrationMonth(yearMonth);
    } catch (e) {
      console.error("Incoming registration write failed:", e);
    }
  }

  // Register tag in active tags collection
  await registerActiveTag("Incoming Calls");

  return docRef.id;
};

// Global search contacts by exact phone number, name prefix, or email prefix
export const globalSearchContacts = async (queryStr) => {
  if (!queryStr || !queryStr.trim()) return [];
  const term = queryStr.trim();
  const termLower = term.toLowerCase();

  const queries = [];

  // 1. Search by exact phone match (using normalized form)
  const norm = normalizePhone(term);
  if (norm.length >= 4) {
    queries.push(
      getDocs(
        query(
          collection(db, "contacts"),
          where("normalizedPhone", "==", norm.slice(-10))
        )
      )
    );
  }

  // 2. Search by Name prefix (case-sensitive prefixes)
  if (term.length >= 2) {
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
    // Also try capitalized prefix
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

  // 3. Search by Email prefix
  if (term.includes("@") || term.length >= 3) {
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

    return Array.from(resultsMap.values());
  } catch (e) {
    console.error("Global search failed:", e);
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
      remark: `Lead claimed by ${attenderName} (previously assigned to: ${data.assignedName || "Unassigned"})`
    };
    
    transaction.update(contactRef, {
      isAssigned: true,
      assignedTo: attenderId,
      assignedName: attenderName,
      attenderId: attenderId, // compatibility
      attenderName: attenderName, // compatibility
      callType: "outgoing",
      status: "", // Reset status to let the new attender dial them fresh
      remark: "", // Reset remark
      callbackDate: null, // Reset callback dates
      isCallbackDue: false,
      history: arrayUnion(historyEntry),
      _deleted: deleteField(), // Ensure contact is active/undeleted when claimed
      updatedAt: serverTimestamp()
    });
  });
};

// ─────────────────────────────────────────────
// REASSIGN — Move unworked contacts back to pool
// ─────────────────────────────────────────────
export const reassignContactsToPool = async (tag, attenderId, count, mode = "Pending") => {
  const q = query(
    collection(db, "contacts"),
    where("assignedTo", "==", attenderId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  // Filter client-side by tag and mode/status
  let candidates = snap.docs
    .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter(c => !c._deleted);

  if (tag && tag !== "ALL") {
    candidates = candidates.filter(c => Array.isArray(c.tags) && c.tags.includes(tag));
  }

  if (mode === "Pending") {
    candidates = candidates.filter(c => !c.status);
  } else if (mode === "Callbacks") {
    candidates = candidates.filter(c => !!c.callbackDate);
  }

  // Limit count
  const toProcess = candidates.slice(0, count);
  if (toProcess.length === 0) return 0;

  const batch = writeBatch(db);
  toProcess.forEach(c => {
    batch.update(c.ref, {
      isAssigned: false,
      assignedTo: null,
      assignedName: null,
      attenderId: null,
      attenderName: null,
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
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
    where("assignedTo", "==", fromAttenderId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  // Filter client-side by tag and mode/status
  let candidates = snap.docs
    .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter(c => !c._deleted);

  if (tag && tag !== "ALL") {
    candidates = candidates.filter(c => Array.isArray(c.tags) && c.tags.includes(tag));
  }

  if (mode === "Pending") {
    candidates = candidates.filter(c => !c.status);
  } else if (mode === "Callbacks") {
    candidates = candidates.filter(c => !!c.callbackDate);
  }

  // Limit count
  const toProcess = candidates.slice(0, count);
  if (toProcess.length === 0) return 0;

  const batch = writeBatch(db);
  toProcess.forEach(c => {
    batch.update(c.ref, {
      assignedTo: toAttenderId,
      assignedName: toAttenderName,
      attenderId: toAttenderId,
      attenderName: toAttenderName,
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
  return toProcess.length;
};

// ─────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────
export const subscribeToAllCallLogs = (tag, callback) => {
  const q = query(
    collection(db, "contacts"),
    where("isAssigned", "==", true)
  );

  return onSnapshot(q, snap => {
    let logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Filter client-side by tag
    if (tag && tag !== "ALL") {
      logs = logs.filter(c => Array.isArray(c.tags) && c.tags.includes(tag));
    }
    // Filter out deleted
    logs = logs.filter(c => !c._deleted);
    // Sort client-side to avoid composite index requirement
    logs.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return ta - tb;
    });
    callback(logs);
  }, err => console.error("subscribeToAllCallLogs error:", err));
};

// Get all call logs for any attender (admin view)
export const getAttenderCallLogs = async (attenderId, tag) => {
  const q = query(
    collection(db, "contacts"),
    where("assignedTo", "==", attenderId)
  );
  const snap = await getDocs(q);
  let logs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c._deleted);
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

export const subscribeToRegistrations = (monthYear, callback) => {
  // Query registrations by registeredYearMonth to optimize performance and prevent memory limits
  let q;
  if (monthYear && monthYear !== "ALL") {
    q = query(collection(db, "registrations"), where("registeredYearMonth", "==", monthYear));
  } else {
    q = query(collection(db, "registrations"));
  }
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort descending by registeredAt client-side
    docs.sort((a, b) => {
      const ta = a.registeredAt?.toMillis ? a.registeredAt.toMillis() : 0;
      const tb = b.registeredAt?.toMillis ? b.registeredAt.toMillis() : 0;
      return tb - ta;
    });
    callback(docs);
  }, err => console.error("subscribeToRegistrations error:", err));
};

// ─────────────────────────────────────────────
// EXCEL CLOUD PERSISTENCE
// ─────────────────────────────────────────────


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
