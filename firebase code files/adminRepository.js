import { idbGet, idbSet } from "./indexedDb.js";
import { getCachePartitions, getSetting } from "./firebaseRepository.js";

const ADMIN_CACHE_KEY = "tgf_admin_month_partitions_v1";

export async function loadAdminData(monthKeys, {
  forceRefresh = false
} = {}) {
  if (!forceRefresh) {
    const cached = await idbGet(ADMIN_CACHE_KEY);
    if (cached && typeof cached === "object") {
      const allPresent = monthKeys.every(key => cached[key]);
      if (allPresent) {
        console.log("[ADMIN IDB HIT]", {
          months: monthKeys,
          firestoreReads: 0
        });
        return cached;
      }
    }
  }

  const docs = await getCachePartitions(monthKeys);
  const byId = {};

  for (const item of docs) byId[item.id] = item;

  await idbSet(ADMIN_CACHE_KEY, byId);

  console.log("[ADMIN FIRESTORE LOAD]", {
    months: monthKeys,
    partitionDocuments: docs.length
  });

  return byId;
}

/**
 * Explicit single-document metadata check.
 * This is optional and should only be used if the application maintains
 * a metadata document. It does not create a listener.
 */
export async function getAdminMetadata() {
  return getSetting("call_center_metadata");
}

export async function clearAdminCache() {
  await idbSet(ADMIN_CACHE_KEY, {});
}
