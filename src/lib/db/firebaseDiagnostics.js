import {
  getDoc as origGetDoc,
  getDocs as origGetDocs,
  onSnapshot as origOnSnapshot,
  setDoc as origSetDoc,
  addDoc as origAddDoc,
  updateDoc as origUpdateDoc,
  deleteDoc as origDeleteDoc,
  writeBatch as origWriteBatch,
  runTransaction as origRunTransaction,
  getCountFromServer as origGetCountFromServer
} from "firebase/firestore";

// ─────────────────────────────────────────────
// ENVIRONMENT CHECK (DEVELOPMENT ONLY)
// ─────────────────────────────────────────────
const IS_PROD = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.PROD;

// ─────────────────────────────────────────────
let currentSessionId = "S-001";
let activeAction = null;
let operationCounter = 0;
let listenerCounter = 0;
let batchCounter = 0;
let transactionCounter = 0;

const activeListenersMap = new Map();
const listenerStatsMap = new Map();
const recentReadsList = [];
const DUPLICATE_READ_WINDOW_MS = 5000;

const generateOpId = (prefix = "OP") => `${prefix}-${String(++operationCounter).padStart(3, "0")}`;
const generateListenerId = () => `L-${String(++listenerCounter).padStart(3, "0")}`;
const generateBatchId = () => `B-${String(++batchCounter).padStart(3, "0")}`;
const generateTxId = () => `TX-${String(++transactionCounter).padStart(3, "0")}`;

// Helper: extract collection name and document path from Firestore reference safely
function parseRef(ref) {
  if (!ref) return { collection: "unknown", document: "unknown" };
  try {
    if (ref.path) {
      const parts = ref.path.split("/");
      const collection = parts[0] || "unknown";
      const document = parts.slice(1).join("/") || "query/collection";
      return { collection, document, fullPath: ref.path };
    }
  } catch (e) {}
  return { collection: "unknown", document: "unknown" };
}

// Helper: extract collection name from Query or CollectionReference
function parseQueryOrCollRef(queryOrRef) {
  if (!queryOrRef) return { collection: "unknown", queryDesc: "unknown" };
  try {
    if (queryOrRef.path) {
      const parts = queryOrRef.path.split("/");
      return { collection: parts[0] || "unknown", queryDesc: queryOrRef.path };
    }
    if (queryOrRef._query && queryOrRef._query.path) {
      const parts = queryOrRef._query.path.segments || [];
      return { collection: parts[0] || "unknown", queryDesc: `query(${parts.join("/")})` };
    }
  } catch (e) {}
  return { collection: "unknown", queryDesc: "query" };
}

// Helper: check and record duplicate reads within 5 second window
function checkAndTrackDuplicateRead(opId, collection, targetPath, fnName, trigger) {
  const now = Date.now();
  const readKey = `${collection}:${targetPath}`;
  
  // Clean up entries older than 5 seconds
  while (recentReadsList.length > 0 && now - recentReadsList[0].timestamp > DUPLICATE_READ_WINDOW_MS) {
    recentReadsList.shift();
  }

  const prevMatch = recentReadsList.find(r => r.key === readKey);
  let isDup = false;
  let prevOpId = null;

  if (prevMatch) {
    isDup = true;
    prevOpId = prevMatch.operationId;
    console.warn(
      `%c[DUPLICATE FIRESTORE READ]\npreviousOperationId: ${prevOpId}\nnewOperationId: ${opId}\ncollection: ${collection}\nquery/document: ${targetPath}\nfunction: ${fnName}\ntrigger: ${trigger}`,
      "color: #FF5722; font-weight: bold; background: #2A0900; padding: 4px; border-left: 4px solid #FF5722;"
    );
  }

  recentReadsList.push({
    key: readKey,
    operationId: opId,
    collection,
    targetPath,
    function: fnName,
    trigger,
    timestamp: now
  });

  return { isDup, prevOpId };
}

// ─────────────────────────────────────────────
// SESSION & ACTION API (STEP 9 & STEP 10)
// ─────────────────────────────────────────────
export function startFirebaseDiagnosticSession(sessionId) {
  if (IS_PROD) return;
  currentSessionId = sessionId || `S-${Date.now()}`;
  console.log(`%c[FIREBASE DIAGNOSTICS] Session set to: ${currentSessionId}`, "color: #4CAF50; font-weight: bold;");
}

export function getFirebaseDiagnosticSession() {
  return currentSessionId;
}

export function startFirebaseDiagnosticAction(actionName) {
  if (IS_PROD) return;
  activeAction = {
    action: actionName,
    sessionId: currentSessionId,
    startTime: Date.now(),
    reads: [],
    writes: [],
    batches: [],
    transactions: [],
    listenersStarted: [],
    listenersStopped: [],
    snapshots: [],
    duplicateReads: []
  };
  console.log(`%c==================================================\nSTART DIAGNOSTIC ACTION: ${actionName} (Session: ${currentSessionId})\n==================================================`, "color: #2196F3; font-weight: bold;");
}

export function endFirebaseDiagnosticAction() {
  if (IS_PROD || !activeAction) return null;
  const durationMs = Date.now() - activeAction.startTime;
  const act = activeAction;

  const totalGetDocReads = act.reads.filter(r => r.operation === "getDoc").length;
  const totalGetDocsReads = act.reads.filter(r => r.operation === "getDocs").length;
  const totalReads = totalGetDocReads + totalGetDocsReads;
  const duplicateReadsCount = act.reads.filter(r => r.isDuplicate).length;
  const unnecessaryReadsCount = duplicateReadsCount; // Reads that could be avoided by caching/dedup
  const expectedReadsCount = totalReads - duplicateReadsCount;

  const serverDocsFromReads = act.reads.reduce((sum, r) => sum + (r.operation === "getDoc" ? (r.exists ? 1 : 0) : (r.documentsReturned || 0)), 0);
  const serverSnapshots = act.snapshots.filter(s => !s.fromCache);
  const cacheSnapshots = act.snapshots.filter(s => s.fromCache);
  const serverDocsFromSnapshots = serverSnapshots.reduce((sum, s) => sum + (s.documentsReturned || 0), 0);
  const totalServerDocsReturned = serverDocsFromReads + serverDocsFromSnapshots;

  const setUpdateWrites = act.writes.filter(w => w.operation === "setDoc" || w.operation === "updateDoc").length;
  const batchCount = act.batches.filter(b => b.status === "SUCCESS").length;
  const batchWriteItemsCount = act.batches.reduce((sum, b) => sum + (b.status === "SUCCESS" ? b.writeCount : 0), 0);
  const deleteWrites = act.writes.filter(w => w.operation === "deleteDoc").length +
                       act.batches.reduce((sum, b) => sum + b.writes.filter(bw => bw.operation === "deleteDoc").length, 0);
  const totalWrites = setUpdateWrites + batchWriteItemsCount + deleteWrites;

  // Duplicate Listeners Evaluation
  const listenerKeyCounts = {};
  act.listenersStarted.forEach(l => {
    const key = `${l.collection}:${l.query}`;
    if (!listenerKeyCounts[key]) listenerKeyCounts[key] = { key, count: 0, ids: [], functions: new Set(), collections: new Set() };
    listenerKeyCounts[key].count++;
    listenerKeyCounts[key].ids.push(l.listenerId);
    listenerKeyCounts[key].functions.add(l.function);
    listenerKeyCounts[key].collections.add(l.collection);
  });

  const duplicateListenersList = Object.values(listenerKeyCounts).filter(item => item.count > 1);
  const duplicateListenersCount = duplicateListenersList.reduce((acc, item) => acc + (item.count - 1), 0);
  const expectedListenersCount = act.listenersStarted.length - duplicateListenersCount;
  const leakedListenersCount = 0; // Active listeners during Admin display are EXPECTED_ACTIVE unless unmounted

  // Group by Function
  const byFunction = {};
  const addFnStat = (fn, type, count = 1) => {
    const key = fn || "unknownFunction";
    if (!byFunction[key]) byFunction[key] = { reads: 0, writes: 0, listeners: 0, snapshots: 0 };
    byFunction[key][type] += count;
  };
  act.reads.forEach(r => addFnStat(r.function, "reads"));
  act.writes.forEach(w => addFnStat(w.function, "writes"));
  act.batches.forEach(b => addFnStat(b.function, "writes", b.writeCount));
  act.listenersStarted.forEach(l => addFnStat(l.function, "listeners"));
  act.snapshots.forEach(s => addFnStat(s.function, "snapshots"));

  // Group by Collection
  const byCollection = {};
  const addCollStat = (coll, type, count = 1) => {
    const key = coll || "unknownCollection";
    if (!byCollection[key]) byCollection[key] = { reads: 0, writes: 0, listeners: 0, snapshots: 0 };
    byCollection[key][type] += count;
  };
  act.reads.forEach(r => addCollStat(r.collection, "reads"));
  act.writes.forEach(w => addCollStat(w.collection, "writes"));
  act.batches.forEach(b => b.writes.forEach(bw => addCollStat(bw.collection, "writes")));
  act.listenersStarted.forEach(l => addCollStat(l.collection, "listeners"));
  act.snapshots.forEach(s => addCollStat(s.collection, "snapshots"));

  // Duplicate Reads Summary Table
  const duplicateReadsMap = {};
  act.reads.filter(r => r.isDuplicate).forEach(r => {
    const key = `${r.collection}/${r.document || r.query}`;
    if (!duplicateReadsMap[key]) {
      duplicateReadsMap[key] = { target: key, count: 0, functions: new Set(), triggers: new Set() };
    }
    duplicateReadsMap[key].count++;
    duplicateReadsMap[key].functions.add(r.function);
    duplicateReadsMap[key].triggers.add(r.trigger);
  });

  // Top Operations by Read Count
  const topOps = [...act.reads]
    .sort((a, b) => (b.documentsReturned || 1) - (a.documentsReturned || 1))
    .slice(0, 5);

  console.log(`%c==================================================\nADMIN FIREBASE DIAGNOSTIC SUMMARY: ${act.action} (Session: ${currentSessionId})\n==================================================`, "color: #9C27B0; font-weight: bold;");
  console.log(`READS: ${totalReads}
  getDoc: ${totalGetDocReads}
  getDocs: ${totalGetDocsReads}
  server documents returned: ${totalServerDocsReturned}`);

  console.log(`WRITES: ${totalWrites}
  set/update: ${setUpdateWrites}
  batch writes: ${batchCount} (${batchWriteItemsCount} documents)
  deletes: ${deleteWrites}`);

  console.log(`LISTENERS:
  started: ${act.listenersStarted.length}
  stopped: ${act.listenersStopped.length}
  active at end (EXPECTED_ACTIVE): ${activeListenersMap.size}
  snapshots: ${act.snapshots.length}
  server snapshots: ${serverSnapshots.length}
  cache snapshots: ${cacheSnapshots.length}`);

  console.log(`\n--- METRIC CLASSIFICATION OVERVIEW ---`);
  console.log(`EXPECTED READS: ${expectedReadsCount}`);
  console.log(`UNNECESSARY READS: ${unnecessaryReadsCount}`);
  console.log(`DUPLICATE READS: ${duplicateReadsCount}`);
  console.log(`EXPECTED LISTENERS: ${expectedListenersCount}`);
  console.log(`DUPLICATE LISTENERS: ${duplicateListenersCount}`);
  console.log(`LEAKED LISTENERS: ${leakedListenersCount}`);

  console.log(`\nGROUP BY FUNCTION:`);
  console.table(byFunction);

  console.log(`\nGROUP BY COLLECTION:`);
  console.table(byCollection);

  if (Object.keys(duplicateReadsMap).length > 0) {
    console.log(`\nDUPLICATE READS:`);
    console.table(Object.values(duplicateReadsMap).map(item => ({
      "Query / Document": item.target,
      "Duplicate Count": item.count,
      "Functions": Array.from(item.functions).join(", "),
      "Triggers": Array.from(item.triggers).join(", ")
    })));
  }

  if (duplicateListenersList.length > 0) {
    console.log(`\nDUPLICATE LISTENERS:`);
    console.table(duplicateListenersList.map(item => ({
      "Listener Key": item.key,
      "Instances": item.count,
      "Listener IDs": item.ids.join(", "),
      "Functions": Array.from(item.functions).join(", "),
      "Collections": Array.from(item.collections).join(", ")
    })));
  }

  // Listener Snapshot Cost Analysis Table
  if (listenerStatsMap.size > 0) {
    console.log(`\nLISTENER SNAPSHOT COST ANALYSIS:`);
    const snapshotAnalysisData = [];
    listenerStatsMap.forEach((stats, id) => {
      snapshotAnalysisData.push({
        "Listener ID": id,
        "Collection": stats.collection,
        "Function": stats.function,
        "Initial Server Docs": stats.initialServerDocs,
        "Server Added": stats.serverAdded,
        "Server Modified": stats.serverModified,
        "Server Removed": stats.serverRemoved,
        "Cache Snapshots": stats.cacheSnapshots,
        "Total Snapshots": stats.totalSnapshots
      });
    });
    console.table(snapshotAnalysisData);
  }

  if (topOps.length > 0) {
    console.log(`\nMOST EXPENSIVE OPERATIONS:`);
    topOps.forEach((op, i) => {
      console.log(`  ${i + 1}. [${op.operation}] ${op.collection}/${op.document || op.query} -> ${op.documentsReturned || (op.exists ? 1 : 0)} docs [${op.function} -> ${op.trigger}]`);
    });
  }

  console.log(`==================================================`);

  const summary = {
    action: act.action,
    sessionId: act.sessionId,
    durationMs,
    reads: totalReads,
    expectedReads: expectedReadsCount,
    unnecessaryReads: unnecessaryReadsCount,
    duplicateReads: duplicateReadsCount,
    expectedListeners: expectedListenersCount,
    duplicateListeners: duplicateListenersCount,
    leakedListeners: leakedListenersCount,
    byFunction,
    byCollection,
    topOps
  };

  activeAction = null;
  return summary;
}

// ─────────────────────────────────────────────
// READ INSTRUMENTATION (STEP 3)
// ─────────────────────────────────────────────
export async function diagGetDoc(docRef, meta = {}) {
  if (IS_PROD) return origGetDoc(docRef);
  const opId = generateOpId("READ");
  const { collection, document } = parseRef(docRef);
  const fnName = meta.function || "unknownFunction";
  const trigger = meta.trigger || "unknownTrigger";
  const start = Date.now();

  const { isDup, prevOpId } = checkAndTrackDuplicateRead(opId, collection, document, fnName, trigger);

  try {
    const snap = await origGetDoc(docRef);
    const durationMs = Date.now() - start;
    const entry = {
      operationId: opId,
      operation: "getDoc",
      collection,
      document,
      function: fnName,
      trigger,
      timestamp: new Date().toISOString(),
      durationMs,
      exists: snap.exists(),
      isDuplicate: isDup,
      previousOpId: prevOpId,
      sessionId: currentSessionId
    };

    console.log(`[FIREBASE READ]`, entry);
    if (activeAction) {
      activeAction.reads.push(entry);
      if (isDup) activeAction.duplicateReads.push(entry);
    }
    return snap;
  } catch (err) {
    console.error(`[FIREBASE READ FAILED] ${opId} getDoc ${collection}/${document}:`, err);
    throw err;
  }
}

export async function diagGetDocs(queryRef, meta = {}) {
  if (IS_PROD) return origGetDocs(queryRef);
  const opId = generateOpId("READ");
  const { collection, queryDesc } = parseQueryOrCollRef(queryRef);
  const fnName = meta.function || "unknownFunction";
  const trigger = meta.trigger || "unknownTrigger";
  const start = Date.now();

  const { isDup, prevOpId } = checkAndTrackDuplicateRead(opId, collection, queryDesc, fnName, trigger);

  try {
    const snap = await origGetDocs(queryRef);
    const durationMs = Date.now() - start;
    const entry = {
      operationId: opId,
      operation: "getDocs",
      collection,
      query: queryDesc,
      function: fnName,
      trigger,
      timestamp: new Date().toISOString(),
      durationMs,
      documentsReturned: snap.docs.length,
      isDuplicate: isDup,
      previousOpId: prevOpId,
      sessionId: currentSessionId
    };

    console.log(`[FIREBASE READ]`, entry);
    if (activeAction) {
      activeAction.reads.push(entry);
      if (isDup) activeAction.duplicateReads.push(entry);
    }
    return snap;
  } catch (err) {
    console.error(`[FIREBASE READ FAILED] ${opId} getDocs ${collection}:`, err);
    throw err;
  }
}

// ─────────────────────────────────────────────
// LISTENER INSTRUMENTATION (STEP 4 & STEP 12)
// ─────────────────────────────────────────────
export function diagOnSnapshot(queryOrDocRef, arg2, arg3, arg4) {
  if (IS_PROD) return origOnSnapshot(queryOrDocRef, arg2, arg3, arg4);

  let options = {};
  let onNext;
  let onError;
  let onCompletion;

  if (typeof arg2 === "function") {
    onNext = arg2;
    if (typeof arg3 === "function") {
      onError = arg3;
      onCompletion = arg4;
    } else if (typeof arg3 === "object") {
      options = arg3;
    }
  } else if (typeof arg2 === "object") {
    options = arg2;
    onNext = arg3;
    onError = arg4;
  }

  const meta = options.__meta || {};
  const listenerId = meta.listenerId || generateListenerId();
  const { collection, queryDesc } = parseQueryOrCollRef(queryOrDocRef);
  const fnName = meta.function || "unknownFunction";
  const trigger = meta.trigger || "unknownTrigger";
  const startTime = Date.now();

  // Detect duplicate listeners
  const listenerKey = `${collection}:${queryDesc}:${fnName}`;
  activeListenersMap.forEach((existing, existingId) => {
    const existingKey = `${existing.collection}:${existing.query}:${existing.function}`;
    if (existingKey === listenerKey || existingId === listenerId) {
      console.warn(
        `%c[ADMIN DUPLICATE LISTENER] Duplicate listener detected! Previous ID: "${existingId}", New ID: "${listenerId}" | Function: "${fnName}" | Collection: "${collection}"`,
        "color: #FF9800; font-weight: bold; background: #331A00; padding: 2px 6px; border-radius: 3px;"
      );
    }
  });

  const listenerInfo = {
    listenerId,
    collection,
    query: queryDesc,
    function: fnName,
    trigger,
    timestamp: new Date().toISOString(),
    startTime,
    sessionId: currentSessionId
  };

  activeListenersMap.set(listenerId, listenerInfo);
  console.log(`[FIREBASE LISTENER START]`, listenerInfo);
  if (activeAction) activeAction.listenersStarted.push(listenerInfo);

  const wrappedOnNext = (snapshot) => {
    let added = 0;
    let modified = 0;
    let removed = 0;

    if (typeof snapshot.docChanges === "function") {
      const changes = snapshot.docChanges();
      changes.forEach(c => {
        if (c.type === "added") added++;
        else if (c.type === "modified") modified++;
        else if (c.type === "removed") removed++;
      });
    }

    const docsReturned = snapshot.docs ? snapshot.docs.length : (snapshot.exists ? 1 : 0);
    const fromCache = snapshot.metadata ? snapshot.metadata.fromCache : false;
    const hasPendingWrites = snapshot.metadata ? snapshot.metadata.hasPendingWrites : false;
    const source = snapshot.metadata ? (fromCache ? "cache" : "server") : "unknown";

    // Track listener snapshot cost statistics
    if (!listenerStatsMap.has(listenerId)) {
      listenerStatsMap.set(listenerId, {
        listenerId,
        collection,
        function: fnName,
        initialServerDocs: 0,
        serverAdded: 0,
        serverModified: 0,
        serverRemoved: 0,
        cacheSnapshots: 0,
        totalSnapshots: 0,
        hasReceivedInitialServer: false
      });
    }
    const lStats = listenerStatsMap.get(listenerId);
    lStats.totalSnapshots++;
    if (fromCache) {
      lStats.cacheSnapshots++;
    } else {
      if (!lStats.hasReceivedInitialServer) {
        lStats.hasReceivedInitialServer = true;
        lStats.initialServerDocs = docsReturned;
      } else {
        lStats.serverAdded += added;
        lStats.serverModified += modified;
        lStats.serverRemoved += removed;
      }
    }

    const snapLog = {
      listenerId,
      collection,
      timestamp: new Date().toISOString(),
      source,
      fromCache,
      hasPendingWrites,
      documentsReturned: docsReturned,
      added,
      modified,
      removed,
      sessionId: currentSessionId
    };

    console.log(`[FIREBASE SNAPSHOT]`, snapLog);
    if (activeAction) activeAction.snapshots.push(snapLog);

    if (onNext) onNext(snapshot);
  };

  const cleanOptions = { ...options };
  delete cleanOptions.__meta;

  const unsubscribe = origOnSnapshot(
    queryOrDocRef,
    Object.keys(cleanOptions).length > 0 ? cleanOptions : wrappedOnNext,
    Object.keys(cleanOptions).length > 0 ? wrappedOnNext : onError,
    Object.keys(cleanOptions).length > 0 ? onError : onCompletion
  );

  return () => {
    const lifetimeMs = Date.now() - startTime;
    activeListenersMap.delete(listenerId);
    const stopLog = {
      listenerId,
      collection,
      function: fnName,
      trigger,
      lifetimeMs,
      timestamp: new Date().toISOString(),
      sessionId: currentSessionId
    };
    console.log(`[FIREBASE LISTENER STOP]`, stopLog);
    if (activeAction) activeAction.listenersStopped.push(stopLog);
    return unsubscribe();
  };
}

// ─────────────────────────────────────────────
// WRITE INSTRUMENTATION (STEP 5)
// ─────────────────────────────────────────────
export async function diagSetDoc(docRef, data, options, meta) {
  if (IS_PROD) return origSetDoc(docRef, data, options);

  // Handle optional options overload (setDoc(ref, data, { merge: true }))
  let actualOptions = options;
  let actualMeta = meta || {};
  if (options && (options.function || options.trigger)) {
    actualMeta = options;
    actualOptions = undefined;
  }

  const opId = generateOpId("WRITE");
  const { collection, document } = parseRef(docRef);
  const fnName = actualMeta.function || "unknownFunction";
  const trigger = actualMeta.trigger || "unknownTrigger";
  const fieldNames = data && typeof data === "object" ? Object.keys(data) : [];
  const start = Date.now();

  try {
    const res = actualOptions ? await origSetDoc(docRef, data, actualOptions) : await origSetDoc(docRef, data);
    const durationMs = Date.now() - start;
    const entry = {
      operationId: opId,
      operation: "setDoc",
      collection,
      document,
      function: fnName,
      trigger,
      timestamp: new Date().toISOString(),
      durationMs,
      fieldNames,
      sessionId: currentSessionId
    };
    console.log(`[FIREBASE WRITE]`, entry);
    if (activeAction) activeAction.writes.push(entry);
    return res;
  } catch (err) {
    console.error(`[FIREBASE WRITE FAILED] ${opId} setDoc ${collection}/${document}:`, err);
    throw err;
  }
}

export async function diagAddDoc(collRef, data, meta = {}) {
  if (IS_PROD) return origAddDoc(collRef, data);
  const opId = generateOpId("WRITE");
  const { collection } = parseRef(collRef);
  const fnName = meta.function || "unknownFunction";
  const trigger = meta.trigger || "unknownTrigger";
  const fieldNames = data && typeof data === "object" ? Object.keys(data) : [];
  const start = Date.now();

  try {
    const res = await origAddDoc(collRef, data);
    const durationMs = Date.now() - start;
    const entry = {
      operationId: opId,
      operation: "addDoc",
      collection,
      document: res.id,
      function: fnName,
      trigger,
      timestamp: new Date().toISOString(),
      durationMs,
      fieldNames,
      sessionId: currentSessionId
    };
    console.log(`[FIREBASE WRITE]`, entry);
    if (activeAction) activeAction.writes.push(entry);
    return res;
  } catch (err) {
    console.error(`[FIREBASE WRITE FAILED] ${opId} addDoc ${collection}:`, err);
    throw err;
  }
}

export async function diagUpdateDoc(docRef, data, meta = {}) {
  if (IS_PROD) return origUpdateDoc(docRef, data);
  const opId = generateOpId("WRITE");
  const { collection, document } = parseRef(docRef);
  const fnName = meta.function || "unknownFunction";
  const trigger = meta.trigger || "unknownTrigger";
  const fieldNames = data && typeof data === "object" ? Object.keys(data) : [];
  const start = Date.now();

  try {
    const res = await origUpdateDoc(docRef, data);
    const durationMs = Date.now() - start;
    const entry = {
      operationId: opId,
      operation: "updateDoc",
      collection,
      document,
      function: fnName,
      trigger,
      timestamp: new Date().toISOString(),
      durationMs,
      fieldNames,
      sessionId: currentSessionId
    };
    console.log(`[FIREBASE WRITE]`, entry);
    if (activeAction) activeAction.writes.push(entry);
    return res;
  } catch (err) {
    console.error(`[FIREBASE WRITE FAILED] ${opId} updateDoc ${collection}/${document}:`, err);
    throw err;
  }
}

export async function diagDeleteDoc(docRef, meta = {}) {
  if (IS_PROD) return origDeleteDoc(docRef);
  const opId = generateOpId("WRITE");
  const { collection, document } = parseRef(docRef);
  const fnName = meta.function || "unknownFunction";
  const trigger = meta.trigger || "unknownTrigger";
  const start = Date.now();

  try {
    const res = await origDeleteDoc(docRef);
    const durationMs = Date.now() - start;
    const entry = {
      operationId: opId,
      operation: "deleteDoc",
      collection,
      document,
      function: fnName,
      trigger,
      timestamp: new Date().toISOString(),
      durationMs,
      sessionId: currentSessionId
    };
    console.log(`[FIREBASE WRITE]`, entry);
    if (activeAction) activeAction.writes.push(entry);
    return res;
  } catch (err) {
    console.error(`[FIREBASE WRITE FAILED] ${opId} deleteDoc ${collection}/${document}:`, err);
    throw err;
  }
}

// ─────────────────────────────────────────────
// WRITE BATCH INSTRUMENTATION (STEP 6)
// ─────────────────────────────────────────────
export function diagWriteBatch(dbInstance, meta = {}) {
  const batch = origWriteBatch(dbInstance);
  if (IS_PROD) return batch;

  const batchId = generateBatchId();
  const fnName = meta.function || "unknownFunction";
  const trigger = meta.trigger || "unknownTrigger";
  const writes = [];

  const wrapper = {
    set(docRef, data, options) {
      const { collection, document } = parseRef(docRef);
      writes.push({ operation: "setDoc", collection, document });
      if (options) batch.set(docRef, data, options);
      else batch.set(docRef, data);
      return wrapper;
    },
    update(docRef, data) {
      const { collection, document } = parseRef(docRef);
      writes.push({ operation: "updateDoc", collection, document });
      batch.update(docRef, data);
      return wrapper;
    },
    delete(docRef) {
      const { collection, document } = parseRef(docRef);
      writes.push({ operation: "deleteDoc", collection, document });
      batch.delete(docRef);
      return wrapper;
    },
    async commit() {
      const start = Date.now();
      const startLog = {
        batchId,
        function: fnName,
        trigger,
        timestamp: new Date().toISOString(),
        writeCount: writes.length,
        writes,
        sessionId: currentSessionId
      };
      console.log(`[FIREBASE BATCH START]`, startLog);

      try {
        const res = await batch.commit();
        const durationMs = Date.now() - start;
        const successLog = {
          batchId,
          writeCount: writes.length,
          durationMs,
          timestamp: new Date().toISOString(),
          sessionId: currentSessionId
        };
        console.log(`[FIREBASE BATCH SUCCESS]`, successLog);

        if (activeAction) {
          activeAction.batches.push({
            batchId,
            function: fnName,
            trigger,
            writeCount: writes.length,
            writes,
            status: "SUCCESS",
            durationMs
          });
        }
        return res;
      } catch (err) {
        const failLog = {
          batchId,
          error: err ? err.message : "Unknown error",
          writeCount: writes.length,
          timestamp: new Date().toISOString(),
          sessionId: currentSessionId
        };
        console.error(`[FIREBASE BATCH FAILED]`, failLog);
        if (activeAction) {
          activeAction.batches.push({
            batchId,
            function: fnName,
            trigger,
            writeCount: writes.length,
            writes,
            status: "FAILED",
            error: err ? err.message : "Unknown error"
          });
        }
        throw err;
      }
    }
  };

  return wrapper;
}

// ─────────────────────────────────────────────
// TRANSACTION INSTRUMENTATION (STEP 7)
// ─────────────────────────────────────────────
export async function diagRunTransaction(dbInstance, updateFunction, meta = {}) {
  if (IS_PROD) return origRunTransaction(dbInstance, updateFunction);

  const txId = generateTxId();
  const fnName = meta.function || "unknownFunction";
  const trigger = meta.trigger || "unknownTrigger";
  const start = Date.now();

  console.log(`[FIREBASE TRANSACTION START]`, {
    transactionId: txId,
    function: fnName,
    trigger,
    timestamp: new Date().toISOString(),
    sessionId: currentSessionId
  });

  try {
    const res = await origRunTransaction(dbInstance, async (transaction) => {
      return updateFunction(transaction);
    });
    const durationMs = Date.now() - start;
    console.log(`[FIREBASE TRANSACTION SUCCESS]`, {
      transactionId: txId,
      function: fnName,
      trigger,
      durationMs,
      timestamp: new Date().toISOString(),
      sessionId: currentSessionId
    });
    return res;
  } catch (err) {
    console.error(`[FIREBASE TRANSACTION FAILED]`, {
      transactionId: txId,
      function: fnName,
      trigger,
      error: err ? err.message : "Unknown error",
      timestamp: new Date().toISOString(),
      sessionId: currentSessionId
    });
    throw err;
  }
}

// ─────────────────────────────────────────────
// COUNT INSTRUMENTATION
// ─────────────────────────────────────────────
export async function diagGetCountFromServer(queryRef, meta = {}) {
  if (IS_PROD) return origGetCountFromServer(queryRef);
  const opId = generateOpId("READ");
  const { collection, queryDesc } = parseQueryOrCollRef(queryRef);
  const fnName = meta.function || "unknownFunction";
  const trigger = meta.trigger || "unknownTrigger";
  const start = Date.now();

  try {
    const snap = await origGetCountFromServer(queryRef);
    const durationMs = Date.now() - start;
    console.log(`[FIREBASE READ]`, {
      operationId: opId,
      operation: "getCountFromServer",
      collection,
      query: queryDesc,
      function: fnName,
      trigger,
      timestamp: new Date().toISOString(),
      durationMs,
      count: snap.data().count,
      sessionId: currentSessionId
    });
    return snap;
  } catch (err) {
    console.error(`[FIREBASE READ FAILED] ${opId} getCountFromServer:`, err);
    throw err;
  }
}

// ─────────────────────────────────────────────
// GLOBAL BROWSER EXPOSURE (DEV ONLY)
// ─────────────────────────────────────────────
if (!IS_PROD && typeof window !== "undefined") {
  window.startFirebaseDiagnosticSession = startFirebaseDiagnosticSession;
  window.getFirebaseDiagnosticSession = getFirebaseDiagnosticSession;
  window.startFirebaseDiagnosticAction = startFirebaseDiagnosticAction;
  window.endFirebaseDiagnosticAction = endFirebaseDiagnosticAction;
  window.getActiveFirebaseListeners = () => Array.from(activeListenersMap.values());
  console.log(`%c[FIREBASE DIAGNOSTICS INITIALIZED] Diagnostic functions attached to window.`, "color: #00BCD4; font-weight: bold;");
}
