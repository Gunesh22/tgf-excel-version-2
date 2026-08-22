import {
  collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase.js";
import { getIDBCache, setIDBCache } from "./cacheService.js";

let inMemoryAttenders = null;

export const generateRandomPassword = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const invalidateAttendersCache = () => {
  inMemoryAttenders = null;
  try {
    if (typeof window !== "undefined" && window.indexedDB) {
      setIDBCache("tgf_cached_attenders", null).catch(() => {});
    }
  } catch (e) {}
};

export const getAttenders = async (forceRefresh = false) => {
  if (!forceRefresh && Array.isArray(inMemoryAttenders) && inMemoryAttenders.length > 0) {
    return inMemoryAttenders;
  }

  if (!forceRefresh) {
    try {
      const cached = await getIDBCache("tgf_cached_attenders");
      if (Array.isArray(cached) && cached.length > 0) {
        inMemoryAttenders = cached;
        return cached;
      }
    } catch (e) {}
  }

  const snap = await getDocs(collection(db, "attenders"));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Auto-migrate legacy attenders missing a password
  docs.forEach(a => {
    if (!a.password) {
      const generated = generateRandomPassword();
      a.password = generated;
      updateDoc(doc(db, "attenders", a.id), { password: generated }).catch(() => {});
    }
  });

  const sorted = docs.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
  inMemoryAttenders = sorted;
  setIDBCache("tgf_cached_attenders", sorted).catch(() => {});
  return sorted;
};

export const createAttender = async (name, customPassword = null) => {
  invalidateAttendersCache();
  const password = customPassword || generateRandomPassword();
  const ref = await addDoc(collection(db, "attenders"), {
    name,
    password,
    isActive: true,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, password };
};

export const updateAttender = async (id, data) => {
  invalidateAttendersCache();
  const payload = typeof data === "string" ? { name: data } : data;
  await updateDoc(doc(db, "attenders", id), payload);
};

export const deleteAttender = async (id) => {
  invalidateAttendersCache();
  await deleteDoc(doc(db, "attenders", id));
};

export const getAdminPassword = async () => {
  try {
    const adminDocRef = doc(db, "settings", "admin_auth");
    const snap = await getDoc(adminDocRef);
    if (snap.exists() && snap.data().password) {
      return snap.data().password;
    }
    const defaultPassword = "123456";
    await setDoc(adminDocRef, { password: defaultPassword, updatedAt: serverTimestamp() }, { merge: true });
    return defaultPassword;
  } catch (err) {
    console.error("Error fetching admin password:", err);
    return "123456";
  }
};

export const setAdminPassword = async (newPassword) => {
  const adminDocRef = doc(db, "settings", "admin_auth");
  await setDoc(adminDocRef, { password: newPassword, updatedAt: serverTimestamp() }, { merge: true });
};
