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
