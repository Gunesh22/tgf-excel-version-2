import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Phone, Plus, X, Save, Tag, User, MapPin, MessageSquare,
  Hash, Clock, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame,
  ChevronDown, Check, Search
} from "lucide-react";
import {
  addIncomingCallLog, updateCallLog, createProgram
} from "../../../../lib/db";
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
  isKhojiField
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

  const ringClass = colorClass === "amber" ? "focus:ring-amber-500/10 focus:border-amber-500" :
                    colorClass === "blue" ? "focus:ring-blue-500/10 focus:border-blue-500" :
                    "focus:ring-indigo-500/10 focus:border-indigo-500";

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold text-left focus:outline-none focus:ring-4 ${ringClass} flex justify-between items-center transition ${
          disabled
            ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed"
            : "bg-gray-50 border-gray-100 text-gray-800 hover:bg-gray-100/50"
        }`}
      >
        <span className="truncate">{getButtonText()}</span>
        <ChevronDown size={14} className="text-gray-400 shrink-0 ml-2" />
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
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSelect(opt)}
                      className={`w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-gray-50 flex items-center justify-between transition ${
                        active ? "bg-indigo-50/50 text-indigo-700 font-bold" : "text-gray-700"
                      }`}
                    >
                      <span className="truncate">{opt}</span>
                      {active && (
                        <Check size={14} className="text-indigo-600 shrink-0 ml-2" />
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
  const [dupPopoverOpen, setDupPopoverOpen] = useState(false);
  const handleDismissRef = useRef(null);
  const [addedFields, setAddedFields] = useState([]);
  const [localPrograms, setLocalPrograms] = useState(programs);

  useEffect(() => {
    setLocalPrograms(programs);
  }, [programs]);

  const getOtherValuesForField = (fieldKey) => {
    const list = [];

    // Helper: find a value for fieldKey in a state/document object,
    // checking both the exact key and common case variants.
    const extractVal = (obj, key) => {
      if (!obj) return undefined;
      if (key === "programName") return obj.programName || obj.programId;
      // Direct match
      if (obj[key] !== undefined) return obj[key];
      // Case-insensitive fallback (handles Source vs source etc.)
      const lower = key.toLowerCase();
      const found = Object.keys(obj).find(k => k.toLowerCase() === lower);
      return found ? obj[found] : undefined;
    };
    
    // 1. Get values from other attenders' attenderStates (attender-specific fields)
    if (row.attenderStates) {
      Object.keys(row.attenderStates).forEach(otherId => {
        if (otherId === attenderId) return;
        const state = row.attenderStates[otherId];
        if (state) {
          const name = state.attenderName || "Other Attender";
          // For shared top-level fields (Source, Called For), attenderStates won't have them.
          // We fall back to reading them from the top-level row document below.
          const val = extractVal(state, fieldKey);
          if (val !== undefined) {
            list.push({ name, val });
          }
        }
      });
    }

    // 2. For shared top-level fields (e.g. Source, Called For), if no per-attender value
    //    was found above, show the document-level value attributed to the last editor.
    //    This keeps the badge visible and stable regardless of who saved last.
    if (list.length === 0) {
      const topVal = extractVal(row._rawData || row, fieldKey);
      // Only show if it differs from the current attender's own value in edited
      const myVal = String(edited[fieldKey] || "").trim();
      const topValStr = String(topVal || "").trim();
      if (topValStr && topValStr !== myVal) {
        const editorName = row.lastEditedBy || row.assignedName || row.attenderName || "";
        if (editorName && editorName !== attenderName) {
          list.push({ name: editorName, val: topVal });
        }
      }
    }

    // 3. Get values from legacy duplicate docs (if any)
    if (globalDup && Array.isArray(globalDup.matches)) {
      const otherEdits = globalDup.matches.filter(m => m.id !== row.id);
      otherEdits.forEach(m => {
        const name = m.assignedName || m.attenderName || "Unknown";
        const val = extractVal(m, fieldKey);
        if (val !== undefined) {
          if (!list.some(item => item.name === name && item.val === val)) {
            list.push({ name, val });
          }
        }
      });
    }

    return list.filter(item => {
      if (!item.val) return false;
      if (Array.isArray(item.val) && item.val.length === 0) return false;
      return String(item.val).trim() !== "";
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
      globalDup.matches.forEach(m => {
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
    const internalKeys = [
      "id", "contactId", "programId", "programName", "attenderId", "attenderName",
      "callType", "status", "remark", "callbackDate", "callbackStatus", "isCallbackDue",
      "isHotLead", "createdAt", "updatedAt", "lastCalledAt", "firstCalledAt", "history",
      "_callbackDue", "_deleted", "_isNew", "registeredAt", "conversionSource", "convertedBy",
      "GHL_ID", "Sub Program", "subProgram", "objectionReason",
      // Firestore-managed fields — never show as editable form fields
      "lastEditedBy", "lastEditedAt", "attenderStates", "assignedTo",
      "assignedName", "assignedAt", "isAssigned", "normalizedPhone", "normalizedMobile", "registeredYearMonth"
    ];

    const contactKeys = Object.keys(edited).filter(k => {
      if (internalKeys.includes(k)) return false;
      if (k.startsWith("_")) return false;
      
      // Skip standard fields since they are explicitly rendered at the top of the form
      if (standardOrder.includes(k)) return false;

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
    
    dupTimerRef.current = setTimeout(() => {
      import("../../../../lib/db").then(({ checkGlobalDuplicate }) => {
        // When this modal is for a NEW incoming entry, do NOT exclude any contact id from
        // the duplicate lookup. Excluding `edited.contactId` (which we may set after
        // auto-mapping a duplicate) hides the duplicate immediately. Only exclude when
        // editing an existing saved contact.
        const excludeId = row._isNew ? null : (edited.contactId || row.id);
        
        const promises = [];
        if (hasPhone) promises.push(checkGlobalDuplicate(phoneVal, excludeId));
        if (hasMobile) promises.push(checkGlobalDuplicate(mobileVal, excludeId));
        
        Promise.all(promises).then(([res1, res2]) => {
          // Merge results
          const r1 = hasPhone ? res1 : null;
          const r2 = hasMobile ? (hasPhone ? res2 : res1) : null;
          
          if (!r1 && !r2) {
            setGlobalDup(null);
            return;
          }
          
          // Combine matches and tags
          const allMatchesMap = new Map();
          const allTagsSet = new Set();
          
          [r1, r2].forEach(res => {
            if (res && Array.isArray(res.matches)) {
              res.matches.forEach(m => {
                allMatchesMap.set(m.id, m);
              });
            }
            if (res && Array.isArray(res.allTags)) {
              res.allTags.forEach(t => allTagsSet.add(t));
            }
          });
          
          const combinedMatches = Array.from(allMatchesMap.values());
          if (combinedMatches.length === 0) {
            setGlobalDup(null);
            return;
          }
          
          const combinedRes = {
            count: combinedMatches.length,
            allTags: Array.from(allTagsSet).sort(),
            matches: combinedMatches,
            first: combinedMatches[0],
            programName: combinedMatches[0]?.programName
          };
          
          setGlobalDup(combinedRes);

          // If we found a duplicate contact and this is a new incoming entry, auto-populate the fields!
          if (combinedRes.first && row._isNew) {
            const dup = combinedRes.first;
            setEdited(prev => {
              const updated = { ...prev };
              const fieldsToMap = ["Name", "Email", "City", "State", "Khoji"];
              
              fieldsToMap.forEach(f => {
                const dupVal = getFieldWithFallback(dup, f);
                if (!String(updated[f] || "").trim() && dupVal) {
                  updated[f] = dupVal;
                }
              });

              // Map Tags specifically
              const dupTagsVal = getFieldWithFallback(dup, "tags");
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

              return updated;
            });
          }
        });
      });
    }, 1000);
    return () => { if (dupTimerRef.current) clearTimeout(dupTimerRef.current); };
  }, [phoneVal, mobileVal, row._isNew, row.id, edited.contactId]);

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

    // 2. Iterate over row.attenderStates to collect history of other attenders
    if (row.attenderStates) {
      Object.keys(row.attenderStates).forEach(otherAttenderId => {
        if (otherAttenderId === attenderId) return; // already added above via edited.history / row.history
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
                  isCurrentDoc: false, // can't edit inline
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
                isCurrentDoc: false,
                sourceProgram: progName
              });
            }
          }
        }
      });
    }

    // 3. Fallback: also include duplicate contacts' history if globalDup has matches
    if (globalDup && Array.isArray(globalDup.matches)) {
      globalDup.matches.forEach(m => {
        if (m.id === row.id) return;
        const progName = m.programName || "Duplicate Lead";
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

  const isManualEntry = edited.programId === "incoming-calls" || edited.programId === "outgoing-calls" || edited.programId === "Incoming Calls" || edited.programId === "Outgoing Calls";
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

  const handleSaveAndClose = async () => {
    if (saving) return; // Prevent double save

    // Objection Tracker Validation
    if ((edited.status === "Not interested" || edited.status === "Not possible") && !edited.objectionReason) {
      toast.error(`Please select a reason for "${edited.status}" before saving.`, { duration: 4000, position: 'top-center' });
      return;
    }

    setSaving(true);

    if (onSave) onSave(edited, true);

    try {
      const { id, _callbackDue, ...rest } = edited;
      const updates = { ...rest };
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
      if (!row.firstCalledAt && !edited.firstCalledAt) {
        updates.firstCalledAt = new Date().toISOString();
      }

      // Maintain a timeline of interactions.
      // Only push a new history entry if:
      //   a) the status actually changed from what was previously saved, OR
      //   b) the attender typed a new remark this session (non-empty)
      const statusChanged = row.status !== updates.status;
      const hasNewRemark = String(updates.remark || "").trim().length > 0;
      
      let baseHistory = Array.isArray(edited.history) ? edited.history : (Array.isArray(row.history) ? row.history : []);
      if (statusChanged || hasNewRemark) {
        const safeName = attenderName || "Unknown";
        const newHist = {
          status: updates.status || "",
          remark: updates.remark || "",
          attenderName: safeName,
          timestamp: new Date().toISOString()
        };
        updates.history = [...baseHistory, newHist];
      } else if (Array.isArray(edited.history)) {
        // Even if no new note/status change, we want to persist any edits to past notes!
        updates.history = baseHistory;
      }

      updates.lastEditedBy = attenderName || "Unknown";

      console.log("Attempting to save updates: ", updates);

      // If this is a NEW incoming entry, create it in Firebase
      if (row._isNew) {
        delete updates._isNew;
        await addIncomingCallLog(
          row.attenderId, row.attenderName, updates, edited.programId, edited.programName
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
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                <Phone size={11} className="text-blue-500" /> Phone
              </label>
              <input
                value={edited.Phone || ""}
                onChange={e => handleChange("Phone", e.target.value)}
                readOnly={!getEditable("Phone")}
                className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                  !getEditable("Phone")
                    ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                    : "bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                }`}
                placeholder="Enter Phone..."
              />
            </div>

            {/* Mobile */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                <Phone size={11} className="text-blue-500" /> Mobile
              </label>
              <input
                value={edited.Mobile || ""}
                onChange={e => handleChange("Mobile", e.target.value)}
                readOnly={!getEditable("Mobile")}
                className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                  !getEditable("Mobile")
                    ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
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
                <Phone size={13} className="text-blue-500" /> Called For
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
                <CheckCircle2 size={13} className="text-indigo-500" /> General Result Status
              </label>
              <SearchableDropdown
                options={STATUS_OPTIONS.filter(opt => opt !== "Reg.Done")}
                selected={edited.status || ""}
                onChange={val => {
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
                                📅 {new Date(h.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
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
                <button
                  type="button"
                  onClick={() => handleChange("status", "Reg.Done")}
                  className={`w-full py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 ${edited.status === "Reg.Done" ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]" : "bg-white text-emerald-700 border-2 border-emerald-500 hover:bg-emerald-50"}`}
                >
                  <CheckCircle2 size={18} />
                  {edited.status === "Reg.Done" ? "Added to Abhivyakti Report" : "Add to Abhivyakti Report"}
                </button>
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
    </div>
  );
};
