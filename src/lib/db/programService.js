import {
  collection, getDocs, doc, setDoc, deleteDoc, query, where, limit, serverTimestamp, Timestamp
} from "firebase/firestore";
import { db } from "../firebase.js";

// HARDCODED STATIC ACTIVE TAGS (0 Firestore Reads & 0 Writes)
const STATIC_ACTIVE_TAGS = ["Incoming Calls", "Outgoing Calls"];

export const getActiveTags = async (forceRefresh = false) => {
  return STATIC_ACTIVE_TAGS;
};

export const registerActiveTag = async (tag) => {
  // Static tags in use — 0 Firestore writes
  return;
};

export const removeActiveTag = async (tag) => {
  // Static tags in use — 0 Firestore writes
  return;
};

// Fixed ID for the dedicated "Incoming Calls" program — never changes
export const INCOMING_PROGRAM_ID = "incoming-calls";
export const INCOMING_PROGRAM_NAME = "Incoming Calls";

// Fixed ID for the dedicated "Outgoing Calls" program — never changes
export const OUTGOING_PROGRAM_ID = "outgoing-calls";
export const OUTGOING_PROGRAM_NAME = "Outgoing Calls";

// Upsert the Incoming Calls program document — no-op (0 Firestore writes)
export const ensureIncomingProgram = async () => {
  return;
};

// Upsert the Outgoing Calls program document — no-op (0 Firestore writes)
export const ensureOutgoingProgram = async () => {
  return;
};

export const getPrograms = async () => {
  const tags = await getActiveTags();
  const list = tags.map(t => ({
    id: t,
    name: t,
    contactCount: 0,
    createdAt: Timestamp.now()
  }));

  if (!list.some(p => p.id === INCOMING_PROGRAM_ID || p.name === INCOMING_PROGRAM_NAME)) {
    list.unshift({
      id: INCOMING_PROGRAM_ID,
      name: INCOMING_PROGRAM_NAME,
      isSystem: true,
      contactCount: 0,
      createdAt: Timestamp.now()
    });
  }

  if (!list.some(p => p.id === OUTGOING_PROGRAM_ID || p.name === OUTGOING_PROGRAM_NAME)) {
    list.unshift({
      id: OUTGOING_PROGRAM_ID,
      name: OUTGOING_PROGRAM_NAME,
      isSystem: true,
      contactCount: 0,
      createdAt: Timestamp.now()
    });
  }

  return list;
};

export const createProgram = async (name) => {
  await registerActiveTag(name);
  const ref = doc(db, "programs", name);
  await setDoc(ref, {
    name,
    createdAt: serverTimestamp(),
    contactCount: 0,
  }, { merge: true });
  return name;
};

export const deleteProgram = async (id) => {
  await removeActiveTag(id);
  await deleteDoc(doc(db, "programs", id));
};

// Read contacts of a program (for field-scanning before remapping)
export const getProgramChunkContacts = async (programId, limitCount = 100) => {
  const q = query(
    collection(db, "contacts"),
    where("programId", "==", programId),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
