import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import {
  Phone, ArrowLeft, Plus, Download, Search, ChevronLeft, ChevronRight, ChevronDown,
  Edit3, X, Save, FileText, Calendar, Tag, User, MapPin, MessageSquare,
  Hash, Clock, PhoneOff, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame, SlidersHorizontal, FileSpreadsheet, CheckSquare
} from "lucide-react";
import {
  subscribeToCallLogs, updateCallLog, addIncomingCallLog,
  assignContactsToAttender, normalizePhone, getActiveTags,
  INCOMING_PROGRAM_ID, INCOMING_PROGRAM_NAME, ensureIncomingProgram,
  OUTGOING_PROGRAM_ID, OUTGOING_PROGRAM_NAME, ensureOutgoingProgram,
  globalSearchContacts, claimContact, removeAttenderFromContact, claimCRMContact
} from "../../../lib/db";
import { searchCRM } from "../../../lib/ghl";
import {
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  CONNECTED_STATUSES,
  NOT_CONNECTED_STATUSES,
  getFieldWithFallback,
  getKhojiValue,
  isKhojiAffirmative,
  isKhojiNegative,
  isIgnoredField,
  getCanonicalStatus
} from "./utils";
import { EditModal } from "./components/EditModal";
import { MyPerformanceDashboard } from "./components/MyPerformanceDashboard";
import { ColumnsSelector } from "./components/ColumnsSelector";

function parseTimestamp(t) {
  if (!t) return null;
  if (t instanceof Date) return t;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t === "object" && t.seconds !== undefined) {
    return new Date(t.seconds * 1000 + Math.round((t.nanoseconds || 0) / 1000000));
  }
  return new Date(t);
}
import { Pagination } from "./components/Pagination";
import { AttenderFilters } from "./components/AttenderFilters";
import { ContactTable } from "./components/ContactTable";

// ─── Main Attender View ───────────────────────
export default function AttenderView({ attenderId, attenderName, optionsVersion, onExit }) {
  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedProgramName, setSelectedProgramName] = useState("");
  const [selectedSubProgram, setSelectedSubProgram] = useState("");
  const [callLogs, setCallLogs] = useState([]);
  const [editingRow, setEditingRow] = useState(null);
  const [isLoadingProgram, setIsLoadingProgram] = useState(false); // skeleton state
  const [requestCount, setRequestCount] = useState(10);
  const [isRequesting, setIsRequesting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterSource, setFilterSource] = useState([]);
  const [filterCity, setFilterCity] = useState([]);
  const [filterCalledFor, setFilterCalledFor] = useState([]);
  const [filterCallType, setFilterCallType] = useState([]);
  const [filterSubProgram, setFilterSubProgram] = useState([]);
  const [filterObjectionReason, setFilterObjectionReason] = useState([]);
  const [filterCallbackStatus, setFilterCallbackStatus] = useState([]);
  const [filterCallCount, setFilterCallCount] = useState([]);
  const [filterGeneralStatus, setFilterGeneralStatus] = useState([]);
  const [filterQueryStatus, setFilterQueryStatus] = useState([]);
  const [filterAbhivyakti, setFilterAbhivyakti] = useState([]);
  const [filterKhoji, setFilterKhoji] = useState([]);
  const [filterDateType, setFilterDateType] = useState("All");
  const [filterDateRange, setFilterDateRange] = useState("All");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [customTimeFrom, setCustomTimeFrom] = useState("");
  const [customTimeTo, setCustomTimeTo] = useState("");
  const [activeView, setActiveView] = useState("sheet"); // "sheet" | "performance"
  const [sortBy, setSortBy] = useState("activityDesc"); // "activityDesc" | "nameAsc" | "createdDesc"
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(`hidden_cols_${attenderId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [colSearchQuery, setColSearchQuery] = useState("");
  const [programDropOpen, setProgramDropOpen] = useState(false);
  const [programSearch, setProgramSearch] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(`hidden_cols_${attenderId}`, JSON.stringify(hiddenColumns));
    } catch (e) {
      console.error(e);
    }
  }, [hiddenColumns, attenderId]);

  const resetOtherFilters = () => {
    setFilterStatus("All");
    setFilterSource([]); setFilterCity([]); setFilterCalledFor([]);
    setFilterCallType([]); setFilterSubProgram([]); setFilterObjectionReason([]);
    setFilterCallbackStatus([]); setFilterCallCount([]); setFilterGeneralStatus([]);
    setFilterQueryStatus([]);
    setFilterAbhivyakti([]); setFilterKhoji([]); setFilterDateType("All"); setFilterDateRange("All");
    setCustomDateFrom(""); setCustomDateTo(""); setSearchQuery("");
  };

  // ── Global Search State ──
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

  // ── Add Call Entry dialog state ──
  const [pickedProgramId, setPickedProgramId] = useState("");

  const rowsPerPage = 50;
  const unsubRef = useRef(null);
  const didDrag = useRef(false);
  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  useEffect(() => {
    loadPrograms();
  }, []);

  useEffect(() => {
    // Subscribe by attenderId only — all this attender's logs across all programs
    setIsLoadingProgram(true);
    unsubRef.current = subscribeToCallLogs(attenderId, (logs) => {
      setCallLogs(logs);
      setIsLoadingProgram(false);
    });
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [attenderId]);

  // Refresh callback-due flags every 60 seconds for long-running sessions
  useEffect(() => {
    const interval = setInterval(() => {
      setCallLogs(prev => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let changed = false;
        const updated = prev.map(log => {
          if (log.callbackDate) {
            const cbDate = parseTimestamp(log.callbackDate);
            if (cbDate && !isNaN(cbDate.getTime())) {
              cbDate.setHours(0, 0, 0, 0);
              const shouldBeDue = cbDate <= today;
              if (log._callbackDue !== shouldBeDue) { changed = true; return { ...log, _callbackDue: shouldBeDue }; }
            }
          }
          return log;
        });
        return changed ? updated : prev; // Only trigger re-render if something actually changed
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadPrograms = async () => {
    // Ensure the default programs always exist in Firestore
    await ensureIncomingProgram();
    await ensureOutgoingProgram();
    const tags = await getActiveTags();
    // Convert active tags to object structure for compatibility
    const list = tags.map(tag => ({
      id: tag,
      name: tag,
      subPrograms: []
    }));
    setPrograms(list);
  };

  const handleGetNumbers = async () => {
    if (!selectedProgramId) { toast.error("Select a tag first."); return; }

    const currentTagCount = tagFilteredLogs.length;
    if (currentTagCount > 0) {
      if (!window.confirm(`You already have ${currentTagCount} entries with tag #${selectedProgramId}.\nGet ${requestCount} more contacts?`)) return;
    }
    setIsRequesting(true);
    try {
      const assigned = await assignContactsToAttender(
        selectedProgramId, // tag
        selectedProgramId, // programName (which is tag)
        attenderId,
        attenderName,
        requestCount,
        null // subProgramName
      );
      if (assigned === 0) toast.error("No more available contacts in this tag!");
      else {
        toast.success(`${assigned} contacts added to your sheet!`);
        setSelectedTags([selectedProgramId]);
        setPage(1);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to get contacts.");
    } finally {
      setIsRequesting(false);
    }
  };

  const openCallEntryDialog = () => {
    setEditingRow({
      _isNew: true,
      programId: INCOMING_PROGRAM_ID,
      programName: INCOMING_PROGRAM_NAME,
      attenderId, attenderName,
      Name: "", Phone: "", Mobile: "", Email: "",
      City: "", State: "", Khoji: "", Source: "", Tags: "",
      "Called For": "",
      callType: "incoming",
      "Sub Program": "Incoming Calls",
      subProgram: "Incoming Calls",
      status: "", remark: "",
    });
  };

  const handleDeleteRow = async (id) => {
    try {
      // Remove only this attender from the contact — does NOT affect other attenders.
      // The Firestore subscription queries by assignedTo array-contains, so the
      // contact vanishes from this attender's sheet automatically.
      await removeAttenderFromContact(id, attenderId);
      setCallLogs(prev => prev.filter(l => l.id !== id));
      toast.success("Entry removed from your sheet.");
    } catch (err) {
      toast.error("Failed to remove.");
    }
  };

  const handleGlobalSearch = async (e) => {
    if (e) e.preventDefault();
    if (!globalSearchQuery.trim()) return;
    setIsSearchingGlobal(true);
    try {
      const results = await globalSearchContacts(globalSearchQuery);
      if (results.length === 0) {
        const crmLoaderId = toast.loading("No matches in Firebase. Searching CRM...");
        console.log(`[CRM Fetch Global] No Firebase matches. Initiating search CRM for query: "${globalSearchQuery}"`);
        try {
          const crmResults = await searchCRM(globalSearchQuery);
          toast.dismiss(crmLoaderId);
          if (crmResults && crmResults.length > 0) {
            console.log(`[CRM Fetch Global] Found ${crmResults.length} contact(s) in CRM:`, crmResults);
            setGlobalSearchResults(crmResults);
            toast.success(`Found ${crmResults.length} contact(s) in CRM!`);
          } else {
            console.log(`[CRM Fetch Global] No contacts found in CRM for query: "${globalSearchQuery}"`);
            setGlobalSearchResults([]);
            toast.error("No contacts found in Firebase or CRM.");
          }
        } catch (crmErr) {
          toast.dismiss(crmLoaderId);
          console.error(`[CRM Fetch Global] Error querying CRM contacts:`, crmErr);
          toast.error("Failed to query CRM contacts.");
          setGlobalSearchResults([]);
        }
      } else {
        console.log(`[Firebase Search Global] Found ${results.length} contact(s) in Firebase:`, results);
        setGlobalSearchResults(results);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to perform global search.");
    } finally {
      setIsSearchingGlobal(false);
    }
  };

  const handleClaimContact = async (contact) => {
    const confirmMsg = contact.isFromCRM
      ? `Are you sure you want to claim and import this lead from CRM?`
      : contact.isAssigned
        ? `This contact is currently assigned to ${contact.assignedName || "someone else"}.\nAre you sure you want to claim this lead?`
        : `Are you sure you want to claim this lead?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      if (contact.isFromCRM) {
        const newId = await claimCRMContact(contact, attenderId, attenderName);
        toast.success("Lead claimed from CRM successfully! It will now appear on your call sheet.");
        // Update local search results so it displays as claimed/assigned
        setGlobalSearchResults(prev => prev.map(c => c.GHL_ID === contact.GHL_ID ? {
          ...c,
          id: newId,
          isFromCRM: false,
          isAssigned: true,
          assignedTo: attenderId,
          assignedName: attenderName,
          attenderId,
          attenderName
        } : c));
      } else {
        await claimContact(contact.id, attenderId, attenderName);
        toast.success("Lead claimed successfully! It will now appear on your call sheet.");
        setGlobalSearchResults(prev => prev.map(c => c.id === contact.id ? {
          ...c,
          isAssigned: true,
          assignedTo: attenderId,
          assignedName: attenderName,
          attenderId,
          attenderName
        } : c));
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to claim contact.");
    }
  };

  const cleanExportRow = (log) => {
    const INTERNAL_KEYS = [
      "id", "programId", "programName", "contactId", "attenderId", "createdAt", "updatedAt",
      "history", "_callbackDue", "_deleted", "isCallbackDue", "isHotLead", "callCount",
      "callbackStatus", "lastCalledAt", "firstCalledAt", "registeredAt", "conversionSource",
      "convertedBy", "subProgram", "objectionReason"
    ];

    const row = {};
    
    // Find standard field mappings
    const findValue = (obj, keysList) => {
      const matchingKeys = Object.keys(obj).filter(k => keysList.includes(k.toLowerCase()));
      for (const k of matchingKeys) {
        const val = String(obj[k] || "").trim();
        if (val) return val;
      }
      return "";
    };

    const nameVal = findValue(log, ["name", "caller", "caller name", "lead name", "lead", "name of caller"]);
    const phoneVal = findValue(log, ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number"]);
    const emailVal = findValue(log, ["email", "mail", "e-mail", "email id", "emailaddress"]);
    const cityVal = findValue(log, ["city", "location", "khoji city", "place", "city name"]);
    const stateVal = findValue(log, ["state", "state name", "province", "region"]);
    const khojiVal = findValue(log, ["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani"]);

    const tagsVal = findValue(log, ["tags", "tag"]);
    const statusVal = log.status || "Pending";
    const remarkVal = log.remark || "";
    const subProgramVal = log["Sub Program"] || log.subProgram || "";
    const sourceVal = findValue(log, ["source", "sourse"]);
    const calledForVal = findValue(log, ["called for", "called_for", "calledfor"]);
    const callTypeVal = log.callType || "";
    const callbackStatusVal = log.callbackStatus || "";
    const objectionReasonVal = log.objectionReason || "";

    let callbackDateStr = "";
    if (log.callbackDate) {
      const d = parseTimestamp(log.callbackDate);
      if (d && !isNaN(d.getTime())) {
        callbackDateStr = d.toLocaleDateString("en-IN");
      }
    }

    row["Name"] = nameVal;
    row["Phone"] = phoneVal;
    row["Email"] = emailVal;
    row["City"] = cityVal;
    row["State"] = stateVal;
    row["Khoji"] = khojiVal;
    row["Tags"] = tagsVal;
    row["Sub Program"] = subProgramVal;
    row["Source"] = sourceVal;
    row["Called For"] = calledForVal;
    row["Call Type"] = callTypeVal;
    row["Status"] = statusVal;
    row["Remark"] = remarkVal;
    row["Callback Date"] = callbackDateStr;
    row["Callback Status"] = callbackStatusVal;
    row["Objection Reason"] = objectionReasonVal;

    // Add all other dynamic/custom keys ONLY if they are explicitly present in the _mappedFields array metadata of the contact.
    if (log._mappedFields && Array.isArray(log._mappedFields)) {
      log._mappedFields.forEach(key => {
        if (INTERNAL_KEYS.includes(key) || key.startsWith("_")) return;
        
        const isStandard = [
          "name", "caller", "caller name", "lead name", "lead", "name of caller",
          "phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number",
          "email", "mail", "e-mail", "email id", "emailaddress",
          "city", "location", "khoji city", "place", "city name",
          "state", "state name", "province", "region",
          "khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani",
          "tags", "tag", "status", "remark", "callbackdate", "sub program",
          "source", "sourse", "called for", "called_for", "calledfor", "call type", "calltype", "callback status", "callbackstatus", "objection reason", "objectionreason"
        ].includes(key.toLowerCase());
        
        if (!isStandard) {
          row[key] = log[key];
        }
      });
    }

    if (log.attenderName) {
      row["Attended By"] = log.attenderName;
    }

    let historyStr = "";
    if (log.history && Array.isArray(log.history)) {
      historyStr = log.history.map(h => {
        const d = parseTimestamp(h.timestamp);
        const dateStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "Invalid Date";
        return `[${dateStr}] ${h.attenderName}: ${h.status} - ${h.remark}`;
      }).join(" | ");
    }
    row["Call History Timeline"] = historyStr;

    return row;
  };

  const handleExport = () => {
    if (sortedLogs.length === 0) { toast.error("Nothing to export."); return; }
    const rows = sortedLogs.map(cleanExportRow);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "My Sheet");
    XLSX.writeFile(wb, `${attenderName}_all_${new Date().toLocaleDateString("en-CA")}.xlsx`);
    toast.success("Exported!");
  };

  // ── Drag scroll ──
  const onMouseDown = useCallback((e) => {
    isDragging.current = true; didDrag.current = false;
    dragStartX.current = e.pageX - scrollRef.current.offsetLeft;
    dragScrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = "grabbing";
  }, []);
  const onMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - dragStartX.current) * 1.2;
    if (Math.abs(walk) > 3) didDrag.current = true;
    scrollRef.current.scrollLeft = dragScrollLeft.current - walk;
  }, []);
  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  }, []);

  // ── Available tags ──
  const availableTags = useMemo(() => {
    const tagsSet = new Set();
    const programNames = new Set(programs.map(p => p.name));
    programNames.add("Incoming Calls"); // ensure Incoming Calls is always considered a main tag

    let hasUntagged = false;

    callLogs.forEach(l => {
      if (l._deleted) return;
      let isTagged = false;

      const checkTag = (x) => {
        if (programNames.has(x)) {
          tagsSet.add(x);
          isTagged = true;
        }
      };

      if (Array.isArray(l.tags)) {
        l.tags.forEach(t => {
          if (typeof t === "string") {
            t.split(",").map(x => x.trim()).filter(Boolean).forEach(checkTag);
          } else if (t) {
            checkTag(String(t).trim());
          }
        });
      }
      if (l.Tags) {
        String(l.Tags).split(",").map(x => x.trim()).filter(Boolean).forEach(checkTag);
      }
      // Backwards compatibility for old records:
      const sh = l["Sub Program"] || l.subProgram;
      if (sh) {
        String(sh).split(",").map(x => x.trim()).filter(Boolean).forEach(checkTag);
      }

      if (!isTagged && !l.programId) {
        hasUntagged = true;
      }
    });

    const list = Array.from(tagsSet).sort();
    if (hasUntagged) {
      list.push("Untagged");
    }
    return list;
  }, [callLogs, programs]);

  useEffect(() => {
    if (availableTags.length > 0) {
      setSelectedTags(prev => prev.filter(t => availableTags.includes(t)));
    } else {
      setSelectedTags([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTags]);

  // ── Tag filtered logs ──
  const tagFilteredLogs = useMemo(() => {
    if (selectedTags.length === 0) return callLogs.filter(l => !l._deleted);
    return callLogs.filter(l => {
      if (l._deleted) return false;
      const tags = Array.isArray(l.tags) ? l.tags.map(x => String(x).trim()) : [];
      const tagsStr = l.Tags ? String(l.Tags).trim() : "";
      const splitTags = tagsStr.split(",").map(x => x.trim()).filter(Boolean);
      const subProg = l["Sub Program"] || l.subProgram || "";

      const allContactTags = new Set([...tags, ...splitTags]);
      if (subProg) {
        subProg.split(",").map(x => x.trim()).filter(Boolean).forEach(x => allContactTags.add(x));
      }

      const programNames = new Set(programs.map(p => p.name));
      programNames.add("Incoming Calls");

      let isTagged = false;
      allContactTags.forEach(t => {
        if (programNames.has(t)) {
          isTagged = true;
        }
      });

      const isLogUntagged = !isTagged && !l.programId;

      return selectedTags.some(t => {
        if (t === "Untagged") {
          return isLogUntagged;
        }
        return allContactTags.has(t);
      });
    });
  }, [callLogs, selectedTags, programs]);

  // ── Stats ──
  const stats = useMemo(() => {
    const active = tagFilteredLogs;
    const total = active.length;
    const called = active.filter(l => l.status || l.callbackDate || l.remark || l.remarks).length;
    const interested = active.filter(l => l.status === "Interested").length;
    const regDone = active.filter(l => l.status === "Reg.Done").length;
    const callbacks = active.filter(l => l._callbackDue).length;
    const incoming = active.filter(l => l.callType === "incoming").length;
    const outgoing = active.filter(l => l.callType !== "incoming").length;
    const hotLeads = active.filter(l => l.isHotLead).length;
    return { total, called, interested, regDone, callbacks, incoming, outgoing, hotLeads };
  }, [tagFilteredLogs]);

  // ── Unique values for dropdowns dynamically computed from month data ──
  const uniqueSources = useMemo(() => {
    const set = new Set(SOURCE_OPTIONS);
    tagFilteredLogs.forEach(log => {
      const k = Object.keys(log).find(key => key.toLowerCase().includes("source") || key.toLowerCase().includes("sourse"));
      if (k && log[k]) set.add(String(log[k]).trim());
    });
    return Array.from(set).sort();
  }, [tagFilteredLogs, optionsVersion]);

  const uniqueCities = useMemo(() => {
    const set = new Set();
    tagFilteredLogs.forEach(log => {
      const k = Object.keys(log).find(key => key.toLowerCase().includes("city") || key.toLowerCase().includes("location") || key.toLowerCase().includes("khoji city"));
      if (k && log[k]) set.add(String(log[k]).trim());
    });
    return Array.from(set).sort();
  }, [tagFilteredLogs]);

  const uniqueCalledFor = useMemo(() => {
    const set = new Set(CALLED_FOR_OPTIONS);
    tagFilteredLogs.forEach(log => {
      const k = Object.keys(log).find(key => key.toLowerCase().includes("called for") || key.toLowerCase().includes("called_for") || key.toLowerCase().includes("calledfor"));
      if (k && log[k]) {
        String(log[k]).split(",").map(x => x.trim()).filter(Boolean).forEach(cf => set.add(cf));
      }
    });
    return Array.from(set).sort();
  }, [tagFilteredLogs, optionsVersion]);

  const uniqueSubPrograms = useMemo(() => {
    const set = new Set();
    tagFilteredLogs.forEach(log => {
      if (log["Sub Program"]) set.add(String(log["Sub Program"]).trim());
    });
    return Array.from(set).sort();
  }, [tagFilteredLogs]);

  const uniqueObjectionReasons = useMemo(() => {
    const set = new Set();
    tagFilteredLogs.forEach(log => {
      if (log.objectionReason) set.add(String(log.objectionReason).trim());
    });
    return Array.from(set).sort();
  }, [tagFilteredLogs]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (filterStatus !== "All") count++;
    if (filterSource.length > 0) count++;
    if (filterCity.length > 0) count++;
    if (filterCalledFor.length > 0) count++;
    if (filterCallType.length > 0) count++;
    if (filterSubProgram.length > 0) count++;
    if (filterObjectionReason.length > 0) count++;
    if (filterCallbackStatus.length > 0) count++;
    if (filterCallCount.length > 0) count++;
    if (filterGeneralStatus.length > 0) count++;
    if (filterAbhivyakti.length > 0) count++;
    if (filterKhoji.length > 0) count++;
    if (filterDateType !== "All" && filterDateRange !== "All") count++;
    if (customTimeFrom) count++;
    if (customTimeTo) count++;
    return count;
  }, [
    searchQuery, filterStatus, filterSource, filterCity, filterCalledFor,
    filterCallType, filterSubProgram, filterObjectionReason,
    filterCallbackStatus, filterCallCount, filterGeneralStatus, filterAbhivyakti,
    filterKhoji,
    filterDateType, filterDateRange, customTimeFrom, customTimeTo
  ]);

  const handleClearAllFilters = () => {
    setSearchQuery("");
    setFilterStatus("All");
    setFilterSource([]);
    setFilterCity([]);
    setFilterCalledFor([]);
    setFilterCallType([]);
    setFilterSubProgram([]);
    setFilterObjectionReason([]);
    setFilterCallbackStatus([]);
    setFilterCallCount([]);
    setFilterGeneralStatus([]);
    setFilterAbhivyakti([]);
    setFilterKhoji([]);
    setFilterDateType("All");
    setFilterDateRange("All");
    setCustomDateFrom("");
    setCustomDateTo("");
    setCustomTimeFrom("");
    setCustomTimeTo("");
    setPage(1);
    toast.success("All filters cleared!");
  };

  // ── Filter ──
  const filteredLogs = useMemo(() => {
    return tagFilteredLogs.filter(log => {
      // 1. Text Search Query
      const q = searchQuery.toLowerCase();
      if (q && !Object.values(log).join(" ").toLowerCase().includes(q)) return false;

      // 2. Quick Status Filter
      if (filterStatus === "Hot Leads" && !log.isHotLead) return false;
      if (filterStatus === "Callback" && !log.callbackDate) return false;
      if (filterStatus === "Follow up" && !(log.callbackDate || log.status === "reminder" || log.status === "Next time")) return false;
      if (filterStatus === "Today Activity") {
        if (!log.lastCalledAt) return false;
        const logDate = new Date(log.lastCalledAt);
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
        if (logDate < startOfToday || logDate > endOfToday) return false;
      }
      if (
        filterStatus !== "All" && 
        filterStatus !== "Hot Leads" && 
        filterStatus !== "Callback" && 
        filterStatus !== "Follow up" && 
        filterStatus !== "Today Activity" && 
        log.status !== filterStatus
      ) return false;

      // 3. Source Filter
      if (filterSource.length > 0) {
        const k = Object.keys(log).find(key => key.toLowerCase().includes("source") || key.toLowerCase().includes("sourse"));
        if (!k || !filterSource.includes(String(log[k] || "").trim())) return false;
      }

      // 4. Called For Filter
      if (filterCalledFor.length > 0) {
        const k = Object.keys(log).find(key => key.toLowerCase().includes("called for") || key.toLowerCase().includes("called_for") || key.toLowerCase().includes("calledfor"));
        if (!k) return false;
        const calledForVal = String(log[k] || "").trim();
        const logCalledFors = calledForVal.split(",").map(x => x.trim()).filter(Boolean);
        if (!logCalledFors.some(cf => filterCalledFor.includes(cf))) return false;
      }

      // 5. City/Location Filter
      if (filterCity.length > 0) {
        const k = Object.keys(log).find(key => key.toLowerCase().includes("city") || key.toLowerCase().includes("location") || key.toLowerCase().includes("khoji city"));
        if (!k || !filterCity.includes(String(log[k] || "").trim())) return false;
      }

      // 6. Call Type Filter
      if (filterCallType.length > 0) {
        const cType = log.callType || "outgoing";
        if (!filterCallType.includes(cType)) return false;
      }

      // 7. Sub Program / Sheet Filter
      if (filterSubProgram.length > 0) {
        if (!filterSubProgram.includes(String(log["Sub Program"] || "").trim())) return false;
      }

      // 8. Objection Reason Filter
      if (filterObjectionReason.length > 0) {
        if (!filterObjectionReason.includes(String(log.objectionReason || "").trim())) return false;
      }

      // 9. Callback Status Filter
      if (filterCallbackStatus.length > 0) {
        if (!log.callbackDate) return false;
        const cbStatus = log.callbackStatus || "pending";
        if (!filterCallbackStatus.includes(cbStatus)) return false;
      }

      // 10. Call Count Filter
      if (filterCallCount.length > 0) {
        const hasAttempt = log.status || log.callbackDate || log.remark || log.remarks;
        const count = log.history ? log.history.length : (hasAttempt ? 1 : 0);
        let match = false;
        if (filterCallCount.includes("0") && count === 0) match = true;
        if (filterCallCount.includes("1") && count === 1) match = true;
        if (filterCallCount.includes("2+") && count >= 2) match = true;
        if (!match) return false;
      }

      // 10b. General Result Status Filter
      if (filterGeneralStatus.length > 0) {
        const logStatus = log.status;
        const logQueryStatus = log.queryStatus || "Pending";

        const matched = filterGeneralStatus.some(f => {
          if (f === "Query Pending") return logStatus === "Query" && logQueryStatus === "Pending";
          if (f === "Query Solved")  return logStatus === "Query" && logQueryStatus === "Solved";
          return f === logStatus;
        });
        if (!matched) return false;
      }

      // 10c. Abhivyakti Filter
      if (filterAbhivyakti.length > 0) {
        const hasYes = filterAbhivyakti.includes("Yes");
        const hasNo = filterAbhivyakti.includes("No");
        if (hasYes && !hasNo && log.status !== "Reg.Done") return false;
        if (hasNo && !hasYes && log.status === "Reg.Done") return false;
      }

      // 10d. Khoji Filter
      if (filterKhoji.length > 0) {
        const val = getKhojiValue(log);
        const affirmative = isKhojiAffirmative(val);
        const isDew = String(val || "").toLowerCase().includes("dew d") || String(val || "").toLowerCase().includes("dewdrop");
        const isNo = isKhojiNegative(val) || !val;
        
        let match = false;
        if (filterKhoji.includes("Yes") && affirmative && !isDew) match = true;
        if (filterKhoji.includes("No") && isNo) match = true;
        if (filterKhoji.includes("Dew drop khoji") && isDew) match = true;
        
        if (!match) return false;
      }

      // 11. Date & Time Range Filter
      if (filterDateType !== "All") {
        let logDate = null;
        if (filterDateType === "lastCalledAt") {
          logDate = log.lastCalledAt ? new Date(log.lastCalledAt) : null;
        } else if (filterDateType === "createdAt") {
          logDate = log.createdAt?.toDate ? log.createdAt.toDate() : log.createdAt ? new Date(log.createdAt) : null;
        }

        if (!logDate || isNaN(logDate)) return false;

        if (filterDateRange !== "All") {
          const startOfDay = (d) => { const nd = new Date(d); nd.setHours(0, 0, 0, 0); return nd; };
          const endOfDay = (d) => { const nd = new Date(d); nd.setHours(23, 59, 59, 999); return nd; };

          const today = new Date();
          const yesterday = new Date();
          yesterday.setDate(today.getDate() - 1);

          if (filterDateRange === "Today") {
            if (logDate < startOfDay(today) || logDate > endOfDay(today)) return false;
          } else if (filterDateRange === "Yesterday") {
            if (logDate < startOfDay(yesterday) || logDate > endOfDay(yesterday)) return false;
          } else if (filterDateRange === "This Week") {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 7);
            if (logDate < startOfDay(sevenDaysAgo)) return false;
          } else if (filterDateRange === "Custom") {
            if (customDateFrom && logDate < startOfDay(new Date(customDateFrom))) return false;
            if (customDateTo && logDate > endOfDay(new Date(customDateTo))) return false;
          }
        }

        if (customTimeFrom || customTimeTo) {
          const logHours = logDate.getHours();
          const logMinutes = logDate.getMinutes();
          const logMinutesSinceMidnight = logHours * 60 + logMinutes;

          if (customTimeFrom) {
            const [h, m] = customTimeFrom.split(":").map(Number);
            const fromMinutes = h * 60 + m;
            if (logMinutesSinceMidnight < fromMinutes) return false;
          }
          if (customTimeTo) {
            const [h, m] = customTimeTo.split(":").map(Number);
            const toMinutes = h * 60 + m;
            if (logMinutesSinceMidnight > toMinutes) return false;
          }
        }
      }

      return true;
    });
  }, [
    tagFilteredLogs, searchQuery, filterStatus, filterSource, filterCalledFor,
    filterCity, filterCallType, filterSubProgram, filterObjectionReason,
    filterCallbackStatus, filterCallCount, filterGeneralStatus, filterQueryStatus, filterAbhivyakti,
    filterKhoji,
    filterDateType, filterDateRange, customDateFrom, customDateTo, customTimeFrom, customTimeTo
  ]);

  // ── Dynamic columns from data ──
  const INTERNAL_KEYS_LOWER = useMemo(() => new Set([
    "id", "contactid", "attenderid", "attendername", "programid", "programname",
    "status", "remark", "callbackdate", "calltype", "createdat", "updatedat",
    "_callbackdue", "_deleted", "iscallbackdue", "ishotlead", "registeredat",
    "type", "callback", "call type", "call_type", "followup", "followup date",
    "history", "lastcalledat", "firstcalledat", "sub program", "subprogram",
    "ghl_id", "_contactrefid", "objectionreason",
    "normalizedphone", "normalizedmobile", "contactrefid", "conversionSource", "conversionsource",
    "convertedat", "convertedby", "isassigned",
    "assignedname", "assignedto", "assignedat", "registeredyearmonth"
  ]), []);

  const dynamicCols = useMemo(() => {
    const standardOrder = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Tags", "Source", "Called For"];
    const allKeysSet = new Set();
    tagFilteredLogs.forEach(log => {
      Object.keys(log).forEach(key => {
        const kLower = key.toLowerCase();
        if (!INTERNAL_KEYS_LOWER.has(kLower) && !key.startsWith("_")) {
          const isStandard = standardOrder.some(col => col.toLowerCase() === kLower);
          if (isStandard) {
            allKeysSet.add(key);
          } else if (log._mappedFields && Array.isArray(log._mappedFields)) {
            if (log._mappedFields.includes(key)) {
              allKeysSet.add(key);
            }
          } else {
            if (!isIgnoredField(key)) {
              allKeysSet.add(key);
            }
          }
        }
      });
    });

    standardOrder.forEach(col => {
      const colLower = col.toLowerCase();
      Array.from(allKeysSet).forEach(k => {
        if (k.toLowerCase() === colLower) {
          allKeysSet.delete(k);
        }
      });
    });

    const sorted = [...standardOrder, ...Array.from(allKeysSet).sort()];
    console.log("[DEBUG] dynamicCols:", sorted);
    return sorted;
  }, [tagFilteredLogs, INTERNAL_KEYS_LOWER]);

  const allPossibleCols = useMemo(() => {
    return [...dynamicCols, "Type", "Status", "Remark", "Callback"];
  }, [dynamicCols]);

  const visibleCount = useMemo(() => {
    return 1 + allPossibleCols.filter(col => !hiddenColumns.includes(col)).length;
  }, [allPossibleCols, hiddenColumns]);

  const duplicatePhoneMap = useMemo(() => {
    const map = {};
    callLogs.forEach(log => {
      if (log._deleted) return;
      const progId = log.programId || "incoming";
      const keys = Object.keys(log);
      const phoneKey = keys.find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
        || keys.find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
      const rawPhone = phoneKey ? String(log[phoneKey] || "").replace(/[\s\-\.\(\)\+]/g, "").trim() : "";
      const phone = rawPhone.length >= 10 ? rawPhone.slice(-10) : rawPhone;
      if (!phone || phone.length < 5) return;
      if (!map[progId]) map[progId] = {};
      map[progId][phone] = (map[progId][phone] || 0) + 1;
    });
    return map;
  }, [callLogs]);

  const sortedLogs = useMemo(() => {
    const list = [...filteredLogs];
    list.sort((a, b) => {
      const aDue = a._callbackDue ? 1 : 0;
      const bDue = b._callbackDue ? 1 : 0;
      if (aDue !== bDue) return bDue - aDue;

      if (sortBy === "nameAsc") {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        const aNameKey = aKeys.find(k => k.toLowerCase() === "name" || k.toLowerCase().includes("caller") || k.toLowerCase().includes("khoji")) || "Name";
        const bNameKey = bKeys.find(k => k.toLowerCase() === "name" || k.toLowerCase().includes("caller") || k.toLowerCase().includes("khoji")) || "Name";
        const aName = String(a[aNameKey] || "").toLowerCase();
        const bName = String(b[bNameKey] || "").toLowerCase();
        return aName.localeCompare(bName);
      } else if (sortBy === "createdDesc") {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt ? new Date(a.createdAt) : new Date(0);
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt) : new Date(0);
        return bDate - aDate;
      } else {
        const aDate = a.lastCalledAt ? new Date(a.lastCalledAt) : a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt ? new Date(a.createdAt) : new Date(0);
        const bDate = b.lastCalledAt ? new Date(b.lastCalledAt) : b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt) : new Date(0);
        return bDate - aDate;
      }
    });
    return list;
  }, [filteredLogs, sortBy]);

  const totalPages = Math.ceil(sortedLogs.length / rowsPerPage);
  const paginated = sortedLogs.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const performanceStats = useMemo(() => {
    let totalAttempts = 0;
    let connectedContacts = 0;
    let notConnectedContacts = 0;
    let registrations = 0;
    let infoGiven = 0;
    let interested = 0;
    
    const statusCounts = {};
    const objectionCounts = {};
    const dailyActivity = {}; // date string -> attempts count

    tagFilteredLogs.forEach(log => {
      const hist = log.history || [];
      const isCalled = log.status || log.callbackDate || log.remark || log.remarks || hist.length > 0;
      const status = isCalled ? getCanonicalStatus(log.status || "Pending") : "";

      const attemptsCount = hist.length || (status ? 1 : 0);
      totalAttempts += attemptsCount;

      hist.forEach(h => {
        const d = parseTimestamp(h.timestamp);
        const dStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "Invalid Date";
        dailyActivity[dStr] = (dailyActivity[dStr] || 0) + 1;
      });
      if (hist.length === 0 && status && log.updatedAt) {
        const d = parseTimestamp(log.updatedAt);
        const dStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "Invalid Date";
        dailyActivity[dStr] = (dailyActivity[dStr] || 0) + 1;
      }

      if (status) {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        if (CONNECTED_STATUSES.includes(status)) {
          connectedContacts++;
          if (status === "Reg.Done") registrations++;
          else if (status === "Info given") infoGiven++;
          else if (status === "Interested") interested++;
        } else if (NOT_CONNECTED_STATUSES.includes(status)) {
          notConnectedContacts++;
        }
      }

      if (log.objectionReason) {
        objectionCounts[log.objectionReason] = (objectionCounts[log.objectionReason] || 0) + 1;
      }
    });

    const statusChartData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    const objectionChartData = Object.entries(objectionCounts).map(([name, value]) => ({ name, value }));
    const dailyChartData = Object.entries(dailyActivity)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => {
        const [da, ma, ya] = a.date.split("/").map(Number);
        const [db, mb, yb] = b.date.split("/").map(Number);
        return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
      })
      .slice(-15);

    const assignedCount = tagFilteredLogs.length;
    const isLogCalled = l => !!(l.status || l.callbackDate || l.remark || l.remarks);
    const calledCount = tagFilteredLogs.filter(isLogCalled).length;
    const pendingCount = tagFilteredLogs.filter(l => !isLogCalled(l)).length;

    // Today's calls — count history entries with today's date
    const todayStr = new Date().toLocaleDateString("en-IN");
    let todayCallCount = 0;
    tagFilteredLogs.forEach(log => {
      const hist = log.history || [];
      hist.forEach(h => {
        if (new Date(h.timestamp).toLocaleDateString("en-IN") === todayStr) todayCallCount++;
      });
      // Fallback for logs with no history but updated today
      if (hist.length === 0 && log.status && log.updatedAt) {
        const d = parseTimestamp(log.updatedAt);
        if (d && d.toLocaleDateString("en-IN") === todayStr) todayCallCount++;
      }
    });

    // Overdue callbacks
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const callbacksDue = tagFilteredLogs.filter(l => {
      if (!l.callbackDate) return false;
      const d = parseTimestamp(l.callbackDate);
      if (!d || isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      return d <= today && l.callbackStatus !== "done";
    }).length;

    return {
      totalAttempts,
      assignedCount,
      calledCount,
      pendingCount,
      connectedContacts,
      notConnectedContacts,
      registrations,
      infoGiven,
      interested,
      statusChartData,
      objectionChartData,
      dailyChartData,
      todayCallCount,
      callbacksDue,
      connectionRate: assignedCount > 0 ? Math.round((connectedContacts / assignedCount) * 100) : 0,
      registrationRate: assignedCount > 0 ? Math.round((registrations / assignedCount) * 100) : 0,
      callsPerAssign: assignedCount > 0 ? (totalAttempts / assignedCount).toFixed(1) : "0.0"
    };
  }, [tagFilteredLogs]);

  const getStatusBadge = (status) => {
    if (!status) return { bg: "bg-gray-100", text: "text-gray-400", label: "Pending" };
    if (status === "Reg.Done") return { bg: "bg-emerald-100", text: "text-emerald-700", label: status };
    if (status === "Interested") return { bg: "bg-blue-100", text: "text-blue-700", label: status };
    if (status === "Info given") return { bg: "bg-purple-100", text: "text-purple-700", label: status };
    if (["NA", "Busy", "Call Cut", "switched off", "Not interested", "Invalid No"].includes(status)) return { bg: "bg-red-100", text: "text-red-600", label: status };
    return { bg: "bg-indigo-100", text: "text-indigo-700", label: status };
  };

  const getCallbackStr = (log) => {
    if (!log.callbackDate) return "";
    if (log.callbackDate?.toDate) return log.callbackDate.toDate().toLocaleDateString("en-IN");
    return String(log.callbackDate).split("T")[0];
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-xl transition">
              <ArrowLeft size={18} className="text-gray-500" />
            </button>
            <div>
              <h1 className="font-black text-gray-900 text-lg leading-none">My Call Sheet</h1>
              <p className="text-xs text-gray-400 font-medium">{attenderName}</p>
            </div>
          </div>

          {/* View Toggle tabs */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200 shrink-0">
            <button
              onClick={() => setActiveView("sheet")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "sheet"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Call Sheet
            </button>
            <button
              onClick={() => setActiveView("performance")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "performance"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              My Performance
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Get Numbers */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5">
            {/* Searchable Tag Dropdown */}
            <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setProgramDropOpen(false); setProgramSearch(""); } }}>
              <button
                type="button"
                onClick={() => { setProgramDropOpen(o => !o); setProgramSearch(""); }}
                className="flex items-center gap-1.5 bg-transparent text-sm font-semibold text-blue-700 focus:outline-none cursor-pointer min-w-[120px] max-w-[200px]"
              >
                <span className="truncate">
                  {selectedProgramId ? (programs.find(p => p.id === selectedProgramId)?.name || "Select Tag...") : "Select Tag..."}
                </span>
                <ChevronDown size={14} className={`shrink-0 text-blue-500 transition-transform ${programDropOpen ? "rotate-180" : ""}`} />
              </button>

              {programDropOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-blue-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  {/* Search input */}
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search tags..."
                        value={programSearch}
                        onChange={e => setProgramSearch(e.target.value)}
                        className="w-full pl-7 pr-3 py-1.5 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:bg-white transition"
                      />
                    </div>
                  </div>
                  {/* Options list */}
                  <div className="max-h-52 overflow-y-auto py-1">
                    {/* Clear option */}
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => { setSelectedProgramId(""); setSelectedProgramName(""); setSelectedSubProgram(""); setProgramDropOpen(false); setProgramSearch(""); }}
                      className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-blue-50 transition ${!selectedProgramId ? "text-blue-700 bg-blue-50" : "text-gray-400"}`}
                    >
                      — Select Tag...
                    </button>
                    {programs
                      .filter(p => !programSearch || p.name.toLowerCase().includes(programSearch.toLowerCase()))
                      .map(p => (
                        <button
                          key={p.id}
                          type="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedProgramId(p.id);
                            setSelectedProgramName(p.name);
                            setSelectedSubProgram("");
                            setProgramDropOpen(false);
                            setProgramSearch("");
                          }}
                          className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-blue-50 transition truncate ${selectedProgramId === p.id ? "text-blue-700 bg-blue-50/80" : "text-gray-700"}`}
                        >
                          {p.name}
                        </button>
                      ))
                    }
                    {programs.filter(p => !programSearch || p.name.toLowerCase().includes(programSearch.toLowerCase())).length === 0 && (
                      <div className="px-3 py-3 text-xs text-gray-400 text-center">No tags match "{programSearch}"</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 bg-white/50 rounded-lg px-1">
              <button onClick={() => setRequestCount(c => Math.max(5, c - 5))} className="w-5 h-5 flex items-center justify-center text-blue-600 hover:text-blue-900 font-bold text-sm">-</button>
              <span className="w-7 text-center font-bold text-sm text-blue-700">{requestCount}</span>
              <button onClick={() => setRequestCount(c => c + 5)} className="w-5 h-5 flex items-center justify-center text-blue-600 hover:text-blue-900 font-bold text-sm">+</button>
            </div>
            <button
              onClick={handleGetNumbers}
              disabled={isRequesting || !selectedProgramId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 disabled:opacity-50 transition shadow shadow-blue-500/20"
            >
              {isRequesting ? <Loader size={13} className="animate-spin" /> : <PhoneOutgoing size={13} />}
              Get Numbers
            </button>
          </div>

          <button onClick={() => setGlobalSearchOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20">
            <Search size={15} /> Global Search
          </button>
          <button onClick={openCallEntryDialog} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20">
            <PhoneIncoming size={15} /> Add Call Entry
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#217346] text-[#217346] rounded-xl font-bold text-sm hover:bg-[#217346] hover:text-white transition">
            <Download size={15} /> Export
          </button>
        </div>
      </header>





      {/* Edit Modal */}
      {editingRow && (
        <EditModal
          key={editingRow.id || "new-entry"}
          optionsVersion={optionsVersion}
          row={editingRow}
          attenderId={attenderId}
          attenderName={attenderName}
          programs={programs.filter(p => p.id !== INCOMING_PROGRAM_ID && p.id !== OUTGOING_PROGRAM_ID)}
          onSave={(updated, isOptimistic) => {
            setCallLogs(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
            if (!isOptimistic) setEditingRow(null);
          }}
          onDelete={handleDeleteRow}
          onClose={() => setEditingRow(null)}
        />
      )}

      {/* Global Search Modal */}
      {globalSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[550px] max-h-[85vh] flex flex-col animate-slide-up">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h2 className="text-lg font-black text-gray-900">Global Contact Search</h2>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Search and claim contacts across all lists by Name, Phone, or Email Prefix.</p>
              </div>
              <button onClick={() => { setGlobalSearchOpen(false); setGlobalSearchResults([]); setGlobalSearchQuery(""); }} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleGlobalSearch} className="flex gap-2 mb-4 shrink-0">
              <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                <Search size={16} className="text-gray-400" />
                <input
                  type="text"
                  placeholder="Enter phone, name prefix, or email..."
                  value={globalSearchQuery}
                  onChange={e => setGlobalSearchQuery(e.target.value)}
                  className="bg-transparent text-sm outline-none w-full font-medium text-gray-700"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={isSearchingGlobal || !globalSearchQuery.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {isSearchingGlobal ? <Loader size={16} className="animate-spin" /> : "Search"}
              </button>
            </form>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {isSearchingGlobal && (
                <div className="py-12 text-center text-gray-400 font-bold flex flex-col items-center gap-2">
                  <Loader size={24} className="animate-spin text-indigo-500" />
                  Searching global database...
                </div>
              )}

              {!isSearchingGlobal && globalSearchResults.length > 0 && (
                globalSearchResults.map(contact => {
                  const alreadyMine = Array.isArray(contact.assignedTo) ? contact.assignedTo.includes(attenderId) : contact.assignedTo === attenderId;
                  const isAssigned = contact.isAssigned;
                  const tags = contact.tags || [];
                  const uniqueKey = contact.id || contact.GHL_ID || Math.random().toString();

                  return (
                    <div key={uniqueKey} className="p-4 border border-gray-100 rounded-xl bg-gray-50/50 hover:bg-white hover:shadow transition flex items-center justify-between gap-4">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 truncate">{contact.Name || "No Name"}</p>
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            contact.isFromCRM
                              ? "bg-purple-100 text-purple-700"
                              : isAssigned
                                ? alreadyMine
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                          }`}>
                            {contact.isFromCRM
                              ? "CRM Lead"
                              : isAssigned
                                ? alreadyMine
                                  ? "My Lead"
                                  : `Assigned to: ${contact.assignedName || "Other"}`
                                : "Unassigned"
                            }
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 space-y-0.5">
                          <p className="flex items-center gap-1"><Phone size={12} className="text-gray-400" /> {contact.Phone || contact.Mobile || "No Phone"}</p>
                          {contact.Email && <p className="truncate flex items-center gap-1"><User size={12} className="text-gray-400" /> {contact.Email}</p>}
                        </div>
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tags.map(t => (
                              <span key={t} className="text-[9px] font-bold bg-gray-200/60 text-gray-600 px-1.5 py-0.5 rounded">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleClaimContact(contact)}
                        disabled={alreadyMine}
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm transition ${
                          alreadyMine
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : contact.isFromCRM
                              ? "bg-purple-600 hover:bg-purple-700 text-white"
                              : isAssigned
                                ? "bg-amber-500 hover:bg-amber-600 text-white"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        }`}
                      >
                        {alreadyMine
                          ? "Claimed"
                          : contact.isFromCRM
                            ? "Claim & Import"
                            : isAssigned
                              ? "Claim & Reassign"
                              : "Claim Lead"
                        }
                      </button>
                    </div>
                  );
                })
              )}

              {!isSearchingGlobal && globalSearchQuery && globalSearchResults.length === 0 && (
                <div className="py-12 text-center text-gray-400 font-bold">
                  No matching contacts found globally.
                </div>
              )}

              {!globalSearchQuery && (
                <div className="py-12 text-center text-gray-400 font-semibold text-xs">
                  Enter a phone number, name prefix, or email prefix to query the entire database.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Column Config Modal */}
      <ColumnsSelector
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        hiddenColumns={hiddenColumns}
        setHiddenColumns={setHiddenColumns}
        allPossibleCols={allPossibleCols}
        colSearchQuery={colSearchQuery}
        setColSearchQuery={setColSearchQuery}
      />

      {/* Filters */}
      {activeView === "sheet" && (
        <AttenderFilters
          key={`filters-${optionsVersion}`}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          setPage={setPage}
          showAdvancedFilters={showAdvancedFilters}
          setShowAdvancedFilters={setShowAdvancedFilters}
          activeFiltersCount={activeFiltersCount}
          hiddenColumns={hiddenColumns}
          allPossibleCols={allPossibleCols}
          setIsColumnModalOpen={setIsColumnModalOpen}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          availableTags={availableTags}
          selectedTags={selectedTags}
          setSelectedTags={setSelectedTags}
          tagDropdownOpen={tagDropdownOpen}
          setTagDropdownOpen={setTagDropdownOpen}
          tagSearchQuery={tagSearchQuery}
          setTagSearchQuery={setTagSearchQuery}
          tagFilteredLogsLength={tagFilteredLogs.length}
          resetOtherFilters={resetOtherFilters}
          stats={stats}
          filterSource={filterSource}
          setFilterSource={setFilterSource}
          filterCity={filterCity}
          setFilterCity={setFilterCity}
          filterCalledFor={filterCalledFor}
          setFilterCalledFor={setFilterCalledFor}
          filterCallType={filterCallType}
          setFilterCallType={setFilterCallType}
          filterSubProgram={filterSubProgram}
          setFilterSubProgram={setFilterSubProgram}
          filterObjectionReason={filterObjectionReason}
          setFilterObjectionReason={setFilterObjectionReason}
          filterCallbackStatus={filterCallbackStatus}
          setFilterCallbackStatus={setFilterCallbackStatus}
          filterCallCount={filterCallCount}
          setFilterCallCount={setFilterCallCount}
          filterGeneralStatus={filterGeneralStatus}
          setFilterGeneralStatus={setFilterGeneralStatus}
          filterQueryStatus={filterQueryStatus}
          setFilterQueryStatus={setFilterQueryStatus}
          filterAbhivyakti={filterAbhivyakti}
          setFilterAbhivyakti={setFilterAbhivyakti}
          filterKhoji={filterKhoji}
          setFilterKhoji={setFilterKhoji}
          filterDateType={filterDateType}
          setFilterDateType={setFilterDateType}
          filterDateRange={filterDateRange}
          setFilterDateRange={setFilterDateRange}
          customDateFrom={customDateFrom}
          setCustomDateFrom={setCustomDateFrom}
          customDateTo={customDateTo}
          setCustomDateTo={setCustomDateTo}
          customTimeFrom={customTimeFrom}
          setCustomTimeFrom={setCustomTimeFrom}
          customTimeTo={customTimeTo}
          setCustomTimeTo={setCustomTimeTo}
          uniqueSources={uniqueSources}
          uniqueCities={uniqueCities}
          uniqueCalledFor={uniqueCalledFor}
          uniqueSubPrograms={uniqueSubPrograms}
          uniqueObjectionReasons={uniqueObjectionReasons}
          handleClearAllFilters={handleClearAllFilters}
        />
      )}

      {/* Sheet Table */}
      {isLoadingProgram ? (
        <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-3 animate-pulse">
          <div className="h-10 bg-gray-200 rounded-xl w-full" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-8 bg-gray-100 rounded-lg w-12" />
              <div className="h-8 bg-gray-100 rounded-lg flex-1" />
              <div className="h-8 bg-gray-100 rounded-lg w-24" />
              <div className="h-8 bg-gray-100 rounded-lg w-32" />
              <div className="h-8 bg-gray-50 rounded-lg flex-1" />
              <div className="h-8 bg-gray-100 rounded-lg w-28" />
            </div>
          ))}
        </div>
      ) : activeView === "performance" ? (
        <MyPerformanceDashboard logs={tagFilteredLogs} attenderName={attenderName} attenderId={attenderId} />
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <ContactTable
            scrollRef={scrollRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            dynamicCols={dynamicCols}
            hiddenColumns={hiddenColumns}
            paginated={paginated}
            page={page}
            rowsPerPage={rowsPerPage}
            duplicatePhoneMap={duplicatePhoneMap}
            didDrag={didDrag}
            setEditingRow={setEditingRow}
            callLogs={callLogs}
          />

          <Pagination
            page={page}
            totalPages={totalPages}
            setPage={setPage}
            filteredLogsLength={filteredLogs.length}
            stats={stats}
          />
        </div>
      )}
    </div>
  );
}
