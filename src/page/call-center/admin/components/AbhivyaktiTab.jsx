import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Download, Calendar, TrendingUp, UserCheck, Smile, Info, Search, X, ChevronDown, Check, ChevronRight
} from "lucide-react";
import { CONNECTED_STATUSES, getContactKhoji } from "../utils.jsx";

function ReportSection({ title, subtitle, badge, action, children, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-300">
      <div className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer select-none">
        <div onClick={() => setIsOpen(!isOpen)} className="flex-1">
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
        <div className="flex items-center gap-3 shrink-0">
          {action}
          <button type="button" onClick={() => setIsOpen(!isOpen)} className="p-1 text-gray-400 hover:text-gray-600">
            {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>
      </div>
      {isOpen && <div className="px-6 pb-6 pt-2 border-t border-gray-100 bg-white">{children}</div>}
    </div>
  );
}

// ── Formula Info Popover ──────────────────────────────────────────────────────
function FormulaInfoPopover({ title = "Formula Info", formulas = [], iconOnly = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left font-normal normal-case" ref={popoverRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={
          iconOnly
            ? "p-1 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-full transition-all inline-flex items-center justify-center cursor-pointer shadow-2xs"
            : "px-2.5 py-1 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-full transition-all inline-flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer"
        }
        title={iconOnly ? `View ${title}` : "View Formula Information"}
      >
        <Info size={iconOnly ? 13 : 14} className="text-indigo-600" />
        {!iconOnly && <span>Formula Info</span>}
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 mt-2 w-80 p-4 bg-slate-900 text-white rounded-2xl shadow-xl z-50 border border-slate-700 text-xs normal-case font-normal"
        >
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
            <span className="font-extrabold text-indigo-300 text-sm flex items-center gap-1.5">
              <Info size={16} className="text-indigo-400" /> {title}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-3">
            {formulas.map((item, idx) => (
              <div key={idx}>
                {item.label && <div className="text-indigo-300 font-bold mb-1">{item.label}</div>}
                <div className="bg-slate-800/90 p-2 rounded-xl text-slate-200 font-mono text-[11px] border border-slate-700/60 leading-relaxed">
                  {item.formula}
                </div>
                {item.note && <div className="text-[10px] text-slate-400 mt-1 italic">{item.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
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

// Helper to parse dates in a robust way (handling Firestore Timestamps, ISO strings, Date objects, string formats, etc.)
const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val.toDate === "function") return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  if (typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (trimmed.includes("/")) {
      const parts = trimmed.split(/[/ :]/);
      if (parts.length >= 3) {
        const [d, m, y] = parts.map(Number);
        if (y && m && d) return new Date(y, m - 1, d);
      }
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

// Option 3: Primary Assigned Attender Priority Helper (Assigned Lead Owner Priority)
export const getRegistrationPrimaryAttender = (r) => {
  if (!r) return "Direct / Online";

  // 1. Check assigned lead owner (attenderName, assignedTo, assignedAttender, attender)
  const assigned = r.attenderName || r.assignedTo || r.assignedAttender || r.attender;
  if (assigned && String(assigned).trim() && String(assigned).trim() !== "Unknown" && String(assigned).trim() !== "Unassigned") {
    return String(assigned).trim();
  }

  // 2. Look back at prior call history array to find the primary nurturer
  if (Array.isArray(r.history) && r.history.length > 0) {
    for (let i = 0; i < r.history.length; i++) {
      const h = r.history[i];
      const hAttender = h.attenderName || h.convertedBy || h.user || h.attender;
      if (hAttender && String(hAttender).trim() && String(hAttender).trim() !== "Unknown" && String(hAttender).trim() !== "Unassigned") {
        return String(hAttender).trim();
      }
    }
  }

  // 3. Fallback to convertedBy or Direct / Online
  if (r.convertedBy && String(r.convertedBy).trim() && String(r.convertedBy).trim() !== "Unknown") {
    return String(r.convertedBy).trim();
  }

  return "Direct / Online";
};

// ── Main AbhivyaktiTab Component ──────────────────────────────────────────────
export default function AbhivyaktiTab({
  registrations = [],
  loading = false
}) {
  // Local filter states
  const [selectedCallTypes, setSelectedCallTypes] = useState([]);
  const [selectedCalledFors, setSelectedCalledFors] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedAttenders, setSelectedAttenders] = useState([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const todayObj = new Date();
    const yr = todayObj.getFullYear();
    const mn = String(todayObj.getMonth() + 1).padStart(2, "0");
    return `${yr}-${mn}-01`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const todayObj = new Date();
    const yr = todayObj.getFullYear();
    const mn = todayObj.getMonth();
    const lastDay = new Date(yr, mn + 1, 0).getDate();
    const mnStr = String(mn + 1).padStart(2, "0");
    return `${yr}-${mnStr}-${lastDay}`;
  });

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
      const val = getRegistrationPrimaryAttender(r);
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

      // 4. Attender Filter (Assigned Lead Owner Priority)
      const rAttender = getRegistrationPrimaryAttender(r);
      if (selectedAttenders.length > 0 && !selectedAttenders.includes(String(rAttender).trim())) {
        return false;
      }

      // 5. Date Range Filter
      if (dateFrom || dateTo) {
        const d = parseDate(r.registeredAt) || parseDate(r.createdAt);
        if (!d || isNaN(d.getTime())) return false;
        
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dStr = `${y}-${m}-${day}`;
        if (dateFrom && dStr < dateFrom) return false;
        if (dateTo && dStr > dateTo) return false;
      }

      return true;
    });
  }, [registrations, selectedCallTypes, selectedCalledFors, selectedSources, selectedAttenders, dateFrom, dateTo]);

  // Active filters count
  const activeFilters = selectedCallTypes.length + selectedCalledFors.length + selectedSources.length + selectedAttenders.length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

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

    const allDates = Array.from(new Set(filteredRegistrations.map(r => {
      const d = parseDate(r.registeredAt) || parseDate(r.createdAt);
      return d ? d.toLocaleDateString("en-IN") : null;
    }).filter(Boolean))).sort((a, b) => {
      const [da, ma, ya] = a.split("/").map(Number);
      const [db, mb, yb] = b.split("/").map(Number);
      return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });

    const list = [];
    allDates.forEach(dStr => {
      const data = map[dStr] || { date: dStr, total: 0, assisted: 0, direct: 0 };
      list.push({
        "Date": dStr,
        "Total Registrations": data.total,
        "Attender Assisted": data.assisted,
        "Direct Online": data.direct
      });
    });
    return list;
  }, [filteredRegistrations]);

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
      const primaryName = getRegistrationPrimaryAttender(r);

      // Primary credit to Lead Owner
      if (!primaryName || primaryName === "Unknown" || primaryName === "Direct / Online") return;
      if (!map[primaryName]) {
        map[primaryName] = {
          name: primaryName,
          incomingConversions: 0,
          outgoingConversions: 0,
          count: 0,
          incomingConnected: 0,
          outgoingConnected: 0
        };
      }
      const callType = (r.callType || "").toLowerCase();
      const isIncoming = callType.startsWith("incoming");

      if (isIncoming) {
        map[primaryName].incomingConversions++;
      } else {
        map[primaryName].outgoingConversions++;
      }
      map[primaryName].count++;

      const rStatus = r.status || r.callStatus || "Reg.Done";
      const isRConnected = CONNECTED_STATUSES.includes(rStatus);

      let historyIncConn = 0;
      let historyOutConn = 0;
      if (Array.isArray(r.history) && r.history.length > 0) {
        r.history.forEach(h => {
          const hType = (h.callType || h.type || callType).toLowerCase();
          const hStatus = h.status || h.callStatus || rStatus;
          if (CONNECTED_STATUSES.includes(hStatus)) {
            if (hType.startsWith("incoming")) historyIncConn++;
            else historyOutConn++;
          }
        });
      }

      if (historyIncConn === 0 && isIncoming && isRConnected) historyIncConn = 1;
      if (historyOutConn === 0 && !isIncoming && isRConnected) historyOutConn = 1;

      map[primaryName].incomingConnected += Math.max(historyIncConn, isIncoming ? 1 : 0);
      map[primaryName].outgoingConnected += Math.max(historyOutConn, !isIncoming ? 1 : 0);
    });

    return Object.values(map).map(a => {
      const incConn = a.incomingConnected;
      const outConn = a.outgoingConnected;
      const totalConn = incConn + outConn;

      const incRateNum = incConn > 0 ? (a.incomingConversions / incConn) * 100 : 0;
      const outRateNum = outConn > 0 ? (a.outgoingConversions / outConn) * 100 : 0;
      const totalRateNum = totalConn > 0 ? (a.count / totalConn) * 100 : 0;

      return {
        "Attender Name": a.name,
        "Incoming Conversions": a.incomingConversions,
        "Incoming Connected": incConn,
        "Incoming Conversion Rate (%)": `${incRateNum.toFixed(1)}%`,
        "Outgoing Conversions": a.outgoingConversions,
        "Outgoing Connected": outConn,
        "Outgoing Conversion Rate (%)": `${outRateNum.toFixed(1)}%`,
        "Total Conversions": a.count,
        "Total Connected": totalConn,
        "Overall Conversion Rate (%)": `${totalRateNum.toFixed(1)}%`
      };
    }).sort((a, b) => b["Total Conversions"] - a["Total Conversions"]);
  }, [filteredRegistrations]);

  const attenderPerformanceTotals = useMemo(() => {
    const totals = {
      "Attender Name": "Total Assisted",
      "Incoming Conversions": 0,
      "Incoming Connected": 0,
      "Incoming Conversion Rate (%)": "0.0%",
      "Outgoing Conversions": 0,
      "Outgoing Connected": 0,
      "Outgoing Conversion Rate (%)": "0.0%",
      "Total Conversions": 0,
      "Total Connected": 0,
      "Overall Conversion Rate (%)": "0.0%"
    };
    attenderPerformance.forEach(row => {
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Incoming Connected"] += row["Incoming Connected"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
      totals["Outgoing Connected"] += row["Outgoing Connected"];
      totals["Total Conversions"] += row["Total Conversions"];
      totals["Total Connected"] += row["Total Connected"];
    });

    const incRate = totals["Incoming Connected"] > 0
      ? ((totals["Incoming Conversions"] / totals["Incoming Connected"]) * 100).toFixed(1)
      : "0.0";
    const outRate = totals["Outgoing Connected"] > 0
      ? ((totals["Outgoing Conversions"] / totals["Outgoing Connected"]) * 100).toFixed(1)
      : "0.0";
    const totalRate = totals["Total Connected"] > 0
      ? ((totals["Total Conversions"] / totals["Total Connected"]) * 100).toFixed(1)
      : "0.0";

    totals["Incoming Conversion Rate (%)"] = `${incRate}%`;
    totals["Outgoing Conversion Rate (%)"] = `${outRate}%`;
    totals["Overall Conversion Rate (%)"] = `${totalRate}%`;

    return totals;
  }, [attenderPerformance]);

  // Separate Breakdown Table for Shared Conversions (Team Assists)
  const sharedConversionsBreakdown = useMemo(() => {
    const map = {};
    filteredRegistrations.forEach(r => {
      const primaryName = getRegistrationPrimaryAttender(r);
      const finalRegistrar = (r.convertedBy || "").trim();

      if (
        finalRegistrar &&
        finalRegistrar !== "Unknown" &&
        finalRegistrar !== "Direct / Online" &&
        primaryName &&
        primaryName !== "Unknown" &&
        primaryName !== "Direct / Online" &&
        finalRegistrar !== primaryName
      ) {
        const key = `${finalRegistrar}__${primaryName}`;
        if (!map[key]) {
          map[key] = {
            assistant: finalRegistrar,
            primaryOwner: primaryName,
            count: 0
          };
        }
        map[key].count++;
      }
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [filteredRegistrations]);

  // Breakdown table for Called For + Attender Name + Khoji Type + Call Type (Incoming/Outgoing) + Conversions Count
  const calledForAttenderBreakdown = useMemo(() => {
    const map = {};
    filteredRegistrations.forEach(r => {
      const rawCalledFor = r.calledFor || r["Called For"];
      const calledForTags = rawCalledFor
        ? String(rawCalledFor).split(",").map(s => s.trim()).filter(Boolean)
        : ["Unspecified"];
      if (calledForTags.length === 0) calledForTags.push("Unspecified");

      const attender = getRegistrationPrimaryAttender(r);
      const khoji = getContactKhoji(r) || "No";
      const callType = (r.callType || "").toLowerCase();
      const isIncoming = callType.startsWith("incoming");

      calledForTags.forEach(tag => {
        const key = `${attender}___${tag}___${khoji}`;
        if (!map[key]) {
          map[key] = {
            calledFor: tag,
            attenderName: attender,
            khojiType: khoji,
            incomingConversions: 0,
            outgoingConversions: 0,
            total: 0
          };
        }
        const item = map[key];
        if (isIncoming) {
          item.incomingConversions++;
        } else {
          item.outgoingConversions++;
        }
        item.total++;
      });
    });

    return Object.values(map)
      .map(item => ({
        "Converted By (Attender)": item.attenderName,
        "Called For": item.calledFor,
        "Khoji Type": item.khojiType,
        "Incoming Conversions": item.incomingConversions,
        "Outgoing Conversions": item.outgoingConversions,
        "Total Conversions": item.total
      }))
      .sort((a, b) => {
        const attenderComp = a["Converted By (Attender)"].localeCompare(b["Converted By (Attender)"]);
        if (attenderComp !== 0) return attenderComp;
        const cfComp = a["Called For"].localeCompare(b["Called For"]);
        if (cfComp !== 0) return cfComp;
        const khojiComp = a["Khoji Type"].localeCompare(b["Khoji Type"]);
        if (khojiComp !== 0) return khojiComp;
        return b["Total Conversions"] - a["Total Conversions"];
      });
  }, [filteredRegistrations]);

  const calledForAttenderTotals = useMemo(() => {
    const totals = {
      "Converted By (Attender)": "Total",
      "Called For": "-",
      "Khoji Type": "-",
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

  // Grouped breakdown by attender with per-attender totals
  const groupedCalledForAttender = useMemo(() => {
    const attenderMap = new Map();
    calledForAttenderBreakdown.forEach(row => {
      const attender = row["Converted By (Attender)"];
      if (!attenderMap.has(attender)) {
        attenderMap.set(attender, {
          attenderName: attender,
          rows: [],
          totalIncoming: 0,
          totalOutgoing: 0,
          totalConversions: 0
        });
      }
      const group = attenderMap.get(attender);
      group.rows.push(row);
      group.totalIncoming += row["Incoming Conversions"];
      group.totalOutgoing += row["Outgoing Conversions"];
      group.totalConversions += row["Total Conversions"];
    });
    return Array.from(attenderMap.values());
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
      const attenderVal = getRegistrationPrimaryAttender(r);
      const callsDoneVal = r.callCount !== undefined ? r.callCount : (r.history ? r.history.length : 0);
      const calledForVal = r.calledFor || r["Called For"] || "";
      const khojiVal = getContactKhoji(r) || "No";
      const sourceVal = r.conversionSource || r.Source || r.source || "";
      const callTypeVal = r.callType || "";

      return {
        "Name": nameVal,
        "Phone Number": phoneVal,
        "Mobile Number": mobileVal,
        "Attender Name": attenderVal,
        "Calls Done": callsDoneVal,
        "Called For": calledForVal,
        "Khoji Type": khojiVal,
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

    // 6. Called For & Attender Breakdown (With Attender Subtotals)
    const calledForAttenderExportRows = [];
    groupedCalledForAttender.forEach(group => {
      group.rows.forEach(r => {
        calledForAttenderExportRows.push({ ...r });
      });
      calledForAttenderExportRows.push({
        "Converted By (Attender)": `Total for ${group.attenderName}`,
        "Called For": "",
        "Khoji Type": "",
        "Incoming Conversions": group.totalIncoming,
        "Outgoing Conversions": group.totalOutgoing,
        "Total Conversions": group.totalConversions
      });
    });
    calledForAttenderExportRows.push({ ...calledForAttenderTotals });

    const wsCalledForAttender = XLSX.utils.json_to_sheet(calledForAttenderExportRows);
    XLSX.utils.book_append_sheet(wb, wsCalledForAttender, "Called For & Attender");

    // 7. Team Assists Sheet
    if (sharedConversionsBreakdown.length > 0) {
      const wsShared = XLSX.utils.json_to_sheet(sharedConversionsBreakdown.map(item => ({
        "Assisting Attender (Final Call)": item.assistant,
        "Primary Lead Owner (Nurturer)": item.primaryOwner,
        "Shared Registrations Finalized": item.count
      })));
      XLSX.utils.book_append_sheet(wb, wsShared, "Team Assists");
    }

    XLSX.writeFile(wb, `Abhivyakti_RegistrationsReport_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                title="Reset date range filter"
              >
                <X size={12} /> Reset Dates
              </button>
            )}

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
                    className={`px-3 py-1.5 rounded-2xl text-xs font-black border transition-all duration-200 cursor-pointer ${
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
                    className={`px-3 py-1.5 rounded-2xl text-xs font-black border transition-all duration-200 cursor-pointer ${
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
                  setDateFrom("");
                  setDateTo("");
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-xs font-black hover:bg-red-100 transition cursor-pointer"
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

          {/* Attender Productivity */}
              {attenderPerformance.length > 0 && (
                <ReportSection
                  title="Attender Assisted Conversions"
                  subtitle="Conversion volume and conversion rates calculated from connected incoming & outgoing calls"
                  action={
                    <FormulaInfoPopover
                      title="Attender Conversion Rate Formulas"
                      formulas={[
                        {
                          label: "Incoming Conversion Rate (%)",
                          formula: "(Incoming Conversions ÷ Total Incoming Connected Calls) × 100"
                        },
                        {
                          label: "Outgoing Conversion Rate (%)",
                          formula: "(Outgoing Conversions ÷ Total Outgoing Connected Calls) × 100"
                        },
                        {
                          label: "Overall Conversion Rate (%)",
                          formula: "(Total Conversions ÷ Total Connected Calls) × 100"
                        }
                      ]}
                    />
                  }
                >
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 sticky top-0">
                        <tr>
                          <th className="px-6 py-3 bg-gray-50">Attender Name</th>
                          <th className="px-4 py-3 bg-gray-50 text-right">Incoming<br />Connected Calls</th>
                          <th className="px-4 py-3 bg-gray-50 text-right">Incoming<br />Conversions</th>
                          <th className="px-4 py-3 bg-gray-50 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span>Incoming<br />Conversion Rate (%)</span>
                              <FormulaInfoPopover
                                title="Incoming Conversion Rate"
                                formulas={[{ label: "Incoming Conversion Rate (%)", formula: "(Incoming Conversions ÷ Total Incoming Connected Calls) × 100" }]}
                                iconOnly={true}
                              />
                            </div>
                          </th>
                          <th className="px-4 py-3 bg-gray-50 text-right">Outgoing<br />Connected Calls</th>
                          <th className="px-4 py-3 bg-gray-50 text-right">Outgoing<br />Conversions</th>
                          <th className="px-4 py-3 bg-gray-50 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span>Outgoing<br />Conversion Rate (%)</span>
                              <FormulaInfoPopover
                                title="Outgoing Conversion Rate"
                                formulas={[{ label: "Outgoing Conversion Rate (%)", formula: "(Outgoing Conversions ÷ Total Outgoing Connected Calls) × 100" }]}
                                iconOnly={true}
                              />
                            </div>
                          </th>
                          <th className="px-4 py-3 bg-gray-50 text-right">Total<br />Connected Calls</th>
                          <th className="px-4 py-3 bg-gray-50 text-right">Total<br />Conversions</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span>Overall<br />Conversion Rate (%)</span>
                              <FormulaInfoPopover
                                title="Overall Conversion Rate"
                                formulas={[{ label: "Overall Conversion Rate (%)", formula: "(Total Conversions ÷ Total Connected Calls) × 100" }]}
                                iconOnly={true}
                              />
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                        {attenderPerformance.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-3.5 font-bold text-gray-800">{r["Attender Name"]}</td>
                            <td className="px-4 py-3.5 text-right font-bold text-gray-600">
                              {r["Incoming Connected"]}
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-emerald-700">
                              {r["Incoming Conversions"]}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold">
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                                {r["Incoming Conversion Rate (%)"]}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-gray-600">
                              {r["Outgoing Connected"]}
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-blue-700">
                              {r["Outgoing Conversions"]}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold">
                              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                                {r["Outgoing Conversion Rate (%)"]}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-gray-700">
                              {r["Total Connected"]}
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-indigo-600">
                              {r["Total Conversions"]}
                            </td>
                            <td className="px-6 py-3.5 text-right font-bold">
                              <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-black">
                                {r["Overall Conversion Rate (%)"]}
                              </span>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50/70 border-t border-gray-100 font-bold text-gray-900 sticky bottom-0">
                          <td className="px-6 py-4 bg-gray-50 font-black">Total Assisted</td>
                          <td className="px-4 py-4 bg-gray-50 text-right text-gray-700 font-extrabold">{attenderPerformanceTotals["Incoming Connected"]}</td>
                          <td className="px-4 py-4 bg-gray-50 text-right text-emerald-700 font-extrabold">{attenderPerformanceTotals["Incoming Conversions"]}</td>
                          <td className="px-4 py-4 bg-gray-50 text-right text-emerald-800 font-extrabold">{attenderPerformanceTotals["Incoming Conversion Rate (%)"]}</td>
                          <td className="px-4 py-4 bg-gray-50 text-right text-gray-700 font-extrabold">{attenderPerformanceTotals["Outgoing Connected"]}</td>
                          <td className="px-4 py-4 bg-gray-50 text-right text-blue-700 font-extrabold">{attenderPerformanceTotals["Outgoing Conversions"]}</td>
                          <td className="px-4 py-4 bg-gray-50 text-right text-blue-800 font-extrabold">{attenderPerformanceTotals["Outgoing Conversion Rate (%)"]}</td>
                          <td className="px-4 py-4 bg-gray-50 text-right text-gray-800 font-extrabold">{attenderPerformanceTotals["Total Connected"]}</td>
                          <td className="px-4 py-4 bg-gray-50 text-right text-indigo-700 font-extrabold">{attenderPerformanceTotals["Total Conversions"]}</td>
                          <td className="px-6 py-4 bg-gray-50 text-right text-indigo-900 font-black">{attenderPerformanceTotals["Overall Conversion Rate (%)"]}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </ReportSection>
              )}

              {/* Separate Table: Shared Conversions & Team Assists */}
              {sharedConversionsBreakdown.length > 0 && (
                <ReportSection
                  title="🤝 Shared Conversions & Team Assists"
                  subtitle="Registrations finalized by an attender on incoming calls for another lead owner (Note: These registrations are already counted under the primary lead owner. No double counting is done.)"
                >
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 mt-2">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-amber-50/60 text-[11px] font-bold text-amber-900 uppercase tracking-wider border-b border-amber-100">
                        <tr>
                          <th className="px-6 py-3">Assisting Attender (Final Call)</th>
                          <th className="px-6 py-3">Primary Lead Owner (Nurturer)</th>
                          <th className="px-6 py-3 text-right">Shared Registrations Finalized</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                        {sharedConversionsBreakdown.map((item, idx) => (
                          <tr key={idx} className="hover:bg-amber-50/20 transition-colors">
                            <td className="px-6 py-3.5 font-bold text-gray-900">{item.assistant}</td>
                            <td className="px-6 py-3.5 font-bold text-indigo-700">{item.primaryOwner}</td>
                            <td className="px-6 py-3.5 text-right font-black text-amber-700">
                              <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-extrabold border border-amber-200">
                                🤝 {item.count}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ReportSection>
              )}

              {/* Called For & Attender Conversions Table */}
              {calledForAttenderBreakdown.length > 0 && (
                <ReportSection
                  title="Conversions by Called For & Attender"
                  subtitle="Breakdown of conversions by Attender, Called For category, Khoji Type, and Call Type"
                  action={
                    <FormulaInfoPopover
                      title="Conversions Breakdown Information"
                      formulas={[
                        {
                          label: "Conversions Count",
                          formula: "Count of registrations attributed to each Attender, Called For program, and Khoji Type."
                        }
                      ]}
                    />
                  }
                >
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                        <tr>
                          <th className="px-6 py-3 bg-gray-50">Converted By (Attender)</th>
                          <th className="px-6 py-3 bg-gray-50">Called For</th>
                          <th className="px-6 py-3 bg-gray-50">Khoji Type</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">Incoming Conversions</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">Outgoing Conversions</th>
                          <th className="px-6 py-3 bg-gray-50 text-right">Total Conversions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                        {groupedCalledForAttender.map((group, groupIdx) => (
                          <React.Fragment key={groupIdx}>
                            {group.rows.map((r, i) => (
                              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-3.5 font-bold text-indigo-900">{r["Converted By (Attender)"]}</td>
                                <td className="px-6 py-3.5 font-bold text-gray-800">{r["Called For"]}</td>
                                <td className="px-6 py-3.5 font-medium text-purple-700">{r["Khoji Type"]}</td>
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
                            {/* Per-Attender Subtotal Row */}
                            <tr className="bg-indigo-50/60 border-t border-b border-indigo-100 font-extrabold text-indigo-950">
                              <td className="px-6 py-3 font-black text-xs uppercase tracking-wider text-indigo-900" colSpan={3}>
                                📊 Total for {group.attenderName}
                              </td>
                              <td className="px-6 py-3 text-right text-emerald-700 font-black">{group.totalIncoming}</td>
                              <td className="px-6 py-3 text-right text-blue-700 font-black">{group.totalOutgoing}</td>
                              <td className="px-6 py-3 text-right text-indigo-800 font-black">{group.totalConversions}</td>
                            </tr>
                          </React.Fragment>
                        ))}
                        <tr className="bg-gray-100/90 border-t-2 border-gray-300 font-black text-gray-900">
                          <td className="px-6 py-4 bg-gray-100 font-black uppercase text-xs tracking-wider" colSpan={3}>Grand Total</td>
                          <td className="px-6 py-4 bg-gray-100 text-right text-emerald-700 font-extrabold">{calledForAttenderTotals["Incoming Conversions"]}</td>
                          <td className="px-6 py-4 bg-gray-100 text-right text-blue-700 font-extrabold">{calledForAttenderTotals["Outgoing Conversions"]}</td>
                          <td className="px-6 py-4 bg-gray-100 text-right text-indigo-700 font-extrabold">{calledForAttenderTotals["Total Conversions"]}</td>
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
                    <th className="px-6 py-3 bg-gray-50 text-center">Calls Done</th>
                    <th className="px-6 py-3 bg-gray-50">Called For</th>
                    <th className="px-6 py-3 bg-gray-50">Khoji Type</th>
                    <th className="px-6 py-3 bg-gray-50">Source</th>
                    <th className="px-6 py-3 bg-gray-50">Call Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                  {filteredRegistrations.map((r, i) => {
                    const nameVal = r.Name || r.name || "Unknown";
                    const phoneVal = r.Phone || r.phone || "N/A";
                    const mobileVal = r.Mobile || r.mobile || "N/A";
                    const attenderVal = getRegistrationPrimaryAttender(r);
                    const callsDoneVal = r.callCount !== undefined ? r.callCount : (r.history ? r.history.length : 0);
                    const calledForVal = r.calledFor || r["Called For"] || "N/A";
                    const khojiVal = getContactKhoji(r) || "No";
                    const sourceVal = r.conversionSource || r.Source || r.source || "N/A";
                    const callTypeVal = r.callType || "N/A";

                    return (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-gray-800">{nameVal}</td>
                        <td className="px-6 py-3.5 font-mono text-xs">{phoneVal}</td>
                        <td className="px-6 py-3.5 font-mono text-xs">{mobileVal}</td>
                        <td className="px-6 py-3.5 font-bold text-indigo-700">{attenderVal}</td>
                        <td className="px-6 py-3.5 text-center font-black text-indigo-600">{callsDoneVal}</td>
                        <td className="px-6 py-3.5 font-bold">{calledForVal}</td>
                        <td className="px-6 py-3.5 text-xs text-purple-700 font-bold">{khojiVal}</td>
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
