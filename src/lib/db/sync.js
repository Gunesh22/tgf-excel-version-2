import { documentId } from "firebase/firestore";
import { combineContactHistories, findMatchingAttenderState } from "./metadata";
import { globalActivePartitionsCache } from "./cache";
import { collection, getDocs, getDoc, doc, query, where, Timestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { setIDBCache, getIDBCache } from "../db.js";

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
export const fetchPartitionCacheForColdBoot = async (attenderId, attenderName, monthsBack = 6) => {
  console.log(`[COLD BOOT PARTITION CACHE] Initializing cold boot fetch from callCenterCache for ${attenderName || attenderId} (${monthsBack} months back)`);
  
  const monthKeys = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    monthKeys.push(`${year}-${month}`);
  }

  const allAttenderContacts = new Map();
  let totalPartitionDocsRead = 0;

  for (const monthStr of monthKeys) {
    try {
      const partitionDocRef = doc(db, "callCenterCache", monthStr, "attenderPartitions", attenderId);
      const snap = await getDoc(partitionDocRef);
      if (snap.exists()) {
        totalPartitionDocsRead += 1;
        const data = snap.data();
        const docContacts = data.contacts || {};
        const tombstones = data.tombstones || {};
        
        Object.entries(docContacts).forEach(([id, rawData]) => {
          if (!rawData || rawData._deleted || tombstones[id]) {
            return;
          }

          const isAssigned = (attenderId && (
            (Array.isArray(rawData.assignedTo) && rawData.assignedTo.includes(attenderId)) ||
            rawData.assignedTo === attenderId ||
            rawData.attenderId === attenderId ||
            (rawData.attenderStates && rawData.attenderStates[attenderId])
          )) || (attenderName && (
            rawData.assignedName === attenderName ||
            rawData.attenderName === attenderName ||
            (Array.isArray(rawData.assignedTo) && rawData.assignedTo.includes(attenderName))
          ));

          if (isAssigned) {
            const matchedStateObj = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName) || {};
            const combinedHist = combineContactHistories(rawData, matchedStateObj, attenderName);
            const latestHist = combinedHist.length > 0 ? combinedHist[combinedHist.length - 1] : null;

            const resolvedStatus = (matchedStateObj && matchedStateObj.status && matchedStateObj.status !== "Pending")
              ? matchedStateObj.status
              : (rawData.status || (latestHist && latestHist.status) || "");

            const resolvedRemark = (matchedStateObj && matchedStateObj.remark !== undefined && matchedStateObj.remark !== "")
              ? matchedStateObj.remark
              : (rawData.remark || (latestHist && latestHist.remark) || "");

            allAttenderContacts.set(id, {
              ...rawData,
              id: id,
              contactId: id,
              status: resolvedStatus,
              remark: resolvedRemark,
              history: combinedHist,
              attenderStates: rawData.attenderStates || {}
            });
          }
        });
      }
    } catch (err) {
      console.warn(`[COLD BOOT CACHE WARN] Error fetching partition docs for ${monthStr}:`, err);
    }
  }

  let logsList = Array.from(allAttenderContacts.values());

  // Sort callback overdue leads to the top, matching onSnapshot behavior
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = [];
  const rest = [];
  logsList.forEach(log => {
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

  console.log(`[COLD BOOT PARTITION CACHE SUCCESS] Fetched ${finalLogs.length} assigned contacts from callCenterCache across ${totalPartitionDocsRead} partition doc reads (0 individual contact doc reads!)`);

  if (attenderId) {
    const cacheKey = `tgf_attender_logs_${attenderId}`;
    await setIDBCache(cacheKey, finalLogs).catch(() => {});
  }

  return finalLogs;
};

// Global Active Snapshot Listeners Registry (Singleton Pattern per attender)
const activeSnapshotRegistry = {};

// Delta-Sync Polling subscription - queries by attenderId
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

  const processAndMapDocs = (docsList, existingMap) => {
    let updatedCount = 0;
    docsList.forEach(rawData => {
      if (!rawData) return;
      const id = rawData.id;
      
      if (rawData._deleted || rawData._tombstone) {
        if (existingMap.has(id)) {
          existingMap.delete(id);
          updatedCount++;
        }
        return;
      }

      const matchedStateObj = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName);
      const attState = matchedStateObj || {};
      
      const lastHistTime = Array.isArray(rawData.history) && rawData.history.length > 0 
        ? (rawData.history[rawData.history.length - 1]?.timestamp || rawData.history[rawData.history.length - 1]?.date)
        : null;
      const newLastCalledAt = attState.lastCalledAt || rawData.lastCalledAt || attState.updatedAt || rawData.updatedAt || lastHistTime || rawData.createdAt || null;
      
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
      
      if (attState._hidden === true) {
         if (existingMap.has(id)) {
            existingMap.delete(id);
            updatedCount++;
         }
         return;
      }

      existingMap.set(id, {
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
        _hidden: false,
        attenderId: attenderId,
        attenderName: attState.attenderName || rawData.assignedName || rawData.attenderName || ""
      });
      updatedCount++;
    });
    return updatedCount;
  };

  const processSortingAndEmission = (contactsMap, registryEntry) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = [];
    const rest = [];
    const logs = Array.from(contactsMap.values());
    
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

    registryEntry.lastEmittedLogs = finalLogs;
    registryEntry.subscribers.forEach(({ callback: subCb, tag: subTag }) => {
      let subFiltered = finalLogs;
      if (subTag && subTag !== "ALL") {
        subFiltered = finalLogs.filter(log => Array.isArray(log.tags) && log.tags.includes(subTag));
      }
      if (subCb) subCb(subFiltered);
    });
  };

  if (!attenderId && !attenderName) {
    console.warn("[SCOPED LISTENER] Listener deferred: attenderId is missing.");
    return () => {};
  }

  const emitSyncStatus = (status, error = null) => {
    if (activeSnapshotRegistry[registryKey]) {
      activeSnapshotRegistry[registryKey].currentStatus = status;
      activeSnapshotRegistry[registryKey].lastSyncTime = Date.now();
      activeSnapshotRegistry[registryKey].syncStatusSubscribers.forEach((cb) => {
        cb({ status, lastSyncTime: Date.now(), error });
      });
    }
  };

  if (!activeSnapshotRegistry[registryKey]) {
    activeSnapshotRegistry[registryKey] = {
      subscribers: new Map(),
      syncStatusSubscribers: new Map(),
      unsub: null,
      lastEmittedLogs: null,
      pollingActive: true,
      currentStatus: 'LOADING_LOCAL',
      lastSyncTime: null
    };
    
    const registryEntry = activeSnapshotRegistry[registryKey];

    const runDeltaSync = async () => {
      try {
        let contactsMap = new Map();
        let cursorTime = 0;
        emitSyncStatus('LOADING_LOCAL');
        
        // 1. Instantly load from IndexedDB
        const cachedLogs = await getIDBCache(cacheKey);
        if (Array.isArray(cachedLogs) && cachedLogs.length > 0) {
          console.log(`[LOCAL CACHE INSTANT LOAD] Served ${cachedLogs.length} leads from IndexedDB for ${attenderId}`);
          cachedLogs.forEach(c => contactsMap.set(c.id, c));
          processSortingAndEmission(contactsMap, registryEntry);
          
          cachedLogs.forEach(log => {
             let ms = 0;
             if (log.updatedAt && typeof log.updatedAt.toDate === "function") ms = log.updatedAt.toDate().getTime();
             else if (log.updatedAt && log.updatedAt.seconds) ms = log.updatedAt.seconds * 1000;
             else if (log.updatedAt) ms = new Date(log.updatedAt).getTime();
             if (ms > cursorTime) cursorTime = ms;
          });
          emitSyncStatus('READY');
        } else {
          emitSyncStatus('SYNCING');
          console.log(`[COLD BOOT INITIAL LOAD] IndexedDB empty for ${attenderId}. Fetching partition docs from callCenterCache (~15-20 reads total)...`);
          const partitionLogs = await fetchPartitionCacheForColdBoot(attenderId, attenderName, 6);
          if (partitionLogs.length > 0) {
             partitionLogs.forEach(c => contactsMap.set(c.id, c));
             processSortingAndEmission(contactsMap, registryEntry);
             
             partitionLogs.forEach(log => {
               let ms = 0;
               if (log.updatedAt && typeof log.updatedAt.toDate === "function") ms = log.updatedAt.toDate().getTime();
               else if (log.updatedAt && log.updatedAt.seconds) ms = log.updatedAt.seconds * 1000;
               else if (log.updatedAt) ms = new Date(log.updatedAt).getTime();
               if (ms > cursorTime) cursorTime = ms;
             });
          }
          emitSyncStatus('SYNCED');
        }
        
        // Extract Delta Sync logic so it can be called on-demand
        registryEntry.executeDeltaSync = async () => {
          try {
             emitSyncStatus('SYNCING');
             const safeCursor = cursorTime > 120000 ? new Date(cursorTime - 120000) : null;
             let qParams = [where("assignedTo", "array-contains", attenderId)];
             if (safeCursor) qParams.push(where("updatedAt", ">", safeCursor));
             const q = query(collection(db, "contacts"), ...qParams);
             const snap = await getDocs(q);
             
             let tombParams = [where("attenderId", "==", attenderId)];
             if (safeCursor) tombParams.push(where("updatedAt", ">", safeCursor));
             const tombQ = query(collection(db, "sync_tombstones"), ...tombParams);
             const tombSnap = await getDocs(tombQ);
             
             let docChanges = [];
             snap.docs.forEach(d => docChanges.push({ id: d.id, ...d.data() }));
             tombSnap.docs.forEach(d => docChanges.push({ id: d.data().contactId, _tombstone: true }));
             
             if (docChanges.length > 0) {
               console.log(`[DELTA SYNC] Attender ${attenderId} fetched ${docChanges.length} updates/tombstones.`);
               const numUpdates = processAndMapDocs(docChanges, contactsMap);
                if (numUpdates > 0) {
                  cursorTime = Date.now();
                  processSortingAndEmission(contactsMap, registryEntry);
                  emitSyncStatus('SYNCED');
                  return true; // indicates changes were found
                }
              }
              emitSyncStatus('SYNCED');
              return false;
           } catch (e) {
              console.error("[DELTA SYNC] Error fetching updates:", e);
              emitSyncStatus('SYNC_ERROR', e.message);
              return false;
           }
        };

        // Adaptive Polling Logic
        let pollInterval = 60000; // Start at 1 minute
        const MAX_POLL_INTERVAL = 300000; // Max 5 minutes

        const scheduleNextPoll = () => {
          if (!registryEntry.pollingActive) return;
          
          setTimeout(async () => {
            if (!registryEntry.pollingActive) return;
            
            // Only poll if the browser is active
            if (typeof document !== "undefined" && document.visibilityState === "visible") {
              const hasChanges = await registryEntry.executeDeltaSync();
              if (hasChanges) {
                pollInterval = 60000; // Reset to 1 min on activity
              } else {
                pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL); // Exponential backoff
              }
            }
            
            scheduleNextPoll();
          }, pollInterval);
        };
        
        scheduleNextPoll();
      } catch (err) {
        console.error("Delta Sync initialization error:", err);
      }
    };

    runDeltaSync();

    registryEntry.unsub = () => {
       registryEntry.pollingActive = false;
    };
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


export const forceDeltaSync = async (attenderId, attenderName) => {
  const key = `${attenderId || 'global'}_${attenderName || 'global'}`;
  const registryEntry = activeSnapshotRegistry[key];
  if (registryEntry && typeof registryEntry.executeDeltaSync === "function") {
    return await registryEntry.executeDeltaSync();
  }
  return false;
};

export const subscribeToSyncStatus = (attenderId, attenderName, callback) => {
  const registryKey = `${attenderId || 'global'}_${attenderName || 'global'}`;
  
  const interval = setInterval(() => {
    if (activeSnapshotRegistry[registryKey]) {
      clearInterval(interval);
      const subId = Date.now().toString() + Math.random();
      activeSnapshotRegistry[registryKey].syncStatusSubscribers.set(subId, callback);
      
      callback({
        status: activeSnapshotRegistry[registryKey].currentStatus,
        lastSyncTime: activeSnapshotRegistry[registryKey].lastSyncTime,
        error: null
      });
    }
  }, 100);

  return () => {
    clearInterval(interval);
    if (activeSnapshotRegistry[registryKey]) {
      for (const [key, cb] of activeSnapshotRegistry[registryKey].syncStatusSubscribers.entries()) {
        if (cb === callback) {
          activeSnapshotRegistry[registryKey].syncStatusSubscribers.delete(key);
        }
      }
    }
  };
};
