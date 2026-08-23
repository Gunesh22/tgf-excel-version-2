import {
  collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase.js";
import { getIDBCache, setIDBCache } from "./cacheService.js";
import { diagGetDocs, diagGetDoc, diagSetDoc, diagAddDoc, diagUpdateDoc, diagDeleteDoc } from "./firebaseDiagnostics.js";

let inMemoryAttenders = null;
let inFlightAttendersPromise = null;

export const generateRandomPassword = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const invalidateAttendersCache = () => {
  inMemoryAttenders = null;
  inFlightAttendersPromise = null;
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("tgf_cached_attenders");
      if (window.indexedDB) {
        setIDBCache("tgf_cached_attenders", null).catch(() => {});
      }
    }
  } catch (e) {}
};

export const getAttenders = async (forceRefresh = false) => {
  if (!forceRefresh && Array.isArray(inMemoryAttenders) && inMemoryAttenders.length > 0) {
    return inMemoryAttenders;
  }

  if (!forceRefresh) {
    try {
      const lsCached = localStorage.getItem("tgf_cached_attenders");
      if (lsCached) {
        const parsed = JSON.parse(lsCached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryAttenders = parsed;
          return parsed;
        }
      }
    } catch (e) {}

    try {
      const cached = await getIDBCache("tgf_cached_attenders");
      if (Array.isArray(cached) && cached.length > 0) {
        inMemoryAttenders = cached;
        try { localStorage.setItem("tgf_cached_attenders", JSON.stringify(cached)); } catch (e) {}
        return cached;
      }
    } catch (e) {}
  }

  if (inFlightAttendersPromise !== null) {
    console.log("[ATTENDERS INFLIGHT HIT] Sharing pending getAttenders request");
    return inFlightAttendersPromise;
  }

  console.log("[ATTENDERS INFLIGHT START] Initiating Firestore getDocs(attenders)");

  inFlightAttendersPromise = (async () => {
    try {
      const snap = await diagGetDocs(collection(db, "attenders"), {
        function: "getAttenders",
        trigger: "Fetch attenders list"
      });
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Auto-migrate legacy attenders missing a password
      docs.forEach(a => {
        if (!a.password) {
          const generated = generateRandomPassword();
          a.password = generated;
          diagUpdateDoc(doc(db, "attenders", a.id), { password: generated }, {
            function: "getAttenders:autoMigratePassword",
            trigger: "Auto-migrate missing attender password"
          }).catch(() => {});
        }
      });

      const sorted = docs.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
      inMemoryAttenders = sorted;
      try { localStorage.setItem("tgf_cached_attenders", JSON.stringify(sorted)); } catch (e) {}
      setIDBCache("tgf_cached_attenders", sorted).catch(() => {});
      return sorted;
    } finally {
      console.log("[ATTENDERS INFLIGHT COMPLETE] getAttenders request finished");
      inFlightAttendersPromise = null;
    }
  })();

  return inFlightAttendersPromise;
};

export const createAttender = async (name, customPassword = null) => {
  invalidateAttendersCache();
  const password = customPassword || generateRandomPassword();
  const ref = await diagAddDoc(collection(db, "attenders"), {
    name,
    password,
    isActive: true,
    createdAt: serverTimestamp(),
  }, {
    function: "createAttender",
    trigger: "Admin create attender"
  });
  return { id: ref.id, password };
};

export const updateAttender = async (id, data) => {
  invalidateAttendersCache();
  const payload = typeof data === "string" ? { name: data } : data;
  await diagUpdateDoc(doc(db, "attenders", id), payload, {
    function: "updateAttender",
    trigger: "Admin update attender"
  });
};

export const deleteAttender = async (id) => {
  invalidateAttendersCache();
  await diagDeleteDoc(doc(db, "attenders", id), {
    function: "deleteAttender",
    trigger: "Admin delete attender"
  });
};

export const getAdminPassword = async () => {
  try {
    const adminDocRef = doc(db, "settings", "admin_auth");
    const snap = await diagGetDoc(adminDocRef, {
      function: "getAdminPassword",
      trigger: "Admin login verification"
    });
    if (snap.exists() && snap.data().password) {
      return snap.data().password;
    }
    const defaultPassword = "123456";
    await diagSetDoc(adminDocRef, { password: defaultPassword, updatedAt: serverTimestamp() }, { merge: true }, {
      function: "getAdminPassword:initDefault",
      trigger: "Initialize admin default password"
    });
    return defaultPassword;
  } catch (err) {
    console.error("Error fetching admin password:", err);
    return "123456";
  }
};

export const setAdminPassword = async (newPassword) => {
  const adminDocRef = doc(db, "settings", "admin_auth");
  await diagSetDoc(adminDocRef, { password: newPassword, updatedAt: serverTimestamp() }, { merge: true }, {
    function: "setAdminPassword",
    trigger: "Admin update password"
  });
};
