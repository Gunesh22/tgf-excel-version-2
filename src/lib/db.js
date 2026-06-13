import {
  collection, addDoc, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, query, where,
  serverTimestamp, writeBatch, onSnapshot,
  limit, Timestamp, runTransaction, arrayUnion, orderBy,
  deleteField
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

// Fixed ID for the dedicated "Incoming Calls" program — never changes
export const INCOMING_PROGRAM_ID = "incoming-calls";
export const INCOMING_PROGRAM_NAME = "Incoming Calls";

// Upsert the Incoming Calls program document — safe to call multiple times
export const ensureIncomingProgram = async () => {
  const ref = doc(db, "programs", INCOMING_PROGRAM_ID);
  await setDoc(ref, {
    name: INCOMING_PROGRAM_NAME,
    isSystem: true,       // marks it as a system/reserved program
    contactCount: 0,
    createdAt: serverTimestamp(),
  }, { merge: true });   // merge:true so we never overwrite existing data
};

export const getPrograms = async () => {
  const snap = await getDocs(collection(db, "programs"));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
};

export const createProgram = async (name) => {
  const ref = await addDoc(collection(db, "programs"), {
    name,
    createdAt: serverTimestamp(),
    contactCount: 0,
  });
  return ref.id;
};

export const deleteProgram = async (id) => {
  await deleteDoc(doc(db, "programs", id));
};

// Read all contacts from all chunks of a program (for field-scanning before remapping)
export const getProgramChunkContacts = async (programId) => {
  const snap = await getDocs(collection(db, "programQueues", programId, "chunks"));
  const allContacts = [];
  snap.docs.forEach(d => {
    const contacts = d.data().contacts || [];
    contacts.forEach(c => allContacts.push(c));
  });
  return allContacts;
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
  const snap = await getDocs(collection(db, "programQueues", programId, "chunks"));
  const INTERNAL_KEYS = ["_contactRefId", "_mappedFields", "Sub Program", "GHL_ID", "normalizedPhone"];
  let totalUpdated = 0;
  const MAX_BATCH = 499;

  const batchWriteOps = [];

  const activeMappedFields = [];
  Object.entries(columnMappings).forEach(([col, target]) => {
    if (col === "Sub Program" || target === "Ignore") return;
    activeMappedFields.push(target);
  });

  snap.docs.forEach(chunkDoc => {
    const rawContacts = chunkDoc.data().contacts || [];
    const remappedContacts = rawContacts.map(contact => {
      const newContact = {};
      const contactMappedFields = [...activeMappedFields];

      // Always carry system/meta keys untouched
      INTERNAL_KEYS.forEach(k => {
        const lookup = getCaseInsensitiveProp(contact, k);
        if (lookup.found) {
          newContact[lookup.key] = lookup.val;
        }
      });

      // Initialize all activeMappedFields to "" by default
      activeMappedFields.forEach(f => {
        newContact[f] = "";
      });

      Object.entries(contact).forEach(([key, val]) => {
        const isInternal = INTERNAL_KEYS.some(k => k.toLowerCase() === key.toLowerCase());
        if (isInternal) return;

        const mappingLookup = getCaseInsensitiveProp(columnMappings, key);
        if (!mappingLookup.found) {
          // Ignore by default!
          return;
        }

        const canonicalKey = mappingLookup.key;
        const target = mappingLookup.val;

        const skipEmptyLookup = getCaseInsensitiveProp(skipEmptySettings, key);
        const skipEmpty = skipEmptyLookup.found ? !!skipEmptyLookup.val : false;
        const strVal = val === null || val === undefined ? "" : String(val).trim();

        if (skipEmpty && !strVal) return;
        if (target === "Ignore") return;

        // Standard target
        if (newContact[target]) {
          newContact[target] = `${newContact[target]} ${strVal}`.trim();
        } else {
          newContact[target] = strVal || val;
        }
      });

      newContact._mappedFields = Array.from(new Set(contactMappedFields));

      // Re-compute normalizedPhone
      const phoneVal = newContact.Phone || newContact.Mobile || "";
      newContact.normalizedPhone = normalizePhone(String(phoneVal));

      return newContact;
    });

    batchWriteOps.push({
      ref: chunkDoc.ref,
      data: { contacts: remappedContacts }
    });
    totalUpdated += rawContacts.length;
  });

  // Query and update existing call logs for this program
  const logsSnap = await getDocs(
    query(collection(db, "callLogs"), where("programId", "==", programId))
  );

  const LOG_SYSTEM_KEYS = new Set([
    "contactid", "programid", "programname", "attenderid", "attendername",
    "calltype", "status", "remark", "callbackdate", "iscallbackdue",
    "createdat", "updatedat", "history", "callbackstatus", "objectionreason",
    "registeredat", "conversionsource", "convertedby", "_callbackdue", "_deleted", "_isnew",
    "_contactrefid", "_mappedfields", "sub program", "subprogram", "ghl_id", "normalizedphone"
  ]);

  const STANDARD_FIELDS = new Set(["Name", "Phone", "Email", "City", "State", "Khoji", "Source", "Tags"]);

  logsSnap.docs.forEach(logDoc => {
    const logData = logDoc.data();
    const logUpdate = {};
    const logMappedFields = [...activeMappedFields];

    // Initialize all active mapped fields to "" if not already present in logData (case-insensitive)
    activeMappedFields.forEach(f => {
      const lookup = getCaseInsensitiveProp(logData, f);
      if (!lookup.found) {
        logUpdate[f] = "";
      }
    });

    Object.entries(logData).forEach(([key, val]) => {
      const keyLower = key.toLowerCase();
      if (LOG_SYSTEM_KEYS.has(keyLower)) return;

      const mappingLookup = getCaseInsensitiveProp(columnMappings, key);
      const strVal = val === null || val === undefined ? "" : String(val).trim();

      if (!mappingLookup.found) {
        // Keep standard fields in mapped fields
        const isStandard = Array.from(STANDARD_FIELDS).some(f => f.toLowerCase() === keyLower);
        if (isStandard) {
          const canonicalStandard = Array.from(STANDARD_FIELDS).find(f => f.toLowerCase() === keyLower);
          logMappedFields.push(canonicalStandard);
        } else {
          // Delete other fields to ignore by default
          logUpdate[key] = deleteField();
        }
        return;
      }

      const canonicalKey = mappingLookup.key;
      const target = mappingLookup.val;
      const skipEmptyLookup = getCaseInsensitiveProp(skipEmptySettings, key);
      const skipEmpty = skipEmptyLookup.found ? !!skipEmptyLookup.val : false;

      if (target === "Ignore" || (skipEmpty && !strVal)) {
        logUpdate[canonicalKey] = deleteField();
        if (key !== canonicalKey) {
          logUpdate[key] = deleteField();
        }
        const idx = logMappedFields.indexOf(target);
        if (idx !== -1) logMappedFields.splice(idx, 1);
        return;
      }

      logUpdate[target] = strVal || val;
      if (key !== target) {
        logUpdate[key] = deleteField();
      }
    });

    logUpdate._mappedFields = Array.from(new Set(logMappedFields));

    // Recompute normalizedPhone safely (without evaluating Firestore delete field token)
    const newPhoneLookup = getCaseInsensitiveProp(logUpdate, "Phone");
    const newMobileLookup = getCaseInsensitiveProp(logUpdate, "Mobile");
    const oldPhoneLookup = getCaseInsensitiveProp(logData, "Phone");
    const oldMobileLookup = getCaseInsensitiveProp(logData, "Mobile");
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
      logUpdate.normalizedPhone = normalizePhone(String(phoneVal));
    }

    batchWriteOps.push({
      ref: logDoc.ref,
      data: logUpdate
    });
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


// ─────────────────────────────────────────────
// CONTACTS (MASTER POOL - CHUNKED FOR FREE TIER)
// ─────────────────────────────────────────────

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
      Source: "",
      Tags: ""
    };
    if (row["Sub Program"] !== undefined) {
      clean["Sub Program"] = row["Sub Program"];
    }
    if (row.GHL_ID !== undefined) {
      clean.GHL_ID = row.GHL_ID;
    }
    row._mappedFields.forEach(field => {
      if (["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Source", "Tags"].includes(field)) {
        clean[field] = row[field] !== undefined && row[field] !== null ? String(row[field]) : "";
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
    Source: "",
    Tags: ""
  };
  
  if (row["Sub Program"] !== undefined) {
    clean["Sub Program"] = row["Sub Program"];
  }

  const mappedFields = [];

  // Parse standard fields (by matching lowercase keys)
  Object.entries(row).forEach(([key, val]) => {
    const k = key.trim().toLowerCase();
    const strVal = val === null || val === undefined ? "" : String(val).trim();
    if (!strVal) return;
    
    if (["name", "caller", "caller name", "lead name", "lead", "name of caller"].includes(k) || k === "first name" || k === "last name") {
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
      clean.Tags = strVal;
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
// CONTACTS (MASTER POOL - CHUNKED FOR FREE TIER)
// ─────────────────────────────────────────────
export const importContacts = async (programId, programName, rows, subPrograms = null) => {
  // Free tier massively limits writes (20k/day).
  // We chunk contacts into a SINGLE document up to 800 KB (maximum 500 contacts per chunk). 
  // An Excel sheet of 20,000 rows only uses 40 database writes!
  const MAX_BATCH_OPS = 499; // L5 fix: Firebase limit is 500 ops per batch, reserve 1 for parent doc
  const maxDocSizeBytes = 800000; // 800 KB limit for safety (Firestore doc limit is 1 MB)
  const maxContactsPerChunk = 500;
  let imported = 0;
  const queueIndexOffset = Date.now();

  // Load all existing callLogs for this program to check duplicates and merge fields
  const logsSnap = await getDocs(
    query(collection(db, "callLogs"), where("programId", "==", programId))
  );
  const assignedLogs = new Map(); // normalizedPhone -> { ref, data }
  logsSnap.docs.forEach(d => {
    const data = d.data();
    if (data._deleted) return;
    const phoneVal = data.Phone || data.Mobile || "";
    const norm = normalizePhone(phoneVal);
    if (norm) {
      assignedLogs.set(norm, { ref: d.ref, data });
    }
  });

  // Track phone numbers processed in this import to prevent internal duplicates
  const processedPhones = new Set();
  const logsToUpdate = [];

  // Group rows by sub-program to prevent chunk starvation
  const rowsBySub = {};
  rows.forEach(r => {
    const sp = r["Sub Program"] || "";
    if (!rowsBySub[sp]) rowsBySub[sp] = [];
    rowsBySub[sp].push(r);
  });

  // Build all chunk operations first using dynamic size-based chunking
  const chunkOps = [];
  let rowOffset = 0;
  
  Object.keys(rowsBySub).forEach(sp => {
    const spRows = rowsBySub[sp];
    let currentChunkContacts = [];
    let currentChunkSize = 0;

    spRows.forEach((r, idx) => {
      const cleaned = cleanImportRow(r);
      const phoneVal = cleaned.Phone || cleaned.Mobile || "";
      const norm = normalizePhone(phoneVal);

      if (norm) {
        // 1. If it's already assigned, update its fields and skip adding to chunk
        if (assignedLogs.has(norm)) {
          const existing = assignedLogs.get(norm);
          const updatePayload = {};
          let needsUpdate = false;

          Object.entries(cleaned).forEach(([k, val]) => {
            if (k.startsWith("_") && k !== "_mappedFields") return;
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

          if (needsUpdate) {
            logsToUpdate.push({ ref: existing.ref, data: updatePayload });
            Object.assign(existing.data, updatePayload); // Update cache
          }
          return; // Skip adding to chunk queue
        }

        // 2. If it's a duplicate within the same Excel sheet, skip it
        if (processedPhones.has(norm)) {
          return;
        }
        processedPhones.add(norm);
      }

      const contactObj = {
        ...cleaned,
        _contactRefId: `C_${queueIndexOffset}_${rowOffset}`, // Unique virtual ID
      };
      rowOffset++;

      const serializedLength = encodeURIComponent(JSON.stringify(contactObj)).length;

      // Split chunk if it exceeds either size limit or max contact count
      if (
        currentChunkContacts.length > 0 && 
        (currentChunkSize + serializedLength > maxDocSizeBytes || currentChunkContacts.length >= maxContactsPerChunk)
      ) {
        chunkOps.push({
          chunkIndex: queueIndexOffset + (rowOffset - currentChunkContacts.length - 1),
          subProgram: sp,
          contacts: currentChunkContacts,
          count: currentChunkContacts.length
        });
        currentChunkContacts = [contactObj];
        currentChunkSize = serializedLength;
      } else {
        currentChunkContacts.push(contactObj);
        currentChunkSize += serializedLength;
      }
    });

    if (currentChunkContacts.length > 0) {
      chunkOps.push({
        chunkIndex: queueIndexOffset + (rowOffset - currentChunkContacts.length),
        subProgram: sp,
        contacts: currentChunkContacts,
        count: currentChunkContacts.length
      });
    }
  });

  // Split into multiple batches to respect Firebase's 500 ops/batch limit
  // First, write the callLog updates
  for (let i = 0; i < logsToUpdate.length; i += MAX_BATCH_OPS) {
    const batch = writeBatch(db);
    const slice = logsToUpdate.slice(i, i + MAX_BATCH_OPS);
    slice.forEach(op => {
      batch.update(op.ref, op.data);
    });
    await batch.commit();
  }

  // Second, write the queue chunks
  for (let batchStart = 0; batchStart < chunkOps.length; batchStart += MAX_BATCH_OPS) {
    const batch = writeBatch(db);
    const batchSlice = chunkOps.slice(batchStart, batchStart + MAX_BATCH_OPS);

    batchSlice.forEach(op => {
      const ref = doc(collection(db, "programQueues", programId, "chunks"));
      batch.set(ref, { chunkIndex: op.chunkIndex, subProgram: op.subProgram, contacts: op.contacts });
      imported += op.count;
    });

    // Ensure the parent document exists so the subcollection is visible in the Firebase Console
    batch.set(doc(db, "programQueues", programId), {
      programName,
      lastImportedAt: serverTimestamp(),
    }, { merge: true });

    await batch.commit();
  }

  // Update total program stat
  const progRef = doc(db, "programs", programId);
  const progSnap = await getDoc(progRef);
  if (progSnap.exists()) {
    const updateData = { contactCount: (progSnap.data().contactCount || 0) + imported };
    if (subPrograms && subPrograms.length > 0) {
      updateData.subPrograms = arrayUnion(...subPrograms);
    }
    await updateDoc(progRef, updateData);
  }

  return imported;
};

export const getProgramContactStats = async (programId) => {
  // Free tier compatible chunk-based stats calculations.
  // We query callLogs to calculate status distribution.
  const progSnap = await getDoc(doc(db, "programs", programId));
  let total = 0;
  if (progSnap.exists()) {
    total = progSnap.data().contactCount || 0;
  }

  const logsSnap = await getDocs(query(collection(db, "callLogs"), where("programId", "==", programId)));
  const stats = { total, available: 0, assigned: 0, done: 0, callback_scheduled: 0 };
  let poolAssignedCount = 0; // B5 fix: Only pool-originated entries reduce "available"

  logsSnap.docs.forEach(d => {
    const data = d.data();
    if (data._deleted) return; // B5 fix: Skip soft-deleted entries
    // Only outgoing (pool-originated) calls reduce the available count — incoming calls are added manually
    const isFromPool = data.callType !== "incoming" && data.callType !== "incoming f";
    if (isFromPool) poolAssignedCount++;
    if (data._callbackDue || data.callbackDate) {
      stats.callback_scheduled++;
    } else if (!data.status) {
      stats.assigned++;
    } else {
      stats.done++;
    }
  });

  stats.available = Math.max(0, total - poolAssignedCount);
  return stats;
};

// Global Duplicate Detection (Now checks ONLY assigned numbers and registrations, instead of the 50k queued chunk pool)
export const checkGlobalDuplicate = async (phone, excludeContactId = null) => {
  if (!phone) return null;
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const q = query(
    collection(db, "callLogs"),
    where("normalizedPhone", "==", norm)
  );
  const snap = await getDocs(q);
  const matches = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d._deleted !== true && d.contactId !== excludeContactId && d.id !== excludeContactId);
  return matches.length > 0 ? matches[0] : null;
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

// ─────────────────────────────────────────────
// QUEUE — Assign N contacts to attender
// ─────────────────────────────────────────────
export const assignContactsToAttender = async (programId, programName, attenderId, attenderName, count, subProgramName = null) => {
  // 1. Fetch chunks from the queue
  let q;
  if (subProgramName) {
    q = query(
      collection(db, "programQueues", programId, "chunks"),
      where("subProgram", "==", subProgramName),
      limit(5)
    );
  } else {
    q = query(
      collection(db, "programQueues", programId, "chunks"),
      limit(5)
    );
  }
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const chunks = snap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }));
  chunks.sort((a, b) => (a.data.chunkIndex || 0) - (b.data.chunkIndex || 0));

  // 2. Gather all phone numbers from the loaded chunks to check duplicate assignment
  const chunkPhones = [];
  chunks.forEach(chunk => {
    const pool = chunk.data.contacts || [];
    pool.forEach(contact => {
      const phone = contact.Phone || contact["Cont No"] || contact.phone || contact.Number || contact.Mobile || "";
      const norm = normalizePhone(phone);
      if (norm) chunkPhones.push(norm);
    });
  });

  const assignedLogs = new Map(); // normalizedPhone -> { ref, data }
  if (chunkPhones.length > 0) {
    // Slice into batches of 30 due to Firestore "in" query limitation
    const batches = [];
    const uniqueChunkPhones = Array.from(new Set(chunkPhones));
    for (let i = 0; i < uniqueChunkPhones.length; i += 30) {
      batches.push(uniqueChunkPhones.slice(i, i + 30));
    }

    const queries = batches.map(batch =>
      getDocs(query(
        collection(db, "callLogs"),
        where("normalizedPhone", "in", batch)
      ))
    );

    const snaps = await Promise.all(queries);
    snaps.forEach(snap => {
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data._deleted) return;
        const norm = data.normalizedPhone;
        if (norm) {
          // Prefer storing/updating the callLog that matches the current programId
          const existing = assignedLogs.get(norm);
          if (!existing || data.programId === programId) {
            assignedLogs.set(norm, { ref: doc.ref, data });
          }
        }
      });
    });
  }

  let totalAssigned = 0;
  const now = Timestamp.now();
  let remainingNeed = count;
  const sessionAssigned = new Set();

  for (const chunk of chunks) {
    if (remainingNeed <= 0) break;

    const txResult = await runTransaction(db, async (transaction) => {
      const freshSnap = await transaction.get(chunk.ref);
      if (!freshSnap.exists()) return 0;

      const freshData = freshSnap.data();
      const pool = freshData.contacts || [];
      if (pool.length === 0) {
        transaction.delete(chunk.ref);
        return 0;
      }

      // Filter out duplicates from the pool
      const unique = [];
      const skipped = [];
      for (const contact of pool) {
        if (subProgramName && contact["Sub Program"] !== subProgramName) {
          skipped.push(contact); // wrong sub-program, skip it
          continue;
        }

        const phone = contact.Phone || contact["Cont No"] || contact.phone || contact.Number || contact.Mobile || "";
        const norm = normalizePhone(phone);
        if (norm) {
          // 1. If it's already assigned, discard from chunk and merge fields if matching current program
          if (assignedLogs.has(norm)) {
            const existing = assignedLogs.get(norm);
            if (existing.data.programId === programId) {
              const updatePayload = {};
              let needsUpdate = false;

              Object.entries(contact).forEach(([k, val]) => {
                if (k.startsWith("_") && k !== "_mappedFields") return;
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
              const contactMapped = contact._mappedFields || [];
              const combinedMapped = Array.from(new Set([...existingMapped, ...contactMapped]));
              if (combinedMapped.length > existingMapped.length) {
                updatePayload._mappedFields = combinedMapped;
                needsUpdate = true;
              }

              if (needsUpdate) {
                transaction.update(existing.ref, updatePayload);
                Object.assign(existing.data, updatePayload); // Update cache
              }
            }
            continue; // Skip entirely (discarded from queue chunk leftovers)
          }

          // 2. If it was already assigned in this current batch run, discard from chunk leftovers
          if (sessionAssigned.has(norm)) {
            continue;
          }
        }

        unique.push(contact);
      }

      // Take what we need from unique contacts
      const takeCount = Math.min(remainingNeed, unique.length);
      const taken = unique.slice(0, takeCount);
      const leftovers = [...unique.slice(takeCount), ...skipped];

      if (leftovers.length === 0) {
        transaction.delete(chunk.ref);
      } else {
        transaction.update(chunk.ref, { contacts: leftovers });
      }

      // Create individual log rows for attender
      taken.forEach(contact => {
        const logRef = doc(collection(db, "callLogs"));
        const payload = {
          contactId: contact._contactRefId || null,
          programId,
          programName,
          attenderId,
          attenderName,
          callType: "outgoing",
          ...Object.fromEntries(
            Object.entries(contact).filter(([k]) => !k.startsWith("_") || k === "_mappedFields")
          ),
          status: "",
          remark: "",
          callbackDate: null,
          isCallbackDue: false,
          createdAt: now,
          updatedAt: now,
        };
        const phoneVal = payload.Phone || payload["Cont No"] || payload.phone || payload.Number || payload.Mobile || "";
        const normVal = normalizePhone(phoneVal);
        payload.normalizedPhone = normVal;

        if (subProgramName) {
          payload["Sub Program"] = subProgramName;
          payload["subProgram"] = subProgramName;
        }
        transaction.set(logRef, payload);
        
        if (normVal) {
          sessionAssigned.add(normVal);
        }
      });

      // Return the count so mutation happens OUTSIDE the transaction callback
      // (transaction callbacks can be retried, mutating outer vars inside would double-count)
      return takeCount;
    });

    // Safe to mutate here — outside the retryable transaction body
    totalAssigned += txResult || 0;
    remainingNeed -= txResult || 0;
  }

  return totalAssigned;
};

// ─────────────────────────────────────────────
// CALL LOGS — Attender's Personal Sheet
// ─────────────────────────────────────────────

// Real-time subscription — queries by attenderId only (month-scoped on client)
export const subscribeToCallLogs = (attenderId, callback) => {
  // No limit here — limiting without orderBy causes newly assigned contacts
  // to fall outside the window and never appear in the snapshot.
  const q = query(
    collection(db, "callLogs"),
    where("attenderId", "==", attenderId)
  );
  return onSnapshot(q, snap => {
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  });
};

export const updateCallLog = async (logId, updates, contactId = null) => {
  const logRef = doc(db, "callLogs", logId);
  
  let previousStatus = "";
  try {
    const logSnap = await getDoc(logRef);
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

  // Using setDoc with merge instead of updateDoc bypasses Firebase FieldPath validation, 
  // allowing us to save keys with slashes/dots like "Khoji/ New" from Excel files without crashing.
  await setDoc(logRef, { ...updates, updatedAt: serverTimestamp() }, { merge: true });

  // 1. If linked to a master contact, sync Name/Phone/City etc back to the master record
  if (contactId) {
    try {
      const contactRef = doc(db, "contacts", contactId);
      // We only sync specific user-editable fields back to master
      // This prevents program-specific data from polluting the general contact record
      const syncableKeys = ["Name", "Phone", "City", "Source", "Email", "Sourse", "Khoji", "Location", "Number", "Cont No", "Cont_No"];
      const masterUpdate = {};
      Object.keys(updates).forEach(k => {
        if (syncableKeys.some(sk => k.toLowerCase().includes(sk.toLowerCase()))) {
          masterUpdate[k] = updates[k];
        }
      });
      if (Object.keys(masterUpdate).length > 0) {
        await setDoc(contactRef, { ...masterUpdate, updatedAt: serverTimestamp() }, { merge: true });
      }
    } catch (e) { console.warn("Sync back to master failed for contactId:", contactId); }
  }

  // 2. If status is "Reg.Done", write to registrations (Abhivyakti Report)
  if (updates.status === "Reg.Done") {
    try {
      const logSnap = await getDoc(logRef);
      const logData = logSnap.exists() ? logSnap.data() : {};

      const payload = {
        ...logData,
        registeredAt: serverTimestamp(),
        conversionSource: logData.Source || logData.Sourse || "Direct",
        convertedBy: logData.attenderName || updates.attenderName || "Unknown",
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
    } catch (e) {
      console.error("Registration write failed:", e);
      // NOTE: Errors here are tracked but shouldn't fail the initial save
    }
  } else if (previousStatus === "Reg.Done" && updates.status && updates.status !== "Reg.Done") {
    try {
      await deleteDoc(doc(db, "registrations", logId));
      console.log("🗑️ Reverted registration deleted for log:", logId);
    } catch (e) {
      console.error("Registration deletion failed on revert:", e);
    }
  }
};

// ────────────────────────────────────────────
// CALL LOGS — Attender's Personal Sheet
// ─────────────────────────────────────────────

// Add a manual incoming call entry — programId/programName are optional (null for general incoming)
export const addIncomingCallLog = async (attenderId, attenderName, data, programId = null, programName = null) => {
  const logData = {
    contactId: null,
    programId,
    programName,
    attenderId,
    attenderName,
    callType: "incoming",
    status: "",
    remark: "",
    callbackDate: null,
    isCallbackDue: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...data,
  };

  const phoneVal = logData.Phone || logData["Cont No"] || logData.phone || logData.Number || logData.Mobile || "";
  logData.normalizedPhone = normalizePhone(phoneVal);

  const docRef = await addDoc(collection(db, "callLogs"), logData);

  // If status is "Reg.Done", write to registrations (Abhivyakti Report)
  if (logData.status === "Reg.Done") {
    try {
      const payload = {
        ...logData,
        registeredAt: serverTimestamp(),
        conversionSource: logData.Source || logData.Sourse || "Direct",
        convertedBy: logData.attenderName || "Unknown",
        programName: logData.programName || "Unknown"
      };

      // Strip out ANY undefined fields
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      // Upsert using the generated call log id
      await setDoc(doc(db, "registrations", docRef.id), payload, { merge: true });
    } catch (e) {
      console.error("Incoming registration write failed:", e);
    }
  }

  return docRef.id;
};

// ─────────────────────────────────────────────
// REASSIGN — Move unworked contacts back to pool
// ─────────────────────────────────────────────
export const reassignContactsToPool = async (attenderId, programId) => {
  const q = query(
    collection(db, "callLogs"),
    where("attenderId", "==", attenderId),
    where("programId", "==", programId),
    where("status", "==", "")
  );
  const snap = await getDocs(q);

  if (snap.empty) return 0;

  const batch = writeBatch(db);
  const leftoverContacts = [];

  for (const logDoc of snap.docs) {
    const data = logDoc.data();
    batch.delete(doc(db, "callLogs", logDoc.id));

    // Extract raw contact data back to object
    const rawContact = Object.fromEntries(
      Object.entries(data).filter(([k]) =>
        !["contactId", "programId", "programName", "attenderId", "attenderName", "callType", "status", "remark",
          "callbackDate", "isCallbackDue", "isHotLead", "createdAt", "updatedAt", "_callbackDue", "_deleted",
          "lastCalledAt", "firstCalledAt", "history", "callbackStatus", "callCount", "registeredAt",
          "conversionSource", "convertedBy"].includes(k)
      )
    );
    // B6 fix: Regenerate _contactRefId so future duplicate detection works correctly
    rawContact._contactRefId = `C_${Date.now()}_${leftoverContacts.length}`;
    leftoverContacts.push(rawContact);
  }

  // Push the unworked records back into the queue collection as fresh chunks
  if (leftoverContacts.length > 0) {
    const maxDocSizeBytes = 800000; // 800 KB limit for safety
    let currentChunkContacts = [];
    let currentChunkSize = 0;
    const chunkIndexOffset = Date.now();

    leftoverContacts.forEach((contactObj, idx) => {
      const serializedLength = encodeURIComponent(JSON.stringify(contactObj)).length;

      if (currentChunkContacts.length > 0 && currentChunkSize + serializedLength > maxDocSizeBytes) {
        const ref = doc(collection(db, "programQueues", programId, "chunks"));
        batch.set(ref, {
          chunkIndex: chunkIndexOffset + idx,
          contacts: currentChunkContacts
        });
        currentChunkContacts = [contactObj];
        currentChunkSize = serializedLength;
      } else {
        currentChunkContacts.push(contactObj);
        currentChunkSize += serializedLength;
      }
    });

    if (currentChunkContacts.length > 0) {
      const ref = doc(collection(db, "programQueues", programId, "chunks"));
      batch.set(ref, {
        chunkIndex: chunkIndexOffset + leftoverContacts.length,
        contacts: currentChunkContacts
      });
    }
  }

  await batch.commit();
  return leftoverContacts.length;
};

// ─────────────────────────────────────────────
// REASSIGN — Move contacts between attenders
// ─────────────────────────────────────────────
export const reassignContactsBetweenAttenders = async (fromAttenderId, toAttenderId, toAttenderName, programId) => {
  const q = query(
    collection(db, "callLogs"),
    where("attenderId", "==", fromAttenderId),
    where("programId", "==", programId),
    where("status", "==", "")
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    batch.update(doc(db, "callLogs", d.id), {
      attenderId: toAttenderId,
      attenderName: toAttenderName,
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
  return snap.docs.length;
};

// ─────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────
export const subscribeToAllCallLogs = (programId, callback) => {
  let q;
  if (programId && programId !== "ALL") {
    q = query(collection(db, "callLogs"), where("programId", "==", programId));
  } else {
    q = query(collection(db, "callLogs"));
  }

  return onSnapshot(q, snap => {
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
export const getAttenderCallLogs = async (attenderId, programId) => {
  const q = query(
    collection(db, "callLogs"),
    where("attenderId", "==", attenderId),
    where("programId", "==", programId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// Get all call logs for an entire program (for Excel export)
export const getProgramCallLogs = async (programId) => {
  const q = query(
    collection(db, "callLogs"),
    where("programId", "==", programId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─────────────────────────────────────────────
// ABHIVYAKTI REPORT
// ─────────────────────────────────────────────
export const subscribeToRegistrations = (programId, callback) => {
  // Avoid server-side orderBy to prevent composite index errors — sort client-side
  let q;
  if (programId && programId !== "ALL") {
    q = query(collection(db, "registrations"), where("programId", "==", programId));
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
