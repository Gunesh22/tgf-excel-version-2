import { doc } from "firebase/firestore";
import { db } from "../firebase.js";
import { findMatchingAttenderState, trackFirestoreRead } from "./core.js";
import { getIDBCache, setIDBCache, updateLocalAttenderCache, fetchPartitionCacheForColdBoot } from "./cacheService.js";
import { diagGetDoc } from "./firebaseDiagnostics.js";

// Canonical function to check if a lead is shared across multiple attenders
export const isLeadShared = (lead, attenderName = null) => {
  if (!lead || typeof lead !== "object") return false;

  // 1. Check attenderStates keys (attenders who have logged state/calls on this lead)
  const attStatesKeys = lead.attenderStates && typeof lead.attenderStates === "object"
    ? Object.keys(lead.attenderStates).filter(k => lead.attenderStates[k] && !lead.attenderStates[k]._deleted && !lead.attenderStates[k].isDeleted)
    : [];
  if (attStatesKeys.length > 1) return true;

  // 2. Check assignedTo array (multiple assigned attender IDs)
  const assignedToArr = Array.isArray(lead.assignedTo)
    ? lead.assignedTo
    : (typeof lead.assignedTo === "string" && lead.assignedTo.trim() ? lead.assignedTo.split(",") : []);
  if (assignedToArr.length > 1) return true;

  // 3. Check explicit flag
  if (lead.isSharedLead === true) return true;

  // 4. Check lastEditedBy (if edited by another attender, lead is shared)
  if (lead.lastEditedBy && attenderName) {
    const lastEd = String(lead.lastEditedBy).trim().toLowerCase();
    const currEd = String(attenderName).trim().toLowerCase();
    if (lastEd && currEd && lastEd !== currEd) return true;
  }

  // 5. Check history for distinct attenders
  if (Array.isArray(lead.history) && lead.history.length > 0) {
    const distinctAttenders = new Set(
      lead.history
        .map(h => (h.attenderName || h.attenderId || h.by || h.editedBy || "").trim().toLowerCase())
        .filter(Boolean)
    );
    if (distinctAttenders.size > 1) return true;
  }

  return false;
}

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
        const idLower = String(attenderId).toLowerCase().trim();
        const nameLower = String(attenderName || "").toLowerCase().trim();

        const cleanLogs = logsToProcess.filter(doc => {
          if (!doc) return false;
          const matchedStateObj = findMatchingAttenderState(doc.attenderStates, attenderId, attenderName);
          if (matchedStateObj && !matchedStateObj._deleted) return true;

          if (Array.isArray(doc.assignedTo)) {
            return doc.assignedTo.some(a => {
              const aLower = String(a).toLowerCase().trim();
              return (idLower && aLower === idLower) || (nameLower && aLower === nameLower);
            });
          }
          if (doc.assignedTo) {
            const aLower = String(doc.assignedTo).toLowerCase().trim();
            return (idLower && aLower === idLower) || (nameLower && aLower === nameLower);
          }
          return false;
        });

        if (cleanLogs.length !== logsToProcess.length) {
          console.log(`[CACHE SANITIZE] Filtered out ${logsToProcess.length - cleanLogs.length} contaminated leads for ${attenderName} (${attenderId})`);
          logsToProcess = cleanLogs;
          setIDBCache(cacheKey, cleanLogs).catch(() => {});
        } else {
          console.log(`[ZERO-READ LOAD] Served ${logsToProcess.length} leads from IndexedDB for ${attenderId} (0 Reads on Reload)`);
        }
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

const sharedFetches = new Map();

// On-Demand Fetcher for Shared Leads (Triggers 1, 2, and 3)
export const fetchFreshSharedLead = async (lead, attenderId, attenderName, forceRefresh = false) => {
  if (!lead || !lead.id || lead._isNew) return lead;

  const isShared = isLeadShared(lead, attenderName);
  const alreadyFetched = !!lead._lastFetchedAt;

  console.log("[SHARED LEAD FETCH DECISION]", {
    leadId: lead.id,
    shared: isShared,
    localCacheHit: alreadyFetched,
    alreadyFetched: alreadyFetched,
    firestoreFetchRequired: forceRefresh || !alreadyFetched
  });

  // If already fetched locally in this session and not force-refreshed: 0 Reads
  if (alreadyFetched && !forceRefresh) {
    console.log("[SHARED LEAD IDB HIT]", {
      leadId: lead.id,
      reason: "Lead already fetched locally in this session"
    });
    return lead;
  }

  // Check if a request for this exact lead is already in-flight
  const existingFetch = sharedFetches.get(lead.id);
  if (existingFetch && !forceRefresh) {
    console.log("[SHARED LEAD INFLIGHT HIT]", { leadId: lead.id });
    return await existingFetch;
  }

  // SHARED LEAD NOT LOCALLY FETCHED / NEEDS FRESH DATA: 1 getDoc Read ONLY
  console.log("[SHARED LEAD FIRESTORE FETCH]", {
    leadId: lead.id,
    reason: forceRefresh ? "Manual Sync Button" : "Shared Lead Initial Fetch"
  });

  const fetchPromise = (async () => {
    try {
      const docRef = doc(db, "contacts", lead.id);
      const docSnap = await diagGetDoc(docRef, {
        function: "fetchFreshSharedLead",
        trigger: forceRefresh ? "Manual Sync Button" : "Shared Lead Initial Fetch"
      });

      trackFirestoreRead({
        collection: "contacts",
        operation: "getDoc",
        document: lead.id,
        documentsReturned: docSnap.exists() ? 1 : 0,
        reason: "fetchFreshSharedLead",
        source: "modal/fetchFreshSharedLead"
      });

      if (!docSnap.exists()) return lead;

      const rawData = docSnap.data();
      const attState = findMatchingAttenderState(rawData.attenderStates, attenderId, attenderName) || {};

      const freshLead = {
        ...rawData,
        id: lead.id,
        status: attState.status || rawData.status || "Pending",
        remark: attState.remark || rawData.remark || "",
        "Called For": attState["Called For"] || attState.calledFor || rawData["Called For"] || rawData.calledFor || "",
        calledFor: attState["Called For"] || attState.calledFor || rawData["Called For"] || rawData.calledFor || "",
        Source: attState.Source || attState.source || rawData.Source || rawData.source || "",
        source: attState.Source || attState.source || rawData.Source || rawData.source || "",
        history: Array.isArray(rawData.history) && rawData.history.length > 0 ? rawData.history : (attState.history || []),
        attenderState: attState,
        _lastFetchedAt: Date.now() // Local freshness marker
      };

      delete freshLead._isNew;

      try {
        await idbSet(`tgf_contact_${lead.id}`, freshLead);
      } catch (cacheErr) {
        console.warn("Failed to cache fresh lead in IndexedDB:", cacheErr);
      }

      if (attenderId) {
        updateLocalAttenderCache(attenderId, freshLead).catch(() => {});
      }

      return freshLead;
    } catch (err) {
      console.warn(`[FETCH FAILED] ${lead.id}:`, err);
      return lead;
    } finally {
      sharedFetches.delete(lead.id);
    }
  })();

  if (!forceRefresh) {
    sharedFetches.set(lead.id, fetchPromise);
  }

  return await fetchPromise;
};

// Pending Write Queue for Offline Persistence / Coalesced Updates
const pendingWriteQueue = [];
let isFlushingQueue = false;

export const queuePendingWrite = (type, payload) => {
  pendingWriteQueue.push({ type, payload, timestamp: Date.now() });
};

export const flushPendingWrites = async (processorFn) => {
  if (isFlushingQueue || pendingWriteQueue.length === 0) return;
  isFlushingQueue = true;
  try {
    while (pendingWriteQueue.length > 0) {
      const item = pendingWriteQueue.shift();
      if (typeof processorFn === "function") {
        await processorFn(item);
      }
    }
  } catch (err) {
    console.warn("[PENDING WRITE FLUSH ERROR]", err);
  } finally {
    isFlushingQueue = false;
  }
};
