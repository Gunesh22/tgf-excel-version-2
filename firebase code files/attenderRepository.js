import { idbGet, idbSet, attenderCacheKey, attenderListCacheKey } from "./indexedDb.js";
import { getAttendersFromFirebase } from "./firebaseRepository.js";

let memoryAttenders = null;
let inFlightAttenders = null;

export async function getAttenders({ forceRefresh = false } = {}) {
  if (!forceRefresh && Array.isArray(memoryAttenders)) {
    return memoryAttenders;
  }

  if (!forceRefresh) {
    const cached = await idbGet(attenderListCacheKey());
    if (Array.isArray(cached) && cached.length) {
      memoryAttenders = cached;
      return cached;
    }
  }

  if (inFlightAttenders) {
    return inFlightAttenders;
  }

  inFlightAttenders = (async () => {
    try {
      const result = await getAttendersFromFirebase();
      memoryAttenders = result;
      await idbSet(attenderListCacheKey(), result);
      return result;
    } finally {
      inFlightAttenders = null;
    }
  })();

  return inFlightAttenders;
}

export async function getAttenderLeads(attenderId) {
  if (!attenderId) return [];
  const cached = await idbGet(attenderCacheKey(attenderId));
  return Array.isArray(cached) ? cached : [];
}

export async function updateAttenderLeadCache(attenderId, lead) {
  if (!attenderId || !lead?.id) return;

  const key = attenderCacheKey(attenderId);
  const existing = await getAttenderLeads(attenderId);
  const index = existing.findIndex(item => item?.id === lead.id);

  if (index >= 0) existing[index] = { ...existing[index], ...lead };
  else existing.unshift(lead);

  await idbSet(key, existing);
}

export function invalidateAttenders() {
  memoryAttenders = null;
}
