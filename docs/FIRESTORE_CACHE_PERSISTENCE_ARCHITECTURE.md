# 📖 Firestore Cache & Persistence Architecture

## 🎯 1. System Overview & Objective

The CRM Call Center application utilizes a **Zero-Read Partitioned Persistence Architecture** designed to maximize UI responsiveness (0ms update latency) while reducing Firestore read costs by over 90%.

### **Key Performance Indicators:**
* **Firestore Reads on Lead Edit/Save:** **0 Reads** (when memory snapshot is hydrated).
* **Firestore Writes on Lead Edit/Save:** **2 Writes** (1 to `contacts/{contactId}`, 1 to `callCenterCache/{partitionId}`).
* **Partition Size Limit:** Strictly **850 KB** (leaving a safe 174 KB headroom under Firestore's 1MB hard limit).
* **Local UI Update Latency:** **0ms** (Stale-While-Revalidate via IndexedDB & in-memory cache).

---

## 🗂️ 2. Data Structure & Partitioning Strategy

### **Collection: `callCenterCache`**
To avoid Firestore's 1 MB per-document ceiling, contact lead data is partitioned into monthly document chunks formatted as:

```text
callCenterCache/
├── 2026-06_part1
├── 2026-07_part1
├── 2026-08_part1
├── 2026-08_part2
├── 2026-08_part3
└── 2026-08_part4  <-- Latest active partition
```

### **Document Schema:**
Each partition document contains a `contacts` object map keyed by `contactId`:
```json
{
  "contacts": {
    "lead_abc123": {
      "name": "John Doe",
      "phone": "+919876543210",
      "status": "In Discussion",
      "history": [ ... ],
      "attenderStates": { ... }
    }
  }
}
```

---

## 💾 3. Multi-Layer Local Caching Architecture

The system operates across **three tier layers** to guarantee instant UI rendering and zero unnecessary network queries:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. In-Memory Registry (globalActivePartitionsCache)         │ <-- 0ms read/write
├─────────────────────────────────────────────────────────────┤
│ 2. IndexedDB Storage (Stale-While-Revalidate Cache)        │ <-- Instant offline load
├─────────────────────────────────────────────────────────────┤
│ 3. Firebase Persistent Local Cache (persistentLocalCache)   │ <-- Disk cache across reloads
└─────────────────────────────────────────────────────────────┘
```

### **Layer 1: In-Memory Partition Cache (`globalActivePartitionsCache`)**
* Stores active monthly partition documents directly in JavaScript memory.
* Synchronously updated on every successful write to provide 0ms size checks and zero-read lookups.

### **Layer 2: IndexedDB Browser Storage**
* Stores filtered call log views per attender (`tgf_attender_logs_{attenderId}`).
* When an attender opens the app, leads render **instantly (0ms)** from IndexedDB before network sync completes.

### **Layer 3: Firebase Persistent Local Cache**
* Configured in `src/lib/firebase.js` using `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.
* Serves document snapshots directly from browser disk across page reloads (`F5`) without charging Firestore Reads.

---

## 📡 4. Singleton Real-time Snapshot Listener

To prevent duplicate subscriptions when switching tabs inside the application, `subscribeToCallLogs` uses a **Singleton Listener Registry (`activeSnapshotRegistry`)**:

```text
[ Attender Tab 1 ] ──┐
                     ├──> [ Active Singleton Listener ] <====> [ Firestore WebSocket ]
[ Attender Tab 2 ] ──┘        (30-second grace period)
```

1. **Re-use Active Streams:** Multiple UI components or tabs share the same active Firestore snapshot listener.
2. **30-Second Navigation Grace Period:** When navigating away from the call center page, the listener stays warm for 30 seconds. Navigating back reuses the connection without re-subscribing or charging reads.

---

## 🔄 5. Step-by-Step Data Operations

### 🅰️ **Updating / Editing an Existing Lead**
1. **Local UI Update (0ms):** UI state updates instantly on the attender's screen.
2. **Memory Partition Lookup:** System checks `globalActivePartitionsCache` to find the lead's current partition (e.g. `2026-08_part1`).
3. **Byte Size Check:** System calculates `getByteSize` of `part1` with updated lead.
   * **If size < 850 KB:** Lead is updated **in-place** inside `part1`.
   * **If size ≥ 850 KB (Overflow):** Lead is deleted from `part1` and moved directly to the **latest partition** (`part4`). If `part4` is full, `part5` is created.
4. **Firestore Write:** `updateDoc` fires asynchronously (0 Reads, 2 Writes).

### 🅱️ **Creating a Brand-New Lead**
1. **Direct Target:** System skips intermediate partitions (`part1`, `part2`) and targets **only the highest numbered partition** (e.g. `part4`).
2. **Space Verification:**
   * If `part4` < 850 KB ➔ Add to `part4`.
   * If `part4` ≥ 850 KB ➔ Create `part5` and add to `part5`.
3. **Firestore Write:** 0 Reads, 2 Writes.

### 🅲️ **Fallback Mode (Cold-Start / Uncached)**
* If a lead's partition is not present in local memory:
  1. System executes a targeted fallback query for documents matching `YYYY-MM_part...`.
  2. Identifies current location or latest partition.
  3. Executes update (1 Read, 2 Writes).

---

## 💰 6. Firestore Cost & Quota Summary

| Action | Firestore Reads | Firestore Writes |
| :--- | :--- | :--- |
| **Opening App (First Visit of Day)** | **~14 Reads** *(Active 3-month window)* | 0 Writes |
| **Page Refresh (`F5`) with Disk Cache** | **0 Reads** | 0 Writes |
| **Navigating Between App Pages** | **0 Reads** | 0 Writes |
| **Saving / Editing a Call Log** | **0 Reads** | **2 Writes** |
| **Adding a Brand-New Lead** | **0 Reads** | **2 Writes** |
| **Bulk Lead Queue Assignment** | **1 Read per chunk** | **1 Batch Write per chunk** |

---

## ⚡ 7. Core Read & Write Optimization Pillars

1. **Stale-While-Revalidate Caching (0ms Load Times)**
   * All call logs and contacts load **instantly (0ms)** from browser memory / IndexedDB (`globalActivePartitionsCache`). Real-time WebSocket subscriptions only sync incoming delta updates.

2. **Deduplicated Singleton Listeners (`activeSnapshotRegistry`)**
   * Eliminates duplicate listeners when attenders toggle views. Keeps active snapshot channels warm during page navigation (with a 30-second grace period) to prevent connection re-initialization.

3. **Batched & Chunked Writes (`writeBatch` & `runTransaction`)**
   * Bulk processes like lead distribution (`assignContactsToAttender`), Excel sheet imports (`importContacts`), and tag remapping (`remapProgramContacts`) are chunked into 200–499 operations per transaction.

4. **Partitioned Historical Data Storage**
   * Archives historical logs into monthly partition chunks (`call_logs_YYYY-MM_partX`). Prevents full historical data re-fetches during daily operation.

5. **Selective Atomic Field Updates**
   * Uses targeted Firestore updates (`updateDoc`, `setDoc` with `{ merge: true }`, `arrayUnion`) so only modified attributes (`status`, `remark`, `callbackDate`) are written without re-transmitting entire documents.

---

## 🛠️ 8. Maintenance & Code References

* **Primary Logic File:** `src/lib/db.js`
  * `updateContactInActiveCache()` — Partition lookup, 850 KB size check, overflow shift.
  * `subscribeToCallLogs()` — Singleton snapshot manager & IndexedDB sync.
  * `assignContactsToAttender()` — Transactional batched lead queue assignments.
  * `rebuildCacheCollection()` — Background partition builder.
* **Firebase Config File:** `src/lib/firebase.js`
  * `persistentLocalCache` configuration for multi-tab disk caching.
