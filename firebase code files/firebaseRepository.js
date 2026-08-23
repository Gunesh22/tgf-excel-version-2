import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, documentId, writeBatch, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase.js";

/**
 * Firebase access layer.
 *
 * IMPORTANT:
 * - No onSnapshot.
 * - No realtime listeners.
 * - No polling.
 * - Reads happen only when a caller explicitly requests them.
 */

export async function getContact(contactId) {
  if (!contactId) return null;
  const snap = await getDoc(doc(db, "contacts", contactId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getContactsByNormalizedPhone(phone) {
  const q = query(
    collection(db, "contacts"),
    where("normalizedPhones", "array-contains", phone)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getAttendersFromFirebase() {
  const snap = await getDocs(collection(db, "attenders"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getSetting(name) {
  const snap = await getDoc(doc(db, "settings", name));
  return snap.exists() ? snap.data() : null;
}

export async function getCachePartitions(monthKeys) {
  const unique = [...new Set(monthKeys.filter(Boolean))];
  if (!unique.length) return [];

  const results = [];
  for (const monthKey of unique) {
    const q = query(
      collection(db, "callCenterCache"),
      where(documentId(), ">=", monthKey),
      where(documentId(), "<=", `${monthKey}\uf8ff`)
    );
    const snap = await getDocs(q);
    results.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }
  return results;
}

export async function writeContact(contactId, data, merge = true) {
  await setDoc(doc(db, "contacts", contactId), data, { merge });
}

export async function updateContact(contactId, data) {
  await updateDoc(doc(db, "contacts", contactId), data);
}

export async function deleteContact(contactId) {
  await deleteDoc(doc(db, "contacts", contactId));
}

export async function createContact(contactId, data) {
  await setDoc(doc(db, "contacts", contactId), data);
  return contactId;
}

export async function batchWriteContactAndCache(contactId, contactData, cacheWrites = []) {
  const batch = writeBatch(db);
  batch.set(doc(db, "contacts", contactId), contactData, { merge: true });

  for (const item of cacheWrites) {
    if (!item?.path || !item?.data) continue;
    batch.set(doc(db, ...item.path.split("/")), item.data, {
      merge: item.merge !== false
    });
  }

  await batch.commit();
}

export { serverTimestamp };
