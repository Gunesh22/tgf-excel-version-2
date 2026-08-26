import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import { BarChart3, Download, Search, X, ChevronDown, Check, Database } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { COLORS, cleanExportRow, CONNECTED_STATUSES, NOT_CONNECTED_STATUSES, parseTimestamp, getCanonicalStatus } from "../utils.jsx";
import { isKhojiAffirmative, isKhojiNegative } from "../../attender/utils.js";
import ExportCacheModal from "./ExportCacheModal.jsx";

// ── Multi-select dropdown ──────────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder, allLabel = "All" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.length === 0 || selected.length === options.length;

  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(options.map(o => o.value));
  };

  const label = allSelected
    ? allLabel
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label || "1 selected")
      : `${selected.length} selected`;

  const hasFilterApplied = selected.length > 0 && selected.length < options.length;

  return (
    <div className="relative flex-1 min-w-[150px] sm:min-w-[165px] max-w-[250px]" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={`flex items-center justify-between gap-2 px-4 py-2.5 border rounded-2xl font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full whitespace-nowrap overflow-hidden transition-all duration-200 cursor-pointer ${
          hasFilterApplied
            ? "bg-indigo-50/80 border-indigo-300 text-indigo-900 font-extrabold shadow-sm shadow-indigo-100"
            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50/90 hover:border-gray-300"
        }`}
      >
        <span className="truncate flex-1 text-left font-bold">{label}</span>
        {hasFilterApplied && (
          <span className="w-4.5 h-4.5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
            {selected.length}
          </span>
        )}
        <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""} ${hasFilterApplied ? "text-indigo-600" : "text-gray-400"}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl w-full min-w-[230px] overflow-hidden right-0">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full text-xs focus:outline-none bg-transparent"
            />
            {search && <button onClick={() => setSearch("")}><X size={12} className="text-gray-400" /></button>}
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              onClick={toggleAll}
              className="w-full px-4 py-2 text-left text-xs font-black text-indigo-600 hover:bg-indigo-50 flex items-center gap-2"
            >
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${allSelected ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                {allSelected && <Check size={10} className="text-white stroke-[3]" />}
              </span>
              {allLabel}
            </button>
            {filtered.map(o => {
              const active = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${active ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                    {active && <Check size={10} className="text-white stroke-[3]" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper to format local YYYY-MM-DD date ──────────────────────────────────
const getLocalDateStr = (d = new Date()) => {
  const yr = d.getFullYear();
  const mn = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mn}-${dy}`;
};

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function DashboardTab({ programs, attenders, settingsOptions = { statusOptions: [], sourceOptions: [], calledForOptions: [] }, callLogs = [], registrations = [], secondsAgo = 0, nextFetchIn = 45, lastSyncedAt }) {
  const todayStr = getLocalDateStr();

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedProgramIds, setSelectedProgramIds] = useState([]); // empty = ALL
  const [selectedAttenderIds, setSelectedAttenderIds] = useState([]); // empty = ALL
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedCalledFors, setSelectedCalledFors] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedCallTypes, setSelectedCallTypes] = useState([]);
  const [selectedKhojiStatuses, setSelectedKhojiStatuses] = useState([]);
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [conversionSearch, setConversionSearch] = useState("");
  const [convPage, setConvPage] = useState(1);
  const [selectedAttenderDetails, setSelectedAttenderDetails] = useState(null);
  const [attenderModalSearch, setAttenderModalSearch] = useState("");

  const callTypeOptions = useMemo(() => [
    { value: "incoming", label: "Incoming" },
    { value: "outgoing", label: "Outgoing" }
  ], []);

  const khojiStatusOptions = useMemo(() => [
    { value: "Yes", label: "Yes (Khoji)" },
    { value: "No", label: "No (New)" },
    { value: "Dew drop khoji", label: "Dew drop khoji" }
  ], []);

  const programOptions = programs.map(p => ({ value: p.id, label: p.name }));
  const attenderOptions = attenders.map(a => ({ value: a.id, label: a.name }));

  const sourceOptions = useMemo(() => {
    const sources = new Set(settingsOptions?.sourceOptions || []);
    callLogs.forEach(log => {
      const sourceKey = Object.keys(log).find(k => ["source", "sourse", "source of information", "source of informiton"].includes(k.toLowerCase()));
      const val = sourceKey ? String(log[sourceKey] || "").trim() : "";
      if (val) sources.add(val);
    });
    return Array.from(sources).sort().map(s => ({ value: s, label: s }));
  }, [callLogs, settingsOptions]);

  const calledForOptions = useMemo(() => {
    const values = new Set();
    (settingsOptions?.calledForOptions || []).forEach(opt => {
      if (opt) {
        String(opt).split(",").map(s => s.trim()).filter(Boolean).forEach(v => values.add(v));
      }
    });
    callLogs.forEach(log => {
      const key = Object.keys(log).find(k => ["called for", "called_for", "calledfor"].includes(k.toLowerCase()));
      const val = key ? String(log[key] || "").trim() : "";
      if (val) {
        val.split(",").map(s => s.trim()).filter(Boolean).forEach(v => values.add(v));
      }
    });
    return Array.from(values).sort().map(s => ({ value: s, label: s }));
  }, [callLogs, settingsOptions]);

  const statusOptions = useMemo(() => {
    const statuses = new Set(settingsOptions?.statusOptions || []);
    callLogs.forEach(log => {
      if (log.attenderStates) {
        Object.values(log.attenderStates).forEach(state => {
          if (state.status) statuses.add(state.status);
          if (state.history) {
            state.history.forEach(h => {
              if (h.status) statuses.add(h.status);
            });
          }
        });
      }
      if (log.status) statuses.add(log.status);
      if (log.history) {
        log.history.forEach(h => {
          if (h.status) statuses.add(h.status);
        });
      }
    });
    return Array.from(statuses).sort().map(s => ({ value: s, label: s }));
  }, [callLogs, settingsOptions]);

  const flattenedLogs = useMemo(() => {
    const list = [];
    callLogs.forEach(log => {
      if (log._deleted) return;

      const nameKey = Object.keys(log).find(k => ["name", "lead name", "caller name", "lead"].includes(k.toLowerCase()));
      const contactName = nameKey ? log[nameKey] : "Unknown";
      const phoneKey = Object.keys(log).find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
        || Object.keys(log).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
      const contactPhone = phoneKey ? log[phoneKey] : "";

      const sourceKey = Object.keys(log).find(k => ["source", "sourse", "source of information", "source of informiton"].includes(k.toLowerCase()));
      const sourceVal = sourceKey ? String(log[sourceKey] || "").trim() : "";

      const calledForKey = Object.keys(log).find(k => ["called for", "called_for", "calledfor"].includes(k.toLowerCase()));
      const calledForVal = calledForKey ? String(log[calledForKey] || "").trim() : "";

      const khojiKey = Object.keys(log).find(k => ["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani"].includes(k.toLowerCase()));
      const khojiVal = log.Khoji || (khojiKey ? String(log[khojiKey] || "").trim() : "");

      const feedbackKey = Object.keys(log).find(k => ["prog. feedback", "feedback", "user feedback", "program feedback"].includes(k.toLowerCase()));
      const feedbackVal = feedbackKey ? String(log[feedbackKey] || "").trim() : "";

      const getAttemptDate = (val) => {
        return parseTimestamp(val);
      };

      const hasAttenderStates = log.attenderStates && typeof log.attenderStates === "object" && Object.keys(log.attenderStates).length > 0;
      const hasTopHistory = Array.isArray(log.history) && log.history.length > 0;

      // Track processed event keys per lead document to prevent double-counting (matching MyPerformanceDashboard)
      const seenEventKeys = new Set();

      const addAttemptIfNew = (status, dateVal, remark, callType, source, calledFor, attId, attName, isHistory, index, stateObj) => {
        const canonicalStatus = getCanonicalStatus(status || "Pending");
        const attemptDate = getAttemptDate(dateVal) || parseTimestamp(log.createdAt);
        if (!attemptDate) return;

        const eventKey = `${log.id}_${attemptDate.getTime()}_${canonicalStatus}`;
        if (seenEventKeys.has(eventKey)) return;
        seenEventKeys.add(eventKey);

        const attItem = {
          ...log,
          id: `${log.id}_${attId}_${isHistory ? `h_${index}` : "latest"}_${attemptDate.getTime()}`,
          contactId: log.id,
          Name: contactName,
          Phone: contactPhone,
          programId: log.programId,
          programName: log.programName || "Unknown Program",
          tags: log.tags || [],
          attenderId: attId,
          attenderName: attName || stateObj?.attenderName || "Unknown",
          status: canonicalStatus,
          remark: remark || "",
          callType: callType || stateObj?.callType || "outgoing",
          history: stateObj?.history || [],
          callbackDate: stateObj?.callbackDate || null,
          createdAt: parseTimestamp(log.createdAt) || attemptDate,
          timestamp: attemptDate, // Canonical event timestamp
          updatedAt: attemptDate,
          lastCalledAt: stateObj?.lastCalledAt || null,
          source: source || stateObj?.Source || stateObj?.source || sourceVal,
          calledFor: calledFor || stateObj?.["Called For"] || stateObj?.calledFor || calledForVal,
          feedback: feedbackVal,
          Khoji: khojiVal
        };

        if (attItem && attItem.timestamp) list.push(attItem);
      };

      // Tier 1: Extract from matching attenderStates
      if (hasAttenderStates) {
        Object.entries(log.attenderStates).forEach(([attId, state]) => {
          if (!state) return;
          const stateAttName = state.attenderName || "Unknown";

          const hasStateHistory = Array.isArray(state.history) && state.history.length > 0;
          if (hasStateHistory) {
            state.history.forEach((h, index) => {
              const dateVal = h.timestamp || h.date || h.createdAt || h.updatedAt || state.lastCalledAt;
              addAttemptIfNew(
                h.status,
                dateVal,
                h.remark,
                h.callType || state.callType,
                h.source || state.Source || state.source,
                h.calledFor || state["Called For"] || state.calledFor,
                attId,
                h.attenderName || stateAttName,
                true,
                index,
                state
              );
            });
          }
          if (state.lastCalledAt || (state.status && state.status !== "Pending") || state.remark) {
            const dateVal = state.lastCalledAt || state.updatedAt || state.createdAt;
            addAttemptIfNew(
              state.status,
              dateVal,
              state.remark,
              state.callType,
              state.Source || state.source,
              state["Called For"] || state.calledFor,
              attId,
              stateAttName,
              false,
              0,
              state
            );
          }
        });
      }

      // Tier 2: Extract from top-level log.history
      if (hasTopHistory) {
        log.history.forEach((h, index) => {
          const itemAttId = h.attenderId || log.attenderId || "legacy";
          const itemAttName = h.attenderName || log.attenderName || "Legacy Attender";
          const dateVal = h.timestamp || h.date || h.createdAt || h.updatedAt;
          addAttemptIfNew(
            h.status,
            dateVal,
            h.remark,
            h.callType || log.callType,
            h.source || log.Source || log.source,
            h.calledFor || log["Called For"] || log.calledFor,
            itemAttId,
            itemAttName,
            true,
            index,
            { attenderName: itemAttName }
          );
        });
      }

      // Tier 3: Extract from top-level document fields (if legacy without attenderStates & without history)
      if (!hasAttenderStates && !hasTopHistory) {
        if (log.lastCalledAt || (log.status && log.status !== "Pending") || log.remark) {
          const dateVal = log.lastCalledAt || log.createdAt;
          addAttemptIfNew(
            log.status,
            dateVal,
            log.remark,
            log.callType,
            log.Source || log.source,
            log["Called For"] || log.calledFor,
            log.attenderId || "legacy",
            log.attenderName || "Legacy Attender",
            false,
            0,
            { attenderName: log.attenderName || "Legacy Attender" }
          );
        }
      }
    });

    return list;
  }, [callLogs]);

  const filteredLogs = useMemo(() => {
    const res = flattenedLogs.filter(log => {
      // Multi-tag filter with robust fallback
      if (selectedProgramIds.length > 0) {
        const selectedNames = selectedProgramIds.map(id => {
          const p = programs.find(x => x.id === id);
          return p ? p.name : id;
        });
        const contactTags = Array.isArray(log.tags) ? log.tags : [];
        const matchesId = selectedProgramIds.includes(log.programId);
        const matchesName = selectedNames.includes(log.programId) || 
                            selectedNames.includes(log.programName) ||
                            contactTags.some(t => selectedNames.includes(t) || selectedProgramIds.includes(t));

        if (!matchesId && !matchesName) return false;
      }

      // Multi-attender filter
      if (selectedAttenderIds.length > 0) {
        const matchesId = log.attenderId && selectedAttenderIds.includes(log.attenderId);
        const selectedAttenderNames = selectedAttenderIds.map(id => {
          const a = attenders.find(x => x.id === id);
          return a ? a.name.toLowerCase().trim() : "";
        }).filter(Boolean);
        const matchesName = selectedAttenderNames.includes((log.attenderName || "").toLowerCase().trim());
        if (!matchesId && !matchesName) return false;
      }

      // Source filter
      if (selectedSources.length > 0 && !selectedSources.includes(log.source || "")) return false;

      // Called For filter
      if (selectedCalledFors.length > 0) {
        const logCalledFors = String(log.calledFor || "").split(",").map(x => x.trim()).filter(Boolean);
        if (!logCalledFors.some(cf => selectedCalledFors.includes(cf))) return false;
      }

      // Status filter
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(log.status || "Pending")) return false;

      // Call Type filter
      if (selectedCallTypes.length > 0) {
        const cType = (log.callType || "outgoing").toLowerCase();
        const matches = selectedCallTypes.some(t => {
          if (t === "incoming") return cType.startsWith("incoming");
          if (t === "outgoing") return cType.startsWith("outgoing");
          return false;
        });
        if (!matches) return false;
      }

      // Khoji Status filter
      if (selectedKhojiStatuses.length > 0) {
        const val = log.Khoji;
        const affirmative = isKhojiAffirmative(val);
        const isDew = String(val || "").toLowerCase().includes("dew d") || String(val || "").toLowerCase().includes("dewdrop");
        const isNo = isKhojiNegative(val) || !val;

        let match = false;
        if (selectedKhojiStatuses.includes("Yes") && affirmative && !isDew) match = true;
        if (selectedKhojiStatuses.includes("No") && isNo) match = true;
        if (selectedKhojiStatuses.includes("Dew drop khoji") && isDew) match = true;

        if (!match) return false;
      }

      // Date range based on canonical event timestamp with fallbacks
      const logDate = parseTimestamp(log.timestamp) || parseTimestamp(log.updatedAt) || parseTimestamp(log.lastCalledAt);
      if (!logDate || isNaN(logDate.getTime())) return false;
      if (dateFrom && logDate < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && logDate > new Date(dateTo + "T23:59:59")) return false;

      return true;
    });
    return res;
  }, [flattenedLogs, selectedProgramIds, selectedAttenderIds, selectedSources, selectedCalledFors, selectedStatuses, selectedCallTypes, selectedKhojiStatuses, dateFrom, dateTo, programs, attenders]);

  const attenderStats = useMemo(() => {
    const map = {};
    const seenRegsPerAttender = new Set();

    filteredLogs.forEach(log => {
      const rawName = (log.attenderName || "").trim() || "Unknown Attender";
      const normName = rawName.toLowerCase();
      // Match with official attenders list if available
      const foundAttender = (attenders || []).find(a => (a.name || "").toLowerCase().trim() === normName);
      const canonicalName = foundAttender ? foundAttender.name : rawName;
      const canonicalId = foundAttender ? foundAttender.id : (log.attenderId && log.attenderId !== "unknown" && log.attenderId !== "legacy" ? log.attenderId : normName);

      const key = canonicalName.toLowerCase();
      if (!map[key]) {
        map[key] = { id: canonicalId, name: canonicalName, total: 0, outgoing: 0, incoming: 0, interested: 0, regDone: 0, pending: 0 };
      }
      const s = map[key];
      s.total++;
      const cType = (log.callType || "").toLowerCase();
      if (cType.startsWith("in")) s.incoming++; else s.outgoing++;

      const normStatus = getCanonicalStatus(log.status);
      if (normStatus === "Interested") s.interested++;
      if (normStatus === "Reg.Done") {
        const leadId = log.contactId || log.Phone || log.Name;
        const cf = (log.calledFor || log.programName || "").toLowerCase().trim();
        const regKey = `${key}_${leadId}_${cf}`;
        if (!seenRegsPerAttender.has(regKey)) {
          seenRegsPerAttender.add(regKey);
          s.regDone++;
        }
      }
      if (!normStatus || normStatus === "Pending") s.pending++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredLogs, attenders]);

  const attenderModalLeads = useMemo(() => {
    if (!selectedAttenderDetails) return [];
    const targetObj = typeof selectedAttenderDetails === "object" ? selectedAttenderDetails : { id: null, name: selectedAttenderDetails };
    const targetId = targetObj.id;
    const targetName = (targetObj.name || "").toLowerCase().trim();

    const leads = filteredLogs.filter(log => {
      const logAttender = (log.attenderName || "").toLowerCase().trim();
      if (logAttender === targetName) return true;
      if (targetId && targetId !== "unknown" && targetId !== "legacy" && log.attenderId === targetId) return true;
      return false;
    });

    const seenRegs = new Set();
    const deduplicatedLeads = leads.filter(l => {
      if (getCanonicalStatus(l.status) === "Reg.Done") {
        const leadId = l.contactId || l.Phone || l.Name;
        const cf = (l.calledFor || l.programName || "").toLowerCase().trim();
        const regKey = `${leadId}_${cf}`;
        if (seenRegs.has(regKey)) return false;
        seenRegs.add(regKey);
      }
      return true;
    });

    if (!attenderModalSearch.trim()) return deduplicatedLeads;
    const q = attenderModalSearch.toLowerCase();
    return deduplicatedLeads.filter(l =>
      (l.Name || "").toLowerCase().includes(q) ||
      (l.Phone || "").toLowerCase().includes(q) ||
      (l.status || "").toLowerCase().includes(q) ||
      (l.remark || "").toLowerCase().includes(q)
    );
  }, [filteredLogs, selectedAttenderDetails, attenderModalSearch]);

  const outcomeData = useMemo(() => {
    const map = {};
    const seenRegs = new Set();
    filteredLogs.forEach(l => {
      const canonical = getCanonicalStatus(l.status);
      if (canonical === "Reg.Done") {
        const leadId = l.contactId || l.Phone || l.Name;
        const cf = (l.calledFor || l.programName || "").toLowerCase().trim();
        const regKey = `${leadId}_${cf}`;
        if (!seenRegs.has(regKey)) {
          seenRegs.add(regKey);
          map["Reg.Done"] = (map["Reg.Done"] || 0) + 1;
        }
      } else {
        const s = !l.status || l.status === "Pending" ? "Pending" : l.status;
        map[s] = (map[s] || 0) + 1;
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredLogs]);

  const conversionsList = useMemo(() => {
    const seen = new Set();
    const result = [];
    filteredLogs.forEach(l => {
      if (getCanonicalStatus(l.status) === "Reg.Done") {
        const leadId = l.contactId || l.Phone || l.Name;
        const cf = (l.calledFor || l.programName || "").toLowerCase().trim();
        const regKey = `${leadId}_${cf}`;
        if (!seen.has(regKey)) {
          seen.add(regKey);
          result.push(l);
        }
      }
    });
    return result;
  }, [filteredLogs]);

  const totalRegDone = conversionsList.length;
  const totalInterested = filteredLogs.filter(l => getCanonicalStatus(l.status) === "Interested").length;

  const searchedConversions = useMemo(() => {
    if (!conversionSearch.trim()) return conversionsList;
    const term = conversionSearch.toLowerCase();
    return conversionsList.filter(c => {
      return (
        (c.Name || "").toLowerCase().includes(term) ||
        (c.Phone || "").toLowerCase().includes(term) ||
        (c.programName || "").toLowerCase().includes(term) ||
        (c.attenderName || "").toLowerCase().includes(term) ||
        (c.source || "").toLowerCase().includes(term) ||
        (c.calledFor || "").toLowerCase().includes(term) ||
        (c.feedback || "").toLowerCase().includes(term) ||
        (c.remark || "").toLowerCase().includes(term)
      );
    });
  }, [conversionsList, conversionSearch]);

  const convPerPage = 10;
  const totalConvPages = Math.ceil(searchedConversions.length / convPerPage) || 1;
  const paginatedConversions = useMemo(() => {
    const start = (convPage - 1) * convPerPage;
    return searchedConversions.slice(start, start + convPerPage);
  }, [searchedConversions, convPage]);

  useEffect(() => {
    setConvPage(1);
  }, [conversionSearch]);

  const handleExport = () => {
    if (filteredLogs.length === 0) { toast.error("No data to export."); return; }
    const ws = XLSX.utils.json_to_sheet(filteredLogs.map(cleanExportRow));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `CallCenter_Report_${todayStr}.xlsx`);
    toast.success("Report downloaded!");
  };

  const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const activeFilters = selectedProgramIds.length + selectedAttenderIds.length + selectedSources.length + selectedCalledFors.length + selectedStatuses.length + selectedCallTypes.length + selectedKhojiStatuses.length;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-black text-slate-800">Analytics Dashboard</h2>
              
              {/* Dynamic Live Real-Time Cache Sync Status Pill */}
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm text-xs font-semibold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-slate-300">
                  Cache Updated: <strong className="text-emerald-400 font-mono">{secondsAgo === 0 ? "Just now" : `${secondsAgo}s ago`}</strong>
                </span>
                <span className="text-slate-700">|</span>
                <span className="text-slate-300">
                  Next Fetch: <strong className="text-indigo-400 font-mono">in {nextFetchIn}s</strong>
                </span>
              </div>
            </div>
            <p className="text-slate-500 mt-1">Real-time call performance across all attenders (Auto-syncs every 45s).</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-bold text-xs rounded-2xl hover:bg-slate-900 transition shadow-sm cursor-pointer"
              title="Export Call Center Cache partition JSON by duration"
            >
              <Database size={16} /> Export Cache JSON
            </button>
            <button
              onClick={handleExport}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-2xl hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Download size={16} /> Export Report
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4">
          {/* Row 1: Dropdowns grid */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Tags multi-select */}
            <MultiSelect
              options={programOptions}
              selected={selectedProgramIds}
              onChange={setSelectedProgramIds}
              placeholder="Tags"
              allLabel="🌟 All Tags"
            />

            {/* Attenders multi-select */}
            <MultiSelect
              options={attenderOptions}
              selected={selectedAttenderIds}
              onChange={setSelectedAttenderIds}
              placeholder="Attenders"
              allLabel="👥 All Attenders"
            />

            {/* Source multi-select */}
            <MultiSelect
              options={sourceOptions}
              selected={selectedSources}
              onChange={setSelectedSources}
              placeholder="Source"
              allLabel="📢 All Sources"
            />

            {/* Called For multi-select */}
            <MultiSelect
              options={calledForOptions}
              selected={selectedCalledFors}
              onChange={setSelectedCalledFors}
              placeholder="Called For"
              allLabel="📞 All Called For"
            />

            {/* Status multi-select */}
            <MultiSelect
              options={statusOptions}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
              placeholder="Status"
              allLabel="📊 All Statuses"
            />

            {/* Call Type multi-select */}
            <MultiSelect
              options={callTypeOptions}
              selected={selectedCallTypes}
              onChange={setSelectedCallTypes}
              placeholder="Call Type"
              allLabel="📞 All Call Types"
            />

            {/* Khoji Status multi-select */}
            <MultiSelect
              options={khojiStatusOptions}
              selected={selectedKhojiStatuses}
              onChange={setSelectedKhojiStatuses}
              placeholder="Khoji Status"
              allLabel="🔮 All Khoji Statuses"
            />
          </div>

          {/* Row 2: Date range & Clear actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Date Range:</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-2xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <span className="text-gray-400 text-sm font-medium">to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-2xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              
              {(() => {
                const todayObj = new Date();
                const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;
                const isTodaySelected = dateFrom === todayStr && dateTo === todayStr;

                const yr = todayObj.getFullYear();
                const mn = todayObj.getMonth();
                const firstDayStr = `${yr}-${String(mn + 1).padStart(2, "0")}-01`;
                const lastDay = new Date(yr, mn + 1, 0).getDate();
                const lastDayStr = `${yr}-${String(mn + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
                const isThisMonthSelected = dateFrom === firstDayStr && dateTo === lastDayStr;

                return (
                  <div className="flex gap-2 ml-2">
                    <button
                      onClick={() => {
                        setDateFrom(todayStr);
                        setDateTo(todayStr);
                      }}
                      className={`px-3 py-1.5 rounded-2xl text-xs font-black border transition-all duration-200 ${
                        isTodaySelected
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20 scale-[1.03]"
                          : "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100/80 hover:scale-[1.01]"
                      }`}
                    >
                      📅 Today
                    </button>
                    <button
                      onClick={() => {
                        setDateFrom(firstDayStr);
                        setDateTo(lastDayStr);
                      }}
                      className={`px-3 py-1.5 rounded-2xl text-xs font-black border transition-all duration-200 ${
                        isThisMonthSelected
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20 scale-[1.03]"
                          : "bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100/80 hover:scale-[1.01]"
                      }`}
                    >
                      📅 This Month
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-semibold">{filteredLogs.length} entries</span>

              {/* Active filter badge + clear */}
              {(activeFilters > 0 || dateFrom !== todayStr || dateTo !== todayStr) && (
                <button
                  onClick={() => {
                    setSelectedProgramIds([]);
                    setSelectedAttenderIds([]);
                    setSelectedSources([]);
                    setSelectedCalledFors([]);
                    setSelectedStatuses([]);
                    setSelectedCallTypes([]);
                    setSelectedKhojiStatuses([]);
                    setDateFrom(todayStr);
                    setDateTo(todayStr);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-xs font-black hover:bg-red-100 transition"
                >
                  <X size={12} /> Clear filters
                  {activeFilters > 0 && <span className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{activeFilters}</span>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        {[
          { label: "Total Entries", value: filteredLogs.length, color: "blue", sub: "all entries" },
          { label: "Interested", value: totalInterested, color: "purple", sub: "hot leads" },
          { label: "Reg.Done", value: totalRegDone, color: "emerald", sub: "conversions" },
        ].map(s => (
          <div key={s.label} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:-translate-y-1 transition-all duration-300">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
            <p className={`text-4xl font-black text-${s.color}-600 mt-2`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Outcome Distribution</h3>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 h-[240px]">
            <div className="w-full sm:w-1/2 h-[220px]">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={outcomeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={50}
                    paddingAngle={3}
                  >
                    {outcomeData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} className="focus:outline-none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "none", borderRadius: "12px", color: "#fff" }}
                    itemStyle={{ color: "#fff" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-1/2 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-semibold text-gray-600 self-center">
              {(() => {
                const total = outcomeData.reduce((sum, item) => sum + item.value, 0);
                return outcomeData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between py-0.5 border-b border-gray-100 last:border-0 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="truncate text-gray-700" title={item.name}>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <span className="text-gray-900 font-bold">{item.value}</span>
                      <span className="text-gray-400 font-medium text-[9px]">({total ? ((item.value / total) * 100).toFixed(0) : 0}%)</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Calls by Attender</h3>
          <div className="w-full min-h-[240px]">
            <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={200}>
              <BarChart data={attenderStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>



      {/* Attender Breakdown Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">Per Attender Breakdown</h3>
            <p className="text-xs text-gray-400 mt-0.5">Click any attender row to inspect the exact leads & calls being counted.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Attender", "Total", "Outgoing", "Incoming", "Interested", "Reg.Done", "Pending", "Progress"].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {attenderStats.map(a => (
                <tr 
                  key={a.id || a.name} 
                  onClick={() => { setSelectedAttenderDetails(a); setAttenderModalSearch(""); }}
                  className="hover:bg-indigo-50/60 transition-colors cursor-pointer group"
                  title="Click to view full leads list"
                >
                  <td className="px-6 py-4 font-bold text-gray-800 group-hover:text-indigo-600 flex items-center gap-2">
                    {a.name}
                    <span className="text-[10px] text-gray-400 font-normal group-hover:text-indigo-500 group-hover:underline">🔍 Inspect</span>
                  </td>
                  <td className="px-6 py-4 font-black text-indigo-600">{a.total}</td>
                  <td className="px-6 py-4 text-blue-600 font-semibold">{a.outgoing}</td>
                  <td className="px-6 py-4 text-green-600 font-semibold">{a.incoming}</td>
                  <td className="px-6 py-4 text-purple-600 font-semibold">{a.interested}</td>
                  <td className="px-6 py-4 text-emerald-600 font-semibold">{a.regDone}</td>
                  <td className="px-6 py-4 text-amber-600 font-semibold">{a.pending}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${a.total ? Math.round(((a.total - a.pending) / a.total) * 100) : 0}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-500 whitespace-nowrap">
                        {a.total ? Math.round(((a.total - a.pending) / a.total) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {attenderStats.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-gray-400">No data for this selection.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Converted Leads Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-white via-white to-emerald-50/10">
          <div>
            <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
              <span className="text-emerald-500">🏆</span> Registered & Converted Leads ({conversionsList.length})
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Leads whose call outcome is marked as Registered/Reg.Done.</p>
          </div>
          <div className="relative max-w-xs w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search conversions..."
              value={conversionSearch}
              onChange={(e) => setConversionSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Name & Contact", "Attender", "Tag / Program", "Source / Called For", "Date & Time", "User Feedback", "Remarks"].map(h => (
                  <th key={h} className="px-6 py-3.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedConversions.map((c, idx) => {
                const dateVal = parseTimestamp(c.timestamp || c.updatedAt);
                const dateStr = dateVal ? dateVal.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "N/A";
                return (
                  <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                    {/* Name & Contact */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900 text-sm">{c.contactName || c.Name || c.name || "Unknown"}</div>
                      <div className="text-xs text-indigo-600 font-mono font-medium">{c.contactPhone || c.Phone || c.phone || c.Mobile || c.mobile || "N/A"}</div>
                      {c.contactCity && <div className="text-[10px] text-gray-400">{c.contactCity}</div>}
                    </td>
                    {/* Attender */}
                    <td className="px-6 py-4 font-semibold text-gray-700 text-xs">
                      {c.attenderName}
                    </td>
                    {/* Tag / Program */}
                    <td className="px-6 py-4">
                      <div className="text-gray-700 font-medium text-xs truncate max-w-[150px]">{c.programName}</div>
                      {c.tags && c.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.tags.slice(0, 2).map((t, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold">
                              {t}
                            </span>
                          ))}
                          {c.tags.length > 2 && (
                            <span className="text-[9px] text-gray-400">+{c.tags.length - 2}</span>
                          )}
                        </div>
                      )}
                    </td>
                    {/* Source / Called For */}
                    <td className="px-6 py-4 text-xs text-gray-600">
                      <div className="font-medium text-gray-700">{c.source || "N/A"}</div>
                      <div className="text-[10px] text-gray-400 font-medium mt-0.5">Called for: {c.calledFor || "N/A"}</div>
                    </td>
                    {/* Date & Time */}
                    <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                      {dateStr}
                    </td>
                    {/* User Feedback */}
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-600 max-w-[200px] truncate" title={c.feedback}>
                        {c.feedback || <span className="text-gray-300 italic">No feedback</span>}
                      </p>
                    </td>
                    {/* Remarks */}
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-600 max-w-[200px] truncate" title={c.remark}>
                        {c.remark || <span className="text-gray-300 italic">No remarks</span>}
                      </p>
                    </td>
                  </tr>
                );
              })}
              {paginatedConversions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 font-medium">
                    No conversions match the current filters and search query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalConvPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <span className="text-xs text-gray-400 font-medium">
              Showing {Math.min(searchedConversions.length, (convPage - 1) * convPerPage + 1)}-{Math.min(searchedConversions.length, convPage * convPerPage)} of {searchedConversions.length} entries
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConvPage(p => Math.max(1, p - 1))}
                disabled={convPage === 1}
                className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold rounded-xl shadow-xs transition"
              >
                Previous
              </button>
              <span className="px-3 text-xs font-bold text-gray-600">
                Page {convPage} of {totalConvPages}
              </span>
              <button
                onClick={() => setConvPage(p => Math.min(totalConvPages, p + 1))}
                disabled={convPage === totalConvPages}
                className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold rounded-xl shadow-xs transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drill-down Modal for Selected Attender */}
      {selectedAttenderDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/30 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-xl text-gray-900 flex items-center gap-2">
                  <span>📊</span> Calls & Leads Breakdown for <span className="text-indigo-600 underline decoration-indigo-300">{typeof selectedAttenderDetails === "object" ? selectedAttenderDetails.name : selectedAttenderDetails}</span>
                </h3>
                <p className="text-xs text-gray-500 mt-1 font-medium">
                  Showing {attenderModalLeads.length} counted entries for date range <span className="font-bold text-gray-700">{dateFrom}</span> to <span className="font-bold text-gray-700">{dateTo}</span>
                </p>
              </div>
              <button 
                onClick={() => setSelectedAttenderDetails(null)}
                className="p-2 rounded-full hover:bg-gray-200/60 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Controls Bar */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search leads by name, phone, status..."
                  value={attenderModalSearch}
                  onChange={e => setAttenderModalSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
                {attenderModalSearch && (
                  <button onClick={() => setAttenderModalSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                <span>Total Counted Items: <strong className="text-indigo-600 font-extrabold">{attenderModalLeads.length}</strong></span>
              </div>
            </div>

            {/* Content Table */}
            <div className="flex-1 overflow-y-auto p-6">
              {attenderModalLeads.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-2">🔍</div>
                  <p className="text-gray-500 font-bold">No matching leads found for this attender.</p>
                  <p className="text-xs text-gray-400 mt-1">Try adjusting the search query or date range filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-100 rounded-2xl shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Lead Name</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3 text-center">Calls Done</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Call Time (IST)</th>
                        <th className="px-4 py-3">Call Type</th>
                        <th className="px-4 py-3">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                      {attenderModalLeads.map((log, i) => {
                        const callTime = parseTimestamp(log.updatedAt || log.lastCalledAt);
                        const timeStr = callTime && !isNaN(callTime.getTime()) 
                          ? callTime.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) 
                          : "N/A";
                        const st = log.status || "Pending";
                        const isInterested = st === "Interested";
                        const isReg = st === "Reg.Done";
                        const isPending = st === "Pending";
                        const targetObj = typeof selectedAttenderDetails === "object" ? selectedAttenderDetails : { id: null, name: selectedAttenderDetails };
                        const targetId = targetObj.id;
                        const targetName = (targetObj.name || "").toLowerCase().trim();
                        let callsDoneCount = 0;

                        if (targetId && log.attenderStates && log.attenderStates[targetId]) {
                          const st = log.attenderStates[targetId];
                          if (Array.isArray(st.history) && st.history.length > 0) {
                            callsDoneCount = st.history.length;
                          } else if (st.lastCalledAt || st.status || st.remark) {
                            callsDoneCount = 1;
                          }
                        } else if (Array.isArray(log.history) && log.history.length > 0) {
                          const attenderHistory = log.history.filter(h => {
                            if (targetId && (h.attenderId === targetId || h.assignedTo === targetId)) return true;
                            const hName = (h.attenderName || h.name || "").toLowerCase().trim();
                            if (targetName && hName === targetName) return true;
                            return false;
                          });
                          callsDoneCount = attenderHistory.length > 0 ? attenderHistory.length : 1;
                        } else if (log.status || log.remark || log.Remark || log.callbackDate) {
                          callsDoneCount = 1;
                        }

                        return (
                          <tr key={log.id + "_" + i} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-4 py-3 text-gray-400 font-mono font-bold">{i + 1}</td>
                            <td className="px-4 py-3 font-extrabold text-gray-900">{log.Name || "Unknown"}</td>
                            <td className="px-4 py-3 font-mono font-medium text-gray-600">{log.Phone || "—"}</td>
                            <td className="px-4 py-3 text-center font-bold">
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[11px] border border-indigo-100">
                                📞 {callsDoneCount}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isReg ? "bg-emerald-100 text-emerald-800" :
                                isInterested ? "bg-purple-100 text-purple-800" :
                                isPending ? "bg-amber-100 text-amber-800" :
                                "bg-blue-100 text-blue-800"
                              }`}>
                                {st}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{timeStr}</td>
                            <td className="px-4 py-3 capitalize">{log.callType || "outgoing"}</td>
                            <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{log.remark || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end">
              <button
                onClick={() => setSelectedAttenderDetails(null)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Call Center Cache Duration Modal */}
      <ExportCacheModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
}
