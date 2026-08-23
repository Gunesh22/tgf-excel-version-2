import {
  idbGet,
  idbSet,
  attenderCacheKey,
  leadCacheKey
} from "./indexedDb.js";
import { getCachePartitions } from "./firebaseRepository.js";
import {
  fetchSharedLeadOnce,
  isSharedLead,
  getLeadFromLocal,
  cacheLead
} from "./leadRepository.js";

/**
 * NON-REALTIME synchronization.
 *
 * There is deliberately NO onSnapshot anywhere in this module.
 * Attender screens are rendered from IndexedDB.
 * A shared lead is fetched from Firestore only when its local copy is missing,
 * unless the user explicitly requests a refresh.
 */

export async function loadAttenderView(attenderId, callback) {
  if (!attenderId) {
    callback?.([]);
    return;
  }

  const key = attenderCacheKey(attenderId);
  const cached = await idbGet(key);

  const leads = Array.isArray(cached) ? cached : [];
  console.log("[ATTENDER LOCAL LOAD]", {
    attenderId,
    leads: leads.length,
    firestoreReads: 0
  });

  callback?.(leads);
  return leads;
}

export async function openLead(lead, attenderId, attenderName) {
  if (!lead?.id) return lead;

  const local = await getLeadFromLocal(lead.id, attenderId);

  if (local && !isSharedLead(local)) {
    console.log("[NON-SHARED LEAD IDB HIT]", { leadId: lead.id });
    return local;
  }

  if (local && isSharedLead(local)) {
    return fetchSharedLeadOnce(local, attenderId, attenderName);
  }

  if (isSharedLead(lead)) {
    return fetchSharedLeadOnce(lead, attenderId, attenderName);
  }

  return lead;
}

export async function refreshSharedLead(lead, attenderId, attenderName) {
  return fetchSharedLeadOnce(lead, attenderId, attenderName, {
    forceRefresh: true
  });
}

/**
 * Optional cold boot.
 *
 * This is intentionally explicit. It is NOT a listener.
 * Existing applications can call it only when they actually need a
 * first-time population of IndexedDB.
 */
export async function coldBootAttender(attenderId, attenderName, monthKeys) {
  if (!attenderId) return [];

  const existing = await idbGet(attenderCacheKey(attenderId));
  if (Array.isArray(existing) && existing.length) {
    return existing;
  }

  const partitions = await getCachePartitions(monthKeys);
  const id = String(attenderId).trim().toLowerCase();
  const name = String(attenderName || "").trim().toLowerCase();

  const map = new Map();

  for (const partition of partitions) {
    const contacts = partition?.contacts;
    if (!contacts || typeof contacts !== "object") continue;

    for (const [contactId, raw] of Object.entries(contacts)) {
      if (!raw || raw._deleted) continue;

      const states = raw.attenderStates || {};
      const state = states[attenderId] || Object.values(states).find(s => {
        const n = String(s?.attenderName || s?.name || "").trim().toLowerCase();
        return n && n === name;
      });

      const assigned = Array.isArray(raw.assignedTo)
        ? raw.assignedTo.map(String)
        : raw.assignedTo ? [String(raw.assignedTo)] : [];

      const belongs =
        !!state ||
        assigned.some(v => v.trim().toLowerCase() === id) ||
        assigned.some(v => name && v.trim().toLowerCase() === name);

      if (!belongs) continue;

      map.set(contactId, {
        ...raw,
        id: contactId,
        attenderState: state || {}
      });
    }
  }

  const result = [...map.values()];
  await idbSet(attenderCacheKey(attenderId), result);

  console.log("[ATTENDER COLD BOOT]", {
    attenderId,
    leads: result.length,
    firestoreReadSource: "callCenterCache partitions"
  });

  return result;
}

export async function writeLeadToLocalCaches(lead, attenderId) {
  await cacheLead(lead, attenderId);
}
