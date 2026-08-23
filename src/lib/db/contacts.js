import { documentId } from "firebase/firestore";
import { updateLocalAttenderCache, updateCacheContacts } from "./cache";
import { normalizePhone, registerActiveTag, formatContactName, parseTags } from "./metadata";
import { registerRegistrationMonth } from "./reports";
import { addDoc, limit, deleteField, writeBatch } from "firebase/firestore";
import { queuePendingWrite } from "./cache";
import { findMatchingAttenderState } from "./metadata";
import { collection, getDocs, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, where, Timestamp, getDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import {  } from "../db.js";
import { } from "./metadata.js";

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

  // Handle "Reg.Done" registrations collection sync (only when status/program changed, saving 1 read per save)
  const registrationSyncRequired = 
    updates.status === "Reg.Done" || 
    previousStatus === "Reg.Done" || 
    updates["Called For"] !== undefined ||
    updates.calledFor !== undefined ||
    updates.called_for !== undefined;

  if (registrationSyncRequired || freshData._deleted) {
    try {
      if (!freshData || freshData._deleted) {
        // If contact is deleted, clean up all its registration snapshots
        const q = query(
          where(documentId(), ">=", logId),
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
}
// Option A Scoped Sync: Contacts collection is the direct source of truth (0 extra callCenterCache reads/writes)
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
    const { attenderStates: _attenderStates, ...restPayload } = logPayload;
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
export const extractIndividualPhones = (phoneStr) => {
  if (!phoneStr) return [];
  return String(phoneStr)
    .split(/[/,]+/)
    .map(p => p.replace(/\D/g, ''))
    .filter(p => p.length >= 10);
};

const dupCheckCacheMap = new Map();
let currentDebounceController = null;

export const checkGlobalDuplicate = async (phone, excludeContactId = null) => {
  if (!phone) return null;
  const digitsOnly = String(phone).replace(/\D/g, "");
  if (digitsOnly.length < 10) return null;

  const numbersToCheck = extractIndividualPhones(phone);
  if (numbersToCheck.length === 0) return null;
  
  const cacheKey = `${numbersToCheck.sort().join("_")}_${excludeContactId || ""}`;
  if (dupCheckCacheMap.has(cacheKey)) {
    const cachedEntry = dupCheckCacheMap.get(cacheKey);
    if (Date.now() - cachedEntry.timestamp < 300000) { 
      return cachedEntry.result;
    }
  }

  if (currentDebounceController) currentDebounceController.cancelled = true;
  const myController = { cancelled: false };
  currentDebounceController = myController;

  await new Promise(resolve => setTimeout(resolve, 200));
  if (myController.cancelled) return null;

  try {
     const db_idb = await new Promise((res, rej) => {
       const req = window.indexedDB.open("TGF_AppCache", 1);
       req.onsuccess = () => res(req.result);
       req.onerror = () => rej(req.error);
     });
     
     const tx = db_idb.transaction("registrations_cache", "readonly");
     const store = tx.objectStore("registrations_cache");
     const allKeysReq = store.getAllKeys();
     
     const idbMatch = await new Promise((resolve) => {
       allKeysReq.onsuccess = async () => {
         const keys = allKeysReq.result || [];
         for (const k of keys) {
            if (typeof k === "string" && k.startsWith("tgf_attender_logs_")) {
               const logs = await new Promise(r => {
                 const getReq = store.get(k);
                 getReq.onsuccess = () => r(getReq.result);
                 getReq.onerror = () => r(null);
               });
               if (Array.isArray(logs)) {
                 const match = logs.find(log => {
                    if (log.id === excludeContactId) return false;
                    const logNorms = log.normalizedPhones || [];
                    return numbersToCheck.some(n => logNorms.includes(n) || log.normalizedPhone === n || log.normalizedMobile === n);
                 });
                 if (match) {
                    resolve(match);
                    return;
                 }
               }
            }
         }
         resolve(null);
       };
       allKeysReq.onerror = () => resolve(null);
     });
     
     if (idbMatch) {
        console.log(`[LOCAL DUP CHECK] Found duplicate in IndexedDB for ${digitsOnly}`);
        const result = {
          isDuplicate: true,
          contactId: idbMatch.id,
          assignedTo: idbMatch.assignedTo || [],
          assignedName: idbMatch.assignedName || "Unknown",
          contactName: idbMatch.name || "Unknown",
          tags: Array.isArray(idbMatch.tags) ? idbMatch.tags : [],
          status: idbMatch.status || "Pending",
          source: "local_cache"
        };
        dupCheckCacheMap.set(cacheKey, { timestamp: Date.now(), result });
        return result;
     }
  } catch(e) {
     console.warn("Local IDB duplicate check failed:", e);
  }

  const promises = [];
  numbersToCheck.forEach(norm => {
    promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm))));
    promises.push(getDocs(query(collection(db, "contacts"), where("normalizedPhone", "==", norm))));
    promises.push(getDocs(query(collection(db, "contacts"), where("normalizedMobile", "==", norm))));
  });
  
  const snaps = await Promise.all(promises);
  for (const snap of snaps) {
    for (const docSnap of snap.docs) {
      if (docSnap.id !== excludeContactId) {
        const d = docSnap.data();
        const result = {
          isDuplicate: true,
          contactId: docSnap.id,
          assignedTo: d.assignedTo || [],
          assignedName: d.assignedName || "Unknown",
          contactName: d.name || "Unknown",
          tags: Array.isArray(d.tags) ? d.tags : [],
          status: d.status || "Pending",
          source: "firestore"
        };
        dupCheckCacheMap.set(cacheKey, { timestamp: Date.now(), result });
        return result;
      }
    }
  }
  
  const result = null;
  dupCheckCacheMap.set(cacheKey, { timestamp: Date.now(), result });
  return result;
};

export const getAttenderContactCount = async (attenderId) => {
  if (!attenderId) return 0;
  const q = query(collection(db, "contacts"), where("assignedTo", "array-contains", attenderId));
  const snap = await getDocs(q);
  let count = 0;
  snap.forEach(d => {
    if (!d.data()._deleted) count++;
  });
  return count;
};

