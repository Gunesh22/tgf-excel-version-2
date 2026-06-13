import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import {
  Phone, ArrowLeft, Plus, Download, Search, ChevronLeft, ChevronRight,
  Edit3, X, Save, FileText, Calendar, Tag, User, MapPin, MessageSquare,
  Hash, Clock, PhoneOff, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame, SlidersHorizontal, FileSpreadsheet, CheckSquare
} from "lucide-react";
import {
  subscribeToCallLogs, updateCallLog, addIncomingCallLog,
  assignContactsToAttender, getPrograms, normalizePhone,
  INCOMING_PROGRAM_ID, INCOMING_PROGRAM_NAME, ensureIncomingProgram,
} from "../../../lib/db";
import {
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  CONNECTED_STATUSES,
  NOT_CONNECTED_STATUSES,
  getFieldWithFallback,
  getKhojiValue,
  isKhojiAffirmative,
  isIgnoredField
} from "./utils";
import { EditModal } from "./components/EditModal";
import { MyPerformanceDashboard } from "./components/MyPerformanceDashboard";

// ─── Main Attender View ───────────────────────
export default function AttenderView({ attenderId, attenderName, onExit }) {
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
  const [filterSource, setFilterSource] = useState("All");
  const [filterCity, setFilterCity] = useState("All");
  const [filterCalledFor, setFilterCalledFor] = useState("All");
  const [filterCallType, setFilterCallType] = useState("All");
  const [filterSubProgram, setFilterSubProgram] = useState("All");
  const [filterObjectionReason, setFilterObjectionReason] = useState("All");
  const [filterCallbackStatus, setFilterCallbackStatus] = useState("All");
  const [filterCallCount, setFilterCallCount] = useState("All");
  const [filterGeneralStatus, setFilterGeneralStatus] = useState("All");
  const [filterAbhivyakti, setFilterAbhivyakti] = useState("All");
  const [filterKhoji, setFilterKhoji] = useState("All");
  const [filterDateType, setFilterDateType] = useState("All");
  const [filterDateRange, setFilterDateRange] = useState("All");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [customTimeFrom, setCustomTimeFrom] = useState("");
  const [customTimeTo, setCustomTimeTo] = useState("");
  const [activeView, setActiveView] = useState("sheet"); // "sheet" | "performance"
  const [sortBy, setSortBy] = useState("activityDesc"); // "activityDesc" | "nameAsc" | "createdDesc"
  const [selectedSheet, setSelectedSheet] = useState("");
  const selectedMonth = selectedSheet;
  const setSelectedMonth = setSelectedSheet;

  // ── Add Call Entry dialog state ──
  const [callEntryDialog, setCallEntryDialog] = useState(false);     // step 1: type picker
  const [callEntryType, setCallEntryType] = useState(null);          // chosen call type
  const [programPickerOpen, setProgramPickerOpen] = useState(false); // step 2: program picker (outgoing only)
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
            const cbDate = log.callbackDate.toDate ? log.callbackDate.toDate() : new Date(log.callbackDate);
            cbDate.setHours(0, 0, 0, 0);
            const shouldBeDue = cbDate <= today;
            if (log._callbackDue !== shouldBeDue) { changed = true; return { ...log, _callbackDue: shouldBeDue }; }
          }
          return log;
        });
        return changed ? updated : prev; // Only trigger re-render if something actually changed
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadPrograms = async () => {
    // Ensure the default Incoming Calls program always exists in Firestore
    await ensureIncomingProgram();
    const progs = await getPrograms();
    setPrograms(progs);
  };

  const handleGetNumbers = async () => {
    if (!selectedProgramId) { toast.error("Select a program first."); return; }

    // Check if program has subPrograms and one is selected
    const selectedProgram = programs.find(p => p.id === selectedProgramId);
    if (selectedProgram?.subPrograms?.length > 0 && !selectedSubProgram) {
      toast.error("Please select a specific sheet first.");
      return;
    }
    const currentSheetCount = monthFilteredLogs.length;
    if (currentSheetCount > 0) {
      if (!window.confirm(`You already have ${currentSheetCount} entries in this sheet.\nGet ${requestCount} more contacts?`)) return;
    }
    setIsRequesting(true);
    try {
      const assigned = await assignContactsToAttender(
        selectedProgramId, selectedProgramName, attenderId, attenderName, requestCount, selectedSubProgram
      );
      if (assigned === 0) toast.error("No more available contacts in this program!");
      else {
        toast.success(`${assigned} contacts added to your sheet!`);
        setPage(1);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to get contacts.");
    } finally {
      setIsRequesting(false);
    }
  };

  // ── "Add Call Entry" multi-step flow ──────────────────────
  const openCallEntryDialog = () => {
    setCallEntryDialog(true);
    setCallEntryType(null);
    setPickedProgramId("");
  };

  // Step 1: user picked a call type
  const handleCallTypeSelected = async (type) => {
    setCallEntryType(type);
    setCallEntryDialog(false);

    const isIncoming = type === "incoming" || type === "incoming f";

    if (isIncoming) {
      // Auto-route to dedicated Incoming Calls program with its own sheet tab
      setEditingRow({
        _isNew: true,
        programId: INCOMING_PROGRAM_ID,
        programName: INCOMING_PROGRAM_NAME,
        attenderId,
        attenderName,
        Name: "", Phone: "", Mobile: "", Email: "",
        City: "", State: "", Khoji: "", Source: "", Tags: "",
        "Called For": "",
        callType: type,
        "Sub Program": "Incoming Calls",
        subProgram: "Incoming Calls",
        status: "", remark: "",
      });
    } else {
      // Outgoing — ask which program this belongs to
      setProgramPickerOpen(true);
    }
  };

  // Step 2 (outgoing only): user picked a program
  const handleProgramPicked = () => {
    const prog = programs.find(p => p.id === pickedProgramId);
    if (!prog) return;
    setProgramPickerOpen(false);
    setEditingRow({
      _isNew: true,
      programId: prog.id,
      programName: prog.name,
      attenderId,
      attenderName,
      Name: "", Phone: "", Mobile: "", Email: "",
      City: "", State: "", Khoji: "", Source: "", Tags: "",
      "Called For": "",
      callType: callEntryType,
      "Sub Program": prog.name,
      subProgram: prog.name,
      status: "", remark: "",
    });
  };

  const handleDeleteRow = async (id) => {
    try {
      await updateCallLog(id, { _deleted: true });
      toast.success("Entry removed.");
    } catch (err) {
      toast.error("Failed to remove.");
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
    const countryVal = findValue(log, ["country", "nation"]);
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
      const d = log.callbackDate.toDate ? log.callbackDate.toDate() : new Date(log.callbackDate);
      if (d && !isNaN(d)) {
        callbackDateStr = d.toLocaleDateString("en-IN");
      }
    }

    row["Name"] = nameVal;
    row["Phone"] = phoneVal;
    row["Email"] = emailVal;
    row["City"] = cityVal;
    row["State"] = stateVal;
    row["Khoji"] = khojiVal;
    row["Country"] = countryVal;
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
          "country", "nation", "tags", "tag", "status", "remark", "callbackdate", "sub program",
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
      historyStr = log.history.map(h => `[${new Date(h.timestamp).toLocaleDateString("en-IN")}] ${h.attenderName}: ${h.status} - ${h.remark}`).join(" | ");
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
    XLSX.writeFile(wb, `${attenderName}_${selectedMonth || 'all'}_${new Date().toLocaleDateString("en-CA")}.xlsx`);
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

  // ── Available sheets ──
  const availableSheets = useMemo(() => {
    const sheets = new Set();
    callLogs.forEach(l => {
      if (l._deleted) return;
      const sh = l["Sub Program"] || l.subProgram || "No Tag";
      sheets.add(sh);
    });
    return Array.from(sheets).sort();
  }, [callLogs]);

  useEffect(() => {
    if (availableSheets.length > 0) {
      if (selectedSheet !== "" && !availableSheets.includes(selectedSheet)) {
        setSelectedSheet(availableSheets[0]);
      }
    } else {
      setSelectedSheet("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSheets]);

  // Sync program details with currently selected sheet for "Get Numbers"
  useEffect(() => {
    if (!selectedSheet) return;
    const match = callLogs.find(l => {
      if (l._deleted) return false;
      const sh = l["Sub Program"] || l.subProgram || "No Tag";
      return sh === selectedSheet;
    });
    if (match && match.programId) {
      setSelectedProgramId(match.programId);
      setSelectedProgramName(match.programName || "");
      setSelectedSubProgram(selectedSheet === "No Tag" ? "" : selectedSheet);
    }
  }, [selectedSheet, callLogs]);

  // ── Sheet filtered logs ──
  const monthFilteredLogs = useMemo(() => {
    if (!selectedSheet) return callLogs.filter(l => !l._deleted);
    return callLogs.filter(l => {
      if (l._deleted) return false;
      const sh = l["Sub Program"] || l.subProgram || "No Tag";
      return sh === selectedSheet;
    });
  }, [callLogs, selectedSheet]);

  // ── Stats ──
  const stats = useMemo(() => {
    const active = monthFilteredLogs;
    const total = active.length;
    const called = active.filter(l => l.status).length;
    const interested = active.filter(l => l.status === "Interested").length;
    const regDone = active.filter(l => l.status === "Reg.Done").length;
    const callbacks = active.filter(l => l._callbackDue).length;
    const incoming = active.filter(l => l.callType === "incoming").length;
    const outgoing = active.filter(l => l.callType !== "incoming").length;
    const hotLeads = active.filter(l => l.isHotLead).length;
    return { total, called, interested, regDone, callbacks, incoming, outgoing, hotLeads };
  }, [monthFilteredLogs]);

  // ── Unique values for dropdowns dynamically computed from month data ──
  const uniqueSources = useMemo(() => {
    const set = new Set(SOURCE_OPTIONS);
    monthFilteredLogs.forEach(log => {
      const k = Object.keys(log).find(key => key.toLowerCase().includes("source") || key.toLowerCase().includes("sourse"));
      if (k && log[k]) set.add(String(log[k]).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const uniqueCities = useMemo(() => {
    const set = new Set();
    monthFilteredLogs.forEach(log => {
      const k = Object.keys(log).find(key => key.toLowerCase().includes("city") || key.toLowerCase().includes("location") || key.toLowerCase().includes("khoji city"));
      if (k && log[k]) set.add(String(log[k]).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const uniqueCalledFor = useMemo(() => {
    const set = new Set(CALLED_FOR_OPTIONS);
    monthFilteredLogs.forEach(log => {
      const k = Object.keys(log).find(key => key.toLowerCase().includes("called for") || key.toLowerCase().includes("called_for") || key.toLowerCase().includes("calledfor"));
      if (k && log[k]) set.add(String(log[k]).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const uniqueSubPrograms = useMemo(() => {
    const set = new Set();
    monthFilteredLogs.forEach(log => {
      if (log["Sub Program"]) set.add(String(log["Sub Program"]).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const uniqueObjectionReasons = useMemo(() => {
    const set = new Set();
    monthFilteredLogs.forEach(log => {
      if (log.objectionReason) set.add(String(log.objectionReason).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (filterStatus !== "All") count++;
    if (filterSource !== "All") count++;
    if (filterCity !== "All") count++;
    if (filterCalledFor !== "All") count++;
    if (filterCallType !== "All") count++;
    if (filterSubProgram !== "All") count++;
    if (filterObjectionReason !== "All") count++;
    if (filterCallbackStatus !== "All") count++;
    if (filterCallCount !== "All") count++;
    if (filterGeneralStatus !== "All") count++;
    if (filterAbhivyakti !== "All") count++;
    if (filterKhoji !== "All") count++;
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
    setFilterSource("All");
    setFilterCity("All");
    setFilterCalledFor("All");
    setFilterCallType("All");
    setFilterSubProgram("All");
    setFilterObjectionReason("All");
    setFilterCallbackStatus("All");
    setFilterCallCount("All");
    setFilterGeneralStatus("All");
    setFilterAbhivyakti("All");
    setFilterKhoji("All");
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
    return monthFilteredLogs.filter(log => {
      // 1. Text Search Query
      const q = searchQuery.toLowerCase();
      if (q && !Object.values(log).join(" ").toLowerCase().includes(q)) return false;

      // 2. Quick Status Filter
      if (filterStatus === "Hot Leads" && !log.isHotLead) return false;
      if (filterStatus === "Callback" && !log.callbackDate) return false;
      if (filterStatus === "Follow up" && !(log.callbackDate || log.status === "reminder" || log.status === "Next time")) return false;
      if (filterStatus !== "All" && filterStatus !== "Hot Leads" && filterStatus !== "Callback" && filterStatus !== "Follow up" && log.status !== filterStatus) return false;

      // 3. Source Filter
      if (filterSource !== "All") {
        const k = Object.keys(log).find(key => key.toLowerCase().includes("source") || key.toLowerCase().includes("sourse"));
        if (!k || String(log[k] || "").trim() !== filterSource) return false;
      }

      // 4. Called For Filter
      if (filterCalledFor !== "All") {
        const k = Object.keys(log).find(key => key.toLowerCase().includes("called for") || key.toLowerCase().includes("called_for") || key.toLowerCase().includes("calledfor"));
        if (!k || String(log[k] || "").trim() !== filterCalledFor) return false;
      }

      // 5. City/Location Filter
      if (filterCity !== "All") {
        const k = Object.keys(log).find(key => key.toLowerCase().includes("city") || key.toLowerCase().includes("location") || key.toLowerCase().includes("khoji city"));
        if (!k || String(log[k] || "").trim() !== filterCity) return false;
      }

      // 6. Call Type Filter
      if (filterCallType !== "All") {
        const cType = log.callType || "outgoing";
        if (cType !== filterCallType) return false;
      }

      // 7. Sub Program / Sheet Filter
      if (filterSubProgram !== "All") {
        if (String(log["Sub Program"] || "").trim() !== filterSubProgram) return false;
      }

      // 8. Objection Reason Filter
      if (filterObjectionReason !== "All") {
        if (String(log.objectionReason || "").trim() !== filterObjectionReason) return false;
      }

      // 9. Callback Status Filter
      if (filterCallbackStatus !== "All") {
        if (!log.callbackDate) return false;
        const cbStatus = log.callbackStatus || "pending";
        if (cbStatus !== filterCallbackStatus) return false;
      }

      // 10. Call Count Filter
      if (filterCallCount !== "All") {
        const count = log.history ? log.history.length : (log.status ? 1 : 0);
        if (filterCallCount === "0") {
          if (count !== 0) return false;
        } else if (filterCallCount === "1") {
          if (count !== 1) return false;
        } else if (filterCallCount === "2+") {
          if (count < 2) return false;
        }
      }

      // 10b. General Result Status Filter
      if (filterGeneralStatus !== "All") {
        const quickIsSpecific = filterStatus !== "All" && filterStatus !== "Hot Leads" && filterStatus !== "Callback" && filterStatus !== "Follow up";
        if (!quickIsSpecific && log.status !== filterGeneralStatus) return false;
        if (quickIsSpecific && log.status !== filterGeneralStatus) return false;
      }

      // 10c. Abhivyakti Filter
      if (filterAbhivyakti === "Yes" && log.status !== "Reg.Done") return false;
      if (filterAbhivyakti === "No" && log.status === "Reg.Done") return false;

      // 10d. Khoji Filter
      if (filterKhoji !== "All") {
        const val = getKhojiValue(log);
        const affirmative = isKhojiAffirmative(val);
        if (filterKhoji === "Yes" && !affirmative) return false;
        if (filterKhoji === "No" && affirmative) return false;
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
    monthFilteredLogs, searchQuery, filterStatus, filterSource, filterCalledFor,
    filterCity, filterCallType, filterSubProgram, filterObjectionReason,
    filterCallbackStatus, filterCallCount, filterGeneralStatus, filterAbhivyakti,
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
    "normalizedphone", "contactrefid", "conversionSource", "conversionsource",
    "convertedat", "convertedby", "isassigned"
  ]), []);

  const dynamicCols = useMemo(() => {
    const standardOrder = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Country", "Tags", "Source", "Called For"];
    const allKeysSet = new Set();
    monthFilteredLogs.forEach(log => {
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
      const found = Array.from(allKeysSet).find(k => k.toLowerCase() === col.toLowerCase());
      if (found) {
        allKeysSet.delete(found);
      }
    });

    const sorted = [...standardOrder, ...Array.from(allKeysSet).sort()];
    console.log("[DEBUG] dynamicCols:", sorted);
    return sorted;
  }, [monthFilteredLogs, INTERNAL_KEYS_LOWER]);

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

    monthFilteredLogs.forEach(log => {
      const hist = log.history || [];
      const status = log.status;

      const attemptsCount = hist.length || (status ? 1 : 0);
      totalAttempts += attemptsCount;

      hist.forEach(h => {
        const dStr = new Date(h.timestamp).toLocaleDateString("en-IN");
        dailyActivity[dStr] = (dailyActivity[dStr] || 0) + 1;
      });
      if (hist.length === 0 && status && log.updatedAt) {
        const dStr = log.updatedAt.toDate ? log.updatedAt.toDate().toLocaleDateString("en-IN") : new Date(log.updatedAt).toLocaleDateString("en-IN");
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

    const assignedCount = monthFilteredLogs.length;

    return {
      totalAttempts,
      assignedCount,
      connectedContacts,
      notConnectedContacts,
      registrations,
      infoGiven,
      interested,
      statusChartData,
      objectionChartData,
      dailyChartData,
      connectionRate: assignedCount > 0 ? Math.round((connectedContacts / assignedCount) * 100) : 0,
      registrationRate: assignedCount > 0 ? Math.round((registrations / assignedCount) * 100) : 0,
      callsPerAssign: assignedCount > 0 ? (totalAttempts / assignedCount).toFixed(1) : "0.0"
    };
  }, [monthFilteredLogs]);

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
            <select
              value={selectedProgramId}
              onChange={e => {
                setSelectedProgramId(e.target.value);
                const p = programs.find(p => p.id === e.target.value);
                setSelectedProgramName(p?.name || "");
                setSelectedSubProgram("");
              }}
              className="bg-transparent text-sm font-semibold text-blue-700 focus:outline-none cursor-pointer"
            >
              <option value="">Pick program...</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {programs.find(p => p.id === selectedProgramId)?.subPrograms?.length > 0 && (
              <select
                value={selectedSubProgram}
                onChange={e => setSelectedSubProgram(e.target.value)}
                className="bg-transparent text-sm font-semibold text-blue-700 focus:outline-none cursor-pointer border-l border-blue-200 pl-2 ml-1"
              >
                <option value="" disabled hidden>Pick a sheet...</option>
                {programs.find(p => p.id === selectedProgramId).subPrograms.map(sp => (
                  <option key={sp} value={sp}>{sp}</option>
                ))}
              </select>
            )}
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

          <button onClick={openCallEntryDialog} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20">
            <PhoneIncoming size={15} /> Add Call Entry
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#217346] text-[#217346] rounded-xl font-bold text-sm hover:bg-[#217346] hover:text-white transition">
            <Download size={15} /> Export
          </button>
        </div>
      </header>

      {/* Sheet Selector */}
      {availableSheets.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-3 shrink-0">
          <FileSpreadsheet size={14} className="text-indigo-500 shrink-0" />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0">Sheet</span>
          <select
            value={selectedSheet}
            onChange={e => {
              const val = e.target.value;
              setSelectedSheet(val);
              setPage(1);
              setFilterStatus("All");
              setFilterSource("All"); setFilterCity("All"); setFilterCalledFor("All");
              setFilterCallType("All"); setFilterSubProgram("All"); setFilterObjectionReason("All");
              setFilterCallbackStatus("All"); setFilterCallCount("All"); setFilterGeneralStatus("All");
              setFilterAbhivyakti("All"); setFilterDateType("All"); setFilterDateRange("All");
              setCustomDateFrom(""); setCustomDateTo(""); setSearchQuery("");
            }}
            className="px-4 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-black text-sm text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer min-w-[180px]"
          >
            <option value="">— All Sheets —</option>
            {availableSheets.map(sh => (
              <option key={sh} value={sh}>{sh}</option>
            ))}
          </select>
          <span className="text-xs font-bold text-gray-400 shrink-0">
            {monthFilteredLogs.length} contacts{selectedSheet === "" ? " · all sheets" : ""}
          </span>
        </div>
      )}

      {stats.callbacks > 0 && filterStatus !== "Callback" && (
        <div className="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-3 flex items-center justify-between shrink-0 shadow-lg shadow-red-600/10 cursor-pointer" onClick={() => { setFilterStatus("Callback"); setPage(1); }}>
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center animate-pulse">
              <AlertCircle size={22} />
            </div>
            <div>
              <p className="font-black text-sm leading-none">You have {stats.callbacks} callback{stats.callbacks > 1 ? "s" : ""} due today or overdue!</p>
              <p className="text-white/70 text-xs font-medium mt-0.5">Click here to view them. These people are waiting for your call.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl text-white font-black text-xs">
            <Phone size={14} /> Call Now
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3 overflow-x-auto flex-1">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shrink-0">
            <Search size={14} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="bg-transparent text-sm outline-none w-36"
            />
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shrink-0">
            <SlidersHorizontal size={13} className="text-gray-400" />
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setPage(1); }}
              className="bg-transparent text-xs font-bold text-gray-600 focus:outline-none cursor-pointer"
            >
              <option value="activityDesc">Sort: Latest Activity</option>
              <option value="createdDesc">Sort: Date Assigned</option>
              <option value="nameAsc">Sort: Name (A-Z)</option>
            </select>
          </div>

          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
              showAdvancedFilters || activeFiltersCount > 0
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal size={13} />
            Advanced Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </button>

          <div className="flex items-center gap-2">
            {["All", "Hot Leads", "Follow up", "Callback", "Interested", "Reg.Done", "Not interested", "NA"].map(s => (
              <button
                key={s}
                onClick={() => { setFilterStatus(s); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${filterStatus === s
                  ? s === "Hot Leads" ? "bg-orange-500 text-white shadow" : s === "Follow up" ? "bg-blue-600 text-white shadow" : "bg-[#217346] text-white shadow"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                {s === "Hot Leads" && <Flame size={12} className={filterStatus === s ? "text-white" : "text-orange-500"} />}
                {s === "Follow up" && <Clock size={12} className={filterStatus === s ? "text-white" : "text-blue-500"} />}
                {s}
              </button>
            ))}
          </div>
        </div>

        {activeFiltersCount > 0 && (
          <button
            onClick={handleClearAllFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div className="bg-white border-b border-gray-200 px-6 py-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 shrink-0 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <Tag size={11} className="text-amber-500" /> Source
            </label>
            <select
              value={filterSource}
              onChange={e => { setFilterSource(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Sources</option>
              {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <Phone size={11} className="text-blue-500" /> Called For
            </label>
            <select
              value={filterCalledFor}
              onChange={e => { setFilterCalledFor(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Purposes</option>
              {uniqueCalledFor.map(cf => <option key={cf} value={cf}>{cf}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <MapPin size={11} className="text-red-500" /> City / Location
            </label>
            <select
              value={filterCity}
              onChange={e => { setFilterCity(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Cities</option>
              {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <PhoneOutgoing size={11} className="text-emerald-500" /> Call Type
            </label>
            <select
              value={filterCallType}
              onChange={e => { setFilterCallType(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Types</option>
              <option value="outgoing">Outgoing</option>
              <option value="incoming">Incoming</option>
              <option value="outgoing f">Outgoing F</option>
              <option value="incoming f">Incoming F</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <FileText size={11} className="text-indigo-500" /> Sheet Name
            </label>
            <select
              value={filterSubProgram}
              onChange={e => { setFilterSubProgram(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Sheets</option>
              {uniqueSubPrograms.map(sp => <option key={sp} value={sp}>{sp}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <AlertCircle size={11} className="text-rose-500" /> Objection
            </label>
            <select
              value={filterObjectionReason}
              onChange={e => { setFilterObjectionReason(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Reasons</option>
              {uniqueObjectionReasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <Clock size={11} className="text-purple-500" /> Callback Status
            </label>
            <select
              value={filterCallbackStatus}
              onChange={e => { setFilterCallbackStatus(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Callbacks</option>
              <option value="pending">⏳ Pending</option>
              <option value="done">✅ Done</option>
              <option value="rescheduled">🔄 Rescheduled</option>
              <option value="cancelled">❌ Cancelled</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <User size={11} className="text-gray-500" /> Call Count
            </label>
            <select
              value={filterCallCount}
              onChange={e => { setFilterCallCount(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Counts</option>
              <option value="0">0 Calls (Never Called)</option>
              <option value="1">1 Call</option>
              <option value="2+">2+ Calls</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <CheckCircle2 size={11} className="text-indigo-500" /> Gen. Status
            </label>
            <select
              value={filterGeneralStatus}
              onChange={e => { setFilterGeneralStatus(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.filter(opt => opt !== "Reg.Done").map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <Flame size={11} className="text-emerald-500" /> Abhivyakti
            </label>
            <select
              value={filterAbhivyakti}
              onChange={e => { setFilterAbhivyakti(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All</option>
              <option value="Yes">Yes (Registered)</option>
              <option value="No">No (Not Registered)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <CheckSquare size={11} className="text-pink-500" /> Khoji Status
            </label>
            <select
              value={filterKhoji}
              onChange={e => { setFilterKhoji(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Contacts</option>
              <option value="Yes">Yes (Khoji)</option>
              <option value="No">No (New)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <CalendarDays size={11} className="text-teal-500" /> Filter By Date
            </label>
            <select
              value={filterDateType}
              onChange={e => {
                setFilterDateType(e.target.value);
                setPage(1);
                if (e.target.value === "All") {
                  setFilterDateRange("All");
                  setCustomDateFrom("");
                  setCustomDateTo("");
                  setCustomTimeFrom("");
                  setCustomTimeTo("");
                }
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">No Date Filter</option>
              <option value="lastCalledAt">Last Called Date</option>
              <option value="createdAt">Assignment Date</option>
            </select>
          </div>

          {filterDateType !== "All" && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                <Calendar size={11} className="text-teal-500" /> Quick Range
              </label>
              <select
                value={filterDateRange}
                onChange={e => { setFilterDateRange(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
              >
                <option value="All">All Dates</option>
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="This Week">Last 7 Days</option>
                <option value="Custom">Custom Range</option>
              </select>
            </div>
          )}

          {filterDateType !== "All" && (
            <div className="col-span-2 grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest leading-none flex items-center gap-1">
                  <Calendar size={10} /> After Date
                </label>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={e => {
                    setCustomDateFrom(e.target.value);
                    if (e.target.value) setFilterDateRange("Custom");
                    setPage(1);
                  }}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition font-sans ${
                    customDateFrom ? "bg-teal-50 border-teal-300" : "bg-gray-50 border-gray-200"
                  }`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest leading-none flex items-center gap-1">
                  <Calendar size={10} /> Before Date
                </label>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={e => {
                    setCustomDateTo(e.target.value);
                    if (e.target.value) setFilterDateRange("Custom");
                    setPage(1);
                  }}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition font-sans ${
                    customDateTo ? "bg-teal-50 border-teal-300" : "bg-gray-50 border-gray-200"
                  }`}
                />
              </div>
            </div>
          )}

          {filterDateType !== "All" && (
            <div className="col-span-2 grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                  <Clock size={10} /> After Time
                </label>
                <input
                  type="time"
                  value={customTimeFrom}
                  onChange={e => { setCustomTimeFrom(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition font-sans cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                  <Clock size={10} /> Before Time
                </label>
                <input
                  type="time"
                  value={customTimeTo}
                  onChange={e => { setCustomTimeTo(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition font-sans cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      )}


      {/* ── Step 1: Call Type Picker Dialog ───────────────────── */}
      {callEntryDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[340px] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-black text-gray-900">Add Call Entry</h2>
                <p className="text-xs text-gray-400 font-medium mt-0.5">What type of call is this?</p>
              </div>
              <button onClick={() => setCallEntryDialog(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { type: "incoming",   label: "Incoming",   icon: <PhoneIncoming size={18} />,  color: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" },
                { type: "outgoing",   label: "Outgoing",   icon: <PhoneOutgoing size={18} />,  color: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" },
                { type: "incoming f", label: "Incoming F", icon: <PhoneIncoming size={18} />,  color: "bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100" },
                { type: "outgoing f", label: "Outgoing F", icon: <PhoneOutgoing size={18} />,  color: "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" },
              ].map(({ type, label, icon, color }) => (
                <button
                  key={type}
                  onClick={() => handleCallTypeSelected(type)}
                  className={`flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 font-bold text-sm transition ${color}`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Program Picker Dialog (outgoing only) ─────── */}
      {programPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[360px] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-black text-gray-900">Select Program</h2>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Which sheet does this outgoing call belong to?</p>
              </div>
              <button onClick={() => setProgramPickerOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <select
              value={pickedProgramId}
              onChange={e => setPickedProgramId(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition mb-4"
            >
              <option value="">Pick a program...</option>
              {programs.filter(p => p.id !== INCOMING_PROGRAM_ID).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={handleProgramPicked}
              disabled={!pickedProgramId}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 transition"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingRow && (
        <EditModal
          row={editingRow}
          attenderName={attenderName}
          onSave={(updated, isOptimistic) => {
            setCallLogs(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
            if (!isOptimistic) setEditingRow(null);
          }}
          onDelete={handleDeleteRow}
          onClose={() => setEditingRow(null)}
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
        <MyPerformanceDashboard stats={performanceStats} />
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={scrollRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            className="flex-1 overflow-auto cursor-grab" style={{ userSelect: "none" }}>
            <table className="table-auto w-full text-left border-collapse text-sm">
              <thead className="bg-[#f8f9fa] border-b border-gray-300 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 text-xs font-black text-gray-600 uppercase w-12 border-r border-gray-200 bg-[#e9ecef]">#</th>
                  {dynamicCols.map(col => (
                    <th key={col} className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px] whitespace-nowrap">{col}</th>
                  ))}
                  <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[100px]">Type</th>
                  <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px]">Status</th>
                  <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[300px]">Remark</th>
                  <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase min-w-[120px]">Callback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map((log, idx) => {
                  const isDue = log._callbackDue;
                  const isHot = log.isHotLead;
                  const hasFollowup = log.callbackDate || log.status === "reminder" || log.status === "Next time";
                  const isCalled = !!log.status;

                  let rowBg = "hover:bg-green-50/50";
                  if (isDue) {
                    rowBg = "bg-red-100 border-l-[6px] border-l-red-600 shadow-sm";
                  } else if (isHot) {
                    rowBg = "bg-orange-100 border-l-[6px] border-l-orange-500";
                  } else if (hasFollowup) {
                    rowBg = "bg-blue-100 border-l-[6px] border-l-blue-500";
                  } else if (isCalled) {
                    rowBg = "bg-emerald-50 border-l-[6px] border-l-emerald-500";
                  }

                  return (
                    <tr
                      key={log.id}
                      className={`cursor-pointer transition-colors ${rowBg}`}
                      onClick={() => {
                        if (!didDrag.current) {
                          console.log("[DEBUG] Selected Row:", log);
                          setEditingRow(log);
                        }
                      }}
                    >
                      <td className="py-4 px-4 text-xs font-bold text-gray-400 text-center bg-[#f8f9fa] border-r border-gray-200 align-top">
                        {(page - 1) * rowsPerPage + idx + 1}
                      </td>
                      {dynamicCols.map((col, ci) => {
                        const getVal = (item, column) => {
                          const standardOrder = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Country", "Tags", "Source", "Called For"];
                          if (standardOrder.includes(column)) {
                            return getFieldWithFallback(item, column);
                          }
                          if (item[column] !== undefined && item[column] !== null) return String(item[column]);
                          const keys = Object.keys(item);
                          const matchingKey = keys.find(k => k.toLowerCase() === column.toLowerCase());
                          return matchingKey ? String(item[matchingKey]) : "";
                        };
                        const val = getVal(log, col);
                        const isName = col.toLowerCase().includes("name") || col.toLowerCase().includes("lead");

                        const logKeys = Object.keys(log);
                        const phoneKey = logKeys.find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
                          || logKeys.find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
                        const phone = phoneKey ? normalizePhone(log[phoneKey]) : "";
                        const isDupInProg = isName && phone && duplicatePhoneMap[log.programId || "incoming"]?.[phone] > 1;

                        return (
                          <td key={col} className={`py-4 px-4 border-r border-gray-100 text-sm ${isName ? "font-bold text-gray-900" : "text-gray-700"} min-w-[140px] whitespace-normal align-top`}>
                            {ci === 0 && log.isHotLead && <Flame size={15} className="text-orange-500 shrink-0 inline mr-1" fill="currentColor" />}
                            {val || "\u2014"}
                            {isDupInProg && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                                Same Person
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-4 px-4 border-r border-gray-100 align-top">
                        <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-xl ${log.callType === "incoming" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                          {log.callType || "outgoing"}
                        </span>
                      </td>
                      <td className="py-4 px-4 border-r border-gray-100 align-top">
                        {(() => {
                          const s = log.status || log.Status;
                          const badge = getStatusBadge(s);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${badge.bg} ${badge.text}`}>
                              {log.isHotLead && <Flame size={10} className="inline" fill="currentColor" />}
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4 border-r border-gray-100 text-gray-700 text-sm leading-relaxed min-w-[300px] whitespace-normal align-top">
                        {log.remark || log.Remark || <span className="text-gray-200 font-medium">\u2014</span>}
                      </td>
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        {getCallbackStr(log) ? (
                          <div className="flex flex-col gap-1">
                            {isDue ? (
                              <span className="text-sm font-black text-red-600 flex items-center gap-1.5">
                                <Clock size={14} className="animate-pulse" /> {getCallbackStr(log)}
                              </span>
                            ) : (
                              <span className="text-sm font-semibold text-amber-600">{getCallbackStr(log)}</span>
                            )}
                            {log.callbackStatus && (
                              <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded w-fit ${log.callbackStatus === "done" ? "bg-emerald-100 text-emerald-700" :
                                log.callbackStatus === "rescheduled" ? "bg-blue-100 text-blue-700" :
                                  log.callbackStatus === "cancelled" ? "bg-red-100 text-red-600" :
                                    "bg-amber-100 text-amber-700"
                                }`}>
                                {log.callbackStatus === "done" ? "✅ Done" : log.callbackStatus === "rescheduled" ? "🔄 Rescheduled" : log.callbackStatus === "cancelled" ? "❌ Cancelled" : "⏳ Pending"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-200 font-medium">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={20}>
                      <div className="py-24 text-center pb-32">
                        <p className="text-xl font-bold text-gray-400">
                          {callLogs.length === 0
                            ? "Pick a program above and click 'Get Numbers' to start calling, or add an incoming call."
                            : "No entries match filters."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer / Pagination */}
          <div className="bg-[#217346] text-white px-6 py-3 flex items-center justify-between shrink-0 text-sm font-bold shadow-inner">
            <span>Total: {filteredLogs.length} entries · Called: {stats.called} · Pending: {stats.total - stats.called}</span>
            <div className="flex items-center gap-4">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center disabled:opacity-30 transition cursor-pointer">
                <ChevronLeft size={18} />
              </button>
              <span>Page {page} / {totalPages || 1}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center disabled:opacity-30 transition cursor-pointer">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
