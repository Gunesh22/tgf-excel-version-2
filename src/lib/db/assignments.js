import { documentId } from "firebase/firestore";
import { parseTags, extractIndividualPhones, formatContactName, normalizePhone } from "./metadata";
import { getIDBCache, setIDBCache } from "./cache";
import { deleteField, startAfter, getDoc, addDoc, runTransaction, or } from "firebase/firestore";
import { findMatchingAttenderState } from "./metadata";
import { collection, getDocs,  doc,   serverTimestamp, query, where, Timestamp, limit, writeBatch } from "firebase/firestore";
import { db } from "../firebase.js";
import { updateCacheContacts } from "../db.js";

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
// const globalActivePartitionsCache = {};

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
      where(documentId(), ">=", monthStr),
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
    
    // Tombstone for Delta Sync eviction
    const tombstoneRef = doc(db, "sync_tombstones", `${attenderId}_${c.ref.id}`);
    batch.set(tombstoneRef, {
      attenderId: attenderId,
      contactId: c.ref.id,
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

    // Tombstone for Delta Sync eviction
    const tombstoneRef = doc(db, "sync_tombstones", `${fromAttenderId}_${c.ref.id}`);
    batch.set(tombstoneRef, {
      attenderId: fromAttenderId,
      contactId: c.ref.id,
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
