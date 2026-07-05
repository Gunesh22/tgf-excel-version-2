import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Phone, Plus, X, Save, Tag, User, MapPin, MessageSquare,
  Hash, Clock, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame,
  ChevronDown, Check, Search
} from "lucide-react";
import {
  addIncomingCallLog, updateCallLog, createProgram, checkGlobalDuplicate
} from "../../../../lib/db";
import { searchCRMByPhone } from "../../../../lib/ghl";
import {
  STATUS_OPTIONS,
  OBJECTION_REASONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  CALL_TYPE_OPTIONS,
  isIgnoredField,
  getFieldWithFallback,
  isKhojiAffirmative,
  isKhojiNegative,
  isKhojiField,
  formatContactName
} from "../utils";

const SearchableDropdown = ({
  options,
  selected,
  onChange,
  placeholder = "Select option...",
  isMulti = false,
  colorClass = "indigo",
  disabled = false,
  allowCreate = false,
  onCreate = null
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) setSearch("");
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    return options.filter(opt =>
      String(opt || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  const handleSelect = (option) => {
    if (disabled) return;
    if (isMulti) {
      const selectedArr = selected ? selected.split(",").map(x => x.trim()).filter(Boolean) : [];
      let newSelected;
      if (selectedArr.includes(option)) {
        newSelected = selectedArr.filter(x => x !== option);
      } else {
        newSelected = [...selectedArr, option];
      }
      onChange(newSelected.join(", "));
    } else {
      onChange(option);
      setIsOpen(false);
    }
  };

  const isSelected = (option) => {
    if (isMulti) {
      const selectedArr = selected ? selected.split(",").map(x => x.trim()).filter(Boolean) : [];
      return selectedArr.includes(option);
    }
    return selected === option;
  };

  const getButtonText = () => {
    if (!selected) return placeholder;
    if (isMulti) {
      const selectedArr = selected.split(",").map(x => x.trim()).filter(Boolean);
      if (selectedArr.length === 0) return placeholder;
      return selectedArr.join(", ");
    }
    return selected;
  };

  const hasExactMatch = useMemo(() => {
    if (!search.trim()) return true;
    return options.some(opt =>
      String(opt || "").toLowerCase() === search.trim().toLowerCase()
    );
  }, [options, search]);

  const handleCreate = () => {
    if (disabled || !search.trim() || !onCreate) return;
    onCreate(search.trim());
    setIsOpen(false);
    setSearch("");
  };

  const hasValue = useMemo(() => {
    if (!selected) return false;
    if (isMulti) {
      return selected.split(",").map(x => x.trim()).filter(Boolean).length > 0;
    }
    return true;
  }, [selected, isMulti]);

  const ringClass = colorClass === "amber" ? "focus:ring-amber-500/10 focus:border-amber-500" :
                    colorClass === "blue" ? "focus:ring-blue-500/10 focus:border-blue-500" :
                    "focus:ring-indigo-500/10 focus:border-indigo-500";

  const buttonStyle = disabled
    ? "bg-gray-100/60 border-gray-150 text-gray-400 cursor-not-allowed"
    : hasValue
      ? colorClass === "amber" ? "bg-amber-50/40 border-amber-300 text-amber-900 font-bold" :
        colorClass === "blue" ? "bg-blue-50/40 border-blue-300 text-blue-900 font-bold" :
        "bg-indigo-50/40 border-indigo-300 text-indigo-900 font-bold"
      : "bg-gray-50 border-gray-150 text-gray-400 hover:bg-gray-100/50 font-medium";

  const iconColor = hasValue
    ? colorClass === "amber" ? "text-amber-500" :
      colorClass === "blue" ? "text-blue-500" :
      "text-indigo-500"
    : "text-gray-400";

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-2 border rounded-xl text-sm text-left focus:outline-none focus:ring-4 ${ringClass} flex justify-between items-center transition ${buttonStyle}`}
      >
        <span className="truncate">{getButtonText()}</span>
        <ChevronDown size={14} className={`${iconColor} shrink-0 ml-2`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-72 overflow-hidden flex flex-col animate-slide-up animate-duration-150">
          <div className="p-2 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
            <Search size={14} className="text-gray-400 shrink-0 ml-1" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search options..."
              className="w-full bg-transparent px-1 py-1 text-xs text-gray-800 focus:outline-none placeholder:text-gray-400"
              autoFocus
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 p-0.5">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 py-1 divide-y divide-gray-50 max-h-56">
            {filteredOptions.length === 0 && (!allowCreate || !search.trim()) ? (
              <div className="px-4 py-3 text-xs text-gray-400 italic text-center">No options found</div>
            ) : (
              <>
                {filteredOptions.map(opt => {
                  const active = isSelected(opt);
                  const itemStyle = active
                    ? colorClass === "amber" ? "bg-amber-50 text-amber-800 font-bold" :
                      colorClass === "blue" ? "bg-blue-50 text-blue-800 font-bold" :
                      "bg-indigo-50 text-indigo-800 font-bold"
                    : "text-gray-700 hover:bg-gray-50/80";
                  const activeCheckColor = colorClass === "amber" ? "text-amber-600" :
                                           colorClass === "blue" ? "text-blue-600" :
                                           "text-indigo-600";
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSelect(opt)}
                      className={`w-full px-4 py-2.5 text-left text-xs font-semibold flex items-center justify-between transition ${itemStyle}`}
                    >
                      <span className="truncate">{opt}</span>
                      {active && (
                        <Check size={14} className={`${activeCheckColor} shrink-0 ml-2`} />
                      )}
                    </button>
                  );
                })}
                {allowCreate && search.trim() && !hasExactMatch && (
                  <button
                    type="button"
                    onClick={handleCreate}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-indigo-600 hover:bg-indigo-50 border-t border-gray-100 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus size={14} className="shrink-0 text-indigo-600" />
                    <span>Create "{search.trim()}"</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const EditModal = ({ row, attenderId, attenderName = "Unknown", programs = [], onSave, onDelete, onClose }) => {
  const [edited, setEdited] = useState(() => {
    const normalized = { ...row };
    if (normalized.callType) {
      normalized.callType = String(normalized.callType).toLowerCase();
    }
    
    // Whitelist fields to normalize
    const standardFields = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Tags", "Source", "Called For"];
    
    // 1. Get fallback values for all standard fields
    const standardVals = {};
    standardFields.forEach(col => {
      standardVals[col] = getFieldWithFallback(row, col);
    });

    // 2. Delete all aliases of standard fields from the normalized object to avoid duplicate keys
    const keysToDelete = new Set();
    const keys = Object.keys(row);
    
    keys.forEach(k => {
      const kLower = k.toLowerCase();
      // Name aliases
      if (["name", "caller", "caller name", "lead name", "lead", "name of caller"].includes(kLower)) keysToDelete.add(k);
      // Phone aliases
      if (["phone", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "contact no", "contact_no"].includes(kLower)) keysToDelete.add(k);
      // Mobile aliases
      if (["mobile", "mobile no", "mobile number"].includes(kLower)) keysToDelete.add(k);
      // Email aliases
      if (["email", "mail", "e-mail", "email id", "emailaddress"].includes(kLower)) keysToDelete.add(k);
      // City aliases
      if (["city", "location", "khoji city", "place", "city name"].includes(kLower)) keysToDelete.add(k);
      // State aliases
      if (["state", "state name", "province", "region"].includes(kLower)) keysToDelete.add(k);
      // Khoji aliases
      if (isKhojiField(kLower)) keysToDelete.add(k);
      // Source aliases
      if (["source", "sourse", "source of informiton", "source of information"].includes(kLower)) keysToDelete.add(k);
      // Tags aliases
      if (["tags", "tag"].includes(kLower)) keysToDelete.add(k);
      // Called For aliases
      if (["called for", "called_for", "calledfor"].includes(kLower)) keysToDelete.add(k);
    });

    // Delete keys
    keysToDelete.forEach(k => {
      delete normalized[k];
    });

    // 3. Set standard fields with normalized values
    standardFields.forEach(col => {
      normalized[col] = standardVals[col];
    });
    // Normalize Tags: if only a `tags` array exists (no `Tags` string), convert to comma string for display
    if (!normalized.Tags && Array.isArray(row.tags) && row.tags.length > 0) {
      normalized.Tags = row.tags.join(", ");
    }
    return {
      ...normalized,
      // Always start with empty remark for a new note — previous remarks are shown in the history timeline
      remark: "",
      // If status is Query, default queryStatus to Pending for backward compat
      queryStatus: normalized.status === "Query" ? (normalized.queryStatus || "Pending") : normalized.queryStatus,
    };
  });
  const [saving, setSaving] = useState(false);
  const [globalDup, setGlobalDup] = useState(null);
  const [isSearchingCRM, setIsSearchingCRM] = useState(false);
  const [dupPopoverOpen, setDupPopoverOpen] = useState(false);
  const handleDismissRef = useRef(null);
  const [addedFields, setAddedFields] = useState([]);
  const [localPrograms, setLocalPrograms] = useState(programs);
  const [showCalledForPrompt, setShowCalledForPrompt] = useState(false);
  const [promptSelection, setPromptSelection] = useState([]);
  const [pendingSave, setPendingSave] = useState(false);
  const [showUndoStatusPrompt, setShowUndoStatusPrompt] = useState(false);

  useEffect(() => {
    setLocalPrograms(programs);
  }, [programs]);

  const getOtherValuesForField = (fieldKey) => {
    const list = [];
    const seenKeys = new Set();

    const extractVal = (obj, key) => {
      if (!obj) return undefined;
      if (key === "programName") return obj.programName || obj.programId;
      if (obj[key] !== undefined) return obj[key];
      const cleanStr = (s) => String(s).toLowerCase().replace(/[\s_-]/g, "");
      const targetClean = cleanStr(key);
      const found = Object.keys(obj).find(k => cleanStr(k) === targetClean);
      return found ? obj[found] : undefined;
    };

    const addToList = (rawName, val) => {
      if (val === undefined || val === null) return;
      const valStr = String(Array.isArray(val) ? val.join(", ") : val).trim();
      if (!valStr) return;

      const name = rawName === attenderName ? "You" : rawName;
      const uniqueKey = `${name}_${valStr}`.toLowerCase();
      if (!seenKeys.has(uniqueKey)) {
        seenKeys.add(uniqueKey);
        list.push({ name, val: valStr });
      }
    };

    // 1. Gather from current contact's attenderStates
    if (row.attenderStates) {
      Object.keys(row.attenderStates).forEach(attId => {
        const state = row.attenderStates[attId];
        if (state) {
          const name = state.attenderName || (attId === attenderId ? "You" : "Attender");
          const val = extractVal(state, fieldKey);
          addToList(name, val);

          // History logs inside state
          if (Array.isArray(state.history)) {
            state.history.forEach(h => {
              const hVal = extractVal(h, fieldKey);
              const hName = h.attenderName || name;
              addToList(hName, hVal);
            });
          }
        }
      });
    }

    // 2. Gather from current contact's top-level and history
    const topVal = extractVal(row._rawData || row, fieldKey);
    const topName = row.lastEditedBy || row.assignedName || row.attenderName || "Original";
    addToList(topName, topVal);

    const currentHist = Array.isArray(edited.history) ? edited.history : (Array.isArray(row.history) ? row.history : []);
    currentHist.forEach(h => {
      const hVal = extractVal(h, fieldKey);
      const hName = h.attenderName || topName;
      addToList(hName, hVal);
    });

    // 3. Gather from duplicate matches
    if (globalDup && Array.isArray(globalDup.matches)) {
      globalDup.matches.forEach(m => {
        // Top-level value of duplicate
        const mVal = extractVal(m, fieldKey);
        const mName = m.lastEditedBy || m.assignedName || m.attenderName || "Duplicate";
        addToList(mName, mVal);

        // History logs of duplicate
        if (Array.isArray(m.history)) {
          m.history.forEach(h => {
            const hVal = extractVal(h, fieldKey);
            const hName = h.attenderName || mName;
            addToList(hName, hVal);
          });
        }

        // attenderStates of duplicate
        if (m.attenderStates) {
          Object.keys(m.attenderStates).forEach(attId => {
            const state = m.attenderStates[attId];
            if (state) {
              const name = state.attenderName || "Attender";
              const val = extractVal(state, fieldKey);
              addToList(name, val);

              if (Array.isArray(state.history)) {
                state.history.forEach(h => {
                  const hVal = extractVal(h, fieldKey);
                  const hName = h.attenderName || name;
                  addToList(hName, hVal);
                });
              }
            }
          });
        }
      });
    }

    // Filter out currently active input value to keep the badges focused on past history
    const myCurrentVal = String(edited[fieldKey] || "").trim().toLowerCase();
    return list.filter(item => {
      const itemValStr = String(item.val).trim().toLowerCase();
      return itemValStr !== myCurrentVal;
    });
  };

  const getLastEditedBy = () => {
    let latestTime = 0;
    let latestAttender = row.lastEditedBy || row.assignedName || row.attenderName || "";
    
    if (row.updatedAt) {
      const t = row.updatedAt?.toMillis ? row.updatedAt.toMillis() : new Date(row.updatedAt).getTime();
      if (t > latestTime) {
        latestTime = t;
      }
    }

    // Check attenderStates
    if (row.attenderStates) {
      Object.keys(row.attenderStates).forEach(attId => {
        const state = row.attenderStates[attId];
        if (state && state.updatedAt) {
          const t = new Date(state.updatedAt).getTime();
          if (t > latestTime) {
            latestTime = t;
            latestAttender = state.attenderName || "Attender";
          }
        }
      });
    }
    
    if (globalDup && Array.isArray(globalDup.matches)) {
      globalDup.matches.filter(m => m.isAssigned === true || m.assignedTo).forEach(m => {
        if (m.updatedAt) {
          const t = m.updatedAt?.toMillis ? m.updatedAt.toMillis() : new Date(m.updatedAt).getTime();
          if (t > latestTime) {
            latestTime = t;
            latestAttender = m.lastEditedBy || m.assignedName || m.attenderName || "";
          }
        }
      });
    }
    
    return latestAttender;
  };

  const handleCreateProgramTag = async (newTagName) => {
    const cleaned = newTagName.trim();
    if (!cleaned) return;

    // Prevent duplicate creation
    if (localPrograms.some(p => p.name.toLowerCase() === cleaned.toLowerCase())) {
      toast.error("Program/tag already exists!");
      return;
    }

    const toastId = toast.loading(`Creating program/tag "${cleaned}"...`);
    try {
      await createProgram(cleaned);

      const newProg = {
        id: cleaned,
        name: cleaned,
        contactCount: 0,
        createdAt: new Date()
      };

      setLocalPrograms(prev => [newProg, ...prev]);

      // Select it
      handleChange("programId", cleaned);
      handleChange("programName", cleaned);
      handleChange("Sub Program", cleaned);
      handleChange("subProgram", cleaned);

      // Sync to Tags field
      const existingTagsStr = edited.Tags || "";
      const existingTags = existingTagsStr.split(",").map(x => x.trim()).filter(Boolean);
      if (!existingTags.includes(cleaned)) {
        existingTags.push(cleaned);
      }
      handleChange("Tags", existingTags.join(", "));

      toast.success(`Program/tag "${cleaned}" created!`, { id: toastId });
    } catch (err) {
      toast.error(`Failed to create: ${err.message}`, { id: toastId });
    }
  };

  const handleAddField = () => {
    const name = window.prompt("Enter new field name:");
    if (!name) return;
    const cleanName = name.trim();
    if (!cleanName) return;

    // Check if standard or already exists
    const existingKeys = Object.keys(edited).map(k => k.toLowerCase());
    if (existingKeys.includes(cleanName.toLowerCase())) {
      toast.error("Field already exists!");
      return;
    }

    setAddedFields(prev => [...prev, cleanName]);
    setEdited(prev => ({
      ...prev,
      [cleanName]: ""
    }));
  };

  // Identify fields from the contact that aren't internal bookkeeping fields
  const dynamicFields = useMemo(() => {
    const standardOrder = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Tags", "Source", "Called For"];
    const excludedKeysLower = new Set([
      "id", "contactid", "programid", "programname", "attenderid", "attendername",
      "calltype", "call type", "status", "remark", "callbackdate", "callbackstatus", "iscallbackdue",
      "ishotlead", "createdat", "updatedat", "lastcalledat", "firstcalledat", "history",
      "_callbackdue", "_deleted", "_isnew", "registeredat", "conversionsource", "convertedby",
      "ghl_id", "ghlid", "sub program", "subprogram", "objectionreason",
      "lasteditedby", "lasteditedat", "attenderstates", "assignedto",
      "assignedname", "assignedat", "isassigned", "normalizedphone", "normalizedmobile", "registeredyearmonth",
      "name", "phone", "mobile", "email", "city", "state", "khoji", "tags", "source", "called for", "calledfor", "sourse",
      "ismanualentry", "ismanual", "is_manual_entry"
    ]);

    const contactKeys = Object.keys(edited).filter(k => {
      const kLower = k.toLowerCase().trim();
      if (excludedKeysLower.has(kLower)) return false;
      if (k.startsWith("_")) return false;

      // Always show newly added fields in this modal session
      if (addedFields.includes(k)) return true;

      // If the contact has recorded mapped fields list, only allow if explicitly mapped.
      if (edited._mappedFields && Array.isArray(edited._mappedFields)) {
        return edited._mappedFields.includes(k);
      }

      if (isIgnoredField(k)) return false;
      
      // Only show other fields if they have a non-empty, non-dummy value
      const val = edited[k];
      if (val === null || val === undefined) return false;
      const strVal = String(val).trim();
      if (!strVal) return false;
      
      const lowerVal = strVal.toLowerCase();
      if (["none", "n/a", "null", "undefined", "false"].includes(lowerVal)) return false;
      
      return true;
    });

    const sortedKeys = [...contactKeys].sort((a, b) => {
      const idxA = standardOrder.indexOf(a);
      const idxB = standardOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedKeys;
  }, [edited, addedFields]);

  // Debounced duplicate check — only on phone/mobile value change, not every keystroke
  const phoneVal = useMemo(() => {
    const key = Object.keys(edited).find(k => {
      const kl = k.toLowerCase();
      return (kl === "phone") || (kl.includes("phone") && !kl.includes("mobile")) || kl.includes("whatsapp") || (kl.includes("cont") && !kl.includes("mobile"));
    }) || "Phone";
    return String(edited[key] || "").trim();
  }, [edited]);

  const mobileVal = useMemo(() => {
    const key = Object.keys(edited).find(k => {
      const kl = k.toLowerCase();
      return kl.includes("mobile");
    }) || "Mobile";
    return String(edited[key] || "").trim();
  }, [edited]);

  const dupTimerRef = useRef(null);
  useEffect(() => {
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);

    const hasPhone = phoneVal && phoneVal.length >= 5;
    const hasMobile = mobileVal && mobileVal.length >= 5;

    if (!hasPhone && !hasMobile) {
      setGlobalDup(null);
      return;
    }

    dupTimerRef.current = setTimeout(async () => {
      try {
        // For NEW incoming entries, don't exclude any id so all matches show.
        // For existing contacts, exclude self so we only flag TRUE duplicates (different docs).
        const excludeId = row._isNew ? null : (edited.contactId || row.id);

        const results = await Promise.all([
          hasPhone  ? checkGlobalDuplicate(phoneVal,  excludeId) : Promise.resolve(null),
          hasMobile ? checkGlobalDuplicate(mobileVal, excludeId) : Promise.resolve(null),
        ]);

        const [r1, r2] = results;

        let combinedMatches = [];
        const allTagsSet = new Set();
        if (r1 || r2) {
          const allMatchesMap = new Map();
          [r1, r2].forEach(res => {
            if (!res) return;
            if (Array.isArray(res.matches)) {
              res.matches.forEach(m => allMatchesMap.set(m.id, m));
            }
            if (Array.isArray(res.allTags)) {
              res.allTags.forEach(t => allTagsSet.add(t));
            }
          });
          combinedMatches = Array.from(allMatchesMap.values());
        }

        if (combinedMatches.length > 0) {
          const dup = combinedMatches[0];
          const hasAssignedMatch = combinedMatches.some(m => m.isAssigned === true || (Array.isArray(m.assignedTo) && m.assignedTo.length > 0));

          setGlobalDup({
            count:       combinedMatches.length,
            allTags:     Array.from(allTagsSet).sort(),
            matches:     combinedMatches,
            first:       dup,
            programName: dup?.programName,
            showWarning: hasAssignedMatch
          });

          // ── Auto-fill all contact fields from the duplicate ──
          if (dup) {
            setEdited(prev => {
              const updated = { ...prev };

              // Standard personal fields — only fill if currently empty
              ["Name", "Email", "City", "State", "Khoji"].forEach(f => {
                const dupVal = getFieldWithFallback(dup, f);
                if (!String(updated[f] || "").trim() && dupVal) {
                  updated[f] = dupVal;
                }
              });

              // Tags
              const dupTagsVal = getFieldWithFallback(dup, "tags") || getFieldWithFallback(dup, "Tags");
              if (!String(updated.Tags || "").trim() && dupTagsVal) {
                updated.Tags = dupTagsVal;
              }

              // Link contact identity
              if (!updated.contactId) {
                updated.contactId = dup.contactId || dup.id;
              }
              if (!updated.GHL_ID && dup.GHL_ID) {
                updated.GHL_ID = dup.GHL_ID;
              }

              // All other custom / dynamic fields — fill if empty
              const skipKeys = new Set([
                "id", "contactid", "ghl_id", "normalizedphone", "normalizedmobile",
                "assignedto", "assignedname", "assignedat", "isassigned", "history",
                "createdat", "updatedat", "lasteditedby", "lasteditedat", "createdtime",
                "attenderid", "attendername", "programid", "programname", "remark", "status",
                "calltype", "querystatus", "objectionreason", "callbackdate", "callbackstatus",
                "ishotlead", "firstcalledat", "lastcalledat", "_isnew", "_rawdata", "_deleted",
                "attenderstates", "tags", "source", "called for", "called_for", "calledfor"
              ]);

              Object.keys(dup).forEach(k => {
                if (skipKeys.has(k.toLowerCase())) return;
                const dupVal = dup[k];
                if (dupVal === undefined || dupVal === null || String(dupVal).trim() === "") return;
                const existingKey = Object.keys(updated).find(x => x.toLowerCase() === k.toLowerCase());
                if (existingKey) {
                  if (!String(updated[existingKey] || "").trim()) {
                    updated[existingKey] = dupVal;
                  }
                } else {
                  updated[k] = dupVal;
                }
              });

              return updated;
            });
          }
        } else {
          // No duplicate found in Firebase -> Reset duplicate state and query CRM!
          setGlobalDup(null);

          // Only query CRM if this is a brand new contact (row._isNew) and not yet fetched (no GHL_ID/ghl_id)
          const alreadyFetched = !!(edited.GHL_ID || row.GHL_ID || edited.ghl_id || row.ghl_id);
          if (row._isNew && !alreadyFetched) {
            const searchVal = phoneVal || mobileVal;
            const digitsCount = String(searchVal || "").replace(/\D/g, "").length;
            if (digitsCount >= 10) {
              setIsSearchingCRM(true);
              console.log(`[CRM Fetch] Initiated search CRM by phone for value: "${searchVal}" (digits: ${digitsCount})`);
              try {
                const crmContact = await searchCRMByPhone(searchVal);
                if (crmContact) {
                  console.log(`[CRM Fetch] Found contact in CRM for phone "${searchVal}":`, crmContact);
                  setEdited(prev => {
                    const updated = { ...prev };
                    if (!String(updated.Name || "").trim() && crmContact.Name) {
                      updated.Name = crmContact.Name;
                    }
                    if (!String(updated.City || "").trim() && crmContact.City) {
                      updated.City = crmContact.City;
                    }
                    if (!String(updated.Tags || "").trim() && crmContact.Tags) {
                      updated.Tags = crmContact.Tags;
                    }
                    if (!String(updated.GHL_ID || "").trim() && crmContact.GHL_ID) {
                      updated.GHL_ID = crmContact.GHL_ID;
                    }
                    return updated;
                  });
                  toast.success("Lead found in CRM! Details auto-filled.");
                } else {
                  console.log(`[CRM Fetch] No contact found in CRM for phone "${searchVal}"`);
                }
              } catch (crmErr) {
                console.error(`[CRM Fetch] Error searching CRM for phone "${searchVal}":`, crmErr);
              } finally {
                setIsSearchingCRM(false);
              }
            } else {
              console.log(`[CRM Fetch] Skipping CRM search because search value "${searchVal}" has only ${digitsCount} digits (minimum 10 required).`);
            }
          }
        }
      } catch (err) {
        console.error("[EditModal] Duplicate check failed:", err);
        setGlobalDup(null);
      }
    }, 800);

    return () => { if (dupTimerRef.current) clearTimeout(dupTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneVal, mobileVal, row._isNew, row.id, edited.contactId]);

  const isPhoneDuplicate = useMemo(() => {
    if (!globalDup || !globalDup.showWarning || !globalDup.first || !phoneVal) return false;
    const rawNorm = phoneVal.replace(/\D/g, "");
    if (!rawNorm) return false;
    const norm = rawNorm.length >= 10 ? rawNorm.slice(-10) : rawNorm;
    const first = globalDup.first;
    return (
      first.normalizedPhone === norm ||
      first.normalizedMobile === norm ||
      (Array.isArray(first.normalizedPhones) && first.normalizedPhones.includes(norm))
    );
  }, [globalDup, phoneVal]);

  const isMobileDuplicate = useMemo(() => {
    if (!globalDup || !globalDup.showWarning || !globalDup.first || !mobileVal) return false;
    const rawNorm = mobileVal.replace(/\D/g, "");
    if (!rawNorm) return false;
    const norm = rawNorm.length >= 10 ? rawNorm.slice(-10) : rawNorm;
    const first = globalDup.first;
    return (
      first.normalizedPhone === norm ||
      first.normalizedMobile === norm ||
      (Array.isArray(first.normalizedPhones) && first.normalizedPhones.includes(norm))
    );
  }, [globalDup, mobileVal]);

  const handleAutofillFromDuplicate = () => {
    if (!globalDup || !globalDup.first) return;
    const dup = globalDup.first;
    setEdited(prev => {
      const updated = { ...prev };
      
      // 1. Autofill standard fields
      const fieldsToMap = ["Name", "Email", "City", "State", "Khoji"];
      fieldsToMap.forEach(f => {
        const dupVal = getFieldWithFallback(dup, f);
        if (!String(updated[f] || "").trim() && dupVal) {
          updated[f] = dupVal;
        }
      });

      // Map Tags specifically
      const dupTagsVal = getFieldWithFallback(dup, "tags") || getFieldWithFallback(dup, "Tags");
      if (!String(updated.Tags || "").trim() && dupTagsVal) {
        updated.Tags = dupTagsVal;
      }

      // Set contactId and GHL_ID
      if (!updated.contactId) {
        updated.contactId = dup.contactId || dup.id;
      }
      if (!updated.GHL_ID && dup.GHL_ID) {
        updated.GHL_ID = dup.GHL_ID;
      }

      // 2. Autofill all other fields (custom / dynamic fields)
      Object.keys(dup).forEach(k => {
        const kl = k.toLowerCase();
        if ([
          "id", "contactid", "ghl_id", "normalizedphone", "normalizedmobile",
          "assignedto", "assignedname", "assignedat", "isassigned", "history",
          "createdat", "updatedat", "lasteditedby", "lasteditedat", "createdtime",
          "attenderid", "attendername", "programid", "programname", "remark", "status",
          "calltype", "querystatus", "objectionreason", "callbackdate", "callbackstatus",
          "ishotlead", "firstcalledat", "lastcalledat", "_isnew", "_rawdata", "_deleted",
          "attenderstates", "tags", "source", "called for", "called_for", "calledfor"
        ].includes(kl)) {
          return;
        }

        const dupVal = dup[k];
        if (dupVal !== undefined && dupVal !== null && String(dupVal).trim() !== "") {
          const existingKey = Object.keys(updated).find(x => x.toLowerCase() === kl);
          if (existingKey) {
            if (!String(updated[existingKey] || "").trim()) {
              updated[existingKey] = dupVal;
            }
          } else {
            updated[k] = dupVal;
          }
        }
      });

      return updated;
    });
    toast.success("Autofilled contact details from duplicate entry!");
  };

  // Aggregated Call Notes / History from current contact & duplicate contact records
  const mergedHistory = useMemo(() => {
    const list = [];

    // 1. Current contact's history entries
    const currentHist = Array.isArray(edited.history) ? edited.history : (Array.isArray(row.history) ? row.history : []);
    currentHist.forEach((h, idx) => {
      if (h.remark && String(h.remark).trim()) {
        list.push({
          status: h.status || "",
          remark: h.remark || "",
          attenderName: h.attenderName || "Unknown",
          timestamp: h.timestamp || new Date().toISOString(),
          isCurrentDoc: true,
          originalIndex: idx,
          sourceProgram: row.programName || "This Sheet"
        });
      }
    });

    // 1b. Also include the standalone remark saved before history tracking existed
    //     (i.e., a remark that is NOT already represented in any history entry)
    if (row.remark && String(row.remark).trim()) {
      const remarkStr = String(row.remark).trim();
      const alreadyInHistory = list.some(h => h.remark === remarkStr && h.isCurrentDoc);
      if (!alreadyInHistory) {
        list.push({
          status: row.status || "",
          remark: remarkStr,
          attenderName: row.attenderName || row.assignedName || "Unknown",
          timestamp: row.updatedAt?.toDate?.()?.toISOString?.() || row.updatedAt || row.createdAt?.toDate?.()?.toISOString?.() || row.createdAt || new Date().toISOString(),
          isCurrentDoc: true,
          originalIndex: -1, // sentinel: this is a standalone remark, not editable inline
          sourceProgram: row.programName || "This Sheet"
        });
      }
    }

    // 2. Iterate over row.attenderStates to collect history of all sessions
    if (row.attenderStates) {
      Object.keys(row.attenderStates).forEach(otherAttenderId => {
        const state = row.attenderStates[otherAttenderId];
        if (state) {
          const progName = state.programName || "Other Attender";
          // Add history entries
          if (Array.isArray(state.history)) {
            state.history.forEach(h => {
              if (h.remark && String(h.remark).trim()) {
                list.push({
                  status: h.status || "",
                  remark: h.remark || "",
                  attenderName: h.attenderName || state.attenderName || "Unknown",
                  timestamp: h.timestamp || new Date().toISOString(),
                  isCurrentDoc: otherAttenderId === attenderId,
                  sourceProgram: progName
                });
              }
            });
          }
          // Standalone remark for this other attender
          if (state.remark && String(state.remark).trim()) {
            const attRemark = String(state.remark).trim();
            const alreadyInHistory = Array.isArray(state.history) && state.history.some(h => h.remark === attRemark);
            if (!alreadyInHistory) {
              list.push({
                status: state.status || "",
                remark: attRemark,
                attenderName: state.attenderName || "Unknown",
                timestamp: state.updatedAt || new Date().toISOString(),
                isCurrentDoc: otherAttenderId === attenderId,
                sourceProgram: progName
              });
            }
          }
        }
      });
    }

    // 3. Fallback: also include duplicate contacts' history if globalDup has matches
    if (globalDup && Array.isArray(globalDup.matches)) {
      globalDup.matches.filter(m => m.id !== row.id).forEach(m => {
        const progName = m.programName || "Duplicate Lead";

        // A) Extract nested history/remarks from m.attenderStates
        if (m.attenderStates) {
          Object.keys(m.attenderStates).forEach(otherId => {
            const state = m.attenderStates[otherId];
            if (state) {
              const attProgName = state.programName || progName;
              if (Array.isArray(state.history)) {
                state.history.forEach(h => {
                  if (h.remark && String(h.remark).trim()) {
                    list.push({
                      status: h.status || "",
                      remark: h.remark || "",
                      attenderName: h.attenderName || state.attenderName || "Unknown",
                      timestamp: h.timestamp || new Date().toISOString(),
                      isCurrentDoc: false,
                      sourceProgram: attProgName
                    });
                  }
                });
              }
              if (state.remark && String(state.remark).trim()) {
                const attRemark = String(state.remark).trim();
                const alreadyInStateHistory = Array.isArray(state.history) && state.history.some(h => h.remark === attRemark);
                if (!alreadyInStateHistory) {
                  list.push({
                    status: state.status || "",
                    remark: attRemark,
                    attenderName: state.attenderName || "Unknown",
                    timestamp: state.updatedAt || new Date().toISOString(),
                    isCurrentDoc: false,
                    sourceProgram: attProgName
                  });
                }
              }
            }
          });
        }

        // B) Extract top-level history/remarks of the duplicate match
        if (Array.isArray(m.history)) {
          m.history.forEach(h => {
            if (h.remark && String(h.remark).trim()) {
              list.push({
                status: h.status || "",
                remark: h.remark || "",
                attenderName: h.attenderName || "Unknown",
                timestamp: h.timestamp || new Date().toISOString(),
                isCurrentDoc: false,
                sourceProgram: progName
              });
            }
          });
        }
        // Also include standalone remark from duplicate if no history
        if (m.remark && String(m.remark).trim()) {
          const dupRemark = String(m.remark).trim();
          const alreadyInDupHistory = Array.isArray(m.history) && m.history.some(h => h.remark === dupRemark);
          if (!alreadyInDupHistory) {
            list.push({
              status: m.status || "",
              remark: dupRemark,
              attenderName: m.assignedName || m.attenderName || "Unknown",
              timestamp: m.updatedAt?.toDate?.()?.toISOString?.() || m.updatedAt || m.createdAt?.toDate?.()?.toISOString?.() || m.createdAt || new Date().toISOString(),
              isCurrentDoc: false,
              sourceProgram: progName
            });
          }
        }
      });
    }

    // Sort chronologically ascending
    list.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeA - timeB;
    });

    // Deduplicate by remark + attenderName (timestamp can vary slightly)
    const seen = new Set();
    const uniqueList = [];
    list.forEach(item => {
      const key = `${item.remark}_${item.status}_${item.attenderName}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueList.push(item);
      }
    });

    return uniqueList;
  }, [row.history, row.remark, row.status, row.programName, row.attenderName, row.assignedName, row.updatedAt, row.createdAt, row.attenderStates, globalDup, edited.history, attenderId]);

  // Identity helpers
  const getLogName = () => {
    if (edited.Name && String(edited.Name).trim()) {
      return edited.Name;
    }
    const key = Object.keys(edited).find(k => {
      const kl = k.toLowerCase();
      if (kl === "attendername" || kl === "programname") return false;
      return kl.includes("name") || kl.includes("lead");
    });
    return key ? edited[key] : "";
  };

  const handleChange = (key, val) => {
    setEdited(prev => ({ ...prev, [key]: val }));
  };

  const handleCallTypeChange = (newCallType) => {
    setEdited(prev => {
      const updated = { ...prev, callType: newCallType };
      
      // Only auto-update program/tag defaults if this is a new entry
      if (row._isNew) {
        const isIncoming = newCallType === "incoming" || newCallType === "incoming f";
        const currentProgId = prev.programId;
        
        // Only update if current program is the default incoming-calls or outgoing-calls,
        // or if it's empty (untagged). This avoids overwriting custom tags chosen by user.
        if (!currentProgId || currentProgId === "incoming-calls" || currentProgId === "outgoing-calls" || currentProgId === "Incoming Calls" || currentProgId === "Outgoing Calls") {
          const defaultProgId = isIncoming ? "incoming-calls" : "outgoing-calls";
          const defaultProgName = isIncoming ? "Incoming Calls" : "Outgoing Calls";
          
          updated.programId = defaultProgId;
          updated.programName = defaultProgName;
          updated["Sub Program"] = defaultProgName;
          updated.subProgram = defaultProgName;

          // Sync Tags string for display in the modal
          const currentTags = prev.Tags || "";
          const tagsList = currentTags.split(",").map(t => t.trim()).filter(Boolean);
          
          // Remove the other default tag if it exists
          const tagToRemove = isIncoming ? "Outgoing Calls" : "Incoming Calls";
          const tagToAdd = isIncoming ? "Incoming Calls" : "Outgoing Calls";
          
          let filteredTags = tagsList.filter(t => t !== tagToRemove);
          if (!filteredTags.includes(tagToAdd)) {
            filteredTags.push(tagToAdd);
          }
          updated.Tags = filteredTags.join(", ");
        }
      }
      return updated;
    });
  };

  // Smart field matching: find actual key name in data that matches an alias list.
  // Explicitly exclude dot-notation keys (e.g. attenderStates.attenderId.source) which
  // are internal Firestore paths and must never be used as field labels.
  const findField = (aliases) => {
    const keys = Object.keys(edited).filter(k => !k.includes(".") && !k.toLowerCase().startsWith("attenderstates"));
    return keys.find(k => aliases.some(a => k.toLowerCase() === a || k.toLowerCase() === a.replace(/_/g, " "))) 
      || keys.find(k => aliases.some(a => k.toLowerCase().includes(a)))
      || (aliases[0].charAt(0).toUpperCase() + aliases[0].slice(1));
  };
  const sourceField = findField(["source", "sourse"]);
  const calledForField = findField(["called for", "called_for", "calledfor"]);

  const isManualEntry = edited.isManualEntry || edited.programId === "incoming-calls" || edited.programId === "outgoing-calls" || edited.programId === "Incoming Calls" || edited.programId === "Outgoing Calls";
  const isIncoming = edited._isNew || edited.callType === "incoming" || edited.callType === "incoming f" || isManualEntry;

  const getEditable = (field) => {
    if (field === "Tags") return true;
    if (isIncoming) return true;
    if (addedFields.includes(field)) return true;
    const fLower = field.toLowerCase();
    return ["source", "called for", "khoji"].includes(fLower) || 
      fLower.includes("asmani") || 
      fLower.includes("aasmani") || 
      fLower.includes("आसमानी") || 
      fLower.includes("shivir done");
  };

  const isQuestion = (f) => f.length > 40 || /^(what|how|why|describe|tell)[\s_]/i.test(f);
  const isCampaign = (f) => { const k = f.toLowerCase().replace(/[_\s]/g, ""); return k.includes("adid") || k.includes("adname") || k.includes("adsetid") || k.includes("adsetname") || k.includes("campaignid") || k.includes("campaignname") || k.includes("formid") || k.includes("formname") || k.includes("isorganic") || k.includes("createdtime"); };
  const iconFor = (f) => { const k = f.toLowerCase(); return k.includes("name") || k.includes("lead") || k.includes("khoji") || k.includes("caller") ? <User size={11} className="text-emerald-500" /> : k.includes("phone") || k.includes("mobile") ? <Phone size={11} className="text-blue-500" /> : k.includes("city") || k.includes("location") ? <MapPin size={11} className="text-red-500" /> : k.includes("email") ? <Hash size={11} className="text-purple-500" /> : k.includes("when") || k.includes("suitable") ? <Clock size={11} className="text-amber-500" /> : k.includes("asmani") || k.includes("aasmani") || k.includes("आसमानी") ? <CheckCircle2 size={11} className="text-pink-500" /> : <Tag size={11} className="text-indigo-500" />; };
  const labelFor = (f) => f.replace(/_/g, " ").replace(/\?/g, "").trim();

  const basicFields = useMemo(() => {
    return dynamicFields.filter(f => !isQuestion(f) && !isCampaign(f));
  }, [dynamicFields]);
  const questionFields = useMemo(() => {
    return dynamicFields.filter(f => isQuestion(f));
  }, [dynamicFields]);
  const campaignFields = useMemo(() => {
    return dynamicFields.filter(f => isCampaign(f));
  }, [dynamicFields]);

  const handleSaveAndClose = async (overrideFields = null) => {
    if (saving) return; // Prevent double save

    const targetEdited = (overrideFields && typeof overrideFields === "object" && !overrideFields.target && !overrideFields.nativeEvent)
      ? { ...edited, ...overrideFields }
      : edited;

    // Compulsory Status Validation
    if (!targetEdited.status || String(targetEdited.status).trim() === "") {
      toast.error("Please select a call status before saving.", { duration: 4000, position: 'top-center' });
      return;
    }

    // Compulsory Called For Validation
    const calledForVal = String(targetEdited[calledForField] || "").trim();
    if (!calledForVal) {
      toast.error("Please select a 'Called For' program/option before saving.", { duration: 4000, position: 'top-center' });
      return;
    }

    // Objection Tracker Validation
    if ((targetEdited.status === "Not interested" || targetEdited.status === "Not possible") && !targetEdited.objectionReason) {
      toast.error(`Please select a reason for "${targetEdited.status}" before saving.`, { duration: 4000, position: 'top-center' });
      return;
    }

    // REGISTRATION DONE VALIDATION
    if (targetEdited.status === "Reg.Done" && CALLED_FOR_OPTIONS.length > 1) {
      const calledForVal = targetEdited[calledForField] || "";
      const selectedArr = calledForVal.split(",").map(x => x.trim()).filter(Boolean);
      if (selectedArr.length !== 1) {
        setPromptSelection("");
        setPendingSave(true);
        setShowCalledForPrompt(true);
        return;
      }
    }

    setSaving(true);

    if (onSave) onSave(targetEdited, true);

    try {
      const { id, _callbackDue, ...rest } = targetEdited;
      const updates = { ...rest };
      if (updates.Name) {
        updates.Name = formatContactName(updates.Name);
      }
      // Never send attenderStates or internal bookkeeping back to Firestore as a whole object.
      // updateCallLog manages attenderStates internally via dot-notation (merge-safe).
      // Sending it here would overwrite the entire map, erasing other attenders' data.
      delete updates.attenderStates;
      delete updates.assignedTo;
      delete updates.assignedName;
      delete updates.assignedAt;
      delete updates.isAssigned;
      delete updates.lastEditedBy;
      delete updates.lastEditedAt;
      delete updates.normalizedPhone;
      delete updates.normalizedMobile;
      if (updates.callbackDate) {
        if (typeof updates.callbackDate === "string") {
          updates.callbackDate = new Date(updates.callbackDate);
        }
      } else {
        updates.callbackDate = null;
      }

      // Clean undefined values out of updates because Firebase will CRASH if any field is undefined.
      Object.keys(updates).forEach(key => {
        if (updates[key] === undefined) {
          delete updates[key];
        }
      });

      // Ensure any newly added fields are marked as mapped so they show up in the table/attender view
      if (addedFields.length > 0) {
        const currentMapped = Array.isArray(updates._mappedFields) ? [...updates._mappedFields] : [];
        addedFields.forEach(f => {
          if (!currentMapped.includes(f)) {
            currentMapped.push(f);
          }
        });
        updates._mappedFields = currentMapped;
      }

      // Track call timestamp — always record when attender touched this contact
      updates.lastCalledAt = new Date().toISOString();
      if (!row.firstCalledAt && !targetEdited.firstCalledAt) {
        updates.firstCalledAt = new Date().toISOString();
      }

      // Maintain a timeline of interactions.
      // Only push a new history entry if:
      //   a) the status actually changed from what was previously saved, OR
      //   b) the attender typed a new remark this session (non-empty)
      let baseHistory = Array.isArray(targetEdited.history) ? targetEdited.history : (Array.isArray(row.history) ? row.history : []);

      // Conditionally update past history entries if correcting a mistake (not protected by a Reg.Done)
      const oldCalledFor = String(row[calledForField] || row.calledFor || "").trim();
      const newCalledFor = String(targetEdited[calledForField] || targetEdited.calledFor || "").trim();
      const oldSource = String(row[sourceField] || row.source || "").trim();
      const newSource = String(targetEdited[sourceField] || targetEdited.source || "").trim();
      const cleanStr = (s) => s ? String(s).toLowerCase().replace(/[\s_-]/g, "") : "";

      if (baseHistory.length > 0) {
        const isCalledForProtected = baseHistory.some(h => 
          cleanStr(h.calledFor) === cleanStr(oldCalledFor) && h.status === "Reg.Done"
        );
        
        baseHistory = baseHistory.map(h => {
          const updatedEntry = { ...h };
          if (oldCalledFor && newCalledFor && cleanStr(h.calledFor) === cleanStr(oldCalledFor)) {
            if (!isCalledForProtected) {
              updatedEntry.calledFor = newCalledFor;
            }
          }
          if (oldSource && newSource && cleanStr(h.source) === cleanStr(oldSource)) {
            if (!isCalledForProtected) {
              updatedEntry.source = newSource;
            }
          }
          return updatedEntry;
        });
      }

      // Maintain a timeline of interactions.
      // Only push a new history entry if:
      //   a) the status actually changed from what was previously saved, OR
      //   b) the attender typed a new remark this session (non-empty), OR
      //   c) the call type changed (e.g., from outgoing to incoming)
      const statusChanged = row.status !== updates.status;
      const hasNewRemark = String(updates.remark || "").trim().length > 0;
      const callTypeChanged = String(row.callType || "outgoing").toLowerCase() !== String(targetEdited.callType || "outgoing").toLowerCase();
      
      if (statusChanged || hasNewRemark || callTypeChanged) {
        const safeName = attenderName || "Unknown";
        const newHist = {
          status: updates.status || "",
          remark: updates.remark || "",
          attenderName: safeName,
          timestamp: new Date().toISOString(),
          calledFor: targetEdited["Called For"] || targetEdited.calledFor || "",
          source: targetEdited.Source || targetEdited.source || targetEdited.Sourse || targetEdited.sourse || "",
          callType: targetEdited.callType || "outgoing"
        };
        updates.history = [...baseHistory, newHist];
      } else {
        // Persist the corrected/updated baseHistory even if no new call attempt log was added
        updates.history = baseHistory;
      }

      updates.lastEditedBy = attenderName || "Unknown";

      console.log("Attempting to save updates: ", updates);

      // If this is a NEW incoming entry, create it in Firebase
      if (row._isNew) {
        delete updates._isNew;
        await addIncomingCallLog(
          row.attenderId, row.attenderName, updates, targetEdited.programId, targetEdited.programName
        );
      } else {
        await updateCallLog(id, updates, attenderId, attenderName);
      }

      console.log("✅ Save successful!");
      toast.success("Saved!", { duration: 4000, position: 'top-center' });

      if (onClose) onClose();
    } catch (err) {
      console.error("❌ CRTICAL SAVE ERROR:", err.message || err);
      alert("FIREBASE REFUSED TO SAVE: " + (err.message || "Unknown Error"));
      toast.error("Save failed - Check network & rules.", { duration: 6000, position: 'top-center' });
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    if (saving) return;
    if (onClose) onClose();
  };
  handleDismissRef.current = handleDismiss;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") handleDismissRef.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleDelete = async () => {
    if (!window.confirm("Remove this entry?")) return;
    onDelete(row.id);
    onClose();
  };

  const getCallbackDateStr = () => {
    if (!edited.callbackDate) return "";
    if (typeof edited.callbackDate === "string") return edited.callbackDate;
    if (edited.callbackDate?.toDate) return edited.callbackDate.toDate().toISOString().split("T")[0];
    return "";
  };

  const getPromptOptions = () => {
    const calledForVal = edited[calledForField] || "";
    const selectedArr = calledForVal.split(",").map(x => x.trim()).filter(Boolean);
    if (selectedArr.length === 0) {
      return CALLED_FOR_OPTIONS;
    }
    return selectedArr;
  };

  const modalScrollRef = useRef(null);
  useEffect(() => {
    if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0;
  }, [row?.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={handleDismiss}>
      <div
        className="bg-white rounded-3xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`px-6 py-4 flex items-center justify-between ${edited._callbackDue ? "bg-red-600" : "bg-indigo-600 shadow-lg shadow-indigo-600/20"}`}>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white">
              {edited.callType === "incoming" ? <PhoneIncoming size={20} /> : <PhoneOutgoing size={20} />}
            </div>
            <div>
              <h3 className="text-white font-black text-xl leading-none">{getLogName() || "Unknown Entry"}</h3>
              <div className="flex items-center gap-3 mt-1">
                {edited.createdAt && (
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                    Assigned: {(edited.createdAt?.toDate ? edited.createdAt.toDate() : new Date(edited.createdAt)).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                )}
                {edited.lastCalledAt && (
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                    Last called: {new Date(edited.lastCalledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {edited.history && edited.history.length > 0 && (
                  <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded text-white/80">
                    {edited.history.length} call{edited.history.length > 1 ? "s" : ""}
                  </span>
                )}

                {getLastEditedBy() && (
                  <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                    Last edited by: {getLastEditedBy()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleChange("isHotLead", !edited.isHotLead)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition ${edited.isHotLead ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30" : "bg-white/10 text-white/50 hover:bg-white/20"}`}
            >
              <Flame size={14} className={edited.isHotLead ? "animate-pulse" : ""} /> {edited.isHotLead ? "HOT LEAD" : "Mark Hot"}
            </button>
            {saving && <Loader size={16} className="text-white animate-spin" />}
            <button onClick={handleDismiss} className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition" title="Discard changes & close">
              <X size={18} />
            </button>
            <button
              onClick={handleSaveAndClose}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-white text-xs font-black transition disabled:opacity-50"
              title="Save changes & close"
            >
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
          </div>
        </div>

        <div ref={modalScrollRef} className="overflow-y-auto flex-1 p-8 space-y-8">
          {globalDup && globalDup.showWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3 animate-slide-up shadow-sm">
              <AlertCircle className="text-amber-500 shrink-0" size={16} />
              <p className="text-xs font-bold text-amber-800">
                ⚠️ Duplicate Detected:{" "}
                <span className="bg-amber-200/70 px-2 py-0.5 rounded-lg text-amber-900 ml-1">
                  {(() => {
                    const attenders = new Set();
                    const calledFors = new Set();
                    let isAssignedToMe = false;
                    let isAssignedToOthers = false;
                    let isUnassigned = false;

                    globalDup.matches.forEach(m => {
                      const docAssigned = m.isAssigned === true || (Array.isArray(m.assignedTo) && m.assignedTo.length > 0);
                      if (!docAssigned) {
                        isUnassigned = true;
                      }

                      // Gather Called For values
                      const docCalledFor = m["Called For"] || m.calledFor || "";
                      if (docCalledFor && docCalledFor !== "Unknown") {
                        calledFors.add(docCalledFor);
                      }

                      if (m.attenderStates) {
                        Object.keys(m.attenderStates).forEach(attId => {
                          const state = m.attenderStates[attId];
                          if (state) {
                            if (state.attenderName && state.attenderName !== "Unknown") {
                              if (attId === attenderId || state.attenderName === attenderName) {
                                isAssignedToMe = true;
                              } else {
                                attenders.add(state.attenderName);
                                isAssignedToOthers = true;
                              }
                            }
                            const stateCalledFor = state["Called For"] || state.calledFor || "";
                            if (stateCalledFor && stateCalledFor !== "Unknown") {
                              calledFors.add(stateCalledFor);
                            }
                          }
                        });
                      }
                      
                      const topName = m.assignedName || m.attenderName;
                      const topId = m.attenderId;
                      if (topName && topName !== "Unknown") {
                        if (topId === attenderId || topName === attenderName) {
                          isAssignedToMe = true;
                        } else {
                          attenders.add(topName);
                          isAssignedToOthers = true;
                        }
                      }
                    });

                    const attList = Array.from(attenders).filter(Boolean);
                    const cfList = Array.from(calledFors).filter(Boolean);
                    const cfStr = cfList.length > 0 ? ` for ${cfList.join(", ")}` : "";

                    if (isAssignedToOthers && attList.length > 0) {
                      return `Already assigned to ${attList.join(", ")}${cfStr}`;
                    } else if (isAssignedToMe) {
                      return `Already assigned to you${cfStr}`;
                    } else if (isUnassigned) {
                      return `Already present in database (Unassigned)${cfStr}`;
                    } else {
                      return `Already present in database${cfStr}`;
                    }
                  })()}
                </span>
              </p>
            </div>
          )}

          {/* Primary Contact Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                <User size={11} className="text-emerald-500" /> Name
              </label>
              <input
                value={edited.Name || ""}
                onChange={e => handleChange("Name", e.target.value)}
                onBlur={e => handleChange("Name", formatContactName(e.target.value))}
                readOnly={!getEditable("Name")}
                className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                  !getEditable("Name")
                    ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                    : "bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                }`}
                placeholder="Enter Name..."
              />
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center justify-between gap-1 mb-1">
                <span className="flex items-center gap-1">
                  <Phone size={11} className="text-blue-500" /> Phone
                </span>
                {isPhoneDuplicate && (
                  <span className="text-[9px] text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 font-bold flex items-center gap-0.5 animate-pulse">
                    ⚠️ Duplicate Detected
                  </span>
                )}
                {isSearchingCRM && (
                  <span className="text-[9px] text-purple-700 bg-purple-100 border border-purple-300 rounded px-1.5 py-0.5 font-bold flex items-center gap-0.5">
                    <Loader size={9} className="animate-spin" /> Searching CRM...
                  </span>
                )}
              </label>
              <input
                value={edited.Phone || ""}
                onChange={e => handleChange("Phone", e.target.value)}
                readOnly={!getEditable("Phone")}
                className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                  !getEditable("Phone")
                    ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                    : isPhoneDuplicate
                    ? "bg-amber-50 border-amber-400 text-amber-900 placeholder:text-amber-300 focus:ring-amber-500/20 focus:border-amber-500 focus:bg-white"
                    : "bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                }`}
                placeholder="Enter Phone..."
              />
            </div>

            {/* Mobile */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center justify-between gap-1 mb-1">
                <span className="flex items-center gap-1">
                  <Phone size={11} className="text-blue-500" /> Mobile
                </span>
                {isMobileDuplicate && (
                  <span className="text-[9px] text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 font-bold flex items-center gap-0.5 animate-pulse">
                    ⚠️ Duplicate Detected
                  </span>
                )}
                {isSearchingCRM && (
                  <span className="text-[9px] text-purple-700 bg-purple-100 border border-purple-300 rounded px-1.5 py-0.5 font-bold flex items-center gap-0.5">
                    <Loader size={9} className="animate-spin" /> Searching CRM...
                  </span>
                )}
              </label>
              <input
                value={edited.Mobile || ""}
                onChange={e => handleChange("Mobile", e.target.value)}
                readOnly={!getEditable("Mobile")}
                className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                  !getEditable("Mobile")
                    ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                    : isMobileDuplicate
                    ? "bg-amber-50 border-amber-400 text-amber-900 placeholder:text-amber-300 focus:ring-amber-500/20 focus:border-amber-500 focus:bg-white"
                    : "bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                }`}
                placeholder="Enter Mobile..."
              />
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                <Hash size={11} className="text-purple-500" /> Email
              </label>
              <input
                value={edited.Email || ""}
                onChange={e => handleChange("Email", e.target.value)}
                readOnly={!getEditable("Email")}
                className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                  !getEditable("Email")
                    ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                    : "bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                }`}
                placeholder="Enter Email..."
              />
            </div>

            {/* City */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                <MapPin size={11} className="text-red-500" /> City
              </label>
              <input
                value={edited.City || ""}
                onChange={e => handleChange("City", e.target.value)}
                readOnly={!getEditable("City")}
                className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                  !getEditable("City")
                    ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                    : "bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                }`}
                placeholder="Enter City..."
              />
            </div>

            {/* State */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                <MapPin size={11} className="text-red-500" /> State
              </label>
              <input
                value={edited.State || ""}
                onChange={e => handleChange("State", e.target.value)}
                readOnly={!getEditable("State")}
                className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                  !getEditable("State")
                    ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                    : "bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                }`}
                placeholder="Enter State..."
              />
            </div>

            {/* Khoji */}
            <div className="space-y-1 col-span-1 md:col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                <User size={11} className="text-emerald-500" /> Khoji
              </label>
              <div className="flex gap-2 py-1 items-center min-h-[38px]">
                {(() => {
                  const isYes = isKhojiAffirmative(edited.Khoji);
                  const isNo = isKhojiNegative(edited.Khoji);
                  const editable = getEditable("Khoji");
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => handleChange("Khoji", "Yes")}
                        disabled={!editable}
                        className={`px-6 py-2 rounded-xl text-xs font-bold border transition ${
                          isYes
                            ? "bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20"
                            : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                        } ${!editable ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChange("Khoji", "No")}
                        disabled={!editable}
                        className={`px-6 py-2 rounded-xl text-xs font-bold border transition ${
                          isNo
                            ? "bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20"
                            : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                        } ${!editable ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        No
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1 col-span-1 md:col-span-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                <Tag size={11} className="text-indigo-500" /> Tags
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 border border-gray-150 rounded-xl min-h-[38px] items-center">
                {(() => {
                  const tagsVal = edited.Tags || "";
                  const tagsArr = tagsVal.split(",").map(t => t.trim()).filter(Boolean);
                  if (tagsArr.length === 0) {
                    return <span className="text-xs text-gray-400 px-2 font-medium">No tags mapped</span>;
                  }
                  return tagsArr.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm"
                    >
                      {tag}
                    </span>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Call Type and Options */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              Call Type
            </label>
            <div className="flex flex-wrap gap-2">
              {CALL_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleCallTypeChange(opt)}
                  className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${
                    edited.callType === opt
                      ? "bg-slate-800 text-white border-slate-800 shadow-md scale-105"
                      : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {opt === "outgoing f" ? "Outgoing (F)" : opt === "incoming f" ? "Incoming (F)" : opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Fields section */}
          {basicFields.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Plus size={13} className="text-indigo-500" /> Custom Fields
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {basicFields.map(field => {
                  const editable = getEditable(field);
                  return (
                    <div
                      key={field}
                      className={`space-y-1 ${
                        field === "Tags"
                          ? "col-span-2 md:col-span-4"
                          : [
                              "What do you want to get out of this call",
                              "How Did You Hear About Us?",
                              "What is stopping you from hitting results...",
                              "Tentative Date of the Mini Shivir you attended",
                              "Which Mini Shivir did you attend?",
                              "Your Health issues",
                              "What is your Tejstan/Center name"
                            ].includes(field)
                          ? "col-span-2 md:col-span-4"
                          : [
                              "Profession", "Source of Information", "When You want to attend the event:", 
                              "Shivir/event category", "Guest Designation", "Platform Name:"
                            ].includes(field) || field.length > 15
                          ? "col-span-2 md:col-span-2"
                          : "col-span-1 md:col-span-1"
                      }`}
                    >
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                        {iconFor(field)} {field}
                      </label>
                      {field.toLowerCase().includes("asmani") || field.toLowerCase().includes("aasmani") || field.toLowerCase().includes("आसमानी") || field.toLowerCase().includes("shivir done") || (field.toLowerCase().includes("khoji") && !field.toLowerCase().includes("id")) ? (
                        <div className="flex gap-2 py-1 items-center min-h-[38px]">
                          {(() => {
                             const isYes = isKhojiAffirmative(edited[field]);
                             const isNo = isKhojiNegative(edited[field]);
                             return (
                               <>
                                 <button
                                   type="button"
                                   onClick={() => handleChange(field, "Yes")}
                                   disabled={!editable}
                                   className={`px-4 py-1.5 rounded-full text-xs font-bold border transition ${
                                     isYes
                                       ? "bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20"
                                       : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                   } ${!editable ? "opacity-60 cursor-not-allowed" : ""}`}
                                 >
                                   Yes
                                 </button>
                                 <button
                                   type="button"
                                   onClick={() => handleChange(field, "No")}
                                   disabled={!editable}
                                   className={`px-4 py-1.5 rounded-full text-xs font-bold border transition ${
                                     isNo
                                       ? "bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20"
                                       : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                   } ${!editable ? "opacity-60 cursor-not-allowed" : ""}`}
                                 >
                                   No
                                 </button>
                               </>
                             );
                          })()}
                        </div>
                      ) : (
                        <input
                          value={edited[field] || ""}
                          onChange={e => handleChange(field, e.target.value)}
                          readOnly={!editable}
                          className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                            !editable
                              ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                              : "bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                          }`}
                          placeholder={`Enter ${field}...`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Custom Field button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddField}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 rounded-xl text-xs font-black transition-all border border-indigo-100/80 shadow-sm hover:shadow-md cursor-pointer"
            >
              <Plus size={14} className="stroke-[3]" /> Add Custom Field
            </button>
          </div>

          {/* Lead form question responses – full-width textareas */}
          {questionFields.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1.5"><MessageSquare size={11} /> Lead Form Responses</p>
              {questionFields.map(field => (
                <div key={field} className="bg-purple-50/40 border border-purple-100 rounded-xl p-3 space-y-1.5">
                  <label className="text-[10px] font-semibold text-purple-700 leading-snug block">{labelFor(field)}</label>
                  <textarea
                    value={edited[field] || ""}
                    readOnly={true}
                    ref={el => {
                      if (el) {
                        setTimeout(() => {
                          el.style.height = 'inherit';
                          el.style.height = `${el.scrollHeight}px`;
                        }, 0);
                      }
                    }}
                    rows={1}
                    className="w-full bg-gray-100/60 border border-purple-100/80 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed resize-none overflow-hidden focus:outline-none transition leading-relaxed placeholder:text-gray-300"
                    placeholder="No response..."
                  />
                </div>
              ))}
            </div>
          )}

          {/* Campaign & Ads metadata – compact 3-col grid, always visible */}
          {campaignFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-1.5"><Tag size={10} /> Campaign / Ads Data</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-gray-50/50 border border-gray-100 rounded-xl">
                {campaignFields.map(field => (
                  <div key={field} className="space-y-1">
                    <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest block">{labelFor(field)}</label>
                    <input
                      value={edited[field] || ""}
                      readOnly={true}
                      className="w-full px-2 py-1.5 bg-gray-100/60 border border-gray-150 rounded-lg text-xs font-mono text-gray-400 cursor-not-allowed focus:outline-none transition"
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dropdown selectors for Source, Called For, Program Mapping */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Searchable Dropdown: Source */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Tag size={13} className="text-amber-500" /> Source
              </label>
              <SearchableDropdown
                options={SOURCE_OPTIONS}
                selected={String(edited[sourceField] || "")}
                onChange={val => handleChange(sourceField, val)}
                placeholder="Search & select source..."
                colorClass="amber"
                disabled={!getEditable(sourceField)}
              />
              {getOtherValuesForField(sourceField).map((item, idx) => (
                <div key={idx} className="text-[10px] text-amber-600 font-bold mt-1 flex items-center gap-1">
                  <span className="opacity-70">👤 {item.name}:</span>
                  <span className="bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-medium">{item.val}</span>
                </div>
              ))}
            </div>

            {/* Searchable Dropdown: Called For */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Phone size={13} className="text-blue-500" /> Called For <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>
              <SearchableDropdown
                options={CALLED_FOR_OPTIONS}
                selected={String(edited[calledForField] || "")}
                onChange={val => handleChange(calledForField, val)}
                placeholder="Search & select multiple..."
                isMulti={true}
                colorClass="blue"
                disabled={!getEditable(calledForField)}
              />
              {getOtherValuesForField(calledForField).map((item, idx) => (
                <div key={idx} className="text-[10px] text-blue-600 font-bold mt-1 flex items-center gap-1">
                  <span className="opacity-70">👤 {item.name}:</span>
                  <span className="bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-medium">
                    {Array.isArray(item.val) ? item.val.join(", ") : String(item.val)}
                  </span>
                </div>
              ))}
            </div>

            {/* Program Mapping */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Tag size={13} className="text-indigo-500" /> Program / Tag Mapping
              </label>
              <SearchableDropdown
                options={["— Untagged —", ...localPrograms.map(p => p.name)]}
                selected={edited.programName || "— Untagged —"}
                onChange={val => {
                  if (!val || val === "— Untagged —") {
                    handleChange("programId", "");
                    handleChange("programName", "");
                    handleChange("Sub Program", "");
                    handleChange("subProgram", "");
                  } else {
                    const prog = localPrograms.find(p => p.name === val);
                    if (prog) {
                      handleChange("programId", prog.id);
                      handleChange("programName", prog.name);
                      handleChange("Sub Program", prog.name);
                      handleChange("subProgram", prog.name);
                      
                      // Sync to Tags field for display
                      const existingTagsStr = edited.Tags || "";
                      const existingTags = existingTagsStr.split(",").map(x => x.trim()).filter(Boolean);
                      if (!existingTags.includes(prog.name)) {
                        existingTags.push(prog.name);
                      }
                      handleChange("Tags", existingTags.join(", "));
                    }
                  }
                }}
                placeholder="Search & select program..."
                allowCreate={true}
                onCreate={handleCreateProgramTag}
                colorClass="indigo"
              />
              {getOtherValuesForField("programName").map((item, idx) => (
                <div key={idx} className="text-[10px] text-indigo-600 font-bold mt-1 flex items-center gap-1">
                  <span className="opacity-70">👤 {item.name}:</span>
                  <span className="bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 font-medium">{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Abhivyakti Quick Action & Call Status */}
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <CheckCircle2 size={13} className="text-indigo-500" /> General Result Status <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>
              <SearchableDropdown
                options={STATUS_OPTIONS}
                selected={edited.status || ""}
                onChange={val => {
                  if (val === "Reg.Done") {
                    const calledForVal = edited[calledForField] || "";
                    const selectedArr = calledForVal.split(",").map(x => x.trim()).filter(Boolean);
                    if (selectedArr.length !== 1 && CALLED_FOR_OPTIONS.length > 1) {
                      setPromptSelection("");
                      setPendingSave(false);
                      setShowCalledForPrompt(true);
                      return;
                    }
                  }
                  setEdited(prev => ({
                    ...prev,
                    status: val,
                    // Auto-default queryStatus to Pending when Query is selected
                    queryStatus: val === "Query" ? (prev.queryStatus || "Pending") : prev.queryStatus,
                  }));
                }}
                placeholder="Search & select status..."
                colorClass="indigo"
              />
              {getOtherValuesForField("status").map((item, idx) => (
                <div key={idx} className="text-[10px] text-indigo-600 font-bold mt-1 flex items-center gap-1">
                  <span className="opacity-70">👤 {item.name}:</span>
                  <span className="bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 font-medium">{item.val}</span>
                </div>
              ))}

              {/* Query Sub-status Toggle */}
              {edited.status === "Query" && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Query:</span>
                  <div className="flex gap-1.5">
                    {["Pending", "Solved"].map(qs => (
                      <button
                        key={qs}
                        type="button"
                        onClick={() => handleChange("queryStatus", qs)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${
                          (edited.queryStatus || "Pending") === qs
                            ? qs === "Pending"
                              ? "bg-amber-500 text-white border-amber-500 shadow shadow-amber-500/20 scale-105"
                              : "bg-emerald-500 text-white border-emerald-500 shadow shadow-emerald-500/20 scale-105"
                            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {qs === "Pending" ? "⏳ Pending" : "✅ Solved"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Objection Tracker (Conditional) */}
            {(edited.status === "Not interested" || edited.status === "Not possible") && (
              <div className="space-y-3 p-4 bg-red-50 border border-red-100 rounded-2xl animate-slide-up">
                <label className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                  <AlertCircle size={13} /> Why are they {edited.status.toLowerCase()}?
                </label>
                <div className="flex flex-wrap gap-2">
                  {OBJECTION_REASONS.map(reason => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => handleChange("objectionReason", edited.objectionReason === reason ? "" : reason)}
                      className={`px-3 py-2 rounded-xl text-[11px] font-black border transition-all ${edited.objectionReason === reason
                          ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20 scale-105"
                          : "bg-white text-red-600 border-red-200 hover:bg-red-100"
                        }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

            {/* Note + Callback */}
            <div className="space-y-6">

              {/* Call Notes Timeline */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare size={13} className="text-indigo-500" /> Call Notes
                  {mergedHistory && mergedHistory.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-black">{mergedHistory.length} past</span>
                  )}
                </label>

                {/* Past history entries */}
                {mergedHistory && mergedHistory.length > 0 && (
                  <div className="space-y-2 pr-1 border border-gray-100 rounded-2xl p-3 bg-gray-50/50">
                    {[...mergedHistory].reverse().map((h, revIdx) => {
                      const origIdx = h.originalIndex;
                      return (
                        <div key={revIdx} className="flex gap-2.5">
                          <div className="shrink-0 flex flex-col items-center pt-2">
                            <div className={`w-2 h-2 rounded-full ${h.isCurrentDoc ? "bg-indigo-300" : "bg-amber-400 animate-pulse"} shrink-0`} />
                            {revIdx < mergedHistory.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                          </div>
                          <div className="flex-1 bg-white rounded-xl p-3 border border-gray-100 shadow-sm mb-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide">
                                📅 {(() => {
                                  const d = h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : (h.timestamp.seconds ? new Date(h.timestamp.seconds * 1000) : new Date(h.timestamp))) : null;
                                  return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Unknown Date";
                                })()}
                              </span>
                              {h.status && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${h.status === "Interested" ? "bg-blue-100 text-blue-700" :
                                  h.status === "Reg.Done" ? "bg-emerald-100 text-emerald-700" :
                                    "bg-gray-100 text-gray-600"
                                  }`}>{h.status}</span>
                              )}
                              {!h.isCurrentDoc && (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-bold border border-amber-200 uppercase tracking-wider">
                                  {h.sourceProgram}
                                </span>
                              )}
                              <span className="text-[9px] text-gray-300 font-bold ml-auto truncate max-w-[80px]">{h.attenderName}</span>
                            </div>
                            <textarea
                              value={h.remark || ""}
                              readOnly={!h.isCurrentDoc || origIdx === -1}
                              onChange={e => {
                                if (!h.isCurrentDoc || origIdx === -1) return;
                                const updatedHistory = [...(edited.history || [])];
                                updatedHistory[origIdx] = { ...updatedHistory[origIdx], remark: e.target.value };
                                handleChange("history", updatedHistory);
                                e.target.style.height = 'inherit';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                              }}
                              onFocus={e => {
                                e.target.style.height = 'inherit';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                              }}
                              ref={el => {
                                if (el) {
                                  setTimeout(() => {
                                    el.style.height = 'inherit';
                                    el.style.height = `${el.scrollHeight}px`;
                                  }, 0);
                                }
                              }}
                              rows={1}
                              className={`w-full bg-transparent text-sm text-gray-700 resize-none overflow-hidden focus:outline-none rounded-lg px-1 py-0.5 transition leading-relaxed placeholder:text-gray-300 ${
                                h.isCurrentDoc && origIdx !== -1 ? "focus:bg-slate-50 focus:ring-2 focus:ring-indigo-100" : "text-gray-500 italic"
                              }`}
                              placeholder="No note for this call..."
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* New note for current call */}
                <div className="relative">
                  <textarea
                    value={edited.remark || ""}
                    onChange={e => {
                      handleChange("remark", e.target.value);
                      e.target.style.height = 'inherit';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    onFocus={e => {
                      e.target.style.height = 'inherit';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    ref={el => {
                      if (el) {
                        setTimeout(() => {
                          el.style.height = 'inherit';
                          el.style.height = `${el.scrollHeight}px`;
                        }, 0);
                      }
                    }}
                    rows={2}
                    className="w-full px-4 py-3 bg-white border-2 border-indigo-200 rounded-2xl text-sm font-medium resize-none overflow-hidden focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition leading-relaxed"
                    placeholder="✏️ Add note for today's call..."
                  />
                  <span className="absolute bottom-3 right-3 text-[9px] text-indigo-300 font-black uppercase tracking-wider pointer-events-none">New Note</span>
                </div>
              </div>

              {/* Follow-up / Callback */}
              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${edited.callbackDate ? "text-amber-500" : "text-slate-400"}`}>
                  <CalendarDays size={13} /> {edited.callbackDate ? "Follow-up Scheduled" : "Schedule Follow-up"}
                </label>
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={getCallbackDateStr()}
                    onChange={e => {
                      handleChange("callbackDate", e.target.value);
                      if (e.target.value && !edited.callbackStatus) handleChange("callbackStatus", "pending");
                    }}
                    className={`flex-1 px-4 py-3 border rounded-2xl text-sm font-bold focus:outline-none transition ${edited.callbackDate ? "bg-amber-50 border-amber-200 text-amber-700 ring-4 ring-amber-500/10" : "bg-gray-50 border-gray-100 text-gray-700"}`}
                  />
                  {edited.callbackDate && (
                    <button onClick={() => { handleChange("callbackDate", null); handleChange("callbackStatus", null); }} className="px-4 py-2 bg-red-50 text-red-500 font-bold rounded-xl text-xs hover:bg-red-100 transition">Remove</button>
                  )}
                </div>

                {/* Follow-up status selector */}
                {edited.callbackDate && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    {[
                      { value: "pending", label: "⏳ Pending", activeClass: "bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-400/20", inactiveClass: "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100" },
                      { value: "done", label: "✅ Done", activeClass: "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-400/20", inactiveClass: "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100" },
                      { value: "rescheduled", label: "🔄 Rescheduled", activeClass: "bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-400/20", inactiveClass: "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100" },
                      { value: "cancelled", label: "❌ Cancelled", activeClass: "bg-red-500 text-white border-red-500 shadow-lg shadow-red-400/20", inactiveClass: "bg-red-50 text-red-500 border-red-200 hover:bg-red-100" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => handleChange("callbackStatus", opt.value)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${(edited.callbackStatus || "pending") === opt.value
                          ? opt.activeClass + " scale-105"
                          : opt.inactiveClass + " scale-95 hover:scale-100"
                          }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fast Registration / Add to Abhivyakti Report */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm uppercase tracking-wider">
                  <Flame size={16} /> Fast Registration
                </div>
                {edited.status === "Reg.Done" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={true}
                      className="flex-1 py-3 rounded-xl font-bold bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={18} />
                      Added to Abhivyakti
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUndoStatusPrompt(true)}
                      className="px-4 py-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 active:scale-95 hover:scale-105"
                    >
                      Undo
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const calledForVal = edited[calledForField] || "";
                      const selectedArr = calledForVal.split(",").map(x => x.trim()).filter(Boolean);
                      if (selectedArr.length !== 1 && CALLED_FOR_OPTIONS.length > 1) {
                        setPromptSelection("");
                        setPendingSave(false);
                        setShowCalledForPrompt(true);
                      } else {
                        handleChange("status", "Reg.Done");
                      }
                    }}
                    className="w-full py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 bg-white text-emerald-700 border-2 border-emerald-500 hover:bg-emerald-50 active:scale-95"
                  >
                    <CheckCircle2 size={18} />
                    Add to Abhivyakti Report
                  </button>
                )}
              </div>
          </div>
        </div>


        <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between shadow-inner">
          <button onClick={handleDelete} className="flex items-center gap-2 text-xs font-bold text-red-400 hover:text-red-600 transition">
            <Trash2 size={14} /> Remove Entry
          </button>
          <div className="flex items-center gap-4 text-xs font-bold text-gray-400 tracking-tighter uppercase">
            {saving ? "Saving..." : "All exits auto-save"}
          </div>
          <button disabled={saving} onClick={handleSaveAndClose} className="px-8 py-3 bg-indigo-600 border border-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition active:scale-95 leading-none flex items-center justify-center gap-2 disabled:opacity-50">
            {saving && <Loader size={14} className="animate-spin" />} Save & Close
          </button>
        </div>
      </div>

      {/* Called For compulsory prompt */}
      {showCalledForPrompt && (
        <div 
          onClick={e => e.stopPropagation()} 
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-indigo-150 animate-slide-up flex flex-col max-h-[85vh]">
            <div className="flex items-center gap-3 mb-4 text-indigo-900">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <Phone size={20} />
              </div>
              <div>
                <h4 className="font-black text-lg leading-none">Select Registered Program</h4>
                <p className="text-[11px] text-gray-500 mt-1 font-semibold">Select exactly which program this lead has registered for.</p>
              </div>
            </div>

            {/* Options List */}
            <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1 min-h-[200px]">
              {getPromptOptions().map(opt => {
                const isSel = promptSelection === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setPromptSelection(opt);
                    }}
                    className={`w-full px-4 py-3 rounded-2xl text-xs font-bold border transition-all text-left flex items-center justify-between ${
                      isSel
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20 scale-[1.01]"
                        : "bg-gray-50 border-gray-150 text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>{opt}</span>
                    {isSel && <CheckCircle2 size={16} />}
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowCalledForPrompt(false);
                  setPendingSave(false);
                }}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600 font-bold rounded-2xl text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!promptSelection) {
                    toast.error("Please select exactly 1 option.");
                    return;
                  }
                  const valStr = promptSelection;
                  handleChange(calledForField, valStr);
                  handleChange("status", "Reg.Done");
                  setShowCalledForPrompt(false);
                  
                  if (pendingSave) {
                    setPendingSave(false);
                    handleSaveAndClose({ [calledForField]: valStr, status: "Reg.Done" });
                  } else {
                    toast.success("Called For and Registration status updated!");
                  }
                }}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black rounded-2xl text-xs transition shadow-lg shadow-indigo-500/25"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Status Selection Prompt */}
      {showUndoStatusPrompt && (
        <div 
          onClick={e => e.stopPropagation()} 
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-rose-150 animate-slide-up flex flex-col max-h-[85vh]">
            <div className="flex items-center gap-3 mb-4 text-rose-900">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
                <X size={20} />
              </div>
              <div>
                <h4 className="font-black text-lg leading-none">Undo Registration</h4>
                <p className="text-[11px] text-gray-500 mt-1 font-semibold">Please select the new status for this lead.</p>
              </div>
            </div>

            {/* Status Options List */}
            <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1 min-h-[250px]">
              {STATUS_OPTIONS.filter(opt => opt !== "Reg.Done").map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setEdited(prev => ({
                      ...prev,
                      status: opt,
                      [calledForField]: ""
                    }));
                    setShowUndoStatusPrompt(false);
                    toast.success(`Registration undone. Status set to "${opt}"`);
                  }}
                  className="w-full px-4 py-3 rounded-2xl text-xs font-bold border border-gray-150 bg-gray-50 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition text-left mb-1.5"
                >
                  {opt}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowUndoStatusPrompt(false)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600 font-bold rounded-2xl text-xs transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
