import { runTransaction, deleteField, or, getCountFromServer, documentId } from "firebase/firestore";
import { globalActivePartitionsCache } from "./cache";
import { collection, getDocs, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, where, Timestamp, getDoc, writeBatch,   onSnapshot } from "firebase/firestore";
import { db } from "../firebase.js";
import { getIDBCache, setIDBCache } from "./cache.js";

// ADMIN DASHBOARD
// ─────────────────────────────────────────────

const safeTimestampNumber = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "object" && ts.seconds !== undefined) return ts.seconds * 1000;
  const time = new Date(ts).getTime();
  return isNaN(time) ? Date.now() : time;
};

export const getMonthStr = (ts) => {
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

export const getCutoffMonth = (numMonths = 3) => {
  const d = new Date();
  d.setMonth(d.getMonth() - (numMonths - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const pruneContactForCacheForMonth = (c, monthStr) => {
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
  } catch {
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
          } catch { /* empty */ }
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
          if (globalActivePartitionsCache[month][knownPartId]) {
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
        const newRef = doc(db, "callCenterCache", newPartId);
        await setDoc(newRef, { contacts: { [contactId]: prunedContact } }, { merge: true });
      }
    } else {
      // No partition doc exists yet for this month -> create part1
      const newPartId = `${month}_part1`;
      const newRef = doc(db, "callCenterCache", newPartId);
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

export const verifyCallCenterCache = async () => {
  try {
    const liveSnap = await getDocs(collection(db, "contacts"));
//     const currentMonth = getMonthStr(new Date());
    
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
        } catch { /* empty */ }
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