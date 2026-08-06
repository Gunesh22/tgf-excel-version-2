# 📦 CRM Tag Sync & Inspector Component Archive

This document contains the complete source code, configuration snippets, and integration instructions for the **GoHighLevel CRM Tag Sync & Inspector Tool**. You can restore or refer to these components whenever you want to re-enable them in the future.

---

## 📁 1. `src/lib/crmSync.js`
*Centralized logic for 1-time historical CRM tag syncing.*

```javascript
import { searchCRMByPhone } from "./ghl";

/**
 * Cutoff date threshold for 1-time CRM tag sync on historical contacts.
 * Contacts created on or before July 29, 2026 are eligible for 1-time sync.
 */
export const CUTOFF_DATE = new Date("2026-07-29T23:59:59Z");

/**
 * Checks if a contact is a legacy contact (created on or before the cutoff date).
 * @param {Object} contact - The contact data object
 * @returns {boolean}
 */
export const isLegacyContact = (contact) => {
  if (!contact) return false;
  
  const rawCreated = contact.createdAt || contact._rawData?.createdAt || contact.firstCalledAt;
  if (!rawCreated) return true; // Default to legacy if date missing to be safe

  let createdDate = null;
  if (typeof rawCreated.toDate === "function") {
    createdDate = rawCreated.toDate();
  } else {
    createdDate = new Date(rawCreated);
  }

  if (isNaN(createdDate.getTime())) return true;
  return createdDate <= CUTOFF_DATE;
};

/**
 * Merges existing tags with newly fetched CRM tags without duplicates.
 * @param {string|Array} existingTags 
 * @param {Array} newCrmTags 
 * @returns {string} Comma-separated string of unique tags
 */
export const mergeTags = (existingTags, newCrmTags = []) => {
  const set = new Set();

  if (Array.isArray(existingTags)) {
    existingTags.forEach(t => String(t).split(",").map(x => x.trim()).filter(Boolean).forEach(x => set.add(x)));
  } else if (typeof existingTags === "string") {
    existingTags.split(",").map(t => t.trim()).filter(Boolean).forEach(t => set.add(t));
  }

  if (Array.isArray(newCrmTags)) {
    newCrmTags.forEach(t => String(t).trim()).filter(Boolean).forEach(t => set.add(t));
  }

  return Array.from(set).join(", ");
};

/**
 * Performs a 1-time CRM tag sync for eligible legacy contacts.
 * @param {Object} contact 
 * @returns {Promise<{ crmSynced: boolean, updatedTags: string|null }|null>}
 */
export const syncContactTagsIfEligible = async (contact) => {
  if (!contact || contact._isNew || contact.crmSynced === true) {
    return null;
  }

  if (!isLegacyContact(contact)) {
    return null;
  }

  const phone = contact.Phone || contact.phone || contact.Mobile || contact.mobile;
  if (!phone) return { crmSynced: true, updatedTags: null };

  try {
    const crmMatch = await searchCRMByPhone(phone);
    if (crmMatch && crmMatch.tags && crmMatch.tags.length > 0) {
      const merged = mergeTags(contact.Tags || contact.tags, crmMatch.tags);
      return {
        crmSynced: true,
        updatedTags: merged
      };
    }
  } catch (err) {
    console.error(`[CRM Sync Error] Failed to sync tags for phone ${phone}:`, err);
  }

  return {
    crmSynced: true,
    updatedTags: null
  };
};
```

---

## 🎨 2. `src/page/call-center/admin/components/CrmTagSearchTab.jsx`
*Admin Panel tab for inspecting live GoHighLevel CRM tags and Firebase status.*

```jsx
import React, { useState } from "react";
import { Search, Loader, Tag, ShieldAlert } from "lucide-react";
import { searchCRMByPhone, searchCRM } from "../../../../lib/ghl";
import { checkGlobalDuplicate } from "../../../../lib/db";
import { toast } from "react-hot-toast";

export default function CrmTagSearchTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [crmResult, setCrmResult] = useState(null);
  const [firebaseResult, setFirebaseResult] = useState(null);
  const [searchedPhone, setSearchedPhone] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      toast.error("Please enter a phone number or name to search");
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setCrmResult(null);
    setFirebaseResult(null);
    setSearchedPhone(query);

    try {
      // 1. ALWAYS perform live GoHighLevel CRM API lookup by phone or query
      const cleanDigits = query.replace(/\D/g, "");
      let crmData = null;
      if (cleanDigits.length >= 5) {
        crmData = await searchCRMByPhone(cleanDigits);
      }
      
      if (!crmData) {
        const crmList = await searchCRM(query);
        if (crmList && crmList.length > 0) {
          crmData = crmList[0];
        }
      }
      setCrmResult(crmData);

      // 2. Query Firebase DB to compare local record and crmSynced status
      if (cleanDigits.length >= 5 && checkGlobalDuplicate) {
        const fbRes = await checkGlobalDuplicate(cleanDigits);
        if (fbRes && fbRes.first) {
          setFirebaseResult(fbRes.first);
        }
      }
    } catch (err) {
      console.error("CRM Search error:", err);
      toast.error("Search failed: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const getTagsArray = (tags) => {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
    if (typeof tags === "string") return tags.split(",").map(t => t.trim()).filter(Boolean);
    return [];
  };

  const crmTags = getTagsArray(crmResult?.tags || crmResult?.Tags);
  const fbTags = getTagsArray(firebaseResult?.Tags || firebaseResult?.tags);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
            <Tag size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">CRM Tag Search & Inspector</h1>
            <p className="text-xs text-slate-500">Performs an immediate live API call to GoHighLevel CRM to inspect real-time tags for any contact</p>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mt-5 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter 10-digit phone number (e.g. 9075975333) or contact name..."
              className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium transition"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl text-sm font-semibold shadow-sm transition flex items-center gap-2 shrink-0"
          >
            {isSearching ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
            {isSearching ? "Searching CRM..." : "Search Live Tags"}
          </button>
        </form>
      </div>

      {/* Results Grid */}
      {hasSearched && !isSearching && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CRM API Result Card */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <h2 className="text-base font-bold text-slate-900">GoHighLevel CRM (Live API Response)</h2>
              </div>
              {crmResult ? (
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full text-[11px] font-bold">
                  Contact Found in CRM
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200/60 rounded-full text-[11px] font-bold">
                  Not Found in CRM
                </span>
              )}
            </div>

            {crmResult ? (
              <div className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium block">Name</span>
                    <span className="font-semibold text-slate-800">{crmResult.Name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Phone</span>
                    <span className="font-semibold text-slate-800">{crmResult.Phone || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">City / State</span>
                    <span className="font-semibold text-slate-800">{[crmResult.City, crmResult.State].filter(Boolean).join(", ") || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">GHL ID</span>
                    <span className="font-mono text-[10px] text-slate-600">{crmResult.GHL_ID || "N/A"}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                    <span>Live CRM Tags ({crmTags.length})</span>
                  </h3>
                  {crmTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {crmTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                        >
                          <Tag size={12} className="text-indigo-500" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No tags attached to this CRM contact</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs flex-1 flex flex-col items-center justify-center">
                <ShieldAlert size={32} className="text-slate-300 mb-2" />
                No matching contact found in GoHighLevel CRM for "{searchedPhone}".
              </div>
            )}
          </div>

          {/* Firebase DB Status Card */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <h2 className="text-base font-bold text-slate-900">Firebase Call Center Record</h2>
              </div>
              {firebaseResult ? (
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${firebaseResult.crmSynced ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  {firebaseResult.crmSynced ? "Synced (crmSynced: true)" : "Pending Sync"}
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-full text-[11px] font-bold">
                  Not in Firebase
                </span>
              )}
            </div>

            {firebaseResult ? (
              <div className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium block">Name</span>
                    <span className="font-semibold text-slate-800">{firebaseResult.Name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Call Status</span>
                    <span className="font-semibold text-slate-800">{firebaseResult.status || "Pending"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Attended By</span>
                    <span className="font-semibold text-slate-800">{firebaseResult.attenderName || "Unassigned"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Source</span>
                    <span className="font-semibold text-slate-800">{firebaseResult.Source || "N/A"}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                    Stored Firebase Tags ({fbTags.length})
                  </h3>
                  {fbTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {fbTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                        >
                          <Tag size={12} className="text-slate-400" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No tags in Firebase record</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs flex-1 flex flex-col items-center justify-center">
                <ShieldAlert size={32} className="text-slate-300 mb-2" />
                Contact not yet added to Call Center Firebase DB.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 🛠️ 3. Integration Snippets

### A. `src/page/call-center/admin/utils.jsx`
Add the `crmtags` item to `TAB_ITEMS`:
```javascript
import { Tag } from "lucide-react";

export const TAB_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={18} /> },
  { id: "monthly", label: "Report", icon: <FileText size={18} /> },
  { id: "crmtags", label: "CRM Tag Search 🏷️", icon: <Tag size={18} /> },
  // ... other items
];
```

### B. `src/page/call-center/admin/AdminPanel.jsx`
Import and render `CrmTagSearchTab`:
```jsx
import CrmTagSearchTab from "./components/CrmTagSearchTab.jsx";

// Inside AdminPanel tab renderer:
{activeTab === "crmtags" && <CrmTagSearchTab />}
```

### C. `src/page/call-center/attender/components/EditModal.jsx`
Import `syncContactTagsIfEligible` and add the modal-open sync effect:
```jsx
import { syncContactTagsIfEligible } from "../../../../lib/crmSync";

// Inside EditModal component:
useEffect(() => {
  if (!row || row._isNew || edited.crmSynced === true) return;

  let isMounted = true;
  setIsSearchingCRM(true);

  syncContactTagsIfEligible(edited)
    .then(async (result) => {
      if (!isMounted || !result) return;

      setEdited(prev => {
        const next = { ...prev, crmSynced: result.crmSynced };
        if (result.updatedTags && result.updatedTags !== prev.Tags) {
          next.Tags = result.updatedTags;
        }
        return next;
      });

      const contactId = row.id || edited.contactId;
      if (contactId && !row._isNew) {
        try {
          const dbUpdates = { crmSynced: true };
          if (result.updatedTags) dbUpdates.Tags = result.updatedTags;
          await updateCallLog(contactId, dbUpdates);
        } catch (err) {
          console.error("Failed to persist crmSynced state:", err);
        }
      }
    })
    .finally(() => {
      if (isMounted) setIsSearchingCRM(false);
    });

  return () => {
    isMounted = false;
  };
}, [row?.id]);
```
