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
    attenderId = args[0];
    attenderName = args[1];
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
          if (matchedStateObj && !matchedStateObj._deleted && !matchedStateObj.isDeleted) return true;

          // Check top-level attender fields
          const topIdLower = doc.attenderId ? String(doc.attenderId).toLowerCase().trim() : "";
          const topNameLower = doc.attenderName ? String(doc.attenderName).toLowerCase().trim() : "";
          if ((idLower && topIdLower === idLower) || (nameLower && topNameLower === nameLower)) return true;

          // Check assignedTo
          if (Array.isArray(doc.assignedTo)) {
            if (doc.assignedTo.some(a => {
              const aLower = String(a).toLowerCase().trim();
              return (idLower && aLower === idLower) || (nameLower && aLower === nameLower);
            })) return true;
          } else if (doc.assignedTo) {
            const aLower = String(doc.assignedTo).toLowerCase().trim();
            if ((idLower && aLower === idLower) || (nameLower && aLower === nameLower)) return true;
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
        logsToProcess = logsToProcess.map(doc => {
          if (!doc) return doc;
          const matchedStateObj = findMatchingAttenderState(doc.attenderStates, attenderId, attenderName);
          const attState = matchedStateObj || {};
          if (doc._isNew) delete doc._isNew;

          return {
            ...doc,
            status: attState.status || doc.status || "Pending",
            remark: attState.remark || doc.remark || "",
            history: Array.isArray(doc.history) && doc.history.length > 0 ? doc.history : (Array.isArray(attState.history) ? attState.history : []),
            attenderState: attState
          };
        });
      }

      let filtered = logsToProcess;
      if (tag && tag !== "ALL") {
        const tagLower = String(tag).toLowerCase().trim();
        filtered = logsToProcess.filter(log => {
          if (!log) return false;
          if (log.programId && String(log.programId).toLowerCase().trim() === tagLower) return true;
          if (log.programName && String(log.programName).toLowerCase().trim() === tagLower) return true;
          if (log.calledFor && String(log.calledFor).toLowerCase().trim() === tagLower) return true;
          if (log["Called For"] && String(log["Called For"]).toLowerCase().trim() === tagLower) return true;
          if (Array.isArray(log.tags) && log.tags.some(t => String(t).toLowerCase().trim() === tagLower)) return true;
          return false;
        });
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
  const lastFetched = lead._lastFetchedAt || 0;
  const isFresh = (Date.now() - lastFetched) < 15000; // 15 seconds freshness window

  console.log("[SHARED LEAD FETCH DECISION]", {
    leadId: lead.id,
    shared: isShared,
    isFresh: isFresh,
    lastFetchedAgo: lastFetched ? `${Math.round((Date.now() - lastFetched)/1000)}s` : "never",
    firestoreFetchRequired: forceRefresh || (isShared && !isFresh)
  });

  // If lead is NOT shared and not force-refreshed: 0 Reads
  if (!isShared && !forceRefresh) {
    console.log("[SOLO LEAD NO FETCH]", { leadId: lead.id });
    return lead;
  }

  // If shared lead was fetched within the last 15 seconds and not force-refreshed: 0 Reads
  if (isShared && isFresh && !forceRefresh) {
    console.log("[SHARED LEAD FRESH HIT]", {
      leadId: lead.id,
      reason: "Fetched less than 15s ago"
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

      const calledForVal = attState["Called For"] || attState.calledFor || rawData["Called For"] || rawData.calledFor || lead["Called For"] || lead.calledFor || "";
      const sourceVal = attState.Source || attState.source || rawData.Source || rawData.source || lead.Source || lead.source || "";

      // CRITICAL FIX: Isolate status and remark to viewing attender's attState first, falling back to local lead state
      const statusVal = attState.status !== undefined && attState.status !== null && attState.status !== "" 
        ? attState.status 
        : (lead.status || "Pending");

      const remarkVal = attState.remark !== undefined && attState.remark !== null && attState.remark !== "" 
        ? attState.remark 
        : (lead.remark || "");

      const programIdVal = lead.programId || rawData.programId || calledForVal || rawData.programName || "";
      const subProgramVal = attState["Sub Program"] || attState.subProgram || rawData["Sub Program"] || rawData.subProgram || lead["Sub Program"] || lead.subProgram || calledForVal || "";

      // Comprehensive Tag Reconstruction: Merge all tags from lead, rawData, and attState
      const tagsSet = new Set();
      const addTag = (t) => {
        if (!t) return;
        if (Array.isArray(t)) {
          t.forEach(addTag);
        } else if (typeof t === "string") {
          t.split(",").map(s => s.trim()).filter(Boolean).forEach(s => tagsSet.add(s));
        }
      };

      addTag(lead.tags);
      addTag(lead.Tags);
      addTag(lead["Sub Program"] || lead.subProgram);
      addTag(lead["Called For"] || lead.calledFor);
      addTag(lead.programId);
      addTag(lead.programName);

      addTag(rawData.tags);
      addTag(rawData.Tags);
      addTag(rawData["Sub Program"] || rawData.subProgram);
      addTag(rawData["Called For"] || rawData.calledFor);
      addTag(rawData.programId);
      addTag(rawData.programName);

      addTag(attState.tags);
      addTag(attState.Tags);
      addTag(attState["Sub Program"] || attState.subProgram);
      addTag(attState["Called For"] || attState.calledFor);
      addTag(attState.programId);
      addTag(attState.programName);

      if (calledForVal) addTag(calledForVal);
      if (subProgramVal) addTag(subProgramVal);
      if (programIdVal) addTag(programIdVal);

      const tagsArr = Array.from(tagsSet);
      const tagsStr = tagsArr.join(", ");

      const historyArr = Array.isArray(rawData.history) && rawData.history.length > 0 
        ? rawData.history 
        : (Array.isArray(attState.history) && attState.history.length > 0 ? attState.history : (lead.history || []));

      const freshLead = {
        ...rawData,
        ...lead, // Preserve local lead context FIRST
        id: lead.id,
        programId: programIdVal,
        "Sub Program": subProgramVal,
        subProgram: subProgramVal,
        tags: tagsArr,
        Tags: tagsStr,
        // CRITICAL FIX: Preserve viewing attender identity so leads remain visible in filtering
        attenderId: attenderId || lead.attenderId || rawData.attenderId,
        attenderName: attenderName || lead.attenderName || rawData.attenderName,
        assignedName: attenderName || lead.assignedName || rawData.assignedName,
        assignedTo: rawData.assignedTo || lead.assignedTo,
        _partitionKey: lead._partitionKey,
        _monthKey: lead._monthKey,
        status: statusVal,
        remark: remarkVal,
        "Called For": calledForVal,
        calledFor: calledForVal,
        Source: sourceVal,
        source: sourceVal,
        history: historyArr,
        attenderState: attState,
        attenderStates: rawData.attenderStates || lead.attenderStates,
        _lastFetchedAt: Date.now() // Local freshness marker
      };

      delete freshLead._isNew;

      try {
        await setIDBCache(`tgf_contact_${lead.id}`, freshLead);
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
