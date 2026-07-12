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

function parseTimestamp(t) {
  if (!t) return null;
  if (t instanceof Date) return t;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t === "object" && t.seconds !== undefined) {
    return new Date(t.seconds * 1000 + Math.round((t.nanoseconds || 0) / 1000000));
  }
  return new Date(t);
}

import SearchableDropdown from "./edit-modal/SearchableDropdown";
import DuplicateBanner from "./edit-modal/DuplicateBanner";
import CallEntryTab from "./edit-modal/CallEntryTab";
import ProfileDetailsTab from "./edit-modal/ProfileDetailsTab";

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
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [dupPopoverOpen, setDupPopoverOpen] = useState(false);
  const handleDismissRef = useRef(null);
  const [addedFields, setAddedFields] = useState([]);
  const [localPrograms, setLocalPrograms] = useState(programs);
  const [showCalledForPrompt, setShowCalledForPrompt] = useState(false);
  const [promptSelection, setPromptSelection] = useState("");
  const [pendingSave, setPendingSave] = useState(false);
  const [showUndoStatusPrompt, setShowUndoStatusPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState(() => (row._isNew ? "profile" : "call"));

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
    return String(edited.Phone || "").trim();
  }, [edited.Phone]);

  const mobileVal = useMemo(() => {
    return String(edited.Mobile || "").trim();
  }, [edited.Mobile]);

  const initialPhone = useMemo(() => {
    return getFieldWithFallback(row, "Phone");
  }, [row]);

  const initialMobile = useMemo(() => {
    return getFieldWithFallback(row, "Mobile");
  }, [row]);

  const dupTimerRef = useRef(null);
  const activeToastRef = useRef(null);
  const lastSearchedPhoneRef = useRef("");
  const lastSearchedMobileRef = useRef("");

  useEffect(() => {
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);

    const cleanPhone = phoneVal.replace(/\D/g, "");
    const cleanMobile = mobileVal.replace(/\D/g, "");

    const isPhoneEmptyOrInitial = !phoneVal || phoneVal === initialPhone || cleanPhone.length < 10;
    const isMobileEmptyOrInitial = !mobileVal || mobileVal === initialMobile || cleanMobile.length < 10;

    if (isPhoneEmptyOrInitial && isMobileEmptyOrInitial) {
      setGlobalDup(null);
      setIsCheckingDuplicate(false);
      if (activeToastRef.current) {
        toast.dismiss(activeToastRef.current);
        activeToastRef.current = null;
      }
      lastSearchedPhoneRef.current = "";
      lastSearchedMobileRef.current = "";
      return;
    }

    const shouldCheckPhone = phoneVal !== initialPhone && cleanPhone.length >= 10 && phoneVal !== lastSearchedPhoneRef.current;
    const shouldCheckMobile = mobileVal !== initialMobile && cleanMobile.length >= 10 && mobileVal !== lastSearchedMobileRef.current;

    if (!shouldCheckPhone && !shouldCheckMobile) {
      return;
    }

    setIsCheckingDuplicate(true);
    if (!activeToastRef.current) {
      activeToastRef.current = toast.loading(`Checking details for ${[phoneVal, mobileVal].filter(Boolean).join(" / ")}...`);
    }

    dupTimerRef.current = setTimeout(async () => {
      try {
        lastSearchedPhoneRef.current = phoneVal;
        lastSearchedMobileRef.current = mobileVal;

        // For NEW incoming entries, don't exclude any id so all matches show.
        // For existing contacts, exclude self so we only flag TRUE duplicates (different docs).
        const excludeId = row._isNew ? null : (edited.contactId || row.id);

        const combinedValue = [
          phoneVal !== initialPhone && cleanPhone.length >= 10 ? phoneVal : null,
          mobileVal !== initialMobile && cleanMobile.length >= 10 ? mobileVal : null
        ].filter(Boolean).join(", ");

        const results = await checkGlobalDuplicate(combinedValue, excludeId);

        let combinedMatches = [];
        const allTagsSet = new Set();
        if (results) {
          if (Array.isArray(results.matches)) {
            combinedMatches = results.matches;
          }
          if (Array.isArray(results.allTags)) {
            results.allTags.forEach(t => allTagsSet.add(t));
          }
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

          if (activeToastRef.current) {
            toast.success("Duplicate contact found! Details auto-filled.", { id: activeToastRef.current });
            activeToastRef.current = null;
          }

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
              if (activeToastRef.current) {
                toast.loading(`No duplicates. Searching GoHighLevel CRM...`, { id: activeToastRef.current });
              }
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
                  if (activeToastRef.current) {
                    toast.success("Lead found in CRM! Details auto-filled.", { id: activeToastRef.current });
                    activeToastRef.current = null;
                  } else {
                    toast.success("Lead found in CRM! Details auto-filled.");
                  }
                } else {
                  console.log(`[CRM Fetch] No contact found in CRM for phone "${searchVal}"`);
                  if (activeToastRef.current) {
                    toast.dismiss(activeToastRef.current);
                    activeToastRef.current = null;
                  }
                }
              } catch (crmErr) {
                console.error(`[CRM Fetch] Error searching CRM for phone "${searchVal}":`, crmErr);
                if (activeToastRef.current) {
                  toast.error("CRM search failed.", { id: activeToastRef.current });
                  activeToastRef.current = null;
                }
              } finally {
                setIsSearchingCRM(false);
              }
            } else {
              console.log(`[CRM Fetch] Skipping CRM search because search value "${searchVal}" has only ${digitsCount} digits (minimum 10 required).`);
              if (activeToastRef.current) {
                toast.dismiss(activeToastRef.current);
                activeToastRef.current = null;
              }
            }
          } else {
            if (activeToastRef.current) {
              toast.dismiss(activeToastRef.current);
              activeToastRef.current = null;
            }
          }
        }
      } catch (err) {
        console.error("[EditModal] Duplicate check failed:", err);
        setGlobalDup(null);
        if (activeToastRef.current) {
          toast.error("Verification failed.", { id: activeToastRef.current });
          activeToastRef.current = null;
        }
      } finally {
        setIsCheckingDuplicate(false);
      }
    }, 800);

    return () => {
      if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneVal, mobileVal, row._isNew, row.id, edited.contactId, initialPhone, initialMobile]);

  const dupWarningMessage = useMemo(() => {
    if (!globalDup) return "";
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
  }, [globalDup, attenderId, attenderName]);

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
      list.push({
        status: h.status || "",
        remark: h.remark || "",
        attenderName: h.attenderName || "Unknown",
        timestamp: h.timestamp || new Date().toISOString(),
        isCurrentDoc: true,
        originalIndex: idx,
        sourceProgram: row.programName || "This Sheet"
      });
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
              list.push({
                status: h.status || "",
                remark: h.remark || "",
                attenderName: h.attenderName || state.attenderName || "Unknown",
                timestamp: h.timestamp || new Date().toISOString(),
                isCurrentDoc: otherAttenderId === attenderId,
                sourceProgram: progName
              });
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
                  list.push({
                    status: h.status || "",
                    remark: h.remark || "",
                    attenderName: h.attenderName || state.attenderName || "Unknown",
                    timestamp: h.timestamp || new Date().toISOString(),
                    isCurrentDoc: false,
                    sourceProgram: attProgName
                  });
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
            list.push({
              status: h.status || "",
              remark: h.remark || "",
              attenderName: h.attenderName || "Unknown",
              timestamp: h.timestamp || new Date().toISOString(),
              isCurrentDoc: false,
              sourceProgram: progName
            });
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

    const getMs = (val) => {
      if (!val) return 0;
      if (val instanceof Date) return val.getTime();
      if (typeof val === "string") return new Date(val).getTime() || 0;
      if (val.toDate && typeof val.toDate === "function") return val.toDate().getTime() || 0;
      if (typeof val === "object" && val.seconds !== undefined) return val.seconds * 1000;
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      } catch (e) {
        return 0;
      }
    };

    // Sort chronologically ascending
    list.sort((a, b) => {
      const timeA = getMs(a.timestamp);
      const timeB = getMs(b.timestamp);
      return timeA - timeB;
    });

    // Deduplicate by timestamp + remark + status + attenderName
    const seen = new Set();
    const uniqueList = [];
    list.forEach(item => {
      const timeStr = String(getMs(item.timestamp));
      const key = `${timeStr}_${item.remark}_${item.status}_${item.attenderName}`;
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

    // Fix for Flaw 3: Clicking "Save" with No Changes (Ghost Calls)
    const isNew = !!row._isNew;

    // We compute the call-attempt changes first
    const getTimestampOrNull = (val) => {
      if (!val) return null;
      if (val instanceof Date) return val.getTime();
      if (typeof val === "string") return new Date(val).getTime();
      if (val.toDate && typeof val.toDate === "function") return val.toDate().getTime();
      if (typeof val === "object" && val.seconds !== undefined) return val.seconds * 1000;
      try {
        return new Date(val).getTime();
      } catch (e) {
        return null;
      }
    };

    const oldStatus = String(row.status || "").trim();
    const newStatus = String(targetEdited.status || "").trim();
    const statusChanged = oldStatus !== newStatus;

    const newRemarkEntered = String(targetEdited.remark || "").trim() !== "";
    const remarkChanged = newRemarkEntered;

    const oldCallType = String(row.callType || "outgoing").toLowerCase();
    const newCallType = String(targetEdited.callType || "outgoing").toLowerCase();
    const callTypeChanged = oldCallType !== newCallType;

    const oldCallbackTime = getTimestampOrNull(row.callbackDate);
    const newCallbackTime = getTimestampOrNull(targetEdited.callbackDate);
    const callbackDateChanged = oldCallbackTime !== newCallbackTime;

    const oldObjection = String(row.objectionReason || "").trim();
    const newObjection = String(targetEdited.objectionReason || "").trim();
    const objectionReasonChanged = oldObjection !== newObjection;

    const isCallAttemptUpdated = statusChanged || remarkChanged || callTypeChanged || callbackDateChanged || objectionReasonChanged;

    if (!isNew) {
      const cleanForCompare = (val) => {
        if (val === undefined || val === null) return "";
        if (val instanceof Date) return val.toISOString().split("T")[0];
        if (typeof val === "object" && val.seconds !== undefined) {
          return new Date(val.seconds * 1000).toISOString().split("T")[0];
        }
        return String(val).trim();
      };
      
      const hasChanges = Object.keys(targetEdited).some(key => {
        if (["id", "_callbackDue", "_isNew", "attenderStates", "assignedTo", "assignedName", "assignedAt", "isAssigned", "lastEditedBy", "lastEditedAt", "normalizedPhone", "normalizedMobile", "history", "lastCalledAt", "firstCalledAt"].includes(key)) {
          return false;
        }
        if (key === "remark") {
          return String(targetEdited.remark || "").trim() !== "";
        }
        const val1 = cleanForCompare(row[key]);
        const val2 = cleanForCompare(targetEdited[key]);
        return val1 !== val2;
      });

      if (!hasChanges) {
        console.log("No changes detected. Closing modal without saving.");
        toast.success("No changes detected.");
        if (onClose) onClose();
        return;
      }
    }

    if (isNew || isCallAttemptUpdated) {
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

      if (!isNew && !isCallAttemptUpdated) {
        // Strip all call-specific fields to prevent ghost calls or history additions
        delete updates.status;
        delete updates.remark;
        delete updates.callType;
        delete updates.callbackDate;
        delete updates.callbackStatus;
        delete updates.objectionReason;
        delete updates.queryStatus;
        delete updates.lastCalledAt;
        delete updates.firstCalledAt;
        delete updates.history;
      } else {
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

        // Scenario 2: Incoming call & Registration on an Outgoing Campaign
        const isIncomingConvertOnOutgoingProgram = 
          updates.status === "Reg.Done" &&
          String(targetEdited.callType || "outgoing").toLowerCase().startsWith("incoming") &&
          (targetEdited.programId || row.programId) !== "incoming-calls";

        if (isIncomingConvertOnOutgoingProgram) {
          const safeName = attenderName || "Unknown";
          const nowStr = new Date().toISOString();

          // 1. The Incoming Call Log (Query)
          const queryHist = {
            status: "Query",
            remark: updates.remark || "Payment query / incoming confirmation",
            attenderName: safeName,
            timestamp: nowStr,
            calledFor: targetEdited[calledForField] || targetEdited["Called For"] || targetEdited.calledFor || "",
            source: targetEdited[sourceField] || targetEdited.Source || targetEdited.source || targetEdited.Sourse || targetEdited.sourse || "",
            callType: targetEdited.callType || "incoming"
          };

          // 2. The Outgoing Conversion Log (Registration)
          const regHist = {
            status: "Reg.Done",
            remark: "Registered",
            attenderName: safeName,
            timestamp: new Date(new Date(nowStr).getTime() + 1000).toISOString(),
            calledFor: targetEdited[calledForField] || targetEdited["Called For"] || targetEdited.calledFor || "",
            source: targetEdited[sourceField] || targetEdited.Source || targetEdited.source || targetEdited.Sourse || targetEdited.sourse || "",
            callType: "outgoing"
          };

          updates.history = [...baseHistory, queryHist, regHist];
          updates.callType = "outgoing"; // Force outgoing conversion at root level
        } else if (isCallAttemptUpdated) {
          const safeName = attenderName || "Unknown";
          const nowStr = new Date().toISOString();
          const newHist = {
            status: updates.status || "",
            remark: updates.remark || "",
            attenderName: safeName,
            timestamp: nowStr,
            calledFor: targetEdited[calledForField] || targetEdited["Called For"] || targetEdited.calledFor || "",
            source: targetEdited[sourceField] || targetEdited.Source || targetEdited.source || targetEdited.Sourse || targetEdited.sourse || "",
            callType: targetEdited.callType || "outgoing"
          };

          // Fix for Flaw 2: 2-minute session collapsing (merge edits by same attender if within 2 min)
          let collapsed = false;
          if (baseHistory.length > 0) {
            const lastEntryIndex = baseHistory.length - 1;
            const lastEntry = baseHistory[lastEntryIndex];
            
            const isSameAttender = String(lastEntry.attenderName || "").toLowerCase().trim() === safeName.toLowerCase().trim();
            
            if (isSameAttender && lastEntry.timestamp) {
              const lastTime = new Date(lastEntry.timestamp).getTime();
              const currTime = new Date(nowStr).getTime();
              const diffMinutes = (currTime - lastTime) / (1000 * 60);
              
              if (diffMinutes < 2) {
                const mergedEntry = {
                  ...lastEntry,
                  status: newHist.status,
                  remark: newHist.remark || lastEntry.remark,
                  calledFor: newHist.calledFor,
                  source: newHist.source,
                  callType: newHist.callType,
                  timestamp: nowStr
                };
                
                const updatedHistory = [...baseHistory];
                updatedHistory[lastEntryIndex] = mergedEntry;
                updates.history = updatedHistory;
                collapsed = true;
              }
            }
          }

          if (!collapsed) {
            updates.history = [...baseHistory, newHist];
          }
        } else {
          // Persist the corrected/updated baseHistory even if no new call attempt log was added
          updates.history = baseHistory;
        }

        // Ensure updates.remark is wiped/deleted if no new remark was entered and we're not saving a new call attempt
        if (!newRemarkEntered && !isCallAttemptUpdated) {
          delete updates.remark;
        }
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
    const d = parseTimestamp(edited.callbackDate);
    return d && !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : "";
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

  const isIncomingCall = String(edited.callType || "outgoing").toLowerCase().startsWith("incoming");
  
  const callTheme = isIncomingCall 
    ? {
        primary: "emerald",
        tabClass: "border-emerald-500 text-emerald-700 font-extrabold scale-105",
        tabLine: "bg-emerald-500",
        iconClass: "text-emerald-500",
        panelClass: "bg-emerald-50/20 border-emerald-100/50 shadow-emerald-500/5",
        callTypeBtnSelected: "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20 scale-105 font-bold",
        callTypeBtnUnselected: "bg-white text-emerald-600 border-emerald-100 hover:bg-emerald-50/50"
      }
    : {
        primary: "indigo",
        tabClass: "border-indigo-500 text-indigo-700 font-extrabold scale-105",
        tabLine: "bg-indigo-500",
        iconClass: "text-indigo-500",
        panelClass: "bg-indigo-50/20 border-indigo-100/50 shadow-indigo-500/5",
        callTypeBtnSelected: "bg-slate-800 text-white border-slate-800 shadow-md scale-105 font-bold",
        callTypeBtnUnselected: "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-200"
      };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={handleDismiss}>
      <div
        className="bg-white rounded-3xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`px-6 py-4 flex items-center justify-between ${edited._callbackDue ? "bg-red-600 shadow-lg shadow-red-600/20" : isIncomingCall ? "bg-emerald-600 shadow-lg shadow-emerald-600/20" : "bg-indigo-600 shadow-lg shadow-indigo-600/20"}`}>
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

                {(isCheckingDuplicate || isSearchingCRM) && (
                  <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded text-white animate-pulse flex items-center gap-1.5 shrink-0">
                    <Loader size={10} className="animate-spin text-white" />
                    {isCheckingDuplicate ? "CHECKING DUPLICATES..." : "SEARCHING CRM..."}
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
          {/* Tab Switcher */}
          <div className="flex border-b border-gray-150 gap-6 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab("call")}
              className={`pb-3 text-sm font-black tracking-wider uppercase flex items-center gap-2 border-b-2 transition-all relative ${
                activeTab === "call"
                  ? callTheme.tabClass
                  : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200"
              }`}
            >
              <Phone size={14} className={activeTab === "call" ? callTheme.iconClass : "text-gray-400"} />
              Record Call Entry
              {activeTab === "call" && (
                <span className={`absolute bottom-[-2px] left-0 right-0 h-0.5 rounded-full ${callTheme.tabLine} animate-pulse`} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`pb-3 text-sm font-black tracking-wider uppercase flex items-center gap-2 border-b-2 transition-all relative ${
                activeTab === "profile"
                  ? callTheme.tabClass
                  : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200"
              }`}
            >
              <User size={14} className={activeTab === "profile" ? callTheme.iconClass : "text-gray-400"} />
              Edit Profile Details
              {(isCheckingDuplicate || isSearchingCRM) && (
                <Loader size={12} className="animate-spin text-indigo-500 shrink-0" />
              )}
              {globalDup && globalDup.showWarning && (
                <AlertCircle size={14} className="text-amber-500 shrink-0 animate-bounce" title={dupWarningMessage} />
              )}
              {activeTab === "profile" && (
                <span className={`absolute bottom-[-2px] left-0 right-0 h-0.5 rounded-full ${callTheme.tabLine} animate-pulse`} />
              )}
            </button>
          </div>

          {/* Duplicate Banner */}
          <DuplicateBanner
            globalDup={globalDup}
            dupWarningMessage={dupWarningMessage}
            onAutofill={handleAutofillFromDuplicate}
          />

          {activeTab === "call" ? (
            <CallEntryTab
              edited={edited}
              row={row}
              callTheme={callTheme}
              calledForField={calledForField}
              sourceField={sourceField}
              getEditable={getEditable}
              handleChange={handleChange}
              handleCallTypeChange={handleCallTypeChange}
              getOtherValuesForField={getOtherValuesForField}
              mergedHistory={mergedHistory}
              setShowCalledForPrompt={setShowCalledForPrompt}
              setPromptSelection={setPromptSelection}
              setPendingSave={setPendingSave}
              setShowUndoStatusPrompt={setShowUndoStatusPrompt}
              setEdited={setEdited}
              getCallbackDateStr={getCallbackDateStr}
            />
          ) : (
            <ProfileDetailsTab
              edited={edited}
              handleChange={handleChange}
              getEditable={getEditable}
              isCheckingDuplicate={isCheckingDuplicate}
              isSearchingCRM={isSearchingCRM}
              basicFields={basicFields}
              questionFields={questionFields}
              campaignFields={campaignFields}
              handleAddField={handleAddField}
            />
          )}
        </div>


        <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between shadow-inner">
          {(!row._isNew && row.id) ? (
            <button onClick={handleDelete} className="flex items-center gap-2 text-xs font-bold text-red-400 hover:text-red-600 transition">
              <Trash2 size={14} /> Remove Entry
            </button>
          ) : (
            <div />
          )}
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
                    setShowUndoStatusPrompt(false);
                    handleSaveAndClose({
                      status: opt
                    });
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
