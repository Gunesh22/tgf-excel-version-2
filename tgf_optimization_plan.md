# TGF Call Center — Full Optimization & Security Analysis

> [!CAUTION]
> **CRITICAL:** Firestore rules are completely open (`allow read, write: if true`). Admin and attender passwords are fetched and compared entirely in the frontend. The GHL token is exposed in VITE env vars. These three issues alone make the entire database publicly writable by anyone on the internet. Fix these before anything else.

---

## PART 1 — SECURITY ISSUES (Must Fix First)

### Issue 1 — Firestore Rules Completely Open

**Current (`firestore.rules`):**
```
allow read, write: if true;  // Temporary open rules for development
```

**Risk:** Anyone on the internet can read, write, or delete every document in your entire Firestore database. This is a critical production vulnerability.

**Fix Required:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Settings — only authenticated admin session can read/write
    match /settings/{doc} {
      allow read, write: if false; // No client access — admin pw must be server-side verified
    }

    // Attenders — readable by anyone (needed for login), writable only by admin session
    match /attenders/{doc} {
      allow read: if true;   // attenders list needed for login
      allow write: if false; // admin writes only via Cloud Function or trusted path
    }

    // Contacts — only assigned attenders can read their own contacts
    match /contacts/{contactId} {
      allow read: if request.auth != null &&
        (resource.data.assignedTo == null ||
         request.auth.uid in resource.data.assignedTo ||
         request.auth.token.admin == true);
      allow write: if request.auth != null;
    }

    // callCenterCache — admin read/write only
    match /callCenterCache/{doc} {
      allow read, write: if request.auth != null && request.auth.token.admin == true;
    }

    // registrations — admin read/write
    match /registrations/{doc} {
      allow read, write: if request.auth != null && request.auth.token.admin == true;
    }

    // programs, activeTags — read by all, write by admin
    match /programs/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /activeTags/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }

    // lockedMonthlyReports — admin only
    match /lockedMonthlyReports/{doc} {
      allow read, write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

> [!IMPORTANT]
> The above rules require **Firebase Authentication**. The current app uses a custom password system, not Firebase Auth. You must either: (A) Migrate login to Firebase Auth (recommended), or (B) Use Cloud Functions as a backend proxy for all sensitive Firestore operations. Option A is strongly preferred.

---

### Issue 2 — Admin Password Fetched and Compared in Frontend

**Current (`db.js` line 1230):**
```javascript
export const getAdminPassword = async () => {
  const snap = await getDoc(doc(db, "settings", "admin_auth"));
  return snap.data().password;  // password sent to browser in plaintext
};
// ... and the fallback:
return "123456";  // hardcoded default
```

**Risk:** Anyone who opens DevTools can see the admin password. The entire `settings/admin_auth` document is readable by any browser with current open rules.

**Required Fix:**
- Move admin authentication to a **Cloud Function** (Firebase Functions) that accepts a password and returns a signed JWT or custom Firebase Auth token.
- Never send the raw password to the frontend.
- Remove the `"123456"` hardcoded fallback entirely.

---

### Issue 3 — Attender Passwords in Frontend

**Current (`db.js` line 1189–1204):**
```javascript
const snap = await getDocs(collection(db, "attenders"));
const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// docs[n].password is now visible in browser memory and DevTools
```

**Risk:** Every attender password is downloaded to the browser in plaintext.

**Required Fix:**
- Move attender login verification to a Cloud Function.
- Store passwords as bcrypt hashes, not plaintext.
- The frontend should send: `{ attenderName, password }` to a Cloud Function.
- The function verifies the hash and returns a Firebase custom auth token.
- The client signs in with `signInWithCustomToken()`.

---

### Issue 4 — `VITE_GHL_TOKEN` in Frontend Environment

**Current (`.env`):**
```
VITE_GHL_TOKEN=...
```

Any `VITE_` prefixed variable is bundled directly into the JavaScript that the browser downloads. Anyone who views-source or uses DevTools can read it.

**Fix:** The `/api/ghl.js` Vercel serverless function already correctly reads `process.env.GHL_TOKEN` (non-VITE). Remove `VITE_GHL_TOKEN` from `.env` and the frontend code. Only use `GHL_TOKEN` (without VITE prefix) in the server-side API route.

---

### Issue 5 — `/api/ghl` Has No Authentication

**Current (`api/ghl.js`):**
```javascript
// No authentication check whatsoever
const GHL_TOKEN = process.env.GHL_TOKEN;
// ... proxy any request to GHL API
```

**Risk:** Anyone who discovers your Vercel deployment URL can call `/api/ghl` and use your GHL token to query or modify all your GHL contacts.

**Fix:** Add a shared secret check:
```javascript
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
  return res.status(403).json({ error: "Forbidden" });
}
```
Send `x-internal-secret` header from the frontend. Store `INTERNAL_API_SECRET` as a server-only env var (no `VITE_` prefix).

---

### Issue 6 — `Access-Control-Allow-Origin: *` in API

**Current (`api/ghl.js` line 4):**
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
```

This allows any website to call your GHL proxy API endpoint and use your GHL token. Combined with no authentication, it is open to the entire internet.

**Fix:** Restrict to your actual domain:
```javascript
const ALLOWED_ORIGINS = ['https://your-app.vercel.app', 'http://localhost:5173'];
const origin = req.headers.origin;
if (ALLOWED_ORIGINS.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
}
```

---

### Issue 7 — localStorage Admin Authentication

Admin login state is stored in `localStorage` (`tgf_admin_auth`, etc.). LocalStorage can be manipulated directly from the browser console: `localStorage.setItem('tgf_admin_auth', 'true')`. This means anyone can grant themselves admin access without knowing the password.

**Fix:** Use Firebase custom auth tokens with admin claims instead of localStorage flags. The UI renders based on a verified Firebase Auth token claim, not a localStorage value.

---

## PART 2 — FIRESTORE READ/WRITE AUDIT TABLE

| Function | Current Reads | Current Writes | Trigger | Can Cache? | Can Reduce? |
|---|---|---|---|---|---|
| `subscribeToCallLogs()` | 3–12 (all monthly partitions) | 0 | Attender login | Yes — IndexedDB | **CRITICAL** — scoped to attender query |
| `updateCallLogDirectFirebase()` | 1 (contact) + 1 (registrations query) | 1–2 batch + 1 registration | Every save | Yes — use in-memory data | Yes — skip reg query when not needed |
| `updateContactInActiveCache()` | 0–3 (fallback path reads all month parts) | 1 | Every save | Yes — in-memory partition cache | Mostly done via `globalActivePartitionsCache` |
| `checkGlobalDuplicate()` | 1–2 per phone number variation | 0 | Every phone keystroke | Yes — debounce + local cache | Yes — debounce + deduplicate variations |
| `globalSearchContacts()` | 1–3 parallel queries | 0 | Every search input | Yes — local IndexedDB first | Yes — min length + debounce |
| `searchAttenderContacts()` | Calls globalSearchContacts (1–3) | 0 | Search | Yes | Yes — local first |
| `getAttenders()` | 1 (then cached in memory + IDB) | 0 | Any login | Yes — already done | Already cached |
| `getActiveTags()` | 1 (then cached) | 0 | Any login | Yes — already done | Already cached |
| `subscribeToAllCallLogs()` | 3–21 (all active + locked partitions) | 0 | Admin login | Yes — IndexedDB per scope | Yes — only load selected month |
| `rebuildCallCenterCache()` | All contacts + all cache docs | Many setDoc + deleteDoc | Admin action | No (intentional full rebuild) | Add rebuild lock |
| `assignContactsToAttender()` | Up to 1000 per attempt × 10 | Batch update per chunk | Admin action | No | Already uses cursors |
| `getProgramContactStats()` | All contacts with tag | 0 | Admin stats | Yes — cache 5 min | Yes — use aggregation count |
| `getAttenderContactCount()` | All contacts for attender | 0 | Admin panel | Yes | Yes — use getCountFromServer |
| `addIncomingCallLog()` | 1 (phone duplicate lookup) | 1 contact + 1 registration | Attender adds call | Partial | Already minimal |
| `removeAttenderFromContact()` | 1 (getDoc) | 1 updateDoc + cache update | Admin unassign | No | Acceptable |
| `claimContact()` | 1 transaction read | 1 transaction write + cache | Attender claim | No | Acceptable |
| `reassignContactsToPool()` | All contacts for attender | batch update | Admin action | No | Acceptable — admin op |
| `fetchHistoricalCachePartition()` | 0 (IDB) or N partition docs | 0 | Attender views old month | Yes — 7-day IDB TTL | Already done |

---

## PART 3 — PRIMARY ARCHITECTURE PROBLEM: Global Cache Listener

### What is Currently Happening (BAD)

```
Attender A logs in
  → onSnapshot(callCenterCache, where(documentId() >= "2026-06"))
  → Downloads 2026-06_part1, 2026-06_part2, 2026-07_part1 ... 2026-08_part3
  → Filters contacts in JS: "is this contact mine?"
  → Renders only matching contacts

Attender B logs in → same thing
Attender C logs in → same thing

Attender D updates Contact X (assigned only to D)
  → callCenterCache document is written
  → ALL 100 connected attenders receive a Firestore snapshot update event
  → Each attender re-downloads the updated partition document
  → Each attender re-filters to find their contacts
  → 99 attenders did zero useful work but each paid for a read
```

With 100 attenders online: **1 contact update → 100 Firestore read events**

---

### What Should Happen (GOOD)

```
Attender A logs in
  → Check IndexedDB tgf_attender_logs_{attenderId}
  → If valid (< 24h old): render immediately, 0 Firestore reads
  → If stale/missing:
      query contacts where assignedTo array-contains attenderId
      where updatedAt > lastSyncTimestamp
      paginate with startAfter cursor
      store results in IndexedDB
      update lastSyncTimestamp

Attender D updates Contact X
  → Contact X's document is updated in Firestore
  → ONLY Attender D receives relevant update (no realtime listener needed for others)
  → Attender B, C etc.: 0 reads
```

---

## PART 4 — REQUIRED CHANGES (Detailed, No Code Yet)

### Change 1 — Replace Global `callCenterCache` Listener with Option A (Scoped Realtime Listener)

**Current (BAD):** `onSnapshot(callCenterCache, where(documentId() >= prev2Month))` — broadcasts every contact edit to all 100 connected attenders.

**New Architecture — Option A (Scoped Realtime Listener):**
- **Initial Load:** Check IndexedDB (`tgf_attender_contacts`) first. If cached, populate UI in 0ms (0 Firestore reads).
- **Attender-Scoped `onSnapshot` Listener:** Open a targeted realtime listener on `contacts` filtered strictly by the attender's assigned ID:
  ```javascript
  onSnapshot(
    query(
      collection(db, "contacts"),
      where("assignedTo", "array-contains", attenderId)
    ),
    (snapshot) => {
      // Syncs changed docs into IndexedDB & updates UI in sub-second real time (~200ms)
    }
  );
  ```
- **Realtime Behavior:**
  - When Attender A updates a contact assigned to both A and B, Attender B receives the update in **sub-second real time (~200ms)**.
  - All 98 other attenders (unassigned to this lead) receive **0 bytes and 0 reads**.
  - Idle connections (no document edits) cost **0 reads**.
- **On Save:** Update local IndexedDB immediately (0ms UI feedback), async write to Firestore in background.

**Impact:** Preserves 100% sub-second realtime collaboration for co-assigned attenders while reducing Firestore read costs by **~95% across 100 concurrent users**.

---

### Change 2 — Attender-Specific Firestore Scoped Realtime Query

**Current query (reads ALL monthly cache partitions):**
```javascript
query(collection(db, "callCenterCache"), where(documentId(), ">=", prev2MonthStr))
```

**New Option A Scoped Query (reads ONLY this attender's assigned contacts):**
```javascript
query(
  collection(db, "contacts"),
  where("assignedTo", "array-contains", attenderId)
)
```

This requires a **Firestore index**: `assignedTo (ARRAY_CONTAINS)`.

---

### Change 3 — IndexedDB Schema Upgrade

**Current:** IndexedDB stores full contact arrays under a single key per attender.

**Problem:** Loading/saving requires reading and rewriting the entire array for every single contact update.

**New Schema:**
```
ObjectStore: "attender_contacts"
  keyPath: "id"  // contact document ID
  indexes:
    - attenderId (for filtering by attender)
    - updatedAt  (for delta sync ordering)
    - status     (for local filter)
    - tags       (for local tag filter, multiEntry: true)

ObjectStore: "attender_meta"
  keyPath: "attenderId"
  data: { lastSyncAt, version, totalCount }
```

With this schema:
- Update 1 contact → write 1 record, not the entire array
- Filter by status → IDB cursor scan, 0 Firestore reads
- Delta sync → query IDB by updatedAt, compare to server

**Migration:** On first load with new code, detect old schema version, read old array, write individual records into new store, update version flag.

---

### Change 4 — Registration Sync Optimization

**Current:** Every single `updateCallLog` call queries the `registrations` collection:
```javascript
const q = query(registrations, where(documentId(), ">=", logId), ...);
const snap = await getDocs(q);  // 1 read every save
```

**Fix:** Only run registration sync when it is actually needed:
```javascript
const registrationSyncRequired = 
  updates.status === "Reg.Done" ||          // becoming registered
  previousStatus === "Reg.Done" ||           // leaving registered state
  updates["Called For"] !== undefined ||     // program changed
  updates.history !== undefined;             // history changed

if (registrationSyncRequired) {
  // ... run registrations query and sync
}
// Otherwise: skip entirely — 0 reads saved
```

For ordinary remark/status changes (not Reg.Done): **saves 1 Firestore read per save**.

---

### Change 5 — Duplicate Phone Check Optimization

**Current:** Triggered on every phone keystroke, queries Firestore with each of 1–2 phone number variations.

**Fix:**
1. Add 800ms debounce — only query after user stops typing
2. Minimum 10-digit length before triggering
3. Deduplicate variations: if `normalizePhone(phone)` produces only 1 unique number, send only 1 query not 2
4. Check local IndexedDB cache first — if the number is in the attender's own loaded contacts, resolve locally with 0 reads
5. Cache the result per phone number in memory for the session (same number typed twice = 0 additional reads)

---

### Change 6 — Search Optimization

**Current:** `globalSearchContacts()` fires 2–3 parallel Firestore queries on every search input.

**Fix:**
1. Minimum 3-character search length
2. 500ms debounce
3. **Local-first search**: search through the attender's already-loaded IndexedDB contacts first
4. Only fall back to Firestore if local results are insufficient (e.g., 0 results for a phone search and it's a complete 10-digit number)
5. For attender search: filter locally since all their contacts are in IndexedDB
6. For admin global search: keep Firestore queries but add debounce and minimum length

---

### Change 7 — Admin Panel Optimization

**Current:** `subscribeToAllCallLogs()` for a single month still downloads all monthly `callCenterCache` partitions going back to 3 months ago.

**Fix:**
- For a **specific month selection**: only query `callCenterCache` documents for that exact month using `documentId()` range query
- Do NOT load "3 months prior" unless the selected month is explicitly ALL or multi-month
- For **ALL scope**: load locked reports first (already historical), then only load active cache partitions for the most recent 2 months
- Cache each month's data in IndexedDB with the admin scope key (already done but refine the TTL — use 30-minute TTL for current month, 24-hour TTL for past months)

---

### Change 8 — `callCenterCache` Usage Classification

| Usage | Classification | Keep? | Action |
|---|---|---|---|
| Attender live data (`subscribeToCallLogs`) | Attender live feed | **Remove** | Replace with direct `contacts` query |
| Admin single month view | Admin data | Keep | Refine to exact month only |
| Admin ALL scope | Admin historical | Keep | Load progressively |
| Admin cache rebuild | Maintenance | Keep | Admin-only, add rebuild lock |
| Export JSON | Utility | Keep | Admin-only |
| Cache verify | Validation | Keep | Admin-only |
| Historical partition for attender (old months) | Historical archive | Keep | Already has 7-day IDB TTL |
| `lockedMonthlyReports` | Historical archive | Keep | Already properly isolated |

**Conclusion:** `callCenterCache` should remain for **admin and historical** purposes. It should be completely removed from the **attender live data path**.

---

### Change 9 — Write Queue Coalescing

**Current:** If an attender edits a remark and then a status within 2 seconds while offline, the queue stores 2 separate writes for the same contact.

**Fix:** In `queuePendingWrite`, before pushing a new write, check if there is already a pending write for the same `logId`. If yes, **merge the updates** into the existing queue entry rather than adding a second entry. The latest state of each field wins.

```
queue before: [{ logId: "abc", updates: { remark: "A" } }]
new write:    { logId: "abc", updates: { status: "Callback" } }
queue after:  [{ logId: "abc", updates: { remark: "A", status: "Callback" } }]
// One write instead of two when connectivity returns
```

---

### Change 10 — Dashboard Counters

**Current:** `getProgramContactStats()` reads the **entire contacts collection** for a tag to count statuses.

**Fix options (choose based on update frequency):**

- **Option A (Aggregation):** Use `getCountFromServer()` with filtered queries. Cost = 1 read per count query regardless of collection size. Good for infrequent admin dashboard loads.
- **Option B (Precomputed summary docs):** Maintain a `programStats/{tag}` document that is updated whenever a contact's status changes. Cost = 1 extra write per status change, but dashboard reads = 0. Good for frequent dashboard views by many users.

**Recommendation:** Use Option A (aggregation) for the admin dashboard. The dashboard is viewed infrequently and by 1 admin, not 100 attenders.

---

### Change 11 — Metadata Shared Promise Pattern

**Current:** If 5 components mount simultaneously and each calls `getAttenders()`, there is a brief window where all 5 may trigger a Firestore read before the first result is cached.

**Fix:** Use a shared in-flight promise:
```javascript
let _attendersPromise = null;

export const getAttenders = async (forceRefresh = false) => {
  if (!forceRefresh && inMemoryAttenders?.length > 0) return inMemoryAttenders;
  if (!forceRefresh && _attendersPromise) return _attendersPromise; // reuse in-flight
  _attendersPromise = fetchAttendersFromFirestore();
  const result = await _attendersPromise;
  _attendersPromise = null;
  return result;
};
```
Apply same pattern to `getActiveTags()`.

---

### Change 12 — Cache Rebuild Safety

**Current:** Rebuild deletes all old cache documents first, then writes new ones. If a write fails midway, the cache is in a broken half-empty state.

**Fix:**
1. Write new partition documents with a **staging prefix** (e.g., `staging_2026-08_part1`)
2. Only after ALL staging documents are written successfully, delete the old ones and rename/copy staging to final names
3. Add a rebuild lock document: `callCenterCache/rebuild_lock` with `{ inProgress: true, startedAt, startedBy }`. Check this before starting. Remove it when done.
4. Use `writeBatch()` for deletes (up to 500 per batch) instead of sequential `deleteDoc()` calls

---

## PART 4.1 — MULTI-ATTENDER & MULTI-PROGRAM DATA ISOLATION GUARANTEES

> [!NOTE]
> **Preservation Rule:** The optimization layer preserves 100% of the existing per-attender and per-program isolation logic without any conflicts, overwrites, or data loss.

### 1. Per-Attender State Isolation (`attenderStates`)
Each contact document maintains isolated sub-objects under `attenderStates[attenderId]`:
- **Attender A** updates: `attenderStates.attender_A.status`, `attenderStates.attender_A.remark`, `attenderStates.attender_A.history`, `attenderStates.attender_A["Called For"]`.
- **Attender B** updates: `attenderStates.attender_B.status`, `attenderStates.attender_B.remark`, `attenderStates.attender_B.history`, `attenderStates.attender_B["Called For"]`.
- Neither attender overwrites the other's status, remarks, or call history.

### 2. Multi-Program & Independent Registration Tracking
- When **Attender A** registers a lead for *Program 1* (e.g. "21-Day Meditation"), a registration record is created in `registrations` with ID `${contactId}_21_Day_Meditation`.
- When **Attender B** registers the same lead for *Program 2* (e.g. "Maha Aasmani Shivir"), a separate registration record is created in `registrations` with ID `${contactId}_Maha_Aasmani_Shivir`.
- Both attenders receive full conversion credit for their respective programs, and both registrations exist independently in reporting.

### 3. Master Timeline Aggregation
- Attender A sees only Attender A's status and remarks on their personal UI sheet.
- Attender B sees only Attender B's status and remarks on their personal UI sheet.
- The Admin View uses `combineContactHistories()` to merge both interaction histories into a unified chronological timeline for audit and quality monitoring.

---

## PART 5 — REQUIRED FIRESTORE INDEXES

Add to `firestore.indexes.json`:

```json
{
  "collectionGroup": "contacts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "assignedTo", "arrayConfig": "CONTAINS" },
    { "fieldPath": "updatedAt", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "contacts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "assignedTo", "arrayConfig": "CONTAINS" },
    { "fieldPath": "isAssigned", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "contacts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "assignedTo", "arrayConfig": "CONTAINS" },
    { "fieldPath": "lastCalledAt", "order": "DESCENDING" }
  ]
}
```

---

## PART 6 — CONCURRENCY IMPACT ANALYSIS

### Before Optimization

| Users Online | 1 Contact Updated | Firestore Read Events |
|---|---|---|
| 3 | 1 | ~3 reads (1 per attender gets updated partition) |
| 50 | 1 | ~50 reads |
| 100 | 1 | ~100 reads |
| 200 | 1 | ~200 reads |

Per attender login (fresh): 3–12 reads (all monthly partitions)  
Per attender save: 5 reads (contact + registration + 3 cache partition fallback)

### After Optimization

| Users Online | 1 Contact Updated | Firestore Read Events |
|---|---|---|
| 3 | 1 | 0 reads for unrelated attenders |
| 50 | 1 | 0 reads for unrelated attenders |
| 100 | 1 | 0 reads for unrelated attenders |
| 200 | 1 | 0 reads for unrelated attenders |

Per attender login (cached, < 24h): **0 reads**  
Per attender login (fresh): **K reads where K = number of assigned contacts changed since last sync**  
Per attender save: **0 reads** (if registration sync not required) or **1 read** (if registration sync required)  
Per filter/sort change: **0 reads** (local IndexedDB)  
Per search: **0 reads** (local) or **1–2 reads** (Firestore fallback for new phone)  

### Action-Level Read & Write Cost Matrix (Option A Scoped Realtime)

| User Action | Firestore Writes | Active Attender Reads | Co-Assigned Attender Reads | Other 98 Attenders Reads |
|---|---|---|---|---|
| **Attender Saves Call Log** | **1 write** | **0 reads** (local 0ms) | **1 read** (~200ms real time) | **0 reads** |
| **Duplicate Check (New Phone Number)** | **0 writes** | **1 read** (debounced) | **0 reads** | **0 reads** |
| **Duplicate Check (Phone in Local Cache)** | **0 writes** | **0 reads** | **0 reads** | **0 reads** |
| **Filter / Sort / Search (Local IDB)** | **0 writes** | **0 reads** | **0 reads** | **0 reads** |
| **Idle Listener (Open Connection)** | **0 writes** | **0 reads** | **0 reads** | **0 reads** |

#### Step-by-Step Co-Assigned Sync Example:
1. **Attender 1 (Neha) saves a call on shared Lead X:**
   - **Write:** 1 Firestore write updates `attenderStates.Neha` in `contacts/lead_x`.
   - **Neha Reads:** 0 reads (local UI updates in 0ms).
   - **Attender 2 (Rohan) Reads:** 1 Firestore read (delivered automatically via Rohan's scoped listener in ~200ms).
   - **Other 98 Attenders Reads:** 0 reads.
2. **Attender 2 (Rohan) saves a call on shared Lead X later:**
   - **Write:** 1 Firestore write updates `attenderStates.Rohan` in `contacts/lead_x`.
   - **Rohan Reads:** 0 reads (local UI updates in 0ms).
   - **Neha Reads:** 1 Firestore read (delivered automatically via Neha's scoped listener in ~200ms).
   - **Other 98 Attenders Reads:** 0 reads.

---

## PART 7 — IMPLEMENTATION ORDER (Priority Sequence)

> [!IMPORTANT]
> Fix in this exact order. Security must come before optimization.

### Phase 0 — Security (Do Immediately, Before Any Users)
1. Close Firestore rules (at minimum restrict to authenticated users)
2. Migrate admin and attender login to Firebase Authentication (Cloud Functions)
3. Remove `VITE_GHL_TOKEN` from frontend env
4. Add `x-internal-secret` auth to `/api/ghl` endpoint
5. Restrict CORS on `/api/ghl` to your domain only

### Phase 1 — Core Architecture (Highest Read Reduction)
6. Replace `subscribeToCallLogs()` global listener with attender-scoped `getDocs()` + delta sync
7. Upgrade IndexedDB schema to record-level storage
8. Add the 3 required composite Firestore indexes
9. Implement delta sync with `lastSyncAt` timestamp per attender

### Phase 2 — Write Optimization
10. Conditional registration sync (only when relevant)
11. Write queue coalescing for same-contact offline writes
12. Skip `updateCacheContacts()` for attender saves (cache is now IndexedDB, not callCenterCache)

### Phase 3 — Search & Duplicate Check
13. Debounce + minimum length for `checkGlobalDuplicate()`
14. Local-first search in `searchAttenderContacts()`
15. Shared promise pattern for `getAttenders()` and `getActiveTags()`

### Phase 4 — Admin Panel
16. Admin scope-specific cache loading (exact month only)
17. Aggregation queries for dashboard counters
18. Cache rebuild safety (staging prefix + rebuild lock)

### Phase 5 — Instrumentation & Verification
19. Add dev-mode Firestore operation counter (reads/writes per session)
20. Test all 12 scenarios listed in the requirements

---

## PART 8 — DATA THAT MUST NOT BE DELETED

- `contacts` collection — canonical source of truth, never delete
- `registrations` collection — historical registration records
- `lockedMonthlyReports` — locked historical monthly archives, never overwrite
- `attenderStates` fields within each contact — per-attender call history
- `history` arrays within contacts and attenderStates
- `callCenterCache` — keep for admin use; only remove from attender live data path

---

## PART 9 — ONE-TIME MIGRATION REQUIRED

When implementing the new IndexedDB schema:
1. Each attender's browser will detect a version mismatch on first load
2. Migration reads the old array-based cache from IDB key `tgf_attender_logs_{attenderId}`
3. Writes each contact as an individual IDB record into the new `attender_contacts` object store
4. Updates IDB version number to `2`
5. Sets `lastSyncAt = 0` to force a full delta sync on first load after migration
6. Old cache key is deleted after successful migration

If migration fails, the code falls back to a full fresh sync from Firestore (graceful degradation).

---

## PART 10 — db.js SIZE ISSUE

`db.js` is currently **5,392 lines** and **213 KB**. This is a significant maintenance problem.

**Recommended split (do after Phase 0–2 are stable):**

| New File | Contains |
|---|---|
| `lib/db/contacts.js` | importContacts, normalizePhone, formatContactDoc, checkGlobalDuplicate |
| `lib/db/attenders.js` | getAttenders, createAttender, updateAttender, deleteAttender, getAdminPassword |
| `lib/db/callLogs.js` | updateCallLog, updateCallLogDirectFirebase, addIncomingCallLog |
| `lib/db/cache.js` | subscribeToCallLogs, updateCacheContacts, updateContactInActiveCache, rebuildCallCenterCache |
| `lib/db/admin.js` | subscribeToAllCallLogs, getProgramContactStats, getAttenderContactCount |
| `lib/db/programs.js` | getPrograms, createProgram, deleteProgram, getActiveTags, registerActiveTag |
| `lib/db/sync.js` | queuePendingWrite, flushPendingWrites, getIDBCache, setIDBCache, updateLocalAttenderCache |
| `lib/db/search.js` | globalSearchContacts, searchAttenderContacts, fetchHistoricalCachePartition |
| `lib/db/index.js` | re-exports everything from the above files |

This split does not change any behavior — it only makes the code maintainable.

---

## SUMMARY: Top 5 Actions by Impact

| Priority | Action | Read Reduction | Security |
|---|---|---|---|
| 🔴 1 | Close Firestore rules | — | **CRITICAL** |
| 🔴 2 | Move auth to Firebase Auth / Cloud Functions | — | **CRITICAL** |
| 🔴 3 | Remove `VITE_GHL_TOKEN`, secure `/api/ghl` | — | **HIGH** |
| 🟠 4 | Replace global callCenterCache listener with attender-scoped delta sync | **~95% reduction for 100 users** | — |
| 🟠 5 | Conditional registration sync (skip when not Reg.Done) | **~50% reduction per save** | — |
