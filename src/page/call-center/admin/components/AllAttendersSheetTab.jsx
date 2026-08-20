import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronDown,
  Check,
  Download,
  FileSpreadsheet,
  Users,
  Phone,
  PhoneOff,
  Flame,
  Clock,
  Tag,
  Calendar,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Eye,
  Filter,
  Layers,
  ArrowUpDown,
  UserCheck,
  Hash,
  UserPlus,
  Plus,
  PhoneCall,
  MessageSquare
} from "lucide-react";
import { EditModal } from "../../attender/components/EditModal";
import {
  getFieldWithFallback,
  isKhojiAffirmative,
  isKhojiNegative,
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  OBJECTION_REASONS,
  CALL_TYPE_OPTIONS,
  isUnansweredCallback
} from "../../attender/utils.js";
import { parseTimestamp, cleanExportRow, getAllCallEntries, getCallsDoneCount, getContactPhone } from "../utils.jsx";
import { normalizePhone, verifyCallCenterCache, addIncomingCallLog } from "../../../../lib/db";

// ── MultiSelect Dropdown Subcomponent ───────────────────────────────────────
function MultiSelectDropdown({ options, selected = [], onChange, placeholder, icon: Icon, allLabel = "All" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const normalizedOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    return options.map(o => {
      if (o && typeof o === "object") {
        const val = o.value !== undefined ? o.value : (o.id !== undefined ? o.id : o.label);
        const lbl = o.label !== undefined ? o.label : (o.name !== undefined ? o.name : String(val || ""));
        return { value: val, label: String(lbl) };
      }
      return { value: o, label: String(o || "") };
    });
  }, [options]);

  const filtered = normalizedOptions.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.length === 0 || selected.length === normalizedOptions.length;

  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(normalizedOptions.map(o => o.value));
  };

  const label = allSelected
    ? allLabel
    : selected.length === 1
      ? (normalizedOptions.find(o => o.value === selected[0])?.label || "1 selected")
      : `${selected.length} selected`;

  const hasFilterApplied = selected.length > 0 && selected.length < normalizedOptions.length;

  return (
    <div className="relative min-w-[105px] sm:min-w-[115px]" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 border rounded-xl font-bold text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full whitespace-nowrap transition-all duration-200 cursor-pointer ${
          hasFilterApplied
            ? "bg-indigo-50 border-indigo-300 text-indigo-900 font-extrabold shadow-indigo-100"
            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {Icon && <Icon size={13} className={hasFilterApplied ? "text-indigo-600" : "text-gray-400"} />}
          <span className="truncate text-left font-bold">{label}</span>
        </div>
        {hasFilterApplied && (
          <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
            {selected.length}
          </span>
        )}
        <ChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""} ${hasFilterApplied ? "text-indigo-600" : "text-gray-400"}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-2xl w-full min-w-[220px] max-w-[300px] overflow-hidden left-0 sm:left-auto animate-slide-down-scale origin-top-left">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2 bg-gray-50/50">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              className="w-full text-xs focus:outline-none bg-transparent font-medium"
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <X size={12} className="text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={toggleAll}
              className="w-full px-3.5 py-1.5 text-left text-xs font-black text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 transition"
            >
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${allSelected ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                {allSelected && <Check size={10} className="text-white stroke-[3]" />}
              </span>
              {allLabel}
            </button>
            {filtered.map(o => {
              const active = selected.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  className="w-full px-3.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${active ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                    {active && <Check size={10} className="text-white stroke-[3]" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3.5 py-3 text-center text-xs text-gray-400 font-semibold">
                No matching options
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Collapsed Tags Pill Render ───────────────────────────────────────────────
function CollapsedTags({ tags }) {
  const [expanded, setExpanded] = useState(false);
  if (!tags || tags.length === 0) return <span className="text-gray-300">—</span>;

  if (tags.length <= 2 || expanded) {
    return (
      <div
        className="flex flex-col gap-1 items-start"
        onClick={(e) => {
          if (expanded) {
            e.stopPropagation();
            setExpanded(false);
          }
        }}
      >
        {tags.map((t, idx) => (
          <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
            #{t}
          </span>
        ))}
        {expanded && (
          <button className="text-[10px] text-indigo-600 font-extrabold underline mt-0.5">
            Less
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      {tags.slice(0, 2).map((t, idx) => (
        <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
          #{t}
        </span>
      ))}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
        }}
        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-700 border border-gray-200 transition whitespace-nowrap"
      >
        +{tags.length - 2} more
      </button>
    </div>
  );
}

// ── AllAttendersSheetTab Main Component ─────────────────────────────────────
export default function AllAttendersSheetTab({
  callLogs = [],
  attenders = [],
  programs = [],
  selectedMonth,
  setSelectedMonth,
  monthOptions = [],
  settingsOptions = {},
  callLogsLoading = false
}) {
  // Drag scroll ref
  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const didDrag = useRef(false);

  const onMouseDown = (e) => {
    isDragging.current = true;
    didDrag.current = false;
    startX.current = e.pageX - (scrollRef.current ? scrollRef.current.offsetLeft : 0);
    scrollLeft.current = scrollRef.current ? scrollRef.current.scrollLeft : 0;
    if (scrollRef.current) scrollRef.current.style.cursor = "grabbing";
  };
  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    didDrag.current = true;
    e.preventDefault();
    const x = e.pageX - (scrollRef.current ? scrollRef.current.offsetLeft : 0);
    const walk = (x - startX.current) * 1.5;
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };
  const onMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };
  const onMouseLeave = () => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };

  // State management
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedAttenderIds, setSelectedAttenderIds] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedCalledFors, setSelectedCalledFors] = useState([]);
  const [selectedCallTypes, setSelectedCallTypes] = useState([]);
  const [selectedSubPrograms, setSelectedSubPrograms] = useState([]);
  const [selectedObjections, setSelectedObjections] = useState([]);
  const [selectedCallbackStatuses, setSelectedCallbackStatuses] = useState([]);
  const [selectedCallCounts, setSelectedCallCounts] = useState([]);
  const [selectedGeneralStatuses, setSelectedGeneralStatuses] = useState([]);
  const [selectedKhojiStatuses, setSelectedKhojiStatuses] = useState([]);
  const [filterStatus, setFilterStatus] = useState("All"); // All, Hot Leads, Follow up, Today Activity, Reg.Done, Interested, Pending

  // Date filters (defaults to "This Month")
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    const yr = d.getFullYear();
    const mn = String(d.getMonth() + 1).padStart(2, "0");
    return `${yr}-${mn}-01`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    const yr = d.getFullYear();
    const mn = d.getMonth();
    const lastDayNum = new Date(yr, mn + 1, 0).getDate();
    const mnStr = String(mn + 1).padStart(2, "0");
    return `${yr}-${mnStr}-${lastDayNum}`;
  });

  // Table options
  const [sortBy, setSortBy] = useState("activityDesc"); // activityDesc, createdDesc, nameAsc, attenderAsc
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingRow, setEditingRow] = useState(null);

  // Hidden columns state
  const allPossibleCols = [
    "Attender",
    "Name",
    "Phone",
    "Mobile",
    "Email",
    "City",
    "State",
    "Khoji",
    "Tags",
    "Source",
    "Called For",
    "Sub Program",
    "Type",
    "Calls Done",
    "Status",
    "Remark",
    "Callback"
  ];
  const DEFAULT_HIDDEN_COLS = ["Attender", "Phone", "Mobile", "Email", "City", "State", "Tags", "Sub Program", "Calls Done", "Callback"];

  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      const saved = localStorage.getItem("admin_hidden_cols");
      return saved ? JSON.parse(saved) : DEFAULT_HIDDEN_COLS;
    } catch {
      return DEFAULT_HIDDEN_COLS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("admin_hidden_cols", JSON.stringify(hiddenColumns));
    } catch (e) {
      console.error(e);
    }
  }, [hiddenColumns]);

  // Flattened entries for multi-attender support
  const flattenedLogs = useMemo(() => {
    const list = [];
    callLogs.forEach(log => {
      if (log._deleted) return;

      const nameKey = Object.keys(log).find(k => ["name", "lead name", "caller name", "lead"].includes(k.toLowerCase()));
      const contactName = nameKey ? log[nameKey] : (log.Name || log.name || "Unknown");

      const contactPhone = getContactPhone(log) || log.Phone || log.Mobile || log.phone || log.mobile || "";

      const sourceKey = Object.keys(log).find(k => ["source", "sourse", "source of information", "source of informiton"].includes(k.toLowerCase()));
      const sourceVal = sourceKey ? String(log[sourceKey] || "").trim() : (log.Source || log.source || "");

      const calledForKey = Object.keys(log).find(k => ["called for", "called_for", "calledfor"].includes(k.toLowerCase()));
      const calledForVal = calledForKey ? String(log[calledForKey] || "").trim() : (log["Called For"] || log.calledFor || "");

      const khojiKey = Object.keys(log).find(k => ["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani"].includes(k.toLowerCase()));
      const khojiVal = log.Khoji || (khojiKey ? String(log[khojiKey] || "").trim() : "");

      const cityKey = Object.keys(log).find(k => ["city", "location", "khoji city", "place"].includes(k.toLowerCase()));
      const cityVal = log.City || (cityKey ? String(log[cityKey] || "").trim() : "");

      const stateKey = Object.keys(log).find(k => ["state", "province", "region"].includes(k.toLowerCase()));
      const stateVal = log.State || (stateKey ? String(log[stateKey] || "").trim() : "");

      const emailKey = Object.keys(log).find(k => ["email", "mail", "e-mail"].includes(k.toLowerCase()));
      const emailVal = log.Email || (emailKey ? String(log[emailKey] || "").trim() : "");

      // If contact has attenderStates (multi-attender assignment)
      if (log.attenderStates && Object.keys(log.attenderStates).length > 0) {
        Object.entries(log.attenderStates).forEach(([attId, state]) => {
          list.push({
            ...log,
            id: `${log.id}_${attId}`,
            contactId: log.id,
            Name: contactName,
            Phone: contactPhone,
            Email: emailVal,
            City: cityVal,
            State: stateVal,
            Khoji: khojiVal,
            Source: state.Source || state.source || sourceVal,
            "Called For": state["Called For"] || state.calledFor || calledForVal,
            attenderId: attId,
            attenderName: state.attenderName || log.attenderName || "Unknown Attender",
            status: state.status || log.status || "Pending",
            remark: state.remark || log.remark || "",
            callType: state.callType || log.callType || "outgoing",
            callbackDate: state.callbackDate || log.callbackDate || null,
            callbackStatus: state.callbackStatus || log.callbackStatus || null,
            lastCalledAt: state.lastCalledAt || log.lastCalledAt || null,
            history: state.history || log.history || []
          });
        });
      } else {
        list.push({
          ...log,
          contactId: log.id,
          Name: contactName,
          Phone: contactPhone,
          Email: emailVal,
          City: cityVal,
          State: stateVal,
          Khoji: khojiVal,
          Source: sourceVal,
          "Called For": calledForVal,
          attenderId: log.attenderId || "unassigned",
          attenderName: log.attenderName || log.assignedName || "Unassigned",
          status: log.status || "Pending",
          remark: log.remark || "",
          callType: log.callType || "outgoing",
          callbackDate: log.callbackDate || null,
          callbackStatus: log.callbackStatus || null,
          lastCalledAt: log.lastCalledAt || null,
          history: log.history || []
        });
      }
    });
    return list;
  }, [callLogs]);

  // Dropdown options
  const attenderOptions = useMemo(() => {
    const set = new Set();
    flattenedLogs.forEach(l => {
      if (l.attenderName) set.add(JSON.stringify({ id: l.attenderId, name: l.attenderName }));
    });
    attenders.forEach(a => {
      if (a.id && a.name) set.add(JSON.stringify({ id: a.id, name: a.name }));
    });
    return Array.from(set).map(str => {
      const obj = JSON.parse(str);
      return { value: obj.id, label: obj.name };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [flattenedLogs, attenders]);

  const tagOptions = useMemo(() => {
    const set = new Set();
    programs.forEach(p => p.name && set.add(p.name));
    flattenedLogs.forEach(l => {
      if (Array.isArray(l.tags)) l.tags.forEach(t => t && set.add(String(t).trim()));
      if (l.Tags) String(l.Tags).split(",").forEach(t => t.trim() && set.add(t.trim()));
      if (l.programName) set.add(l.programName);
    });
    return Array.from(set).sort().map(t => ({ value: t, label: `#${t}` }));
  }, [programs, flattenedLogs]);

  const sourceOptions = useMemo(() => {
    const set = new Set(SOURCE_OPTIONS);
    if (Array.isArray(settingsOptions.sourceOptions)) {
      settingsOptions.sourceOptions.forEach(s => s && set.add(s));
    }
    flattenedLogs.forEach(l => {
      if (l.Source) set.add(String(l.Source).trim());
      if (l.source) set.add(String(l.source).trim());
    });
    return Array.from(set).filter(Boolean).sort().map(s => ({ value: s, label: s }));
  }, [flattenedLogs, settingsOptions]);

  const calledForOptions = useMemo(() => {
    const set = new Set(CALLED_FOR_OPTIONS);
    if (Array.isArray(settingsOptions.calledForOptions)) {
      settingsOptions.calledForOptions.forEach(cf => cf && set.add(cf));
    }
    flattenedLogs.forEach(l => {
      const val = l["Called For"] || l.calledFor;
      if (val) String(val).split(",").forEach(x => x.trim() && set.add(x.trim()));
    });
    return Array.from(set).filter(Boolean).sort().map(cf => ({ value: cf, label: cf }));
  }, [flattenedLogs, settingsOptions]);

  const statusOptions = useMemo(() => {
    const set = new Set(STATUS_OPTIONS);
    if (Array.isArray(settingsOptions.statusOptions)) {
      settingsOptions.statusOptions.forEach(s => s && set.add(s));
    }
    flattenedLogs.forEach(l => {
      if (l.status) set.add(l.status);
    });
    return Array.from(set).filter(Boolean).sort().map(s => ({ value: s, label: s }));
  }, [flattenedLogs, settingsOptions]);

  const callTypeOptions = [
    { value: "outgoing", label: "Outgoing" },
    { value: "incoming", label: "Incoming" },
    { value: "outgoing f", label: "Outgoing Forward" },
    { value: "incoming f", label: "Incoming Forward" }
  ];

  const khojiOptions = [
    { value: "Yes", label: "Yes (Khoji)" },
    { value: "No", label: "No (New)" },
    { value: "Dew drop khoji", label: "Dew drop khoji" }
  ];

  // Primary filtering logic
  const filteredLogs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return flattenedLogs.filter(log => {
      // Global Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const name = (log.Name || "").toLowerCase();
        const phone = (log.Phone || log.Mobile || getContactPhone(log) || "").toLowerCase();
        const phoneClean = phone.replace(/\D/g, "");
        const queryClean = query.replace(/\D/g, "");
        const email = (log.Email || "").toLowerCase();
        const city = (log.City || "").toLowerCase();
        const state = (log.State || "").toLowerCase();
        const remark = (log.remark || "").toLowerCase();
        const attender = (log.attenderName || "").toLowerCase();
        const source = (log.Source || log.source || "").toLowerCase();
        const calledFor = (log["Called For"] || log.calledFor || "").toLowerCase();

        const matches = name.includes(query) ||
          phone.includes(query) ||
          (queryClean.length >= 4 && phoneClean.includes(queryClean)) ||
          email.includes(query) ||
          city.includes(query) ||
          state.includes(query) ||
          remark.includes(query) ||
          attender.includes(query) ||
          source.includes(query) ||
          calledFor.includes(query);

        if (!matches) return false;
      }

      // Attender Filter
      if (selectedAttenderIds.length > 0) {
        if (!selectedAttenderIds.includes(log.attenderId)) return false;
      }

      // Tags Filter
      if (selectedTags.length > 0) {
        const tagsArr = Array.isArray(log.tags) ? log.tags.map(t => String(t).trim()) : [];
        if (log.Tags) String(log.Tags).split(",").forEach(t => tagsArr.push(t.trim()));
        if (log.programName) tagsArr.push(log.programName);

        const hasTag = selectedTags.some(t => tagsArr.includes(t));
        if (!hasTag) return false;
      }

      // Source Filter
      if (selectedSources.length > 0) {
        const s = log.Source || log.source || "";
        if (!selectedSources.includes(s)) return false;
      }

      // Called For Filter
      if (selectedCalledFors.length > 0) {
        const cf = log["Called For"] || log.calledFor || "";
        const cfArr = String(cf).split(",").map(x => x.trim()).filter(Boolean);
        const matches = cfArr.some(x => selectedCalledFors.includes(x));
        if (!matches) return false;
      }

      // Call Type Filter
      if (selectedCallTypes.length > 0) {
        const ct = (log.callType || "outgoing").toLowerCase();
        if (!selectedCallTypes.includes(ct)) return false;
      }

      // Calls Done Filter
      if (selectedCallCounts.length > 0) {
        const count = getCallsDoneCount(log);
        const matches = selectedCallCounts.some(opt => {
          if (opt === "0 Calls (Uncalled)" || opt === "0 Calls") return count === 0;
          if (opt === "1 Call") return count === 1;
          if (opt === "2 Calls") return count === 2;
          if (opt === "3 Calls") return count === 3;
          if (opt === "4+ Calls") return count >= 4;
          return false;
        });
        if (!matches) return false;
      }

      // General Status Filter (Multi-select)
      if (selectedGeneralStatuses.length > 0) {
        const st = log.status || "Pending";
        if (!selectedGeneralStatuses.includes(st)) return false;
      }

      // Khoji Status Filter
      if (selectedKhojiStatuses.length > 0) {
        const kVal = log.Khoji;
        const isAff = isKhojiAffirmative(kVal);
        const isDew = String(kVal || "").toLowerCase().includes("dew d") || String(kVal || "").toLowerCase().includes("dewdrop");
        const isNo = isKhojiNegative(kVal) || !kVal;

        let match = false;
        if (selectedKhojiStatuses.includes("Yes") && isAff && !isDew) match = true;
        if (selectedKhojiStatuses.includes("No") && isNo) match = true;
        if (selectedKhojiStatuses.includes("Dew drop khoji") && isDew) match = true;
        if (!match) return false;
      }

      // Quick Status Presets
      if (filterStatus === "Hot Leads" && !log.isHotLead) return false;
      if (filterStatus === "Follow up" && !(log.callbackDate || log.status === "reminder" || log.status === "Next time")) return false;
      if (filterStatus === "Unanswered Callback" && !isUnansweredCallback(log)) return false;
      if (filterStatus === "Reg.Done" && log.status !== "Reg.Done") return false;
      if (filterStatus === "Interested" && log.status !== "Interested") return false;
      if (filterStatus === "Pending" && (log.status && log.status !== "Pending")) return false;

      if (filterStatus === "Today Activity") {
        const lastCall = parseTimestamp(log.lastCalledAt);
        if (!lastCall || lastCall < today) return false;
      }
      if (filterStatus === "Callback") {
        if (!log.callbackDate) return false;
        const cbDate = parseTimestamp(log.callbackDate);
        if (!cbDate) return false;
      }

      // Date Range Filter (dateFrom to dateTo)
      if (dateFrom || dateTo) {
        const targetDate = parseTimestamp(log.lastCalledAt || log.updatedAt);
        if (dateFrom) {
          if (!targetDate || isNaN(targetDate.getTime())) return false;
          const fromD = new Date(dateFrom + "T00:00:00");
          if (targetDate < fromD) return false;
        }
        if (dateTo) {
          if (!targetDate || isNaN(targetDate.getTime())) return false;
          const toD = new Date(dateTo + "T23:59:59");
          if (targetDate > toD) return false;
        }
      }

      return true;
    });
    console.log(`[AllAttendersSheetTab DEBUG] total flattened:`, flattenedLogs.length, `-> filtered:`, res.length, `(filterStatus: "${filterStatus}", dateFrom: ${dateFrom}, dateTo: ${dateTo})`);
    res.forEach((log, idx) => {
      console.log(`  #${idx+1} [AllAttendersSheetTab MATCH] ${log.Name} (${log.Phone}) | status: "${log.status}" | attender: "${log.attenderName}" | lastCalledAt: ${log.lastCalledAt} | createdAt: ${log.createdAt}`);
    });
    return res;
  }, [
    flattenedLogs,
    searchQuery,
    selectedAttenderIds,
    selectedTags,
    selectedSources,
    selectedCalledFors,
    selectedCallTypes,
    selectedCallCounts,
    selectedGeneralStatuses,
    selectedKhojiStatuses,
    filterStatus,
    dateFrom,
    dateTo
  ]);

  // Sorting
  const sortedLogs = useMemo(() => {
    return [...filteredLogs].sort((a, b) => {
      if (sortBy === "nameAsc") {
        return (a.Name || "").localeCompare(b.Name || "");
      }
      if (sortBy === "attenderAsc") {
        return (a.attenderName || "").localeCompare(b.attenderName || "");
      }
      if (sortBy === "createdDesc") {
        const tA = parseTimestamp(a.createdAt)?.getTime() || 0;
        const tB = parseTimestamp(b.createdAt)?.getTime() || 0;
        return tB - tA;
      }
      // default: activityDesc
      const tA = parseTimestamp(a.lastCalledAt || a.createdAt)?.getTime() || 0;
      const tB = parseTimestamp(b.lastCalledAt || b.createdAt)?.getTime() || 0;
      return tB - tA;
    });
  }, [filteredLogs, sortBy]);

  // Pagination
  const totalPages = Math.ceil(sortedLogs.length / rowsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return sortedLogs.slice(start, start + rowsPerPage);
  }, [sortedLogs, page, rowsPerPage]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedAttenderIds, selectedTags, selectedSources, filterStatus, sortBy, rowsPerPage]);

  // Statistics banner calculation
  const stats = useMemo(() => {
    const total = filteredLogs.length;
    const called = filteredLogs.filter(l => l.status || l.callbackDate || l.remark).length;
    const interested = filteredLogs.filter(l => l.status === "Interested").length;
    const regDone = filteredLogs.filter(l => l.status === "Reg.Done").length;
    const callbacks = filteredLogs.filter(l => {
      if (!l.callbackDate) return false;
      const cb = parseTimestamp(l.callbackDate);
      return cb && cb <= new Date();
    }).length;
    const activeAttenders = new Set(filteredLogs.map(l => l.attenderId)).size;

    return { total, called, interested, regDone, callbacks, activeAttenders };
  }, [filteredLogs]);

  // Count active filters
  const isDefaultDate = (() => {
    const d = new Date();
    const yr = d.getFullYear();
    const mn = d.getMonth();
    const firstDay = `${yr}-${String(mn + 1).padStart(2, "0")}-01`;
    const lastDayNum = new Date(yr, mn + 1, 0).getDate();
    const lastDay = `${yr}-${String(mn + 1).padStart(2, "0")}-${String(lastDayNum).padStart(2, "0")}`;
    return dateFrom === firstDay && dateTo === lastDay;
  })();

  const activeFiltersCount = (selectedAttenderIds.length > 0 ? 1 : 0) +
    (selectedTags.length > 0 ? 1 : 0) +
    (selectedSources.length > 0 ? 1 : 0) +
    (selectedCalledFors.length > 0 ? 1 : 0) +
    (selectedCallTypes.length > 0 ? 1 : 0) +
    (selectedGeneralStatuses.length > 0 ? 1 : 0) +
    (selectedKhojiStatuses.length > 0 ? 1 : 0) +
    (!isDefaultDate ? 1 : 0);

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedAttenderIds([]);
    setSelectedTags([]);
    setSelectedSources([]);
    setSelectedCalledFors([]);
    setSelectedCallTypes([]);
    setSelectedSubPrograms([]);
    setSelectedObjections([]);
    setSelectedCallbackStatuses([]);
    setSelectedCallCounts([]);
    setSelectedGeneralStatuses([]);
    setSelectedKhojiStatuses([]);
    setFilterStatus("All");
    const d = new Date();
    const yr = d.getFullYear();
    const mn = d.getMonth();
    setDateFrom(`${yr}-${String(mn + 1).padStart(2, "0")}-01`);
    const lastDayNum = new Date(yr, mn + 1, 0).getDate();
    setDateTo(`${yr}-${String(mn + 1).padStart(2, "0")}-${String(lastDayNum).padStart(2, "0")}`);
    setSortBy("activityDesc");
  };

  const handleExport = () => {
    if (sortedLogs.length === 0) {
      toast.error("No data to export.");
      return;
    }
    const exportData = [];

    sortedLogs.forEach(log => {
      const calls = getAllCallEntries(log);
      const totalCallsCount = getCallsDoneCount(log);
      const baseCleaned = cleanExportRow(log);

      calls.forEach((call, idx) => {
        const row = {};

        // 1. Call Sequence & Date
        row["Call #"] = totalCallsCount > 0 ? `Call ${idx + 1} of ${totalCallsCount}` : "Uncalled";
        row["Call Date"] = call.dateStr ? String(call.dateStr).split(",")[0].trim() : "";
        row["Attended By"] = call.attenderName || log.attenderName || "Unassigned";

        // 2. Contact Details
        row["Name"] = baseCleaned["Name"] || log.Name || "";
        row["Phone"] = baseCleaned["Phone"] || log.Phone || "";
        row["Mobile"] = getFieldWithFallback(log, "Mobile") || baseCleaned["Mobile"] || "";
        row["Email"] = baseCleaned["Email"] || "";
        row["City"] = baseCleaned["City"] || "";
        row["State"] = baseCleaned["State"] || log.State || "";
        row["Khoji"] = baseCleaned["Khoji"] || log.Khoji || "";

        // 3. Call Activity Details
        row["Total Calls Done"] = totalCallsCount;
        row["Call Type"] = call.callType || log.callType || "outgoing";
        row["Status"] = call.status || log.status || "Pending";
        row["Remark / Comment"] = call.remark || (totalCallsCount === 0 ? (log.remark || "") : "");
        row["Callback Date"] = baseCleaned["Callback Date"] || "";

        // 4. Source & Program Tags
        row["Tags"] = baseCleaned["Tags"] || "";
        row["Source"] = baseCleaned["Source"] || "";
        row["Called For"] = baseCleaned["Called For"] || "";
        row["Sub Program"] = baseCleaned["Sub Program"] || "";

        // 5. Dynamic fields from GHL / original sheet
        Object.keys(baseCleaned).forEach(key => {
          if (!(key in row) && key !== "Call History Timeline") {
            row[key] = baseCleaned[key];
          }
        });

        exportData.push(row);
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "All Attenders Sheet");
    const monthStr = selectedMonth || "Current";
    XLSX.writeFile(wb, `All_Attenders_Sheet_${monthStr}.xlsx`);
    toast.success("Excel report downloaded!");
  };

  const handleRefresh = async (silent = false) => {
    setIsRefreshing(true);
    try {
      if (selectedMonth && selectedMonth !== "ALL") {
        await verifyCallCenterCache(selectedMonth);
      }
      if (!silent) {
        toast.success("Cache verified & refreshed!");
      }
    } catch (err) {
      console.error(err);
      if (!silent) {
        toast.error("Cache refresh complete.");
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusBadge = (log) => {
    const status = log.status;
    if (isUnansweredCallback(log)) {
      return { bg: "bg-amber-100 border-amber-300", text: "text-amber-800 font-extrabold", label: status || "Unanswered Callback" };
    }
    if (status) {
      if (status === "Reg.Done") return { bg: "bg-emerald-100", text: "text-emerald-700 border-emerald-200", label: status };
      if (status === "Interested") return { bg: "bg-blue-100", text: "text-blue-700 border-blue-200", label: status };
      if (status === "Info given") return { bg: "bg-purple-100", text: "text-purple-700 border-purple-200", label: status };
      if (["NA", "Busy", "Call Cut", "switched off", "Not interested", "Invalid No"].includes(status)) {
        return { bg: "bg-rose-100", text: "text-rose-700 border-rose-200", label: status };
      }
      return { bg: "bg-indigo-100", text: "text-indigo-700 border-indigo-200", label: status };
    }
    const hasAttempt = log.callbackDate || log.remark;
    if (hasAttempt) {
      return { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Attempted" };
    }
    return { bg: "bg-gray-100 border-gray-200", text: "text-gray-400", label: "Pending" };
  };

  const getCallbackStr = (log) => {
    if (!log.callbackDate) return "";
    const d = parseTimestamp(log.callbackDate);
    return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "";
  };

  if (callLogsLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 py-20 bg-slate-50/50 min-h-[400px]">
        <RefreshCw size={36} className="text-indigo-600 animate-spin" />
        <div className="text-center space-y-1">
          <p className="text-slate-800 font-extrabold text-base">Syncing Database...</p>
          <p className="text-slate-400 text-xs font-semibold">Fetching active database for {selectedMonth || "selected scope"}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50 overflow-hidden">
      {/* Streamlined Header & Filter Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 shrink-0 shadow-sm space-y-2.5">
        {/* Row 1: Stat Summary Pills & Global Table Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Compact Stat Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-bold py-0.5">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/60 whitespace-nowrap">
              Total: <strong className="text-slate-900">{stats.total}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
              Called: <strong>{stats.called}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-100 whitespace-nowrap">
              Interested: <strong>{stats.interested}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 whitespace-nowrap">
              Reg: <strong>{stats.regDone}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 whitespace-nowrap">
              Callbacks: <strong>{stats.callbacks}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap">
              Attenders: <strong>{stats.activeAttenders}</strong>
            </span>
          </div>

          {/* Right: Global Actions (Clear, Cols, Export) */}
          <div className="flex items-center gap-2">
            {(activeFiltersCount > 0 || searchQuery) && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition"
              >
                <X size={12} /> Clear ({activeFiltersCount})
              </button>
            )}

            <button
              onClick={() => setIsColumnModalOpen(true)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition border active:scale-[0.97] ${
                hiddenColumns.length > 0
                  ? "bg-teal-50 border-teal-200 text-teal-700 shadow-sm"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Eye size={12} />
              Cols {hiddenColumns.length > 0 && `(${allPossibleCols.length - hiddenColumns.length}/${allPossibleCols.length})`}
            </button>

            <button
              onClick={() => {
                setEditingRow({
                  _isNew: true,
                  Name: "",
                  Phone: "",
                  Mobile: "",
                  Email: "",
                  City: "",
                  State: "",
                  Khoji: "No",
                  status: "",
                  callType: "incoming",
                  "Called For": "",
                  Source: "",
                  remark: ""
                });
              }}
              className="flex items-center gap-1.5 px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold text-xs shadow-sm shadow-indigo-600/20 transition active:scale-[0.98] cursor-pointer"
            >
              <Plus size={13} />
              Add Call Entry
            </button>

            <button
              onClick={handleExport}
              disabled={sortedLogs.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs shadow-sm shadow-emerald-600/20 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <Download size={13} />
              Export
            </button>
          </div>
        </div>

        {/* Row 2: Search Input, Quick Lead Presets & Date Range */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
          {/* Left: Search + Quick Lead Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-gray-200 rounded-xl px-2.5 py-1 min-w-[160px] max-w-[220px] focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition">
              <Search size={13} className="text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent text-xs font-semibold text-gray-700 outline-none w-full"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}>
                  <X size={11} className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            <button
              onClick={() => setFilterStatus(filterStatus === "Follow up" ? "All" : "Follow up")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition border active:scale-[0.97] cursor-pointer ${
                filterStatus === "Follow up"
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : "bg-white border-gray-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Clock size={12} className={filterStatus === "Follow up" ? "text-white" : "text-blue-600"} />
              Followup Pending
            </button>

            <button
              onClick={() => setFilterStatus(filterStatus === "Unanswered Callback" ? "All" : "Unanswered Callback")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition border active:scale-[0.97] cursor-pointer ${
                filterStatus === "Unanswered Callback"
                  ? "bg-amber-500 border-amber-500 text-white shadow-sm shadow-amber-500/20"
                  : "bg-white border-gray-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <PhoneOff size={12} className={filterStatus === "Unanswered Callback" ? "text-white" : "text-amber-500"} />
              Unanswered Callback
            </button>

            <button
              onClick={() => setFilterStatus(filterStatus === "Hot Leads" ? "All" : "Hot Leads")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition border active:scale-[0.97] cursor-pointer ${
                filterStatus === "Hot Leads"
                  ? "bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/20"
                  : "bg-white border-gray-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Flame size={12} className={filterStatus === "Hot Leads" ? "text-white" : "text-orange-500"} fill={filterStatus === "Hot Leads" ? "currentColor" : "none"} />
              Hot Leads
            </button>
          </div>

          {/* Right: Date Range Inputs & Presets */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 bg-slate-50 border border-gray-200 rounded-xl px-2 py-1">
              <Calendar size={12} className="text-gray-400 shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer"
              />
              <span className="text-gray-400 text-xs font-medium">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => {
                const d = new Date();
                const yr = d.getFullYear();
                const mn = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                const todayStr = `${yr}-${mn}-${day}`;
                setDateFrom(todayStr);
                setDateTo(todayStr);
              }}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition active:scale-[0.97] cursor-pointer ${
                (() => {
                  const d = new Date();
                  const yr = d.getFullYear();
                  const mn = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  const todayStr = `${yr}-${mn}-${day}`;
                  return dateFrom === todayStr && dateTo === todayStr;
                })()
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                  : "bg-white border-gray-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              Today
            </button>

            <button
              onClick={() => {
                const d = new Date();
                const yr = d.getFullYear();
                const mn = d.getMonth();
                const firstDayStr = `${yr}-${String(mn + 1).padStart(2, "0")}-01`;
                const lastDay = new Date(yr, mn + 1, 0).getDate();
                const lastDayStr = `${yr}-${String(mn + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
                setDateFrom(firstDayStr);
                setDateTo(lastDayStr);
              }}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition active:scale-[0.97] cursor-pointer ${
                (() => {
                  const d = new Date();
                  const yr = d.getFullYear();
                  const mn = d.getMonth();
                  const firstDayStr = `${yr}-${String(mn + 1).padStart(2, "0")}-01`;
                  const lastDay = new Date(yr, mn + 1, 0).getDate();
                  const lastDayStr = `${yr}-${String(mn + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
                  return dateFrom === firstDayStr && dateTo === lastDayStr;
                })()
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                  : "bg-white border-gray-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              This Month
            </button>
          </div>
        </div>

        {/* Row 3: Dedicated Filter Dropdowns Bar */}
        <div className="bg-slate-50/80 border border-slate-200/70 p-1.5 rounded-2xl flex flex-wrap items-center gap-1.5">
          <MultiSelectDropdown
            options={tagOptions}
            selected={selectedTags}
            onChange={setSelectedTags}
            placeholder="Tags"
            icon={Tag}
            allLabel="Tags"
          />

          <MultiSelectDropdown
            options={sourceOptions}
            selected={selectedSources}
            onChange={setSelectedSources}
            placeholder="Source"
            icon={Layers}
            allLabel="Sources"
          />

          <MultiSelectDropdown
            options={calledForOptions}
            selected={selectedCalledFors}
            onChange={setSelectedCalledFors}
            placeholder="Called For"
            icon={Phone}
            allLabel="Called For"
          />

          <MultiSelectDropdown
            options={statusOptions}
            selected={selectedGeneralStatuses}
            onChange={setSelectedGeneralStatuses}
            placeholder="Status"
            icon={CheckCircle2}
            allLabel="Statuses"
          />

          <MultiSelectDropdown
            options={callTypeOptions}
            selected={selectedCallTypes}
            onChange={setSelectedCallTypes}
            placeholder="Call Type"
            icon={Phone}
            allLabel="Call Types"
          />

          <MultiSelectDropdown
            options={["0 Calls (Uncalled)", "1 Call", "2 Calls", "3 Calls", "4+ Calls"]}
            selected={selectedCallCounts}
            onChange={setSelectedCallCounts}
            placeholder="Calls Done"
            icon={Hash}
            allLabel="Calls Done"
          />

          <MultiSelectDropdown
            options={khojiOptions}
            selected={selectedKhojiStatuses}
            onChange={setSelectedKhojiStatuses}
            placeholder="Khoji Status"
            icon={UserCheck}
            allLabel="Khoji Statuses"
          />

          <MultiSelectDropdown
            options={attenderOptions}
            selected={selectedAttenderIds}
            onChange={setSelectedAttenderIds}
            placeholder="Attenders"
            icon={Users}
            allLabel="Attenders"
          />

          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-sm">
            <ArrowUpDown size={12} className="text-gray-400 shrink-0" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-700 focus:outline-none cursor-pointer pr-1"
            >
              <option value="activityDesc">Latest Activity</option>
              <option value="createdDesc">Date Assigned</option>
              <option value="nameAsc">Name (A-Z)</option>
              <option value="attenderAsc">Attender Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div
          ref={scrollRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          className="flex-1 overflow-auto cursor-grab"
          style={{ userSelect: "none" }}
        >
          <table className="table-auto w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 border-b border-gray-300 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-3 px-4 font-black text-gray-600 uppercase w-12 border-r border-gray-200 bg-slate-200/80 text-center">#</th>

                {!hiddenColumns.includes("Attender") && (
                  <th className="py-3 px-4 font-black text-indigo-700 uppercase border-r border-gray-200 min-w-[150px] bg-indigo-50/50">
                    Attended By
                  </th>
                )}
                {!hiddenColumns.includes("Name") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[160px]">
                    Name
                  </th>
                )}
                {!hiddenColumns.includes("Phone") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[130px]">
                    Phone
                  </th>
                )}
                {!hiddenColumns.includes("Mobile") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[130px]">
                    Mobile
                  </th>
                )}
                {!hiddenColumns.includes("Email") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[160px]">
                    Email
                  </th>
                )}
                {!hiddenColumns.includes("City") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[130px]">
                    City
                  </th>
                )}
                {!hiddenColumns.includes("State") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[120px]">
                    State
                  </th>
                )}
                {!hiddenColumns.includes("Khoji") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[120px]">
                    Khoji
                  </th>
                )}
                {!hiddenColumns.includes("Tags") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px]">
                    Tags
                  </th>
                )}
                {!hiddenColumns.includes("Source") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[130px]">
                    Source
                  </th>
                )}
                {!hiddenColumns.includes("Called For") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px]">
                    Called For
                  </th>
                )}
                {!hiddenColumns.includes("Sub Program") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px]">
                    Sub Program
                  </th>
                )}
                {!hiddenColumns.includes("Type") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[100px]">
                    Type
                  </th>
                )}
                {!hiddenColumns.includes("Calls Done") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[110px]">
                    Calls Done
                  </th>
                )}
                {!hiddenColumns.includes("Status") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px]">
                    Status
                  </th>
                )}
                {!hiddenColumns.includes("Remark") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[280px]">
                    Remark
                  </th>
                )}
                {!hiddenColumns.includes("Callback") && (
                  <th className="py-3 px-4 font-bold text-gray-600 uppercase min-w-[130px]">
                    Callback
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {paginatedLogs.map((log, idx) => {
                const isDue = log.callbackDate && parseTimestamp(log.callbackDate) <= new Date();
                const isHot = log.isHotLead;
                const hasFollowup = log.callbackDate || log.status === "reminder" || log.status === "Next time";
                const isUnanswered = isUnansweredCallback(log);
                const isCalled = !!(log.status || log.callbackDate || log.remark);

                let rowBg = "hover:bg-indigo-50/40";
                if (isDue) {
                  rowBg = "bg-rose-50/70 border-l-[6px] border-l-rose-600";
                } else if (isHot) {
                  rowBg = "bg-orange-50/70 border-l-[6px] border-l-orange-500";
                } else if (hasFollowup) {
                  rowBg = "bg-blue-50/60 border-l-[6px] border-l-blue-500";
                } else if (isUnanswered) {
                  rowBg = "bg-amber-100/80 border-l-[6px] border-l-amber-500 shadow-sm";
                } else if (isCalled) {
                  rowBg = "bg-emerald-50/50 border-l-[6px] border-l-emerald-500";
                }

                return (
                  <tr
                    key={log.id}
                    className={`cursor-pointer transition-colors ${rowBg}`}
                    onClick={() => {
                      if (!didDrag.current) {
                        setEditingRow(log);
                      }
                    }}
                  >
                    <td className="py-2.5 px-4 font-bold text-gray-400 text-center bg-slate-50/80 border-r border-gray-200 align-top">
                      {(page - 1) * rowsPerPage + idx + 1}
                    </td>

                    {!hiddenColumns.includes("Attender") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 align-top bg-indigo-50/20">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                          <Users size={11} />
                          {log.attenderName || "Unassigned"}
                        </span>
                      </td>
                    )}

                    {!hiddenColumns.includes("Name") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 font-extrabold text-slate-900 align-top">
                        {isHot && <Flame size={14} className="text-orange-500 shrink-0 inline mr-1" fill="currentColor" />}
                        {log.Name || "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("Phone") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 font-semibold text-slate-700 align-top whitespace-nowrap">
                        {log.Phone || log.Mobile || getContactPhone(log) || "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("Mobile") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 text-slate-600 align-top whitespace-nowrap">
                        {log.Mobile || getFieldWithFallback(log, "Mobile") || "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("Email") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 text-slate-600 align-top">
                        {log.Email || "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("City") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 text-slate-700 align-top">
                        {log.City || "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("State") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 text-slate-600 align-top">
                        {log.State || "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("Khoji") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 align-top">
                        {log.Khoji ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${isKhojiAffirmative(log.Khoji) ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-gray-100 text-gray-600"}`}>
                            {log.Khoji}
                          </span>
                        ) : "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("Tags") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 align-top min-w-[140px]">
                        {(() => {
                          const rawTags = Array.isArray(log.tags) ? log.tags : (log.Tags ? [log.Tags] : []);
                          const seen = new Set();
                          rawTags.forEach(t => String(t).split(",").map(x => x.trim()).filter(Boolean).forEach(x => seen.add(x)));
                          if (log.programName) seen.add(log.programName);
                          return <CollapsedTags tags={Array.from(seen)} />;
                        })()}
                      </td>
                    )}

                    {!hiddenColumns.includes("Source") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 text-slate-700 align-top">
                        {log.Source || log.source || "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("Called For") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 text-slate-700 align-top">
                        {log["Called For"] || log.calledFor || "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("Sub Program") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 text-slate-600 align-top">
                        {log["Sub Program"] || log.subProgram || "\u2014"}
                      </td>
                    )}

                    {!hiddenColumns.includes("Type") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 align-top">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${log.callType === "incoming" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                          {log.callType || "outgoing"}
                        </span>
                      </td>
                    )}

                    {!hiddenColumns.includes("Calls Done") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 align-top">
                        {(() => {
                          const count = getCallsDoneCount(log);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                              count === 0
                                ? "bg-slate-100 text-slate-500 border border-slate-200"
                                : count === 1
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : count === 2
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : "bg-purple-100 text-purple-800 border border-purple-200 shadow-xs"
                            }`}>
                              <Hash size={10} />
                              {count} {count === 1 ? "Call" : "Calls"}
                            </span>
                          );
                        })()}
                      </td>
                    )}

                    {!hiddenColumns.includes("Status") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 align-top">
                        {(() => {
                          const badge = getStatusBadge(log);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${badge.bg} ${badge.text}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                    )}

                    {!hiddenColumns.includes("Remark") && (
                      <td className="py-2.5 px-4 border-r border-gray-100 text-slate-700 leading-relaxed min-w-[280px] align-top">
                        {getFieldWithFallback(log, "remark") || log.remark || <span className="text-gray-300 font-medium">—</span>}
                      </td>
                    )}

                    {!hiddenColumns.includes("Callback") && (
                      <td className="py-2.5 px-4 align-top whitespace-nowrap">
                        {getCallbackStr(log) ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-extrabold ${isDue ? "text-rose-600 flex items-center gap-1" : "text-amber-600"}`}>
                              {isDue && <Clock size={12} className="animate-pulse" />}
                              {getCallbackStr(log)}
                            </span>
                            {log.callbackStatus && (
                              <span className="text-[9px] font-black uppercase text-gray-500">
                                {log.callbackStatus}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 font-medium">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {paginatedLogs.length === 0 && (
                <tr>
                  <td colSpan={allPossibleCols.length - hiddenColumns.length + 1}>
                    <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                      <FileSpreadsheet size={40} className="text-gray-300" />
                      <p className="text-lg font-bold text-gray-400">
                        {callLogsLoading ? "Loading contact cache..." : "No contact entries found matching your filters."}
                      </p>
                      {activeFiltersCount > 0 && (
                        <button
                          onClick={clearAllFilters}
                          className="px-4 py-2 bg-indigo-50 text-indigo-600 font-black text-xs rounded-xl hover:bg-indigo-100 transition"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination Controls */}
        <div className="bg-white border-t border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-gray-600 shrink-0">
          <div className="flex items-center gap-3">
            <span>Showing {sortedLogs.length > 0 ? (page - 1) * rowsPerPage + 1 : 0} to {Math.min(page * rowsPerPage, sortedLogs.length)} of {sortedLogs.length} contacts</span>

            <div className="flex items-center gap-1.5 ml-2 border-l border-gray-200 pl-3">
              <span className="text-gray-400 font-bold">Rows:</span>
              <select
                value={rowsPerPage}
                onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
                className="bg-slate-100 border border-gray-200 rounded-lg px-2 py-1 font-bold text-gray-700 focus:outline-none cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold rounded-xl transition"
            >
              Previous
            </button>
            <span className="font-extrabold text-slate-800">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold rounded-xl transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Filters Modal */}
      {showAdvancedFilters && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAdvancedFilters(false); }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden border border-gray-100 max-h-[90vh] animate-slide-up">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <SlidersHorizontal size={18} className="text-indigo-600" />
                  Advanced Filter Suite
                  {activeFiltersCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black uppercase">
                      {activeFiltersCount} Active
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500 font-semibold mt-0.5">Filter across all attenders sheet cache by custom date ranges and criteria</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Date Filters Section */}
              <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Calendar size={14} className="text-indigo-600" /> Date Parameters Filter
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-500 mb-1">Target Date Field</label>
                    <select
                      value={filterDateType}
                      onChange={e => setFilterDateType(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="lastCalledAt">Last Called / Updated</option>
                      <option value="createdAt">Date Assigned / Created</option>
                      <option value="callbackDate">Callback Date</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-500 mb-1">Date Range</label>
                    <select
                      value={filterDateRange}
                      onChange={e => setFilterDateRange(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="All">All Time</option>
                      <option value="Today">Today</option>
                      <option value="Yesterday">Yesterday</option>
                      <option value="This Month">This Month</option>
                      <option value="Last 7 Days">Last 7 Days</option>
                      <option value="Custom">Custom Range</option>
                    </select>
                  </div>

                  {filterDateRange === "Custom" && (
                    <div className="sm:col-span-2 md:col-span-1 flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[11px] font-extrabold text-slate-500 mb-1">From</label>
                        <input
                          type="date"
                          value={customDateFrom}
                          onChange={e => setCustomDateFrom(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[11px] font-extrabold text-slate-500 mb-1">To</label>
                        <input
                          type="date"
                          value={customDateTo}
                          onChange={e => setCustomDateTo(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Grid of Multi-Selects in Modal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">Attenders</label>
                  <MultiSelectDropdown
                    options={attenderOptions}
                    selected={selectedAttenderIds}
                    onChange={setSelectedAttenderIds}
                    placeholder="Attenders"
                    icon={Users}
                    allLabel="👥 All Attenders"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">Program Tags</label>
                  <MultiSelectDropdown
                    options={tagOptions}
                    selected={selectedTags}
                    onChange={setSelectedTags}
                    placeholder="Tags"
                    icon={Tag}
                    allLabel="🌟 All Tags"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">Source</label>
                  <MultiSelectDropdown
                    options={sourceOptions}
                    selected={selectedSources}
                    onChange={setSelectedSources}
                    placeholder="Source"
                    icon={Layers}
                    allLabel="📢 All Sources"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">City</label>
                  <MultiSelectDropdown
                    options={cityOptions}
                    selected={selectedCities}
                    onChange={setSelectedCities}
                    placeholder="City"
                    icon={Filter}
                    allLabel="📍 All Cities"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">Called For</label>
                  <MultiSelectDropdown
                    options={calledForOptions}
                    selected={selectedCalledFors}
                    onChange={setSelectedCalledFors}
                    placeholder="Called For"
                    icon={Phone}
                    allLabel="📞 All Called For"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">Khoji Status</label>
                  <MultiSelectDropdown
                    options={khojiOptions}
                    selected={selectedKhojiStatuses}
                    onChange={setSelectedKhojiStatuses}
                    placeholder="Khoji Status"
                    icon={UserCheck}
                    allLabel="🔮 All Khoji Statuses"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-slate-50/50 flex items-center justify-between">
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-2 text-xs font-black text-rose-600 hover:bg-rose-50 rounded-xl transition"
              >
                Reset All Filters
              </button>

              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md transition"
              >
                Apply Filters & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Visibility Selector Modal */}
      {isColumnModalOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setIsColumnModalOpen(false); }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 animate-slide-up">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Eye size={18} className="text-teal-600" />
                Table Column Visibility
              </h3>
              <button
                type="button"
                onClick={() => setIsColumnModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-xl transition text-gray-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 max-h-80 overflow-y-auto grid grid-cols-2 gap-3">
              {allPossibleCols.map(col => {
                const isHidden = hiddenColumns.includes(col);
                return (
                  <label
                    key={col}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border cursor-pointer transition ${
                      !isHidden ? "bg-teal-50/60 border-teal-200 text-teal-900 font-extrabold" : "bg-gray-50 border-gray-200 text-gray-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => {
                        if (isHidden) setHiddenColumns(hiddenColumns.filter(c => c !== col));
                        else setHiddenColumns([...hiddenColumns, col]);
                      }}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-xs">{col}</span>
                  </label>
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-slate-50/50 flex items-center justify-between">
              <button
                onClick={() => setHiddenColumns([])}
                className="text-xs font-black text-teal-600 hover:underline"
              >
                Show All Columns
              </button>
              <button
                onClick={() => setIsColumnModalOpen(false)}
                className="px-5 py-2 bg-teal-600 text-white font-black text-xs rounded-xl hover:bg-teal-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact / Add Call Entry Modal */}
      {editingRow && (
        <EditModal
          row={editingRow}
          attenderId={editingRow.attenderId || "admin"}
          attenderName={editingRow.attenderName || "Admin"}
          attenders={attenderOptions.map(opt => ({ id: opt.value, name: opt.label }))}
          allowAttenderSelection={true}
          programs={programs}
          onClose={() => setEditingRow(null)}
          onSave={() => {
            setEditingRow(null);
          }}
        />
      )}
    </div>
  );
}
