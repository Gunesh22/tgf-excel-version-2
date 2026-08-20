import {
  collection, addDoc, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, query, where, or, and,
  serverTimestamp, writeBatch, onSnapshot,
  limit, Timestamp, runTransaction, arrayUnion, arrayRemove, orderBy,
  deleteField, increment, startAfter, documentId, getCountFromServer
} from "firebase/firestore";
import { db } from "./firebase.js";
import { isKhojiField } from "./khojiHelper.js";




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

const registeredTagsCache = new Set();

export const registerActiveTag = async (tag) => {
  if (!tag) return;
  const cleanTag = tag.trim();
  if (!cleanTag || registeredTagsCache.has(cleanTag)) return;
  registeredTagsCache.add(cleanTag);
  try {
    await setDoc(doc(db, "activeTags", cleanTag), {
      name: cleanTag,
      createdAt: serverTimestamp()
    }, { merge: true });
    console.log("%c⚡ [FIRESTORE WRITE - Active Tag]", "background: #701a75; color: #f0abfc; font-weight: bold; padding: 2px 6px; border-radius: 4px;", `Registered tag in "activeTags": ${cleanTag}`);
  } catch (e) {
    registeredTagsCache.delete(cleanTag);
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

      // Rule 1: Identical non-empty remarks logged within 30 minutes of each other (or unknown timestamp)
      if (itemRemark && exRemark && itemRemark === exRemark) {
        if (isTimeUnknown || timeDiff < 1800000) return true;
      }

      // Rule 2: Same status logged within 3 minutes of each other
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

// Fixed ID for the dedicated "Incoming Calls" program — never changes
export const INCOMING_PROGRAM_ID = "incoming-calls";
export const INCOMING_PROGRAM_NAME = "Incoming Calls";

// Fixed ID for the dedicated "Outgoing Calls" program — never changes
export const OUTGOING_PROGRAM_ID = "outgoing-calls";
export const OUTGOING_PROGRAM_NAME = "Outgoing Calls";

let incomingProgramEnsured = false;
let outgoingProgramEnsured = false;

// Upsert the Incoming Calls program document — safe to call multiple times
export const ensureIncomingProgram = async () => {
  if (incomingProgramEnsured) return;
  incomingProgramEnsured = true;
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
  if (outgoingProgramEnsured) return;
  outgoingProgramEnsured = true;
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

// Global Duplicate Detection (checks only assigned contacts)
export const checkGlobalDuplicate = async (phone, excludeContactId = null) => {
  if (!phone) return null;
  const numbersToCheck = extractIndividualPhones(phone);
  if (numbersToCheck.length === 0) return null;
  
  const promises = [];
  console.log(`[FIRESTORE READ - checkGlobalDuplicate] Querying 'contacts' collection | variations: ${numbersToCheck.join(", ")} | queriesCount: ${numbersToCheck.length}`);
  numbersToCheck.forEach(norm => {
    promises.push(
      getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm)))
    );
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
// ATTENDERS & AUTH PASSWORDS
// ─────────────────────────────────────────────
export const generateRandomPassword = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const getAttenders = async () => {
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

  return docs.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
};

export const createAttender = async (name, customPassword = null) => {
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
  const payload = typeof data === "string" ? { name: data } : data;
  await updateDoc(doc(db, "attenders", id), payload);
};

export const deleteAttender = async (id) => {
  await deleteDoc(doc(db, "attenders", id));
};

export const getAdminPassword = async () => {
  try {
    const adminDocRef = doc(db, "settings", "admin_auth");
    const snap = await getDoc(adminDocRef);
    if (snap.exists() && snap.data().password) {
      return snap.data().password;
    }
    // Default admin password if none set
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
  await setDoc(adminDocRef, { password: String(newPassword).trim(), updatedAt: serverTimestamp() }, { merge: true });
};


// Count how many contacts are currently assigned to this attender (across all programs)
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

// Global Active Snapshot Listeners Registry (Singleton Pattern per attender)
const activeSnapshotRegistry = {};

// Real-time subscription — queries by attenderId (Stale-While-Revalidate: Instant 0ms IndexedDB load + background real-time sync)
export const subscribeToCallLogs = (...args) => {
  let tag = null, attenderId = null, attenderName = null, callback = null;
  if (typeof args[args.length - 1] === "function") {
    callback = args.pop();
  }
  if (args.length === 1) {
    attenderId = args[0];
  } else if (args.length === 2) {
    attenderId = args[0];
    if (typeof args[1] === "string" && args[1].length > 0) {
      attenderName = args[1];
    }
  } else if (args.length >= 3) {
    tag = args[0];
    attenderId = args[1];
    attenderName = args[2];
  }

  const cacheKey = `tgf_attender_logs_${attenderId}`;
  const registryKey = `${attenderId || 'global'}_${attenderName || 'global'}`;

  // 1. Immediately emit cached logs from IndexedDB (0ms UI load, zero delay)
  if (attenderId) {
    getIDBCache(cacheKey).then(cachedLogs => {
      if (Array.isArray(cachedLogs) && cachedLogs.length > 0) {
        console.log(`[LOCAL CACHE INSTANT LOAD] Served ${cachedLogs.length} leads from IndexedDB for ${attenderId}`);
        let filtered = cachedLogs;
        if (tag && tag !== "ALL") {
          filtered = cachedLogs.filter(log => Array.isArray(log.tags) && log.tags.includes(tag));
        }
        if (callback) callback(filtered);
      }
    }).catch(err => {
      console.warn("Failed to load attender logs from IndexedDB:", err);
    });
  }

  // 2. Reuse active global snapshot listener if already attached for this attender
  if (!activeSnapshotRegistry[registryKey]) {
    activeSnapshotRegistry[registryKey] = {
      subscribers: new Map(),
      unsub: null,
      lastEmittedLogs: null
    };

    const now = new Date();
    const prev2Date = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prev2MonthStr = `${prev2Date.getFullYear()}-${String(prev2Date.getMonth() + 1).padStart(2, "0")}`;

    const cacheQuery = query(
      collection(db, "callCenterCache"),
      where(documentId(), ">=", prev2MonthStr)
    );

    const listenerId = `callCenterCache_monthly_partitions_${registryKey}`;
    const targetQueryStr = `collection("callCenterCache").where(documentId() >= "${prev2MonthStr}")`;

    const unsubFirestore = onSnapshot(cacheQuery, snap => {
      console.log(
        "%c📡 [SNAPSHOT READ - callCenterCache]",
        "background: #1e1b4b; color: #818cf8; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
        `Realtime update received | Docs: ${snap.docs.length} | Has pending local writes: ${snap.metadata.hasPendingWrites} | Read cost: ${snap.metadata.hasPendingWrites ? 0 : (snap.docChanges().length || snap.docs.length)} doc(s)`
      );
      populateGlobalActivePartitionsCache(snap.docs);
      const contactsMap = {};
      snap.docs.filter(d => d.id !== "contacts").forEach(docSnap => {
        const docContacts = docSnap.data().contacts || {};
        Object.entries(docContacts).forEach(([id, rawData]) => {
          if (!rawData) return;
          const matchedStateObj = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName);
          
          const attNameLower = attenderName ? String(attenderName).trim().toLowerCase() : "";
          const attIdLower = attenderId ? String(attenderId).trim().toLowerCase() : "";

          const hasHistoryMatch = Array.isArray(rawData.history) && rawData.history.some(h => {
            if (!h) return false;
            const hId = h.attenderId ? String(h.attenderId).trim().toLowerCase() : "";
            const hName = h.attenderName ? String(h.attenderName).trim().toLowerCase() : "";
            return (attIdLower && (hId === attIdLower || hId === attNameLower)) || (attNameLower && (hName === attNameLower || hName.includes(attNameLower)));
          });

          const isAssignedToMe = (attIdLower && (
            String(rawData.attenderId || "").toLowerCase().trim() === attIdLower || 
            String(rawData.assignedTo || "").toLowerCase().trim() === attIdLower || 
            (Array.isArray(rawData.assignedTo) && rawData.assignedTo.some(x => String(x).toLowerCase().trim() === attIdLower)) ||
            Boolean(matchedStateObj) ||
            hasHistoryMatch
          )) || (attNameLower && (
            String(rawData.assignedName || "").toLowerCase().trim() === attNameLower || 
            String(rawData.attenderName || "").toLowerCase().trim() === attNameLower || 
            String(rawData.assignedTo || "").toLowerCase().trim() === attNameLower ||
            (Array.isArray(rawData.assignedTo) && rawData.assignedTo.some(x => String(x).toLowerCase().trim() === attNameLower)) ||
            Boolean(matchedStateObj) ||
            hasHistoryMatch
          ));

          if (isAssignedToMe) {
            const attState = matchedStateObj || {};
            
            const lastHistTime = Array.isArray(rawData.history) && rawData.history.length > 0 
              ? (rawData.history[rawData.history.length - 1]?.timestamp || rawData.history[rawData.history.length - 1]?.date)
              : null;
            const newLastCalledAt = attState.lastCalledAt || rawData.lastCalledAt || attState.updatedAt || rawData.updatedAt || lastHistTime || rawData.createdAt || null;
            const getTimeMs = (val) => {
              if (!val) return 0;
              if (typeof val.toDate === "function") return val.toDate().getTime();
              if (val.seconds !== undefined) return val.seconds * 1000;
              const d = new Date(val);
              return isNaN(d.getTime()) ? 0 : d.getTime();
            };

            const combinedHist = combineContactHistories(rawData, attState, attenderName);
            const latestHist = combinedHist.length > 0 ? combinedHist[combinedHist.length - 1] : null;

            const resolvedStatus = (attState && attState.status && attState.status !== "Pending")
              ? attState.status
              : ((rawData && rawData.status && rawData.status !== "Pending")
                ? rawData.status
                : (latestHist && latestHist.status ? latestHist.status : (attState.status || rawData.status || "")));

            const resolvedRemark = (attState && attState.remark !== undefined && attState.remark !== "")
              ? attState.remark
              : ((rawData && rawData.remark !== undefined && rawData.remark !== "")
                ? rawData.remark
                : (latestHist && latestHist.remark !== undefined ? latestHist.remark : (attState.remark || rawData.remark || "")));

            const resolvedCallType = String(
              (attState && attState.callType)
              || (latestHist && latestHist.callType)
              || (rawData && rawData.callType)
              || "outgoing"
            ).toLowerCase();

            const existing = contactsMap[id];
            if (!existing || (newLastCalledAt && getTimeMs(newLastCalledAt) > getTimeMs(existing.lastCalledAt))) {
              contactsMap[id] = {
                id: id,
                ...rawData,
                _rawData: rawData,
                status: resolvedStatus,
                remark: resolvedRemark,
                callType: resolvedCallType,
                history: combinedHist,
                callbackDate: attState.callbackDate !== undefined ? attState.callbackDate : (rawData.callbackDate || null),
                callbackStatus: attState.callbackStatus !== undefined ? attState.callbackStatus : (rawData.callbackStatus || ""),
                objectionReason: attState.objectionReason !== undefined ? attState.objectionReason : (rawData.objectionReason || ""),
                lastCalledAt: newLastCalledAt,
                firstCalledAt: attState.firstCalledAt !== undefined ? attState.firstCalledAt : (rawData.firstCalledAt || null),
                registeredYearMonth: attState.registeredYearMonth !== undefined ? attState.registeredYearMonth : (rawData.registeredYearMonth || null),
                Source: attState.Source !== undefined ? attState.Source : (rawData.Source || rawData.Sourse || ""),
                "Called For": attState["Called For"] !== undefined ? attState["Called For"] : (rawData["Called For"] || ""),
                _hidden: attState._hidden === true,
                _partId: docSnap.id,
                attenderId: attenderId,
                attenderName: attState.attenderName || rawData.assignedName || rawData.attenderName || ""
              };
            }
          }
        });
      });

      let logs = Object.values(contactsMap).filter(log => !log._deleted && !log._hidden);

      console.log(`[ATTENDER_LOGS_SYNC] Logged in attender: "${attenderName}" (${attenderId}) | Total contacts fetched: ${logs.length}`);
      const sanjay = logs.find(l => String(l.Name || l.name || "").toLowerCase().includes("sanjay pathak"));
      if (sanjay) {
        console.log(`[DIAGNOSTIC] Sanjay Pathak historyCount: ${(sanjay.history || []).length} | status: "${sanjay.status}" | remark: "${sanjay.remark}"`, sanjay.history);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const overdue = [];
      const rest = [];
      logs.forEach(log => {
        if (log.callbackDate) {
          let cbDate = null;
          if (typeof log.callbackDate.toDate === "function") {
            cbDate = log.callbackDate.toDate();
          } else if (log.callbackDate.seconds !== undefined) {
            cbDate = new Date(log.callbackDate.seconds * 1000);
          } else {
            cbDate = new Date(log.callbackDate);
          }

          if (cbDate && !isNaN(cbDate.getTime())) {
            cbDate.setHours(0, 0, 0, 0);
            if (cbDate <= today) {
              overdue.push({ ...log, _callbackDue: true });
              return;
            }
          }
        }
        rest.push(log);
      });

      const finalLogs = [...overdue, ...rest];
      if (attenderId) {
        setIDBCache(cacheKey, finalLogs).catch(err => console.warn("Failed to update IndexedDB logs cache:", err));
      }

      activeSnapshotRegistry[registryKey].lastEmittedLogs = finalLogs;
      activeSnapshotRegistry[registryKey].subscribers.forEach(({ callback: subCb, tag: subTag }) => {
        let subFiltered = finalLogs;
        if (subTag && subTag !== "ALL") {
          subFiltered = finalLogs.filter(log => Array.isArray(log.tags) && log.tags.includes(subTag));
        }
        if (subCb) subCb(subFiltered);
      });
    }, err => console.error("subscribeToCallLogs error:", err));

    activeSnapshotRegistry[registryKey].unsub = unsubFirestore;
  }

  // Register this subscriber callback & tag filter
  const subId = Symbol();
  const entry = activeSnapshotRegistry[registryKey];
  entry.subscribers.set(subId, { callback, tag });

  // If data was already loaded in active registry, emit immediately to new subscriber
  if (entry.lastEmittedLogs && callback) {
    let filtered = entry.lastEmittedLogs;
    if (tag && tag !== "ALL") {
      filtered = entry.lastEmittedLogs.filter(log => Array.isArray(log.tags) && log.tags.includes(tag));
    }
    callback(filtered);
  }

  return () => {
    if (activeSnapshotRegistry[registryKey]) {
      activeSnapshotRegistry[registryKey].subscribers.delete(subId);
      // Keep listener open for 30s after unmount to handle rapid tab navigation without dropping connection
      if (activeSnapshotRegistry[registryKey].subscribers.size === 0) {
        setTimeout(() => {
          if (activeSnapshotRegistry[registryKey] && activeSnapshotRegistry[registryKey].subscribers.size === 0) {
            if (activeSnapshotRegistry[registryKey].unsub) {
              activeSnapshotRegistry[registryKey].unsub();
            }
            delete activeSnapshotRegistry[registryKey];
          }
        }, 30000);
      }
    }
  };
};

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

  // Handle "Reg.Done" registrations collection sync (highly robust, history-driven)
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
  // Sync to callCenterCache using in-memory freshData and knownPartId (0 extra reads)
  const knownPartId = existingContact?._partId || logData?._partId || null;
  await updateCacheContacts([logId], { [logId]: freshData }, { [logId]: knownPartId });
};

export const updateCallLog = async (logId, updates, attenderId = null, attenderName = null, existingContact = null) => {
  console.log(`[UPDATE CALL LOG] Initiating instant 0ms local save for contactId: ${logId}`);
  // 1. Instantly update local IndexedDB cache for 0ms UI response
  if (attenderId) {
    await updateLocalAttenderCache(attenderId, logId, updates);
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

  return { success: true, synced: false, localId: logId };
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
      console.log("%c⚡ [FIRESTORE WRITE - Registration]", "background: #701a75; color: #f0abfc; font-weight: bold; padding: 2px 6px; border-radius: 4px;", `Saved registration record in "registrations": ${registrationId}`);
      await registerRegistrationMonth(yearMonth);
    } catch (e) {
      console.error("Incoming registration write failed:", e);
    }
  }

  // Register tag in active tags collection
  await registerActiveTag(finalProgramName);

  const knownPartId = isExisting ? existingData._partId : null;
  await updateCacheContacts([docRef.id], { [docRef.id]: logPayload }, { [docRef.id]: knownPartId });
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

const getByteSize = (obj) => {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch (e) {
    return JSON.stringify(obj).length;
  }
};

let cachedDryRunResult = null;

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

  const unsubCache = onSnapshot(cacheQuery, async (snap) => {
    console.log(
      "%c📡 [SNAPSHOT READ - Admin callCenterCache]",
      "background: #1e1b4b; color: #818cf8; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
      `Realtime update received | Docs: ${snap.docs.length} | Read cost: ${snap.docChanges().length || snap.docs.length} doc(s)`
    );
    if (snap.empty && lockedDocs.length === 0) {
      console.log(`No cache documents exist for range ${startMonth} to ${endMonth}, fetching directly from Firebase contacts collection...`);
      try {
        const fallbackQ = query(collection(db, "contacts"), where("isAssigned", "==", true));
        const liveSnap = await getDocs(fallbackQ);
        let logs = liveSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c._deleted);
        if (tag && tag !== "ALL") {
          logs = logs.filter(log => Array.isArray(log.tags) && log.tags.includes(tag));
        }
        logs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        finalCallback(logs);
      } catch (err) {
        console.error("Firebase contacts fallback fetch error:", err);
      }
      return;
    }
    
    cacheSnap = snap;
    triggerCallback();
  }, async err => {
    console.error("subscribeToAllCallLogs cache error, falling back to Firebase contacts:", err);
    try {
      const fallbackQ = query(collection(db, "contacts"), where("isAssigned", "==", true));
      const liveSnap = await getDocs(fallbackQ);
      let logs = liveSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c._deleted);
      if (tag && tag !== "ALL") {
        logs = logs.filter(log => Array.isArray(log.tags) && log.tags.includes(tag));
      }
      finalCallback(logs);
    } catch (e) {
      console.error("Firebase contacts fallback error:", e);
    }
  });

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

export const getIDBCache = async (key) => {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn("IndexedDB read error:", e);
    return null;
  }
};

export const setIDBCache = async (key, data) => {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(data, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn("IndexedDB write error:", e);
    return false;
  }
};

// Automatically purges historical cache entries older than 7 days (1-Week TTL) or maxKeepMonths (default: 6 months)
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

export const updateLocalAttenderCache = async (attenderId, logId, updates) => {
  if (!attenderId || !logId) {
    console.warn("[LOCAL IDB SAVE] Missing attenderId or logId:", { attenderId, logId });
    return;
  }
  const cacheKey = `tgf_attender_logs_${attenderId}`;
  try {
    const cachedLogs = await getIDBCache(cacheKey);
    let updatedLogs = Array.isArray(cachedLogs) ? [...cachedLogs] : [];
    
    const idx = updatedLogs.findIndex(item => item.id === logId);
    
    const attenderSpecificFields = [
      "status", "remark", "callType", "history", "callbackDate", "callbackStatus",
      "objectionReason", "lastCalledAt", "firstCalledAt", "registeredYearMonth",
      "Source", "Called For", "source", "calledFor", "called_for", "sourse"
    ];
    
    const attUpdates = {};
    Object.keys(updates).forEach(k => {
      if (attenderSpecificFields.includes(k)) {
        attUpdates[k] = updates[k];
      }
    });

    if (idx >= 0) {
      const existing = updatedLogs[idx];
      const existingAttState = existing.attenderStates?.[attenderId] || {};
      const newAttState = { ...existingAttState, ...attUpdates, updatedAt: new Date().toISOString() };
      
      updatedLogs[idx] = {
        ...existing,
        ...updates,
        attenderStates: {
          ...(existing.attenderStates || {}),
          [attenderId]: newAttState
        },
        updatedAt: new Date().toISOString()
      };
    } else {
      const newAttState = { ...attUpdates, updatedAt: new Date().toISOString() };
      updatedLogs.unshift({
        id: logId,
        ...updates,
        attenderId,
        attenderStates: {
          [attenderId]: newAttState
        },
        updatedAt: new Date().toISOString()
      });
    }
    await setIDBCache(cacheKey, updatedLogs);
    console.log(`[LOCAL IDB SUCCESS] Lead ${logId} updated in local IndexedDB for attender ${attenderId} (Total cached: ${updatedLogs.length})`);
  } catch (err) {
    console.warn("Failed to update local IDB attender cache:", err);
  }
};

export const getPendingWrites = async () => {
  try {
    const queue = await getIDBCache(PENDING_WRITES_KEY);
    return Array.isArray(queue) ? queue : [];
  } catch (e) {
    return [];
  }
};

export const queuePendingWrite = async (actionType, payload) => {
  try {
    const queue = await getPendingWrites();
    const newItem = {
      id: `pw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      actionType,
      payload,
      timestamp: new Date().toISOString(),
      retryCount: 0
    };
    queue.push(newItem);
    await setIDBCache(PENDING_WRITES_KEY, queue);
    console.log(`[WRITE QUEUED LOCALLY] Total queued items: ${queue.length}`, newItem);
    return newItem;
  } catch (err) {
    console.error("Failed to queue pending write:", err);
    return null;
  }
};

export const clearPendingWriteItem = async (itemId) => {
  try {
    const queue = await getPendingWrites();
    const updated = queue.filter(item => item.id !== itemId);
    await setIDBCache(PENDING_WRITES_KEY, updated);
  } catch (err) {
    console.warn("Failed to clear pending write item:", err);
  }
};

let isFlushingWrites = false;
export const flushPendingWrites = async () => {
  if (isFlushingWrites) return;
  const queue = await getPendingWrites();
  if (queue.length === 0) return;

  isFlushingWrites = true;
  console.log(`[OFFLINE SYNC START] Attempting to sync ${queue.length} pending local writes to Firebase...`);

  for (const item of queue) {
    try {
      let success = false;
      if (item.actionType === "updateCallLog") {
        const { logId, updates, attenderId, attenderName, existingContact } = item.payload;
        await updateCallLogDirectFirebase(logId, updates, attenderId, attenderName, existingContact);
        success = true;
      } else if (item.actionType === "addIncomingCallLog") {
        const { attenderId, attenderName, data, programId, programName } = item.payload;
        await addIncomingCallLogDirectFirebase(attenderId, attenderName, data, programId, programName);
        success = true;
      }

      if (success) {
        console.log(`[OFFLINE SYNC SUCCESS] Flushed write item ${item.id} to Firebase`);
        await clearPendingWriteItem(item.id);
      }
    } catch (err) {
      console.warn(`[OFFLINE SYNC PAUSED] Write item ${item.id} failed again (quota/offline). Will retry later.`, err);
      break;
    }
  }
  isFlushingWrites = false;
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("🌐 Network online detected! Flushing pending write queue...");
    flushPendingWrites();
  });
  setInterval(() => {
    flushPendingWrites();
  }, 30000);
}

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

  // 1. Immediately emit cached registrations from IndexedDB if available (0 storage quota limit)
  getIDBCache(cacheKey).then(cachedDocs => {
    if (Array.isArray(cachedDocs) && cachedDocs.length > 0) {
      // Hydrate timestamps on cached docs so methods like .toMillis() and .toDate() work seamlessly
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
    }
  }).catch(err => {
    console.warn("Failed to load registrations from IndexedDB cache:", err);
  });

  const { startMonth, endMonth } = getMonthRange(targetOption);

  // Query registrations by registeredYearMonth range to optimize performance
  let q = query(
    collection(db, "registrations"),
    where("registeredYearMonth", ">=", startMonth),
    where("registeredYearMonth", "<=", endMonth)
  );

  return onSnapshot(q, snap => {
    console.log(
      "%c📡 [SNAPSHOT READ - registrations]",
      "background: #1e1b4b; color: #818cf8; font-weight: bold; padding: 3px 8px; border-radius: 4px;",
      `Realtime update received | Docs: ${snap.docs.length} | Read cost: ${snap.docChanges().length || snap.docs.length} doc(s)`
    );
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort descending by registeredAt client-side
    docs.sort((a, b) => {
      const ta = a.registeredAt?.toMillis ? a.registeredAt.toMillis() : (a.registeredAt?.seconds ? a.registeredAt.seconds * 1000 : 0);
      const tb = b.registeredAt?.toMillis ? b.registeredAt.toMillis() : (b.registeredAt?.seconds ? b.registeredAt.seconds * 1000 : 0);
      return tb - ta;
    });

    // Update IndexedDB cache asynchronously
    setIDBCache(cacheKey, docs).catch(err => {
      console.warn("Failed to write registrations to IndexedDB:", err);
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
  // Interaction logging to separate collection is disabled to optimize Firestore writes;
  // full call history is stored directly inside the contact's attenderStates history array.
  return;
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
