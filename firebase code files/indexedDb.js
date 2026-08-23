const DB_NAME = "TGF_CallCenter_Cache";
const DB_VERSION = 2;
const STORE = "kv_store";

let dbPromise = null;

function assertBrowser() {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("IndexedDB is not available");
  }
}

export function openDB() {
  assertBrowser();

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function idbGet(key) {
  try {
    const database = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function idbSet(key, value) {
  try {
    const database = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    return false;
  }
}

export async function idbDelete(key) {
  try {
    const database = await openDB();
    return await new Promise(resolve => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function idbClear() {
  try {
    const database = await openDB();
    return await new Promise(resolve => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export const attenderCacheKey = id => `tgf_attender_logs_${id}`;
export const leadCacheKey = id => `tgf_lead_${id}`;
export const attenderListCacheKey = () => "tgf_cached_attenders";
