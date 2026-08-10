# Firestore Read Usage Audit & Real-World Case Analysis

> [!NOTE]
> This document details the exact breakdown of all Firestore database reads in both the **Attender View** and the **Admin View**, explaining through real-world user cases which function triggers each read, why it occurs, and how it is executed.

---

## 1. Attender View Cases

### Case 1: Attender opens the dashboard or logs in (Initial Page Load)
* **User Action:** Attender logs in or refreshes their browser tab to view their assigned leads.
* **Exact Function Triggered:** `subscribeToCallLogs(attenderId, callback)` in `src/lib/db.js`.
* **Why The Reads Happen:** 
  1. The system checks browser IndexedDB storage (`tgf_attender_logs_${attenderId}`) first (**0 Reads**).
  2. If the cache is empty or refreshing in the background, `onSnapshot` queries `collection(db, "callCenterCache")` for the current month part documents (`2026-08_part1`, `2026-08_part2`, `2026-08_part3`).
* **Exact Read Breakdown:**
  * `2026-08_part1` document fetch = 1 Read
  * `2026-08_part2` document fetch = 1 Read
  * `2026-08_part3` document fetch = 1 Read
* **Total Read Count:** **3 Reads Total** (0 Reads on subsequent tab switches/refreshes via IndexedDB).

---

### Case 2: Attender edits or changes a phone number inside Edit Modal
* **User Action:** Attender opens a lead and modifies or types a 10-digit phone or mobile number.
* **Exact Function Triggered:** `checkGlobalDuplicate(phone, excludeContactId)` in `src/lib/db.js`.
* **Why The Reads Happen:** 
  1. `extractIndividualPhones` normalizes the entered phone string into 1 to 2 number variations.
  2. Executes `getDocs(query(collection(db, "contacts"), where("normalizedPhones", "array-contains", norm)))` to check if that phone number exists in the master `contacts` collection.
  3. Firebase Firestore charges a minimum 1 Read fee per query executed against the `contacts` collection (even if 0 documents match).
* **Exact Read Breakdown:**
  * Primary Phone query against `contacts` = 1 Read
  * Secondary Mobile query against `contacts` = 1 Read
* **Total Read Count:** **1 to 2 Reads per input check**.

---

### Case 3: Attender saves an edited lead (Status, Remark, or Details Change)
* **User Action:** Attender changes status to "Attempting Contact" or adds a remark and clicks "Save".
* **Exact Function Triggered:** `updateCallLog(logId, updates)` ➔ `updateContactInActiveCache(month, contactId, prunedContact)` in `src/lib/db.js`.
* **Why The Reads Happen:** 
  1. `updateCallLog` executes `getDoc(contactRef)` to fetch the lead's previous status before writing the update (**1 Read**).
  2. `updateCallLog` queries `collection(db, "registrations")` to sync registration history (**1 Read**).
  3. `updateContactInActiveCache` runs `getDocs(monthQuery)` against `callCenterCache` to read all 3 month part documents (`2026-08_part1`, `part2`, `part3`) to find which part file holds the lead (**3 Reads**).
* **Exact Read Breakdown:**
  * Pre-save status fetch = 1 Read
  * Registration check = 1 Read
  * Month part document lookup = 3 Reads
* **Total Read Count:** **5 Reads Total per save operation**.

---

## 2. Admin View Cases

### Case 4: Admin opens dashboard with a Single Month selected (e.g., August 2026)
* **User Action:** Admin logs in and selects "August 2026" from the top scope dropdown.
* **Exact Function Triggered:** `subscribeToAllCallLogs(tag, scopeOption, callback)` in `src/lib/db.js`.
* **Why The Reads Happen:** 
  1. The system checks browser IndexedDB storage (`tgf_admin_logs_2026-08_ALL`) first (**0 Reads**).
  2. `subscribeToAllCallLogs` queries `collection(db, "callCenterCache")` for August 2026 part documents (`2026-08_part1`, `2026-08_part2`, `2026-08_part3`).
  3. `lockedMonthlyReports` for August 2026 is checked (**0 Reads** because August is an active month, not locked yet).
* **Exact Read Breakdown:**
  * `2026-08_part1` document fetch = 1 Read
  * `2026-08_part2` document fetch = 1 Read
  * `2026-08_part3` document fetch = 1 Read
* **Total Read Count:** **3 Reads Total** (0 Reads on subsequent refreshes via IndexedDB).

---

### Case 5: Admin opens dashboard with "ALL" Scope selected
* **User Action:** Admin logs in and selects "ALL" from the top scope dropdown to view complete historical data across all months.
* **Exact Function Triggered:** `subscribeToAllCallLogs(tag, scopeOption, callback)` in `src/lib/db.js`.
* **Why The Reads Happen:** 
  1. The system queries `collection(db, "lockedMonthlyReports")` for all historical archived summary reports between `0000-00` and `2026-08` (**9 Reads**).
  2. The system runs `onSnapshot(cacheQuery)` querying `collection(db, "callCenterCache")` for all active cache part documents across June, July, and August (`2026-06_part1..2`, `2026-07_part1..7`, `2026-08_part1..3`) (**12 Reads**).
* **Exact Read Breakdown:**
  * Historical locked summary documents = 9 Reads
  * Active cache part documents across all months = 12 Reads
* **Total Read Count:** **21 Reads Total** (0 Reads on subsequent refreshes via IndexedDB).

---

## 3. Comprehensive Summary

> [!TIP]
> **Total Read Profile Summary:**
> * **Case 1 (Attender Load):** **3 Reads** (IndexedDB cached on refresh = **0 Reads**).
> * **Case 2 (Duplicate Check):** **1 to 2 Reads**.
> * **Case 3 (Saving 1 Lead):** **5 Reads**.
> * **Case 4 (Admin Single Month Load):** **3 Reads** (IndexedDB cached on refresh = **0 Reads**).
> * **Case 5 (Admin ALL Scope Load):** **21 Reads Total** (IndexedDB cached on refresh = **0 Reads**).
