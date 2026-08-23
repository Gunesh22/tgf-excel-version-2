import { idbGet, idbSet, leadCacheKey, attenderCacheKey } from "./indexedDb.js";
import {
  getContact,
  getContactsByNormalizedPhone,
  writeContact,
  batchWriteContactAndCache
} from "./firebaseRepository.js";

const sharedFetches = new Map();
const duplicateChecks = new Map();
const DUP_TTL = 5 * 60 * 1000;

export function isSharedLead(lead) {
  if (!lead) return false;

  // Explicit canonical flag wins.
  if (lead.isSharedLead === true || lead.shared === true) return true;

  const states = lead.attenderStates && typeof lead.attenderStates === "object"
    ? Object.entries(lead.attenderStates)
        .filter(([, state]) => state && !state._deleted && !state.isDeleted)
    : [];

  if (states.length > 1) return true;

  const assigned = Array.isArray(lead.assignedTo)
    ? lead.assignedTo.filter(Boolean)
    : typeof lead.assignedTo === "string"
      ? lead.assignedTo.split(",").map(v => v.trim()).filter(Boolean)
      : [];

  return assigned.length > 1;
}

function makeAttenderView(lead, attenderId, attenderName) {
  if (!lead) return null;

  const states = lead.attenderStates || {};
  let state = states[attenderId];

  if (!state && attenderName) {
    const target = String(attenderName).trim().toLowerCase();
    const entry = Object.entries(states).find(([, value]) => {
      const name = String(value?.attenderName || value?.name || "").trim().toLowerCase();
      return name && name === target;
    });
    state = entry?.[1];
  }

  state = state || {};

  return {
    ...lead,
    id: lead.id,
    status: state.status || lead.status || "Pending",
    remark: state.remark ?? lead.remark ?? "",
    calledFor: state.calledFor || state["Called For"] || lead.calledFor || lead["Called For"] || "",
    "Called For": state.calledFor || state["Called For"] || lead.calledFor || lead["Called For"] || "",
    source: state.source || state.Source || lead.source || lead.Source || "",
    Source: state.source || state.Source || lead.source || lead.Source || "",
    attenderState: state
  };
}

export async function getLeadFromLocal(leadId, attenderId) {
  if (attenderId) {
    const list = await idbGet(attenderCacheKey(attenderId));
    if (Array.isArray(list)) {
      const hit = list.find(item => item?.id === leadId);
      if (hit) return hit;
    }
  }
  return idbGet(leadCacheKey(leadId));
}

export async function cacheLead(lead, attenderId) {
  if (!lead?.id) return;

  await idbSet(leadCacheKey(lead.id), lead);

  if (!attenderId) return;

  const key = attenderCacheKey(attenderId);
  const existing = await idbGet(key);
  const list = Array.isArray(existing) ? [...existing] : [];
  const index = list.findIndex(item => item?.id === lead.id);

  if (index >= 0) list[index] = { ...list[index], ...lead };
  else list.unshift(lead);

  await idbSet(key, list);
}

export async function fetchSharedLeadOnce(lead, attenderId, attenderName, {
  forceRefresh = false
} = {}) {
  if (!lead?.id || lead._isNew) return lead;

  const local = await getLeadFromLocal(lead.id, attenderId);

  if (!forceRefresh && local) {
    console.log("[SHARED LEAD IDB HIT]", {
      leadId: lead.id,
      reads: 0
    });
    return makeAttenderView(local, attenderId, attenderName);
  }

  const existing = sharedFetches.get(lead.id);
  if (existing) {
    console.log("[SHARED LEAD INFLIGHT HIT]", { leadId: lead.id });
    const result = await existing;
    return makeAttenderView(result, attenderId, attenderName);
  }

  console.log("[SHARED LEAD FIRESTORE FETCH]", {
    leadId: lead.id,
    forceRefresh
  });

  const promise = (async () => {
    try {
      const fresh = await getContact(lead.id);
      if (!fresh) return lead;

      await cacheLead(fresh, attenderId);
      return fresh;
    } finally {
      sharedFetches.delete(lead.id);
    }
  })();

  sharedFetches.set(lead.id, promise);
  const fresh = await promise;
  return makeAttenderView(fresh, attenderId, attenderName);
}

export async function checkDuplicatePhone(normalizedPhone) {
  if (!normalizedPhone) return null;

  const cached = duplicateChecks.get(normalizedPhone);
  if (cached && Date.now() - cached.time < DUP_TTL) {
    return cached.result;
  }

  const result = await getContactsByNormalizedPhone(normalizedPhone);
  const first = result[0] || null;

  duplicateChecks.set(normalizedPhone, {
    result: first,
    time: Date.now()
  });

  return first;
}

export function clearDuplicateCache(phone) {
  if (phone) duplicateChecks.delete(phone);
  else duplicateChecks.clear();
}

export async function saveLead(contactId, updates, attenderId) {
  const existing = await getLeadFromLocal(contactId, attenderId);
  const merged = {
    ...(existing || {}),
    ...updates,
    id: contactId,
    updatedAt: new Date().toISOString()
  };

  // Local-first UI update.
  await cacheLead(merged, attenderId);

  // One explicit Firebase write. No read required if caller already supplied current data.
  await writeContact(contactId, updates, true);

  return merged;
}

export function clearSharedFetches() {
  sharedFetches.clear();
}
