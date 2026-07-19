import {
  collection, addDoc, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, query, where, or,
  serverTimestamp, writeBatch, onSnapshot,
  limit, Timestamp, runTransaction, arrayUnion, arrayRemove, orderBy,
  deleteField, increment, startAfter, documentId
} from "firebase/firestore";
import { db } from "./firebase";
import { isKhojiField } from "./khojiHelper";

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

// Fixed ID for the dedicated "Outgoing Calls" program — never changes
export const OUTGOING_PROGRAM_ID = "outgoing-calls";
export const OUTGOING_PROGRAM_NAME = "Outgoing Calls";

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

// Upsert the Outgoing Calls program document — safe to call multiple times
export const ensureOutgoingProgram = async () => {
  await registerActiveTag("Outgoing Calls");
  const ref = doc(db, "programs", OUTGOING_PROGRAM_ID);
  await setDoc(ref, {
    name: OUTGOING_PROGRAM_NAME,
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

  // Ensure Outgoing Calls is always in the list
  if (!list.some(p => p.id === OUTGOING_PROGRAM_ID || p.name === OUTGOING_PROGRAM_NAME)) {
    list.unshift({
      id: OUTGOING_PROGRAM_ID,
      name: OUTGOING_PROGRAM_NAME,
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
  const parts = String(phoneStr).split(/[\n\/,;&]|\band\b/i);
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

  const stats = { total: total || totalCount, available: 0, assigned: 0, done: 0, callback_scheduled: 0, pending: 0 };
  let poolAssignedCount = 0;

  docs.forEach(data => {
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

// Global Duplicate Detection (checks only assigned contacts)
export const checkGlobalDuplicate = async (phone, excludeContactId = null) => {
  if (!phone) return null;
  const numbersToCheck = extractIndividualPhones(phone);
  if (numbersToCheck.length === 0) return null;
  
  const promises = [];
  numbersToCheck.forEach(norm => {
    promises.push(
      getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm)))
    );
  });
  
  const snaps = await Promise.all(promises);
  
  const matchesMap = new Map();
  snaps.forEach(snap => {
    snap.docs.forEach(d => {
      matchesMap.set(d.id, { id: d.id, ...d.data() });
    });
  });
  
  const matches = Array.from(matchesMap.values())
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
    or(
      where("assignedTo", "==", attenderId),
      where("assignedTo", "array-contains", attenderId)
    ),
    where("isAssigned", "==", true)
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
        localAssigned++;
      }
    }
    return localAssigned;
  });

  totalAssigned = txResult || 0;
  if (totalAssigned > 0) {
    const assignedIds = targetContacts.slice(0, totalAssigned).map(c => c.id);
    await updateCacheContacts(assignedIds);
  }
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
    or(
      where("assignedTo", "==", attenderId),
      where("assignedTo", "array-contains", attenderId)
    )
  );
  return onSnapshot(q, snap => {
    let logs = snap.docs
      .map(d => {
        const rawData = d.data();
        const hasState = rawData.attenderStates && rawData.attenderStates[attenderId] !== undefined;
        const attState = hasState ? rawData.attenderStates[attenderId] : {};
        return {
          id: d.id,
          ...rawData,
          _rawData: rawData, // Preserve the exact un-overlaid document data for badge lookups
          
          // Overlay attender-specific state fields only if they exist, otherwise fall back to top-level/root document values
          status: attState.status !== undefined ? attState.status : (rawData.status || ""),
          remark: attState.remark !== undefined ? attState.remark : (rawData.remark || ""),
          callType: String(attState.callType !== undefined ? attState.callType : (rawData.callType || "outgoing")).toLowerCase(),
          history: attState.history !== undefined ? attState.history : (rawData.history || []),
          callbackDate: attState.callbackDate !== undefined ? attState.callbackDate : (rawData.callbackDate || null),
          callbackStatus: attState.callbackStatus !== undefined ? attState.callbackStatus : (rawData.callbackStatus || ""),
          objectionReason: attState.objectionReason !== undefined ? attState.objectionReason : (rawData.objectionReason || ""),
          lastCalledAt: attState.lastCalledAt !== undefined ? attState.lastCalledAt : (rawData.lastCalledAt || null),
          firstCalledAt: attState.firstCalledAt !== undefined ? attState.firstCalledAt : (rawData.firstCalledAt || null),
          registeredYearMonth: attState.registeredYearMonth !== undefined ? attState.registeredYearMonth : (rawData.registeredYearMonth || null),
          
          // Source and Called For are now attender-specific as well
          Source: attState.Source !== undefined ? attState.Source : (rawData.Source || rawData.Sourse || ""),
          "Called For": attState["Called For"] !== undefined ? attState["Called For"] : (rawData["Called For"] || ""),
          
          attenderId: attenderId,
          attenderName: attState.attenderName || rawData.assignedName || rawData.attenderName || ""
        };
      })
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

export const updateCallLog = async (logId, updates, attenderId = null, attenderName = null) => {
  const contactRef = doc(db, "contacts", logId);
  
  let previousStatus = "";
  let logData = {};
  try {
    const logSnap = await getDoc(contactRef);
    if (logSnap.exists()) {
      logData = logSnap.data();
      if (attenderId && logData.attenderStates?.[attenderId]?.status !== undefined) {
        previousStatus = logData.attenderStates[attenderId].status || "";
      } else {
        previousStatus = logData.status || "";
      }
    }
  } catch (e) {
    console.warn("Failed to fetch previous status", e);
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
    "Source", "Called For"
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
    } else if (previousStatus === "Reg.Done" && attenderSpecificUpdates.status && attenderSpecificUpdates.status !== "Reg.Done") {
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
    if (attenderSpecificUpdates.Source !== undefined) finalUpdatePayload.Source = attenderSpecificUpdates.Source;
    if (attenderSpecificUpdates["Called For"] !== undefined) finalUpdatePayload["Called For"] = attenderSpecificUpdates["Called For"];
    
    // Track who did the last edit
    finalUpdatePayload.lastEditedBy = attenderSpecificUpdates.attenderName;
    finalUpdatePayload.lastEditedAt = new Date().toISOString();

    // Also ensure this attender is in the assignedTo array
    const prevAssigned = Array.isArray(logData.assignedTo)
      ? logData.assignedTo
      : (logData.assignedTo ? [logData.assignedTo] : []);
    if (!prevAssigned.includes(attenderId)) {
      prevAssigned.push(attenderId);
      finalUpdatePayload.assignedTo = prevAssigned;
    }
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
  const batch = writeBatch(db);
  if (Object.keys(rootPayload).length > 0) {
    batch.set(contactRef, rootPayload, { merge: true });
  }
  if (Object.keys(deepUpdates).length > 0) {
    batch.update(contactRef, deepUpdates);
  }
  await batch.commit();

  // Log interaction if status/remark/callType/callbackDate changed
  const hasInteractionUpdate = 
    updates.status !== undefined || 
    updates.remark !== undefined || 
    updates.callType !== undefined ||
    updates.callbackDate !== undefined;

  if (hasInteractionUpdate) {
    const nameKey = Object.keys(logData).find(k => ["name", "lead name", "caller name", "lead"].includes(k.toLowerCase())) 
      || Object.keys(updates).find(k => ["name", "lead name", "caller name", "lead"].includes(k.toLowerCase()));
    const contactName = nameKey ? (updates[nameKey] || logData[nameKey]) : "Unknown";

    await logInteraction({
      contactId: logId,
      contactName,
      programId: logData.programId || updates.programId || "",
      programName: logData.programName || updates.programName || "",
      attenderId: attenderId || logData.attenderId || "unknown",
      attenderName: attenderName || logData.attenderName || "Unknown",
      status: updates.status !== undefined ? updates.status : (attenderId ? (logData.attenderStates?.[attenderId]?.status || "") : (logData.status || "")),
      remark: updates.remark !== undefined ? updates.remark : (attenderId ? (logData.attenderStates?.[attenderId]?.remark || "") : (logData.remark || "")),
      callType: updates.callType !== undefined ? updates.callType : (attenderId ? (logData.attenderStates?.[attenderId]?.callType || "outgoing") : (logData.callType || "outgoing")),
      callbackDate: updates.callbackDate !== undefined ? updates.callbackDate : (attenderId ? (logData.attenderStates?.[attenderId]?.callbackDate || null) : (logData.callbackDate || null))
    });
  }

  // Handle "Reg.Done" registrations collection sync (highly robust, history-driven)
  try {
    const freshSnap = await getDoc(contactRef);
    const freshData = freshSnap.exists() ? freshSnap.data() : null;

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
          if (payload[key] === undefined) {
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
  // Sync to callCenterCache
  await updateCacheContacts([logId]);
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
export const addIncomingCallLog = async (attenderId, attenderName, data, programId = null, programName = null) => {
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
      const snap3 = await getDocs(q3);
      
      const mergedDocs = snap3.docs;
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
  const assignedToSet = new Set(prevAssigned);
  assignedToSet.add(attenderId);
  const newAssignedTo = Array.from(assignedToSet);

  // Initialize or fetch attender-specific state
  const prevStates = isExisting ? (existingData.attenderStates || {}) : {};
  const currentAttState = prevStates[attenderId] || {};
  
  // Create history entry
  const historyEntry = {
    timestamp: new Date().toISOString(),
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
  const updatedStates = {
    ...prevStates,
    [attenderId]: {
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
      lastCalledAt: new Date().toISOString(),
      firstCalledAt: currentAttState.firstCalledAt || new Date().toISOString(),
      attenderName: attenderName,
      updatedAt: new Date().toISOString()
    }
  };

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
    await setDoc(contactRef, { ...logPayload, _deleted: deleteField() }, { merge: true });
    docRef = { id: existingDocId };
  } else {
    docRef = await addDoc(collection(db, "contacts"), logPayload);
  }

  // Log interaction
  await logInteraction({
    contactId: docRef.id,
    contactName: rest.Name || existingData.Name || "Unknown",
    programId: finalProgramId,
    programName: finalProgramName,
    attenderId,
    attenderName,
    status: data.status || "Call Log Added",
    remark: data.remark || "",
    callType: data.callType || "incoming",
    callbackDate: data.callbackDate || null
  });

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
      await registerRegistrationMonth(yearMonth);
    } catch (e) {
      console.error("Incoming registration write failed:", e);
    }
  }

  // Register tag in active tags collection
  await registerActiveTag(finalProgramName);

  await updateCacheContacts([docRef.id]);
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
          where("normalizedPhones", "array-contains", norm)
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
    Phone: c.Phone || c.phone || "",
    tags: c.tags || [],
    programId: c.programId || "",
    programName: c.programName || "",
    Source: c.Source || c.source || "",
    "Called For": c["Called For"] || c.calledFor || "",
    source: c.source || c.Source || "",
    calledFor: c.calledFor || c["Called For"] || "",
    Khoji: c.Khoji || "",
    isAssigned: c.isAssigned === true,
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
        attenderId: h.attenderId || attId || "",
        attenderName: h.attenderName || state.attenderName || "",
        status: h.status || "",
        remark: h.remark || "",
        callType: h.callType || state.callType || "outgoing",
        calledFor: h.calledFor || "",
        source: h.source || ""
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
        updatedAt: state.updatedAt || ""
      };
    });
  }
  return pruned;
};

const getByteSize = (obj) => {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch (e) {
    return JSON.stringify(obj).length;
  }
};

export const rebuildCallCenterCache = async () => {
  const q = query(collection(db, "contacts"), where("isAssigned", "==", true));
  const snap = await getDocs(q);
  const currentMonth = getMonthStr(new Date());
  
  const monthlyData = {};
  
  snap.docs.forEach(d => {
    const data = d.data();
    if (data._deleted) return;
    
    const contactMonths = new Set();
    const createdMonth = getMonthStr(data.createdAt) || currentMonth;
    contactMonths.add(createdMonth);
    
    if (data.attenderStates) {
      Object.values(data.attenderStates).forEach(state => {
        (state.history || []).forEach(h => {
          const hTs = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null;
          const hMonth = getMonthStr(hTs);
          if (hMonth) contactMonths.add(hMonth);
        });
      });
    }
    
    (data.history || []).forEach(h => {
      const hTs = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null;
      const hMonth = getMonthStr(hTs);
      if (hMonth) contactMonths.add(hMonth);
    });
    
    contactMonths.forEach(month => {
      if (!monthlyData[month]) {
        monthlyData[month] = {};
      }
      monthlyData[month][d.id] = pruneContactForCacheForMonth({ id: d.id, ...data }, month);
    });
  });
  
  // Clean up any old cache documents first to prevent orphan monthly documents
  const cacheColl = collection(db, "callCenterCache");
  const cacheSnap = await getDocs(cacheColl);
  
  const batch = writeBatch(db);
  cacheSnap.docs.forEach(d => {
    batch.delete(d.ref);
  });
  
  const cutoffMonth = getCutoffMonth(3);
  Object.entries(monthlyData).forEach(([month, contactsMap]) => {
    if (month < cutoffMonth) return;
    const contactEntries = Object.entries(contactsMap);
    if (contactEntries.length > 0) {
      let partNum = 1;
      let currentPartContacts = {};
      
      contactEntries.forEach(([id, contact]) => {
        const testPart = { contacts: { ...currentPartContacts, [id]: contact } };
        const estimatedSize = getByteSize(testPart);
        
        if (estimatedSize > 850 * 1024 || Object.keys(currentPartContacts).length >= 120) {
          // Commit current part
          batch.set(doc(db, "callCenterCache", `${month}_part${partNum}`), { contacts: currentPartContacts });
          partNum++;
          currentPartContacts = { [id]: contact };
        } else {
          currentPartContacts[id] = contact;
        }
      });
      // Commit the last part
      batch.set(doc(db, "callCenterCache", `${month}_part${partNum}`), { contacts: currentPartContacts });
    } else {
      batch.set(doc(db, "callCenterCache", `${month}_part1`), { contacts: {} });
    }
  });
  
  // Always ensure there is at least one placeholder document in the collection to prevent infinite rebuild loop when empty
  batch.set(doc(db, "callCenterCache", "placeholder"), { isPlaceholder: true });

  await batch.commit();
};

export const updateContactInActiveCache = async (month, contactId, prunedContact) => {
  const cacheColl = collection(db, "callCenterCache");
  const snap = await getDocs(cacheColl);
  
  let targetDoc = null;
  const parts = [];
  
  snap.docs.forEach(d => {
    if (d.id === month || d.id.startsWith(`${month}_part`)) {
      parts.push(d);
      const contacts = d.data().contacts || {};
      if (contacts[contactId]) {
        targetDoc = d;
      }
    }
  });
  
  if (targetDoc) {
    const ref = doc(db, "callCenterCache", targetDoc.id);
    if (prunedContact === null) {
      await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });
    } else {
      // Check if updating in-place exceeds size limit (850 KB)
      const data = targetDoc.data();
      const updatedContacts = { ...data.contacts, [contactId]: prunedContact };
      const newSize = getByteSize({ contacts: updatedContacts });
      
      if (newSize < 850 * 1024 && Object.keys(updatedContacts).length <= 120) {
        await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });
      } else {
        // Exceeds limit! Remove from this part and find another part or create one
        await updateDoc(ref, { [`contacts.${contactId}`]: deleteField() });
        
        let chosenDoc = null;
        let maxPartNum = 0;
        
        parts.forEach(d => {
          if (d.id === targetDoc.id) return;
          
          const match = d.id.match(/_part(\d+)$/);
          if (match) {
            const num = parseInt(match[1]);
            if (num > maxPartNum) maxPartNum = num;
          } else {
            maxPartNum = Math.max(maxPartNum, 1);
          }
          
          const dContacts = d.data().contacts || {};
          const testContacts = { ...dContacts, [contactId]: prunedContact };
          const testSize = getByteSize({ contacts: testContacts });
          if (testSize < 850 * 1024 && Object.keys(testContacts).length <= 120 && !chosenDoc) {
            chosenDoc = d;
          }
        });
        
        if (chosenDoc) {
          const chosenRef = doc(db, "callCenterCache", chosenDoc.id);
          await updateDoc(chosenRef, { [`contacts.${contactId}`]: prunedContact });
        } else {
          const newPartNum = maxPartNum > 0 ? maxPartNum + 1 : 1;
          const newPartId = `${month}_part${newPartNum}`;
          const newRef = doc(db, "callCenterCache", newPartId);
          await setDoc(newRef, {
            contacts: {
              [contactId]: prunedContact
            }
          }, { merge: true });
        }
      }
    }
  } else {
    // Contact doesn't exist in any active cache part
    if (prunedContact === null) return; // Nothing to delete
    
    let chosenDoc = null;
    let maxPartNum = 0;
    
    parts.forEach(d => {
      const match = d.id.match(/_part(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxPartNum) maxPartNum = num;
      } else {
        maxPartNum = Math.max(maxPartNum, 1);
      }
      
      const dContacts = d.data().contacts || {};
      const testContacts = { ...dContacts, [contactId]: prunedContact };
      const testSize = getByteSize({ contacts: testContacts });
      if (testSize < 850 * 1024 && Object.keys(testContacts).length <= 120 && !chosenDoc) {
        chosenDoc = d;
      }
    });
    
    if (chosenDoc) {
      const ref = doc(db, "callCenterCache", chosenDoc.id);
      await updateDoc(ref, { [`contacts.${contactId}`]: prunedContact });
    } else {
      const newPartNum = maxPartNum > 0 ? maxPartNum + 1 : 1;
      const newPartId = `${month}_part${newPartNum}`;
      const ref = doc(db, "callCenterCache", newPartId);
      await setDoc(ref, {
        contacts: {
          [contactId]: prunedContact
        }
      }, { merge: true });
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
      
      if (newSize < 850 * 1024 && Object.keys(updatedContacts).length <= 120) {
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
          if (testSize < 850 * 1024 && Object.keys(testContacts).length <= 120 && !chosenDoc) {
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
      if (testSize < 850 * 1024 && Object.keys(testContacts).length <= 120 && !chosenDoc) {
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

export const updateCacheContacts = async (contactIds) => {
  if (!contactIds || contactIds.length === 0) return;
  
  try {
    // 1. Fetch updated contacts in parallel (no transaction needed)
    const contactPromises = contactIds.map(async (id) => {
      const contactRef = doc(db, "contacts", id);
      const snap = await getDoc(contactRef);
      return { id, snap };
    });
    const contactSnaps = await Promise.all(contactPromises);

    const currentMonth = getMonthStr(new Date());

    // 2. Group cache updates by month
    const monthlyUpdatesMap = {};

    contactSnaps.forEach(({ id, snap }) => {
      const exists = snap.exists();
      const raw = exists ? snap.data() : null;
      const isLive = exists && raw.isAssigned && !raw._deleted;

      const contactMonths = new Set();
      // Even if not live, check history to find months this contact belonged to, so we can clean them up.
      if (raw) {
        const createdMonth = getMonthStr(raw.createdAt) || currentMonth;
        contactMonths.add(createdMonth);

        if (raw.attenderStates) {
          Object.values(raw.attenderStates).forEach(state => {
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
          await updateContactInActiveCache(month, contactId, isDeleteVal ? null : val);
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
    const q = query(collection(db, "contacts"), where("isAssigned", "==", true));
    const liveSnap = await getDocs(q);
    const currentMonth = getMonthStr(new Date());
    
    const liveMonthlyData = {};
    liveSnap.docs.forEach(d => {
      const data = d.data();
      if (data._deleted) return;
      
      const contactMonths = new Set();
      const createdMonth = getMonthStr(data.createdAt) || currentMonth;
      contactMonths.add(createdMonth);
      
      if (data.attenderStates) {
        Object.values(data.attenderStates).forEach(state => {
          (state.history || []).forEach(h => {
            const hTs = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null;
            const hMonth = getMonthStr(hTs);
            if (hMonth) contactMonths.add(hMonth);
          });
        });
      }
      
      (data.history || []).forEach(h => {
        const hTs = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null;
        const hMonth = getMonthStr(hTs);
        if (hMonth) contactMonths.add(hMonth);
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
        
        if (liveC.status !== cacheC.status) {
          mismatches.push(`Month ${month}, Contact ${id} status mismatch: Live "${liveC.status}" vs Cached "${cacheC.status}"`);
        }
        if (liveC.source !== cacheC.source) {
          mismatches.push(`Month ${month}, Contact ${id} source mismatch: Live "${liveC.source}" vs Cached "${cacheC.source}"`);
        }
        if (liveC.calledFor !== cacheC.calledFor) {
          mismatches.push(`Month ${month}, Contact ${id} calledFor mismatch: Live "${liveC.calledFor}" vs Cached "${cacheC.calledFor}"`);
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

  const { startMonth, endMonth } = getMonthRange(targetOption);

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
    
    const contactsMap = {};
    finalDocs.forEach(docSnap => {
      const docContacts = docSnap.data().contacts || {};
      Object.entries(docContacts).forEach(([id, c]) => {
        if (!contactsMap[id]) {
          contactsMap[id] = {
            ...c,
            history: [...(c.history || [])]
          };
        } else {
          const existing = contactsMap[id];
          
          existing.status = c.status;
          existing.remark = c.remark;
          existing.callType = c.callType;
          existing.callbackDate = c.callbackDate;
          existing.isCallbackDue = c.isCallbackDue;
          existing.attenderId = c.attenderId;
          existing.attenderName = c.attenderName;
          existing.lastCalledAt = c.lastCalledAt;
          existing.updatedAt = c.updatedAt;
          
          existing.history = [...(existing.history || []), ...(c.history || [])];
          
          if (c.attenderStates) {
            if (!existing.attenderStates) existing.attenderStates = {};
            Object.entries(c.attenderStates).forEach(([attId, state]) => {
              if (!existing.attenderStates[attId]) {
                existing.attenderStates[attId] = {
                  ...state,
                  history: [...(state.history || [])]
                };
              } else {
                const existingState = existing.attenderStates[attId];
                existingState.status = state.status;
                existingState.remark = state.remark;
                existingState.callType = state.callType;
                existingState.callbackDate = state.callbackDate;
                existingState.lastCalledAt = state.lastCalledAt;
                existingState.firstCalledAt = state.firstCalledAt;
                existingState.updatedAt = state.updatedAt;
                existingState.history = [
                  ...(existingState.history || []),
                  ...(state.history || [])
                ];
              }
            });
          }
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
    
    finalCallback(logs);
  };

  // Fetch the locked monthly reports in range
  const lockedQuery = query(
    collection(db, "lockedMonthlyReports"),
    where(documentId(), ">=", startMonth),
    where(documentId(), "<=", endMonth + "\uf8ff")
  );
  
  getDocs(lockedQuery).then(snap => {
    lockedDocs = snap.docs;
    triggerCallback();
  }).catch(err => {
    console.error("subscribeToAllCallLogs locked fetch error:", err);
    triggerCallback();
  });
  
  // Realtime subscription to cache scoped to the month range using documentId range
  const cacheQuery = query(
    collection(db, "callCenterCache"),
    where(documentId(), ">=", startMonth),
    where(documentId(), "<=", endMonth + "\uf8ff")
  );

  const unsubCache = onSnapshot(cacheQuery, async (snap) => {
    if (snap.empty) {
      console.log(`No cache documents exist for range ${startMonth} to ${endMonth}, checking rebuild...`);
      const currentMonth = getMonthStr(new Date());
      if (endMonth === currentMonth) {
        try {
          await rebuildCallCenterCache();
        } catch (err) {
          console.error("Rebuild cache failed:", err);
        }
      }
      return;
    }
    
    cacheSnap = snap;
    triggerCallback();
  }, err => console.error("subscribeToAllCallLogs cache error:", err));

  return () => {
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

export const subscribeToRegistrations = (scopeOption, callback) => {
  let targetOption = scopeOption;
  let finalCallback = callback;
  if (typeof scopeOption === "function") {
    finalCallback = scopeOption;
    targetOption = getMonthStr(new Date());
  } else if (!targetOption) {
    targetOption = getMonthStr(new Date());
  }

  const { startMonth, endMonth } = getMonthRange(targetOption);

  // Query registrations by registeredYearMonth range to optimize performance
  let q = query(
    collection(db, "registrations"),
    where("registeredYearMonth", ">=", startMonth),
    where("registeredYearMonth", "<=", endMonth)
  );

  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort descending by registeredAt client-side
    docs.sort((a, b) => {
      const ta = a.registeredAt?.toMillis ? a.registeredAt.toMillis() : 0;
      const tb = b.registeredAt?.toMillis ? b.registeredAt.toMillis() : 0;
      return tb - ta;
    });
    finalCallback(docs);
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

export const getSettingsOptions = async () => {
  const docRef = doc(db, "settings", "call_center_options");
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    return {
      statusOptions: data.statusOptions || DEFAULT_STATUS_OPTIONS,
      sourceOptions: data.sourceOptions || DEFAULT_SOURCE_OPTIONS,
      calledForOptions: data.calledForOptions || DEFAULT_CALLED_FOR_OPTIONS
    };
  }
  
  // Create default options if not exists
  const defaults = {
    statusOptions: DEFAULT_STATUS_OPTIONS,
    sourceOptions: DEFAULT_SOURCE_OPTIONS,
    calledForOptions: DEFAULT_CALLED_FOR_OPTIONS
  };
  await setDoc(docRef, defaults, { merge: true });
  return defaults;
};

export const updateCallCenterOptions = async (updates) => {
  const docRef = doc(db, "settings", "call_center_options");
  await setDoc(docRef, updates, { merge: true });
};

export const subscribeToCallCenterOptions = (onUpdate) => {
  const docRef = doc(db, "settings", "call_center_options");
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      onUpdate({
        statusOptions: data.statusOptions || DEFAULT_STATUS_OPTIONS,
        sourceOptions: data.sourceOptions || DEFAULT_SOURCE_OPTIONS,
        calledForOptions: data.calledForOptions || DEFAULT_CALLED_FOR_OPTIONS
      });
    } else {
      // Initialize with defaults if it doesn't exist yet
      const defaults = {
        statusOptions: DEFAULT_STATUS_OPTIONS,
        sourceOptions: DEFAULT_SOURCE_OPTIONS,
        calledForOptions: DEFAULT_CALLED_FOR_OPTIONS
      };
      setDoc(docRef, defaults, { merge: true }).then(() => {
        onUpdate(defaults);
      }).catch(e => {
        console.error("Failed to initialize default settings options:", e);
        onUpdate(defaults);
      });
    }
  });
};

export const logInteraction = async ({
  contactId,
  contactName,
  programId,
  programName,
  attenderId,
  attenderName,
  status,
  remark,
  callType,
  callbackDate = null,
  timestamp = null
}) => {
  try {
    const payload = {
      contactId,
      contactName: contactName || "Unknown",
      programId: programId || "unknown-program",
      programName: programName || "Unknown Program",
      attenderId: attenderId || "unknown-attender",
      attenderName: attenderName || "Unknown Attender",
      status: status || "Pending",
      remark: remark || "",
      callType: callType || "outgoing",
      callbackDate: callbackDate || null,
      timestamp: timestamp || serverTimestamp()
    };
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
    await addDoc(collection(db, "interactions"), payload);
  } catch (e) {
    console.error("Error logging interaction:", e);
  }
};

export const subscribeToInteractions = (programId, callback) => {
  let q = collection(db, "interactions");
  if (programId && programId !== "ALL") {
    q = query(q, where("programId", "==", programId));
  }
  return onSnapshot(q, snap => {
    let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const tb = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return tb - ta;
    });
    callback(list);
  }, err => console.error("subscribeToInteractions error:", err));
};

export const subscribeToRecentRegistrations = (callback) => {
  const q = query(
    collection(db, "registrations"),
    orderBy("registeredAt", "desc"),
    limit(5)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    callback(list);
  }, err => console.error("subscribeToRecentRegistrations error:", err));
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
          
          if (estimatedSize > 850 * 1024 || Object.keys(currentPartContacts).length >= 120) {
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
