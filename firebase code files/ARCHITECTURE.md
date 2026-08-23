# TGF Firebase + IndexedDB backend

## Hard rules

This backend deliberately does **not** use:

- `onSnapshot`
- Firestore realtime listeners
- polling
- `setInterval`
- periodic synchronization
- background refresh

## Lead flow

### Normal lead

1. UI reads IndexedDB.
2. Lead opens from IndexedDB.
3. Firestore reads: 0.

### Shared lead

1. UI reads IndexedDB.
2. If a usable cached copy exists, use it.
3. Firestore reads: 0.
4. If no cached copy exists, execute exactly one `getDoc(contacts/{id})`.
5. Store the complete Firestore document in IndexedDB.
6. Subsequent openings use IndexedDB.

### Concurrent shared-lead opens

`sharedFetches` is keyed by contact ID.

If two components request the same uncached lead at the same time:

```text
A -> getDoc()
B -> same Promise
```

Only one Firestore read occurs.

## Explicit refresh

`refreshSharedLead()` is the only automatic code path that intentionally bypasses the local cache.

It must only be connected to a real user action such as:

```text
Refresh from Firebase
```

One click = one getDoc.

## Saving

The UI should save the current lead using `saveLead(contactId, updates, attenderId)`.

The backend updates IndexedDB immediately and performs the explicit Firestore write.

For operations where the caller already has the complete current contact, do not perform a defensive `getDoc()` before writing.

## Important migration note

This package is a clean Firebase/IndexedDB service layer. It is not a blind replacement for the existing 100k+ contact/admin service implementation because those files contain application-specific registration, reporting, GHL, assignment, and historical compatibility logic.

Integrate the functions through the existing UI call sites rather than deleting unrelated business logic.
