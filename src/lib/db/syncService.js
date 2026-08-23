import {
  collection, query, where, onSnapshot, doc, getDoc, setDoc, or
} from "firebase/firestore";
import { db } from "../firebase.js";
import { findMatchingAttenderState } from "./core.js";
import { getIDBCache, setIDBCache, updateLocalAttenderCache, fetchPartitionCacheForColdBoot } from "./cacheService.js";

// Clean Zero-Background-Listener subscribeToCallLogs (0 Reads on Reload)
export const subscribeToCallLogs = (...args) => {
  let tag = null, attenderId = null, attenderName = null, callback = null;
  if (typeof args[args.length - 1] === "function") {
    callback = args.pop();
  }

  if (args.length === 1) {
    attenderId = args[0];
  } else if (args.length === 2) {
    const firstArgStr = String(args[0] || "");
    if (firstArgStr === "ALL" || firstArgStr === "null" || firstArgStr === "undefined" || firstArgStr.includes("Calls")) {
      tag = args[0];
      attenderId = args[1];
    } else {
      attenderId = args[0];
      attenderName = args[1];
    }
  } else if (args.length >= 3) {
    tag = args[0];
    attenderId = args[1];
    attenderName = args[2];
  }

  const cacheKey = `tgf_attender_logs_${attenderId}`;

  // Emit 100% of leads instantly from IndexedDB (0ms UI load, 0 background snapshot reads)
  if (attenderId) {
    getIDBCache(cacheKey).then(async cachedLogs => {
      let logsToProcess = cachedLogs;
      if (!Array.isArray(logsToProcess) || logsToProcess.length === 0) {
        console.log(`[COLD BOOT INITIAL LOAD] IndexedDB empty for ${attenderId}. Fetching partition docs...`);
        logsToProcess = await fetchPartitionCacheForColdBoot(attenderId, attenderName, 6);
      } else {
        console.log(`[ZERO-READ LOAD] Served ${logsToProcess.length} leads from IndexedDB for ${attenderId} (0 Reads on Reload)`);
      }

      if (Array.isArray(logsToProcess)) {
        logsToProcess.forEach(doc => {
          if (doc && doc.id && doc._isNew) delete doc._isNew;
        });
      }

      let filtered = logsToProcess;
      if (tag && tag !== "ALL") {
        filtered = logsToProcess.filter(log => Array.isArray(log.tags) && log.tags.includes(tag));
      }
      if (callback) callback(filtered);
    }).catch(err => {
      console.warn("Failed to load attender logs from IndexedDB:", err);
    });
  }

  return () => {};
};

// On-Demand Fetcher for Shared Leads (Triggers 1, 2, and 3)
export const fetchFreshSharedLead = async (lead, attenderId, attenderName, forceRefresh = false) => {
  if (!lead || !lead.id) return lead;
  
  const historyAttendersCount = Array.isArray(lead.history)
    ? new Set(lead.history.map(h => (h.attenderName || h.attenderId || h.by || h.editedBy || "").trim()).filter(Boolean)).size
    : 0;

  const isShared = (Array.isArray(lead.assignedTo) && lead.assignedTo.length > 1) ||
                   (lead.attenderStates && Object.keys(lead.attenderStates).length > 1) ||
                   lead.isSharedLead === true ||
                   historyAttendersCount > 1;
  const leadName = lead.Name || lead.name || "Lead";

  console.log(
    `[FETCH SHARED LEAD DIAGNOSTIC] Lead "${leadName}" (${lead.id}) | isShared: ${isShared} | forceRefresh: ${forceRefresh} | assignedTo:`,
    lead.assignedTo,
    "| attenderStates keys:",
    Object.keys(lead.attenderStates || {}),
    "| historyAttendersCount:",
    historyAttendersCount
  );

  // If not shared AND not force-refreshed, serve 100% from IndexedDB (0 Reads)
  if (!isShared && !forceRefresh) {
    console.log(
      `%c🟢 [SOLO LEAD - 0 READS] "${leadName}" (${lead.id}) is solo lead. Serving 100% from IndexedDB (0 Firestore Reads)`,
      "background: #065f46; color: #34d399; font-weight: bold; padding: 3px 8px; border-radius: 4px;"
    );
    return lead;
  }

  // Prevent useless reads: If fetched less than 60 seconds ago and not forced, use cache (0 Reads)
  const now = Date.now();
  if (!forceRefresh && lead._lastFetchedAt && (now - lead._lastFetchedAt) < 60000) {
    console.log(
      `%c⚡ [FRESH CACHE RE-USED - 0 READS] "${leadName}" was synced ${Math.round((now - lead._lastFetchedAt) / 1000)}s ago. Reusing local cache (0 Reads).`,
      "background: #065f46; color: #a7f3d0; font-weight: bold; padding: 3px 8px; border-radius: 4px;"
    );
    return lead;
  }

  console.log(
    `%c📡 [FIRESTORE REQUEST - 1 READ] Fetching fresh details for SHARED lead "${leadName}" (${lead.id})...`,
    "background: #1e40af; color: #93c5fd; font-weight: bold; padding: 3px 8px; border-radius: 4px;"
  );

  try {
    const docRef = doc(db, "contacts", lead.id);
    const docSnap = await getDoc(docRef);

    console.log(
      `%c✅ [FIRESTORE RESPONSE RECEIVED] Successfully fetched shared lead "${leadName}" (${lead.id}) | Cost: 1 Firestore Read`,
      "background: #047857; color: #a7f3d0; font-weight: bold; padding: 3px 8px; border-radius: 4px;"
    );

    if (!docSnap.exists()) return lead;

    const rawData = docSnap.data();
    const matchedStateObj = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName);
    const attState = matchedStateObj || {};

    const lastHistTime = Array.isArray(rawData.history) && rawData.history.length > 0 
      ? (rawData.history[rawData.history.length - 1]?.timestamp || rawData.history[rawData.history.length - 1]?.date)
      : null;
    const newLastCalledAt = attState.lastCalledAt || rawData.lastCalledAt || attState.updatedAt || rawData.updatedAt || lastHistTime || rawData.createdAt || null;

    const calledForVal = attState["Called For"] || attState.calledFor || rawData["Called For"] || rawData.calledFor || rawData.programId || rawData.programName || "";
    const sourceVal = attState.Source || attState.source || rawData.Source || rawData.source || "";
    const statusVal = attState.status || rawData.status || "Pending";
    const remarkVal = attState.remark || rawData.remark || "";
    const fullHistory = Array.isArray(rawData.history) && rawData.history.length > 0
      ? rawData.history
      : (Array.isArray(attState.history) ? attState.history : []);

    const freshLead = {
      ...rawData,
      id: lead.id,
      status: statusVal,
      remark: remarkVal,
      "Called For": calledForVal,
      calledFor: calledForVal,
      programId: calledForVal,
      Source: sourceVal,
      source: sourceVal,
      tags: Array.isArray(rawData.tags) ? rawData.tags : (Array.isArray(rawData.Tags) ? rawData.Tags : []),
      callType: attState.callType || rawData.callType || "outgoing",
      history: fullHistory,
      callbackDate: attState.callbackDate || rawData.callbackDate || attState.callback_date || rawData.callback_date || null,
      callbackTime: attState.callbackTime || rawData.callbackTime || attState.callback_time || rawData.callback_time || null,
      callbackStatus: attState.callbackStatus || rawData.callbackStatus || null,
      lastCalledAt: newLastCalledAt,
      attenderState: attState,
      _lastFetchedAt: Date.now()
    };
    delete freshLead._isNew;

    if (attenderId) {
      updateLocalAttenderCache(attenderId, freshLead).catch(() => {});
    }

    return freshLead;
  } catch (err) {
    console.warn(`[ON-DEMAND FETCH FAILED] Could not fetch shared lead ${lead.id}:`, err);
    return lead;
  }
};

// WRITE QUEUE COALESCING (Offline / Low-Connectivity Atomic Queue)
const PENDING_WRITES_KEY = "tgf_pending_writes_v1";

export const getPendingWrites = async () => {
  return (await getIDBCache(PENDING_WRITES_KEY)) || [];
};

export const queuePendingWrite = async (typeOrObj, payload) => {
  let writeItem = {};
  if (typeof typeOrObj === "string") {
    writeItem = {
      type: typeOrObj,
      ...(payload || {}),
      id: payload?.logId || payload?.id || payload?.data?.phone || `pending_${Date.now()}`
    };
  } else if (typeOrObj && typeof typeOrObj === "object") {
    writeItem = {
      ...typeOrObj,
      id: typeOrObj.logId || typeOrObj.id || `pending_${Date.now()}`
    };
  }

  if (!writeItem.id) return;
  const currentQueue = await getPendingWrites();

  // Coalesce rapid writes for the same contact/logId
  const existingIdx = currentQueue.findIndex(w => w.id === writeItem.id || (w.logId && writeItem.logId && w.logId === writeItem.logId));

  if (existingIdx >= 0) {
    const existing = currentQueue[existingIdx];
    const mergedUpdates = {
      ...(existing.updates || {}),
      ...(writeItem.updates || {})
    };

    if (existing.updates?.attenderStates || writeItem.updates?.attenderStates) {
      mergedUpdates.attenderStates = {
        ...(existing.updates?.attenderStates || {}),
        ...(writeItem.updates?.attenderStates || {})
      };
    }

    currentQueue[existingIdx] = {
      ...existing,
      ...writeItem,
      updates: mergedUpdates,
      timestamp: Date.now()
    };
    console.log(`⚡ [WRITE COALESCED] Merged rapid offline updates for contact: ${writeItem.id}`);
  } else {
    currentQueue.push({
      ...writeItem,
      timestamp: Date.now()
    });
    console.log(`📥 [WRITE QUEUED] Queued offline write for contact: ${writeItem.id}`);
  }

  await setIDBCache(PENDING_WRITES_KEY, currentQueue);
};

export const clearPendingWriteItem = async (id) => {
  const currentQueue = await getPendingWrites();
  const filtered = currentQueue.filter(w => w.id !== id);
  await setIDBCache(PENDING_WRITES_KEY, filtered);
};

export const flushPendingWrites = async (directFirebaseHandler) => {
  const pending = await getPendingWrites();
  if (!Array.isArray(pending) || pending.length === 0) return;
  
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("Device is currently offline. Retaining pending write queue...");
    return;
  }

  console.log(`🔄 [FLUSH QUEUE] Flushing ${pending.length} pending offline write(s)...`);

  for (const item of pending) {
    try {
      if (typeof directFirebaseHandler === "function") {
        await directFirebaseHandler(item);
      }
      await clearPendingWriteItem(item.id);
      console.log(`✅ [FLUSH SUCCESS] Synced pending write for contact: ${item.id}`);
    } catch (err) {
      console.error(`❌ [FLUSH ERROR] Failed to flush write for ${item.id}:`, err);
    }
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("Network online detected! Triggering pending write flush...");
    flushPendingWrites();
  });
}

