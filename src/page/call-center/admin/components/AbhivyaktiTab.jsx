import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Download, Calendar, TrendingUp, UserCheck, Smile, Info, Search, X, ChevronDown, Check, ChevronRight
} from "lucide-react";
import { subscribeToRegistrations, getRegistrationMonths } from "../../../../lib/db";

function ReportSection({ title, subtitle, badge, children, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer"
      >
        <div>
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">{title}</h3>
            {badge && (
              <span className="text-xs px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-bold">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5 font-semibold">{subtitle}</p>}
        </div>
        {isOpen ? <ChevronDown size={20} className="text-gray-400 shrink-0" /> : <ChevronRight size={20} className="text-gray-400 shrink-0" />}
      </button>
      {isOpen && <div className="px-6 pb-6 pt-2 border-t border-gray-100 bg-white">{children}</div>}
    </div>
  );
}

// ── Multi-select dropdown component ──────────────────────────────────────────
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
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to parse dates in a robust way (handling Firestore Timestamps, ISO strings, Date objects, etc.)
const parseDate = (val) => {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// ── Main AbhivyaktiTab Component ──────────────────────────────────────────────
export default function AbhivyaktiTab({
  selectedMonth,
  setSelectedMonth,
  registrations = [],
  loading = false,
  monthOptions = []
}) {
  // Local filter states
  const [selectedCallTypes, setSelectedCallTypes] = useState([]);
  const [selectedCalledFors, setSelectedCalledFors] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedAttenders, setSelectedAttenders] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Default date boundaries based on loaded registrations
  useEffect(() => {
    if (registrations.length > 0) {
      let minDate = null;
      let maxDate = null;
      registrations.forEach(r => {
        const d = parseDate(r.registeredAt) || parseDate(r.createdAt);
        
        if (d && !isNaN(d.getTime())) {
          if (!minDate || d < minDate) minDate = d;
          if (!maxDate || d > maxDate) maxDate = d;
        }
      });
      if (minDate && maxDate) {
        const formatDateForInput = (date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, "0");
          const d = String(date.getDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        };
        setDateFrom(formatDateForInput(minDate));
        setDateTo(formatDateForInput(maxDate));
      }
    } else {
      setDateFrom("");
      setDateTo("");
    }
  }, [registrations, selectedMonth]);

  // Derived filter options from registrations data
  const callTypeOptions = useMemo(() => {
    const set = new Set();
    registrations.forEach(r => {
      if (r.callType) set.add(r.callType);
    });
    return Array.from(set).sort().map(val => ({
      value: val,
      label: val.charAt(0).toUpperCase() + val.slice(1)
    }));
  }, [registrations]);

  const calledForOptions = useMemo(() => {
    const set = new Set();
    registrations.forEach(r => {
      const val = r.calledFor || r["Called For"];
      if (val) {
        String(val).split(",").map(s => s.trim()).filter(Boolean).forEach(v => set.add(v));
      }
    });
    return Array.from(set).sort().map(val => ({ value: val, label: val }));
  }, [registrations]);

  const sourceOptions = useMemo(() => {
    const set = new Set();
    registrations.forEach(r => {
      const val = r.conversionSource || r.Source || r.source;
      if (val) set.add(String(val).trim());
    });
    return Array.from(set).sort().map(val => ({ value: val, label: val }));
  }, [registrations]);

  const attenderOptions = useMemo(() => {
    const set = new Set();
    registrations.forEach(r => {
      const val = r.convertedBy || r.attenderName || "Direct / Online";
      set.add(String(val).trim());
    });
    return Array.from(set).sort().map(val => ({ value: val, label: val }));
  }, [registrations]);

  // Apply filters to calculate filteredRegistrations
  const filteredRegistrations = useMemo(() => {
    return registrations.filter(r => {
      if (r._deleted) return false;

      // 1. Call Type Filter
      if (selectedCallTypes.length > 0 && !selectedCallTypes.includes(r.callType)) {
        return false;
      }

      // 2. Called For Filter
      if (selectedCalledFors.length > 0) {
        const rCalledFor = r.calledFor || r["Called For"];
        const rCalledFors = rCalledFor ? String(rCalledFor).split(",").map(s => s.trim()).filter(Boolean) : [];
        if (!rCalledFors.some(cf => selectedCalledFors.includes(cf))) return false;
      }

      // 3. Source Filter
      const rSource = r.conversionSource || r.Source || r.source;
      if (selectedSources.length > 0 && (!rSource || !selectedSources.includes(String(rSource).trim()))) {
        return false;
      }

      // 4. Attender Filter
      const rAttender = r.convertedBy || r.attenderName || "Direct / Online";
      if (selectedAttenders.length > 0 && !selectedAttenders.includes(String(rAttender).trim())) {
        return false;
      }

      // 5. Date Range Filter
      const d = parseDate(r.registeredAt) || parseDate(r.createdAt);
      
      if (d && !isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dStr = `${y}-${m}-${day}`;
        if (dateFrom && dStr < dateFrom) return false;
        if (dateTo && dStr > dateTo) return false;
      } else {
        if (dateFrom || dateTo) return false;
      }

      return true;
    });
  }, [registrations, selectedCallTypes, selectedCalledFors, selectedSources, selectedAttenders, dateFrom, dateTo]);

  // Active filters count
  const activeFilters = selectedCallTypes.length + selectedCalledFors.length + selectedSources.length + selectedAttenders.length;

  const metrics = useMemo(() => {
    const stats = {
      totalRegistrations: filteredRegistrations.length,
      avgPerDay: 0,
      highestDay: "-",
      totalAttenderAssisted: 0,
      conversionRate: "0.0%"
    };

    const dayMap = {};
    filteredRegistrations.forEach(r => {
      const d = parseDate(r.registeredAt) || parseDate(r.createdAt);
      if (d) {
        const dStr = d.toLocaleDateString("en-IN");
        dayMap[dStr] = (dayMap[dStr] || 0) + 1;
      }
      const hasRealAttender = (r.convertedBy && r.convertedBy !== "Unknown") || (r.attenderName && r.attenderName !== "Unknown");
      if (hasRealAttender) {
        stats.totalAttenderAssisted++;
      }
    });

    const dayCounts = Object.values(dayMap);
    if (dayCounts.length > 0) {
      stats.avgPerDay = Math.round(dayCounts.reduce((a, b) => a + b, 0) / dayCounts.length);
      const sorted = Object.entries(dayMap).sort((a, b) => b[1] - a[1]);
      stats.highestDay = `${sorted[0][0]} (${sorted[0][1]} regs)`;
    }

    return stats;
  }, [filteredRegistrations]);

  const section1 = useMemo(() => {
    return [
      { metric: "Total Registrations Count", value: metrics.totalRegistrations },
      { metric: "Average Registrations Per Day", value: metrics.avgPerDay },
      { metric: "Attender Assisted Conversions", value: metrics.totalAttenderAssisted },
      { metric: "Direct Online / Unassisted Registrations", value: metrics.totalRegistrations - metrics.totalAttenderAssisted }
    ];
  }, [metrics]);

  const sourceBreakdown = useMemo(() => {
    const map = {};
    let total = 0;
    filteredRegistrations.forEach(r => {
      const src = r.conversionSource || r.Source || "Online/Direct";
      map[src] = (map[src] || 0) + 1;
      total++;
    });
    return Object.entries(map).map(([src, count]) => ({
      "Registration Source": src,
      "Count": count,
      "Percentage (%)": total ? `${((count / total) * 100).toFixed(1)}%` : "0.0%"
    })).sort((a, b) => b.Count - a.Count);
  }, [filteredRegistrations]);

  const dayWiseTimeline = useMemo(() => {
    const map = {};
    filteredRegistrations.forEach(r => {
      const d = parseDate(r.registeredAt) || parseDate(r.createdAt);
      if (!d) return;
      const dStr = d.toLocaleDateString("en-IN");
      if (!map[dStr]) {
        map[dStr] = { date: dStr, total: 0, assisted: 0, direct: 0 };
      }
      map[dStr].total++;
      const hasRealAttender = (r.convertedBy && r.convertedBy !== "Unknown") || (r.attenderName && r.attenderName !== "Unknown");
      if (hasRealAttender) map[dStr].assisted++;
      else map[dStr].direct++;
    });

    const list = [];
    if (selectedMonth && selectedMonth.includes("-")) {
      const [year, month] = selectedMonth.split("-").map(Number);
      const parsedMonth = new Date(year, month - 1, 1);
      const daysInMonth = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const checkDate = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth(), day);
        const dStr = checkDate.toLocaleDateString("en-IN");
        
        // Only push date to list if it fits inside dateFrom and dateTo filters (if present)
        const checkDateInputFormat = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
        if (dateFrom && checkDateInputFormat < dateFrom) continue;
        if (dateTo && checkDateInputFormat > dateTo) continue;

        const data = map[dStr] || { date: dStr, total: 0, assisted: 0, direct: 0 };
        list.push({
          "Date": dStr,
          "Total Registrations": data.total,
          "Attender Assisted": data.assisted,
          "Direct Online": data.direct
        });
      }
    } else {
      const allDates = Array.from(new Set(filteredRegistrations.map(r => {
        const d = parseDate(r.registeredAt) || parseDate(r.createdAt);
        return d ? d.toLocaleDateString("en-IN") : null;
      }).filter(Boolean))).sort((a, b) => {
        const [da, ma, ya] = a.split("/").map(Number);
        const [db, mb, yb] = b.split("/").map(Number);
        return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
      });

      allDates.forEach(dStr => {
        const data = map[dStr] || { date: dStr, total: 0, assisted: 0, direct: 0 };
        list.push({
          "Date": dStr,
          "Total Registrations": data.total,
          "Attender Assisted": data.assisted,
          "Direct Online": data.direct
        });
      });
    }
    return list;
  }, [filteredRegistrations, selectedMonth, dateFrom, dateTo]);

  const dayWiseTotals = useMemo(() => {
    const totals = { "Date": "Total", "Total Registrations": 0, "Attender Assisted": 0, "Direct Online": 0 };
    dayWiseTimeline.forEach(row => {
      totals["Total Registrations"] += row["Total Registrations"];
      totals["Attender Assisted"] += row["Attender Assisted"];
      totals["Direct Online"] += row["Direct Online"];
    });
    return totals;
  }, [dayWiseTimeline]);

  const attenderPerformance = useMemo(() => {
    const map = {};
    filteredRegistrations.forEach(r => {
      const name = r.convertedBy || r.attenderName;
      if (!name || name === "Unknown") return;
      if (!map[name]) {
        map[name] = { name, incoming: 0, outgoing: 0, count: 0 };
      }
      const callType = (r.callType || "").toLowerCase();
      if (callType === "incoming") {
        map[name].incoming++;
      } else if (callType === "outgoing") {
        map[name].outgoing++;
      }
      map[name].count++;
    });

    return Object.values(map).map(a => ({
      "Attender Name": a.name,
      "Incoming Conversions": a.incoming,
      "Outgoing Conversions": a.outgoing,
      "Total Conversions": a.count
    })).sort((a, b) => b["Total Conversions"] - a["Total Conversions"]);
  }, [filteredRegistrations]);

  const attenderPerformanceTotals = useMemo(() => {
    const totals = {
      "Attender Name": "Total Assisted",
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0,
      "Total Conversions": 0
    };
    attenderPerformance.forEach(row => {
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
      totals["Total Conversions"] += row["Total Conversions"];
    });
    return totals;
  }, [attenderPerformance]);

  // Breakdown table for Called For + Attender Name + Call Type (Incoming/Outgoing) + Conversions Count
  const calledForAttenderBreakdown = useMemo(() => {
    const map = {};
    filteredRegistrations.forEach(r => {
      const rawCalledFor = r.calledFor || r["Called For"];
      const calledForTags = rawCalledFor
        ? String(rawCalledFor).split(",").map(s => s.trim()).filter(Boolean)
        : ["Unspecified"];
      if (calledForTags.length === 0) calledForTags.push("Unspecified");

      const attender = r.convertedBy || r.attenderName || "Direct / Online";
      const callType = (r.callType || "").toLowerCase();

      calledForTags.forEach(tag => {
        const key = `${tag}___${attender}`;
        if (!map[key]) {
          map[key] = {
            calledFor: tag,
            attenderName: attender,
            incoming: 0,
            outgoing: 0,
            total: 0
          };
        }
        if (callType === "incoming") {
          map[key].incoming++;
        } else if (callType === "outgoing") {
          map[key].outgoing++;
        }
        map[key].total++;
      });
    });

    return Object.values(map)
      .map(item => ({
        "Converted By (Attender)": item.attenderName,
        "Called For": item.calledFor,
        "Incoming Conversions": item.incoming,
        "Outgoing Conversions": item.outgoing,
        "Total Conversions": item.total
      }))
      .sort((a, b) => {
        const attenderComp = a["Converted By (Attender)"].localeCompare(b["Converted By (Attender)"]);
        if (attenderComp !== 0) return attenderComp;
        const cfComp = a["Called For"].localeCompare(b["Called For"]);
        if (cfComp !== 0) return cfComp;
        return b["Total Conversions"] - a["Total Conversions"];
      });
  }, [filteredRegistrations]);

  const calledForAttenderTotals = useMemo(() => {
    const totals = {
      "Called For": "Total",
      "Converted By (Attender)": "-",
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0,
      "Total Conversions": 0
    };
    calledForAttenderBreakdown.forEach(row => {
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
      totals["Total Conversions"] += row["Total Conversions"];
    });
    return totals;
  }, [calledForAttenderBreakdown]);

  const handleExport = () => {
    if (!filteredRegistrations.length) {
      toast.error("No registration data to export.");
      return;
    }
    const wb = XLSX.utils.book_new();

    // 1. Raw Data
    const rows = filteredRegistrations.map(r => {
      const nameVal = r.Name || r.name || "Unknown";
      const phoneVal = r.Phone || r.phone || "";
      const mobileVal = r.Mobile || r.mobile || "";
      const attenderVal = r.attenderName || "Unassigned";
      const convertedByVal = r.convertedBy || "Direct / Online";
      const callsDoneVal = r.callCount !== undefined ? r.callCount : (r.history ? r.history.length : 0);
      const calledForVal = r.calledFor || r["Called For"] || "";
      const sourceVal = r.conversionSource || r.Source || r.source || "";
      const callTypeVal = r.callType || "";

      return {
        "Name": nameVal,
        "Phone Number": phoneVal,
        "Mobile Number": mobileVal,
        "Attender Name": attenderVal,
        "Converted By": convertedByVal,
        "Calls Done": callsDoneVal,
        "Called For": calledForVal,
        "Source": sourceVal,
        "Call Type": callTypeVal
      };
    });
    const wsRaw = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, wsRaw, "Registrations List");

    // 2. Summary
    const wsSummary = XLSX.utils.json_to_sheet(section1);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary KPI");

    // 3. Source Breakdown
    const wsSource = XLSX.utils.json_to_sheet(sourceBreakdown);
    XLSX.utils.book_append_sheet(wb, wsSource, "Source Distribution");

    // 4. Day-wise Timeline
    const wsDay = XLSX.utils.json_to_sheet([...dayWiseTimeline, dayWiseTotals]);
    XLSX.utils.book_append_sheet(wb, wsDay, "Day-wise Timeline");

    // 5. Attender performance
    const wsAttenders = XLSX.utils.json_to_sheet([...attenderPerformance, attenderPerformanceTotals]);
    XLSX.utils.book_append_sheet(wb, wsAttenders, "Attender Breakdown");

    // 6. Called For & Attender Breakdown
    const wsCalledForAttenders = XLSX.utils.json_to_sheet([...calledForAttenderBreakdown, calledForAttenderTotals]);
    XLSX.utils.book_append_sheet(wb, wsCalledForAttenders, "CalledFor & Attenders");

    XLSX.writeFile(wb, `Abhivyakti_RegistrationsReport_${selectedMonth}.xlsx`);
    toast.success("Abhivyakti report downloaded successfully!");
  };

  return (
    <div className="p-8 space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800">Abhivyakti Registration Analytics</h2>
          <p className="text-slate-500 mt-1">Track registrations, sources, conversions, and export reporting sheets.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleExport} disabled={!filteredRegistrations.length}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-sm transition-all disabled:opacity-50">
            <Download size={18} /> Export Workbook
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4">
        {/* Row 1: Dropdowns grid */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Scope Dropdown */}
          <div className="relative flex-1 min-w-[150px] sm:min-w-[165px] max-w-[250px]">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm font-bold text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
            >
              <option value="last-3-months">Last 3 Months</option>
              <option value="last-6-months">Last 6 Months</option>
              <option value="ALL">All Time</option>
              {monthOptions.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Call Type Dropdown */}
          <MultiSelect
            options={callTypeOptions}
            selected={selectedCallTypes}
            onChange={setSelectedCallTypes}
            placeholder="Call Type"
            allLabel="📞 All Call Types"
          />

          {/* Called For Dropdown */}
          <MultiSelect
            options={calledForOptions}
            selected={selectedCalledFors}
            onChange={setSelectedCalledFors}
            placeholder="Called For"
            allLabel="📞 All Called For"
          />

          {/* Source Dropdown */}
          <MultiSelect
            options={sourceOptions}
            selected={selectedSources}
            onChange={setSelectedSources}
            placeholder="Source"
            allLabel="📢 All Sources"
          />

          {/* Attender Dropdown */}
          <MultiSelect
            options={attenderOptions}
            selected={selectedAttenders}
            onChange={setSelectedAttenders}
            placeholder="Attender"
            allLabel="👥 All Attenders"
          />
        </div>

        {/* Row 2: Date Pickers & Actions */}
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
            <span className="text-xs text-gray-400 font-semibold">{filteredRegistrations.length} entries</span>

            {/* Clear filters action */}
            {(activeFilters > 0) && (
              <button
                onClick={() => {
                  setSelectedCallTypes([]);
                  setSelectedCalledFors([]);
                  setSelectedSources([]);
                  setSelectedAttenders([]);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-xs font-black hover:bg-red-100 transition"
              >
                <X size={12} /> Clear filters
                <span className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{activeFilters}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400 font-bold">Loading registrations database...</div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="py-20 text-center text-gray-400 font-bold">No registration records match the filters.</div>
      ) : (
        <div className="space-y-6">
          {/* Summary Metric Cards - 4 Side-by-Side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                <Calendar size={22} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Average Registrations/Day</p>
                <p className="text-2xl font-black text-gray-800 mt-1">{metrics.avgPerDay}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                <TrendingUp size={22} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Highest Peak Day</p>
                <p className="text-sm font-bold text-gray-800 mt-1 truncate" title={metrics.highestDay}>{metrics.highestDay}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
                <UserCheck size={22} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Attender Assisted Registrations</p>
                <p className="text-2xl font-black text-gray-800 mt-1">{metrics.totalAttenderAssisted}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 shrink-0">
                <Smile size={22} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Direct Registrations (Online)</p>
                <p className="text-2xl font-black text-gray-800 mt-1">{metrics.totalRegistrations - metrics.totalAttenderAssisted}</p>
              </div>
            </div>
          </div>

          {/* Source breakdown */}
          <ReportSection title="Registration Channels Distribution">
                <div className="overflow-x-auto rounded-2xl border border-gray-100">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3">Registration Source</th>
                        <th className="px-6 py-3 text-right">Count</th>
                        <th className="px-6 py-3 text-right">Percentage (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                      {sourceBreakdown.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-3.5 font-bold text-gray-800">{r["Registration Source"]}</td>
                          <td className="px-6 py-3.5 text-right font-black text-indigo-600">{r["Count"]}</td>
                          <td className="px-6 py-3.5 text-right">{r["Percentage (%)"]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ReportSection>

              {/* Attender Productivity */}
              {attenderPerformance.length > 0 && (
                <ReportSection title="Attender Assisted Conversions">
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-[350px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 sticky top-0">
                        <tr>
                          <th className="px-6 py-3 bg-gray-50">Attender Name</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">Incoming</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">Outgoing</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">Total Conversions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                        {attenderPerformance.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-3.5 font-bold text-gray-800">{r["Attender Name"]}</td>
                            <td className="px-6 py-3.5 text-right font-black">
                              {r["Incoming Conversions"] > 0 ? (
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                                  {r["Incoming Conversions"]}
                                </span>
                              ) : (
                                <span className="text-gray-300">0</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right font-black">
                              {r["Outgoing Conversions"] > 0 ? (
                                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                                  {r["Outgoing Conversions"]}
                                </span>
                              ) : (
                                <span className="text-gray-300">0</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right font-black text-indigo-600">{r["Total Conversions"]}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50/70 border-t border-gray-100 font-bold text-gray-900 sticky bottom-0">
                          <td className="px-6 py-4 bg-gray-50">Total Assisted</td>
                          <td className="px-6 py-4 bg-gray-50 text-right text-emerald-700 font-extrabold">{attenderPerformanceTotals["Incoming Conversions"]}</td>
                          <td className="px-6 py-4 bg-gray-50 text-right text-blue-700 font-extrabold">{attenderPerformanceTotals["Outgoing Conversions"]}</td>
                          <td className="px-6 py-4 bg-gray-50 text-right text-indigo-700 font-extrabold">{attenderPerformanceTotals["Total Conversions"]}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </ReportSection>
              )}

              {/* Called For & Attender Conversions Table */}
              {calledForAttenderBreakdown.length > 0 && (
                <ReportSection
                  title="Conversions by Called For & Attender"
                  subtitle="Breakdown of conversions by Called For category, Attender name, and Call Type"
                >
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                        <tr>
                          <th className="px-6 py-3 bg-gray-50">Converted By (Attender)</th>
                          <th className="px-6 py-3 bg-gray-50">Called For</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">Incoming Calls</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">Outgoing Calls</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">Total Conversions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                        {calledForAttenderBreakdown.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-3.5 font-bold text-indigo-900">{r["Converted By (Attender)"]}</td>
                            <td className="px-6 py-3.5 font-bold text-gray-800">{r["Called For"]}</td>
                            <td className="px-6 py-3.5 text-right font-black">
                              {r["Incoming Conversions"] > 0 ? (
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                                  {r["Incoming Conversions"]}
                                </span>
                              ) : (
                                <span className="text-gray-300">0</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right font-black">
                              {r["Outgoing Conversions"] > 0 ? (
                                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                                  {r["Outgoing Conversions"]}
                                </span>
                              ) : (
                                <span className="text-gray-300">0</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right font-black text-indigo-600">{r["Total Conversions"]}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50/70 border-t border-gray-100 font-bold text-gray-900">
                          <td className="px-6 py-4 bg-gray-50" colSpan={2}>Total Conversions</td>
                          <td className="px-6 py-4 bg-gray-50 text-right text-emerald-700 font-extrabold">{calledForAttenderTotals["Incoming Conversions"]}</td>
                          <td className="px-6 py-4 bg-gray-50 text-right text-blue-700 font-extrabold">{calledForAttenderTotals["Outgoing Conversions"]}</td>
                          <td className="px-6 py-4 bg-gray-50 text-right text-indigo-700 font-extrabold">{calledForAttenderTotals["Total Conversions"]}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </ReportSection>
              )}

          {/* Filtered Registrations Names Table */}
          <ReportSection
            title={`Registrations Table List (${filteredRegistrations.length})`}
            subtitle="Verify names and details before exporting"
          >
            <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-[500px] overflow-y-auto mt-2">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 bg-gray-50">Name</th>
                    <th className="px-6 py-3 bg-gray-50">Phone Number</th>
                    <th className="px-6 py-3 bg-gray-50">Mobile Number</th>
                    <th className="px-6 py-3 bg-gray-50">Attender Name</th>
                    <th className="px-6 py-3 bg-gray-50">Converted By</th>
                    <th className="px-6 py-3 bg-gray-50 text-center">Calls Done</th>
                    <th className="px-6 py-3 bg-gray-50">Called For</th>
                    <th className="px-6 py-3 bg-gray-50">Source</th>
                    <th className="px-6 py-3 bg-gray-50">Call Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                  {filteredRegistrations.map((r, i) => {
                    const nameVal = r.Name || r.name || "Unknown";
                    const phoneVal = r.Phone || r.phone || "N/A";
                    const mobileVal = r.Mobile || r.mobile || "N/A";
                    const attenderVal = r.attenderName || "Unassigned";
                    const convertedByVal = r.convertedBy || "Direct / Online";
                    const callsDoneVal = r.callCount !== undefined ? r.callCount : (r.history ? r.history.length : 0);
                    const calledForVal = r.calledFor || r["Called For"] || "N/A";
                    const sourceVal = r.conversionSource || r.Source || r.source || "N/A";
                    const callTypeVal = r.callType || "N/A";

                    return (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-gray-800">{nameVal}</td>
                        <td className="px-6 py-3.5 font-mono text-xs">{phoneVal}</td>
                        <td className="px-6 py-3.5 font-mono text-xs">{mobileVal}</td>
                        <td className="px-6 py-3.5">{attenderVal}</td>
                        <td className="px-6 py-3.5 text-emerald-600">{convertedByVal}</td>
                        <td className="px-6 py-3.5 text-center font-black text-indigo-600">{callsDoneVal}</td>
                        <td className="px-6 py-3.5 font-bold">{calledForVal}</td>
                        <td className="px-6 py-3.5 text-xs">{sourceVal}</td>
                        <td className="px-6 py-3.5 text-xs uppercase">{callTypeVal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ReportSection>
        </div>
      )}
    </div>
  );
}
