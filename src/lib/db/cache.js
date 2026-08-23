import { getMonthRange, pruneContactForCacheForMonth, updateContactInActiveCache, updateContactInLockedReport, getCutoffMonth, getMonthStr } from "./reports";
import { addIncomingCallLogDirectFirebase, updateCallLogDirectFirebase } from "./contacts";
import { deleteField, onSnapshot } from "firebase/firestore";
import { subscribeToCallLogs } from "./sync";
import { collection, getDocs, setDoc, doc,  deleteDoc, serverTimestamp, query, where, Timestamp, getDoc } from "firebase/firestore";
import { db } from "../firebase.js";

export const globalActivePartitionsCache = {};

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
  } catch {
    return [];
  }
};

export const queuePendingWrite = async (actionType, payload) => {
  try {
    const queue = await getPendingWrites();

    // Coalesce consecutive updates for the same contact
    if (actionType === "updateCallLog" && payload?.logId) {
      const existingIdx = queue.findIndex(
        item => item.actionType === "updateCallLog" && item.payload?.logId === payload.logId
      );
      if (existingIdx >= 0) {
        const existing = queue[existingIdx];
        existing.payload.updates = {
          ...(existing.payload.updates || {}),
          ...(payload.updates || {})
        };
        existing.timestamp = new Date().toISOString();
        await setIDBCache(PENDING_WRITES_KEY, queue);
        console.log(`[WRITE QUEUE COALESCED] Merged rapid edits for contact ${payload.logId} into single queued write`);
        return existing;
      }
    }

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

export const DEFAULT_STATUS_OPTIONS = [
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

export const DEFAULT_SOURCE_OPTIONS = [
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

export const DEFAULT_CALLED_FOR_OPTIONS = [
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

export const subscribeToRecentRegistrations = (callback) => {
  return subscribeToRegistrations(null, (logs) => {
    if (!Array.isArray(logs)) return;
    const registeredList = logs.map(log => ({
      id: log.id,
      name: log.Name || log.name || log.caller || "Someone",
      convertedBy: log.convertedBy || log.attenderName || log.assignedName || "Attender",
      calledFor: log["Called For"] || log.calledFor || log.programName || "",
      timestamp: log.registeredAt?.toMillis ? log.registeredAt.toMillis() : (log.registeredAt?.seconds ? log.registeredAt.seconds * 1000 : Date.now())
    }));
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

