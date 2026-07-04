import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import { BarChart3, Download, Search, X, ChevronDown, Check } from "lucide-react";
import { subscribeToAllCallLogs } from "../../../../lib/db";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { COLORS, cleanExportRow, CONNECTED_STATUSES, NOT_CONNECTED_STATUSES } from "../utils.jsx";

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
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={`flex items-center justify-between gap-2 px-4 py-2.5 border rounded-2xl font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full whitespace-nowrap overflow-hidden transition-all ${
          hasFilterApplied
            ? "bg-indigo-50/50 border-indigo-300 text-indigo-900 font-extrabold"
            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50/50"
        }`}
      >
        <span className="truncate flex-1 text-left">{label}</span>
        <ChevronDown size={14} className={`shrink-0 transition-colors ${hasFilterApplied ? "text-indigo-600" : "text-gray-400"}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl w-full min-w-[200px] overflow-hidden">
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

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function DashboardTab({ programs, attenders, settingsOptions = { statusOptions: [], sourceOptions: [], calledForOptions: [] }, callLogs = [] }) {
  const todayStr = new Date().toISOString().split("T")[0];

  const [selectedProgramIds, setSelectedProgramIds] = useState([]); // empty = ALL
  const [selectedAttenderIds, setSelectedAttenderIds] = useState([]); // empty = ALL
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedCalledFors, setSelectedCalledFors] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [conversionSearch, setConversionSearch] = useState("");
  const [convPage, setConvPage] = useState(1);

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
    const values = new Set(settingsOptions?.calledForOptions || []);
    callLogs.forEach(log => {
      const key = Object.keys(log).find(k => ["called for", "called_for", "calledfor"].includes(k.toLowerCase()));
      const val = key ? String(log[key] || "").trim() : "";
      if (val) values.add(val);
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

      const feedbackKey = Object.keys(log).find(k => ["prog. feedback", "feedback", "user feedback", "program feedback"].includes(k.toLowerCase()));
      const feedbackVal = feedbackKey ? String(log[feedbackKey] || "").trim() : "";

      const getAttemptDate = (val) => {
        if (!val) return null;
        if (typeof val.toDate === "function") return val.toDate();
        return new Date(val);
      };

      const processAttempt = (att, attId, state, isHistory, index) => {
        const status = att.status || "Pending";

        const dateVal = att.timestamp || att.updatedAt || state.lastCalledAt || state.updatedAt;
        const attemptDate = getAttemptDate(dateVal) || getAttemptDate(log.updatedAt || log.createdAt);

        return {
          ...log,
          id: `${log.id}_${attId}_${isHistory ? `h_${index}` : "latest"}`,
          contactId: log.id,
          Name: contactName,
          Phone: contactPhone,
          programId: log.programId,
          programName: log.programName || "Unknown Program",
          tags: log.tags || [],
          attenderId: attId,
          attenderName: state.attenderName || att.attenderName || "Unknown",
          status: status,
          remark: att.remark || "",
          callType: att.callType || state.callType || "outgoing",
          history: state.history || [],
          callbackDate: state.callbackDate || null,
          createdAt: log.createdAt,
          updatedAt: attemptDate,
          lastCalledAt: state.lastCalledAt || null,
          source: att.source || state.Source || state.source || sourceVal,
          calledFor: att.calledFor || state["Called For"] || state.calledFor || calledForVal,
          feedback: feedbackVal
        };
      };

      if (log.attenderStates && Object.keys(log.attenderStates).length > 0) {
        Object.entries(log.attenderStates).forEach(([attId, state]) => {
          if (state.history && Array.isArray(state.history) && state.history.length > 0) {
            state.history.forEach((h, index) => {
              const att = processAttempt(
                {
                  timestamp: h.timestamp,
                  status: h.status,
                  remark: h.remark,
                  callType: h.callType,
                  source: h.source,
                  calledFor: h.calledFor,
                  attenderName: h.attenderName
                },
                attId,
                state,
                true,
                index
              );
              if (att) list.push(att);
            });
          } else if (state.lastCalledAt || (state.status && state.status !== "Pending") || state.remark) {
            const att = processAttempt(
              {
                timestamp: state.lastCalledAt || state.updatedAt,
                status: state.status,
                remark: state.remark,
                callType: state.callType,
                source: state.Source || state.source,
                calledFor: state["Called For"] || state.calledFor
              },
              attId,
              state,
              false
            );
            if (att) list.push(att);
          }
        });
      } else {
        const attId = log.attenderId || "legacy";
        const dummyState = {
          attenderName: log.attenderName || "Legacy Attender",
          status: log.status,
          remark: log.remark,
          callType: log.callType,
          lastCalledAt: log.lastCalledAt,
          updatedAt: log.updatedAt,
          history: log.history,
          callbackDate: log.callbackDate,
          Source: log.Source || log.source,
          calledFor: log["Called For"] || log.calledFor
        };

        if (log.history && Array.isArray(log.history) && log.history.length > 0) {
          log.history.forEach((h, index) => {
            const att = processAttempt(
              {
                timestamp: h.timestamp,
                status: h.status,
                remark: h.remark,
                callType: h.callType,
                source: h.source,
                calledFor: h.calledFor,
                attenderName: h.attenderName
              },
              attId,
              dummyState,
              true,
              index
            );
            if (att) list.push(att);
          });
        } else {
          if (log.lastCalledAt || (log.status && log.status !== "Pending") || log.remark) {
            const att = processAttempt(
              {
                timestamp: log.lastCalledAt || log.updatedAt || log.createdAt,
                status: log.status,
                remark: log.remark,
                callType: log.callType,
                source: log.Source || log.source,
                calledFor: log["Called For"] || log.calledFor
              },
              attId,
              dummyState,
              false
            );
            if (att) list.push(att);
          }
        }
      }
    });
    return list;
  }, [callLogs]);

  const filteredLogs = useMemo(() => {
    return flattenedLogs.filter(log => {
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
      if (selectedAttenderIds.length > 0 && !selectedAttenderIds.includes(log.attenderId)) return false;

      // Source filter
      if (selectedSources.length > 0 && !selectedSources.includes(log.source || "")) return false;

      // Called For filter
      if (selectedCalledFors.length > 0 && !selectedCalledFors.includes(log.calledFor || "")) return false;

      // Status filter
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(log.status || "Pending")) return false;

      // Date range based on action update time
      const logDate = log.updatedAt;
      if (!logDate || isNaN(logDate)) return false;
      if (dateFrom && logDate < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && logDate > new Date(dateTo + "T23:59:59")) return false;

      return true;
    });
  }, [flattenedLogs, selectedProgramIds, selectedAttenderIds, selectedSources, selectedCalledFors, selectedStatuses, dateFrom, dateTo, programs]);

  const attenderStats = useMemo(() => {
    const map = {};
    filteredLogs.forEach(log => {
      if (!map[log.attenderName]) {
        map[log.attenderName] = { name: log.attenderName, total: 0, outgoing: 0, incoming: 0, interested: 0, regDone: 0, pending: 0 };
      }
      const s = map[log.attenderName];
      s.total++;
      if (log.callType === "incoming") s.incoming++; else s.outgoing++;
      if (log.status === "Interested") s.interested++;
      if (log.status === "Reg.Done") s.regDone++;
      if (!log.status || log.status === "Pending") s.pending++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredLogs]);

  const outcomeData = useMemo(() => {
    const map = {};
    filteredLogs.forEach(l => {
      const s = !l.status || l.status === "Pending" ? "Pending" : l.status;
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredLogs]);

  const totalRegDone = filteredLogs.filter(l => l.status === "Reg.Done").length;
  const totalInterested = filteredLogs.filter(l => l.status === "Interested").length;

  const conversionsList = useMemo(() => {
    return filteredLogs.filter(l => l.status === "Reg.Done");
  }, [filteredLogs]);

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

  const activeFilters = selectedProgramIds.length + selectedAttenderIds.length + selectedSources.length + selectedCalledFors.length + selectedStatuses.length;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-slate-800">Analytics Dashboard</h2>
            <p className="text-slate-500 mt-1">Real-time call performance across all attenders.</p>
          </div>
          <button
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition disabled:opacity-50 shrink-0"
          >
            <Download size={16} /> Export Report
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4">
          {/* Row 1: Dropdowns grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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
            <div className="w-full sm:w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
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
          <ResponsiveContainer width="100%" height={240}>
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



      {/* Attender Breakdown Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Per Attender Breakdown</h3>
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
                <tr key={a.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-800">{a.name}</td>
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
              {paginatedConversions.map(c => {
                const dateStr = c.updatedAt instanceof Date && !isNaN(c.updatedAt)
                  ? c.updatedAt.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
                  : "N/A";
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    {/* Name & Contact */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-800">{c.Name || "Unnamed"}</div>
                      <div className="text-xs text-gray-400 font-medium">{c.Phone || "No Phone"}</div>
                    </td>
                    {/* Attender */}
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl">
                        👤 {c.attenderName}
                      </span>
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
    </div>
  );
}
