import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Download, ChevronRight, ChevronDown, Calendar, TrendingUp, UserCheck, Smile, Info, Search, X, Check
} from "lucide-react";
import { subscribeToAllCallLogs } from "../../../../lib/db";
import { CONNECTED_STATUSES, NOT_CONNECTED_STATUSES } from "../utils.jsx";

function MonthlySection({ title, children, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-300">
      <button onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
        <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">{title}</h3>
        {isOpen ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
      </button>
      {isOpen && <div className="p-6 border-t border-gray-50 bg-white">{children}</div>}
    </div>
  );
}

function MonthlyTable({ headers, rows, totals, formatValue }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
          <tr>
            {headers.map(h => <th key={h} className="px-6 py-3">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
              {headers.map((h, i) => (
                <td key={i} className={`px-6 py-3.5 ${i === 0 ? "font-bold text-gray-800" : "text-gray-600"}`}>
                  {formatValue ? formatValue(row[h], h) : row[h]}
                </td>
              ))}
            </tr>
          ))}
          {totals && (
            <tr className="bg-gray-50/70 border-t border-gray-100 font-bold text-gray-900">
              {headers.map((h, i) => (
                <td key={i} className="px-6 py-4">
                  {formatValue ? formatValue(totals[h], h) : totals[h]}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MultiSelect({ options, selected, onChange, placeholder, allLabel = "All" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = React.useRef(null);

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
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl w-full min-w-[200px] overflow-hidden right-0">
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

const getConversionDenominator = (status) => {
  if (!status) return 0;
  const s = status.toLowerCase().trim();
  if (
    status === "Reg.Done" ||
    s === "info given" ||
    s === "interested" ||
    s === "intersted" ||
    s === "next time" ||
    s === "not interested" ||
    s === "not intrested"
  ) {
    return 1;
  }
  return 0;
};

export default function MonthlyReportTab({ programs, attenders = [], settingsOptions = { statusOptions: [], sourceOptions: [], calledForOptions: [] }, callLogs = [] }) {
  const [selectedProgramIds, setSelectedProgramIds] = useState([]); // empty = ALL
  const [selectedAttenderIds, setSelectedAttenderIds] = useState([]); // empty = ALL
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    const yr = d.getFullYear();
    const mn = String(d.getMonth() + 1).padStart(2, "0");
    return `${yr}-${mn}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const yr = d.getFullYear();
    const mn = d.getMonth();
    const lastDay = new Date(yr, mn + 1, 0).getDate();
    const mnStr = String(mn + 1).padStart(2, "0");
    return `${yr}-${mnStr}-${lastDay}`;
  });
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedCalledFors, setSelectedCalledFors] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [conversionSearch, setConversionSearch] = useState("");
  const [convPage, setConvPage] = useState(1);
  const loading = false;

  const programOptions = React.useMemo(() => {
    return programs.map(p => ({ value: p.id, label: p.name }));
  }, [programs]);

  const sourceOptions = React.useMemo(() => {
    const sources = new Set(settingsOptions?.sourceOptions || []);
    callLogs.forEach(log => {
      const sourceKey = Object.keys(log).find(k => ["source", "sourse", "source of information", "source of informiton"].includes(k.toLowerCase()));
      const val = sourceKey ? String(log[sourceKey] || "").trim() : "";
      if (val) sources.add(val);
    });
    return Array.from(sources).sort().map(s => ({ value: s, label: s }));
  }, [callLogs, settingsOptions]);

  const calledForOptions = React.useMemo(() => {
    const values = new Set(settingsOptions?.calledForOptions || []);
    callLogs.forEach(log => {
      const key = Object.keys(log).find(k => ["called for", "called_for", "calledfor"].includes(k.toLowerCase()));
      const val = key ? String(log[key] || "").trim() : "";
      if (val) {
        val.split(",").map(s => s.trim()).filter(Boolean).forEach(v => values.add(v));
      }
    });
    return Array.from(values).sort().map(s => ({ value: s, label: s }));
  }, [callLogs, settingsOptions]);

  const statusOptions = React.useMemo(() => {
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
    return Array.from(statuses).filter(s => s !== "Pending").sort().map(s => ({ value: s, label: s }));
  }, [callLogs, settingsOptions]);

  const allHistoricalAttempts = React.useMemo(() => {
    const attempts = [];
    callLogs.forEach(log => {
      if (log._deleted) return;

      // Multi-tag filter
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

        if (!matchesId && !matchesName) return;
      }

      // Source filter
      const sourceKey = Object.keys(log).find(k => ["source", "sourse", "source of information", "source of informiton"].includes(k.toLowerCase()));
      const sourceVal = sourceKey ? String(log[sourceKey] || "").trim() : "";
      if (selectedSources.length > 0 && !selectedSources.includes(sourceVal)) {
        return;
      }

      // Called For filter
      const calledForKey = Object.keys(log).find(k => ["called for", "called_for", "calledfor"].includes(k.toLowerCase()));
      const calledForVal = calledForKey ? String(log[calledForKey] || "").trim() : "";
      const logCalledFors = calledForVal.split(",").map(x => x.trim()).filter(Boolean);
      if (selectedCalledFors.length > 0 && !logCalledFors.some(cf => selectedCalledFors.includes(cf))) {
        return;
      }

      const feedbackKey = Object.keys(log).find(k => ["prog. feedback", "feedback", "user feedback", "program feedback"].includes(k.toLowerCase()));
      const feedbackVal = feedbackKey ? String(log[feedbackKey] || "").trim() : "";

      const nameKey = Object.keys(log).find(k => ["name", "lead name", "caller name", "lead"].includes(k.toLowerCase()));
      const contactName = nameKey ? log[nameKey] : "Unknown";
      const phoneKey = Object.keys(log).find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number"].includes(k.toLowerCase()));
      const contactPhone = phoneKey ? log[phoneKey] : "";
      const contactTags = Array.isArray(log.tags) ? log.tags : [];
      const programName = log.programName || "Unknown";

      const khojiKey = Object.keys(log).find(k => ["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani"].includes(k.toLowerCase()));
      const khojiVal = log.Khoji || (khojiKey ? String(log[khojiKey] || "").trim() : "");

      const processAttempt = (att) => {
        const status = att.status || "Pending";
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(status)) {
          return null;
        }
        return {
          ...att,
          status,
          contactName,
          contactPhone,
          contactTags,
          programName,
          contactId: log.id,
          source: att.source || sourceVal,
          calledFor: att.calledFor || calledForVal,
          feedback: feedbackVal,
          Khoji: khojiVal
        };
      };

      // 1. Loop over attenderStates
      if (log.attenderStates && Object.keys(log.attenderStates).length > 0) {
        Object.entries(log.attenderStates).forEach(([attId, state]) => {
          if (state.history && Array.isArray(state.history) && state.history.length > 0) {
            state.history.forEach(h => {
              const att = processAttempt({
                timestamp: h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null,
                attenderId: attId,
                attenderName: state.attenderName || h.attenderName || "Unknown",
                status: h.status || "Pending",
                remark: h.remark || "",
                callType: h.callType || state.callType || "outgoing",
                calledFor: h.calledFor || "",
                source: h.source || ""
              });
              if (att) attempts.push(att);
            });
          } else if (state.lastCalledAt || (state.status && state.status !== "Pending") || state.remark) {
            const dateVal = state.lastCalledAt || state.updatedAt;
            const att = processAttempt({
              timestamp: dateVal ? (dateVal.toDate ? dateVal.toDate() : new Date(dateVal)) : null,
              attenderId: attId,
              attenderName: state.attenderName || "Unknown",
              status: state.status || "Pending",
              remark: state.remark || "",
              callType: state.callType || "outgoing",
              calledFor: state["Called For"] || state.calledFor || "",
              source: state.Source || state.source || ""
            });
            if (att) attempts.push(att);
          }
        });
      } else {
        // 2. Legacy fallback
        if (log.history && Array.isArray(log.history) && log.history.length > 0) {
          log.history.forEach(h => {
            const att = processAttempt({
              timestamp: h.timestamp ? (h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp)) : null,
              attenderId: log.attenderId || "legacy",
              attenderName: log.attenderName || h.attenderName || "Unknown",
              status: h.status || "Pending",
              remark: h.remark || "",
              callType: h.callType || log.callType || "outgoing",
              calledFor: h.calledFor || "",
              source: h.source || ""
            });
            if (att) attempts.push(att);
          });
        } else {
          if (log.lastCalledAt || (log.status && log.status !== "Pending") || log.remark) {
            const dateVal = log.lastCalledAt || log.updatedAt || log.createdAt;
            const att = processAttempt({
              timestamp: dateVal ? (dateVal.toDate ? dateVal.toDate() : new Date(dateVal)) : null,
              attenderId: log.attenderId || "legacy",
              attenderName: log.attenderName || "Legacy Attender",
              status: log.status || "Pending",
              remark: log.remark || "",
              callType: log.callType || "outgoing",
              calledFor: log["Called For"] || log.calledFor || "",
              source: log.Source || log.source || ""
            });
            if (att) attempts.push(att);
          }
        }
      }
    });
    return attempts;
  }, [callLogs, selectedProgramIds, selectedSources, selectedCalledFors, selectedStatuses, programs]);



  const attenderOptions = React.useMemo(() => {
    return attenders.map(a => ({
      value: a.id,
      label: a.name
    }));
  }, [attenders]);

  const allAttempts = React.useMemo(() => {
    return allHistoricalAttempts.filter(att => {
      if (!att.timestamp || isNaN(att.timestamp.getTime())) return false;
      
      const attDate = new Date(att.timestamp.getFullYear(), att.timestamp.getMonth(), att.timestamp.getDate());
      
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (attDate.getTime() < start.getTime()) return false;
      }
      
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);
        if (attDate.getTime() > end.getTime()) return false;
      }

      if (selectedAttenderIds.length > 0 && !selectedAttenderIds.includes(att.attenderId)) return false;

      return true;
    });
  }, [allHistoricalAttempts, startDate, endDate, selectedAttenderIds]);

  const monthFiltered = React.useMemo(() => {
    const contactIds = new Set(allAttempts.map(a => a.contactId));
    return callLogs.filter(log => contactIds.has(log.id));
  }, [callLogs, allAttempts]);

  const metrics = React.useMemo(() => {
    const stats = {
      connectedCalls: 0,
      notConnectedCalls: 0,
      totalCalls: 0,
      avgCallsPerDay: 0,
      highestCallDay: "-",
      totalConversions: 0,
      incomingCalls: 0,
      outgoingCalls: 0,
      incomingConversions: 0,
      outgoingConversions: 0,
      queryCalls: 0,
    };

    allAttempts.forEach(c => {
      stats.totalCalls++;
      if (CONNECTED_STATUSES.includes(c.status)) {
        stats.connectedCalls++;
      } else if (NOT_CONNECTED_STATUSES.includes(c.status)) {
        stats.notConnectedCalls++;
      }
      const type = (c.callType || "").toLowerCase();
      const isIncoming = type.startsWith("incoming");
      if (c.status === "Reg.Done") {
        stats.totalConversions++;
        if (isIncoming) {
          stats.incomingConversions++;
        } else {
          stats.outgoingConversions++;
        }
      }
      if (c.status === "Query") {
        stats.queryCalls++;
      }
      if (isIncoming) {
        stats.incomingCalls++;
      } else {
        stats.outgoingCalls++;
      }
    });

    const dayMap = {};
    allAttempts.forEach(c => {
      if (c.timestamp) {
        const dStr = c.timestamp.toLocaleDateString("en-IN");
        dayMap[dStr] = (dayMap[dStr] || 0) + 1;
      }
    });

    const dayCounts = Object.values(dayMap);
    if (dayCounts.length > 0) {
      stats.avgCallsPerDay = Math.round(dayCounts.reduce((a, b) => a + b, 0) / dayCounts.length);
      const sorted = Object.entries(dayMap).sort((a, b) => b[1] - a[1]);
      stats.highestCallDay = `${sorted[0][0]} (${sorted[0][1]} calls)`;
    }

    return stats;
  }, [allAttempts]);

  const section1 = React.useMemo(() => {
    const list = [
      { metric: "Total Calls Attempted", value: allAttempts.length },
      { metric: "Connected Calls", value: metrics.connectedCalls },
      { metric: "Not Connected Calls", value: metrics.notConnectedCalls },
      { metric: "Incoming Calls", value: metrics.incomingCalls },
      { metric: "Outgoing Calls", value: metrics.outgoingCalls },
      { metric: "Query Calls", value: metrics.queryCalls },
      { metric: "Direct Registrations / Conversions (Reg.Done)", value: metrics.totalConversions },
      { metric: "Incoming Conversions (Reg.Done)", value: metrics.incomingConversions },
      { metric: "Outgoing Conversions (Reg.Done)", value: metrics.outgoingConversions },
    ];
    const totalContactsInMonth = new Set(monthFiltered.map(l => l.id)).size;
    list.push({ metric: "Unique Leads Contacted", value: totalContactsInMonth });
    return list;
  }, [allAttempts, metrics, monthFiltered]);

  const connectedBreakdown = React.useMemo(() => {
    const map = {};
    CONNECTED_STATUSES.forEach(s => {
      map[s] = { total: 0, incoming: 0, outgoing: 0 };
    });
    let total = 0;
    allAttempts.forEach(c => {
      if (CONNECTED_STATUSES.includes(c.status)) {
        if (!map[c.status]) {
          map[c.status] = { total: 0, incoming: 0, outgoing: 0 };
        }
        map[c.status].total++;
        const type = (c.callType || "").toLowerCase();
        const isIncoming = type.startsWith("incoming");
        if (isIncoming) {
          map[c.status].incoming++;
        } else {
          map[c.status].outgoing++;
        }
        total++;
      }
    });
    return Object.entries(map).map(([status, countObj]) => ({
      "Call Outcome Status": status,
      "No. of Calls": countObj.total,
      "Incoming": countObj.incoming,
      "Outgoing": countObj.outgoing,
      "Percentage (%)": total ? `${((countObj.total / total) * 100).toFixed(1)}%` : "0.0%"
    }));
  }, [allAttempts]);

  const notConnectedBreakdown = React.useMemo(() => {
    const map = {};
    NOT_CONNECTED_STATUSES.forEach(s => {
      map[s] = { total: 0, incoming: 0, outgoing: 0 };
    });
    let total = 0;
    allAttempts.forEach(c => {
      if (NOT_CONNECTED_STATUSES.includes(c.status)) {
        if (!map[c.status]) {
          map[c.status] = { total: 0, incoming: 0, outgoing: 0 };
        }
        map[c.status].total++;
        const type = (c.callType || "").toLowerCase();
        const isIncoming = type.startsWith("incoming");
        if (isIncoming) {
          map[c.status].incoming++;
        } else {
          map[c.status].outgoing++;
        }
        total++;
      }
    });
    return Object.entries(map).map(([status, countObj]) => ({
      "Call Outcome Status": status,
      "No. of Calls": countObj.total,
      "Incoming": countObj.incoming,
      "Outgoing": countObj.outgoing,
      "Percentage (%)": total ? `${((countObj.total / total) * 100).toFixed(1)}%` : "0.0%"
    }));
  }, [allAttempts]);

  const dayWiseTimeline = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(c => {
      if (!c.timestamp) return;
      const dStr = c.timestamp.toLocaleDateString("en-IN");
      if (!map[dStr]) {
        map[dStr] = { date: dStr, total: 0, connected: 0, notConnected: 0, incoming: 0, outgoing: 0, conversions: 0, incomingConversions: 0, outgoingConversions: 0 };
      }
      map[dStr].total++;
      if (CONNECTED_STATUSES.includes(c.status)) map[dStr].connected++;
      else if (NOT_CONNECTED_STATUSES.includes(c.status)) map[dStr].notConnected++;
      
      const type = (c.callType || "").toLowerCase();
      const isIncoming = type.startsWith("incoming");
      if (isIncoming) {
        map[dStr].incoming++;
      } else {
        map[dStr].outgoing++;
      }

      if (c.status === "Reg.Done") {
        map[dStr].conversions++;
        if (isIncoming) {
          map[dStr].incomingConversions++;
        } else {
          map[dStr].outgoingConversions++;
        }
      }
    });

    if (!startDate || !endDate) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    const list = [];
    let current = new Date(start);
    let count = 0;
    while (current.getTime() <= end.getTime() && count < 366) {
      const dStr = current.toLocaleDateString("en-IN");
      const data = map[dStr] || { date: dStr, total: 0, connected: 0, notConnected: 0, incoming: 0, outgoing: 0, conversions: 0, incomingConversions: 0, outgoingConversions: 0 };
      list.push({
        "Date": dStr,
        "Total Calls": data.total,
        "Connected": data.connected,
        "Not Connected": data.notConnected,
        "Incoming": data.incoming,
        "Outgoing": data.outgoing,
        "Reg.Done (Conversions)": data.conversions,
        "Incoming Conversions": data.incomingConversions,
        "Outgoing Conversions": data.outgoingConversions
      });
      current.setDate(current.getDate() + 1);
      count++;
    }
    return list;
  }, [allAttempts, startDate, endDate]);

  const dayWiseTotals = React.useMemo(() => {
    const totals = { 
      "Date": "Total", 
      "Total Calls": 0, 
      "Connected": 0, 
      "Not Connected": 0, 
      "Incoming": 0, 
      "Outgoing": 0, 
      "Reg.Done (Conversions)": 0,
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0
    };
    dayWiseTimeline.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Connected"] += row["Connected"];
      totals["Not Connected"] += row["Not Connected"];
      totals["Incoming"] += row["Incoming"];
      totals["Outgoing"] += row["Outgoing"];
      totals["Reg.Done (Conversions)"] += row["Reg.Done (Conversions)"];
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
    });
    return totals;
  }, [dayWiseTimeline]);

  const timeOfDayTrend = React.useMemo(() => {
    const intervals = [
      { label: "Morning (08:00 AM - 12:00 PM)", start: 8, end: 12 },
      { label: "Afternoon (12:00 PM - 04:00 PM)", start: 12, end: 16 },
      { label: "Evening (04:00 PM - 08:00 PM)", start: 16, end: 20 },
      { label: "Night (08:00 PM - 12:00 AM)", start: 20, end: 24 },
      { label: "Off Hours (12:00 AM - 08:00 AM)", start: 0, end: 8 }
    ];

    const map = {};
    intervals.forEach(i => {
      map[i.label] = { total: 0, connected: 0, notConnected: 0, incoming: 0, outgoing: 0, conversions: 0, incomingConversions: 0, outgoingConversions: 0 };
    });

    allAttempts.forEach(c => {
      if (!c.timestamp) return;
      const hr = c.timestamp.getHours();
      const match = intervals.find(i => hr >= i.start && hr < i.end);
      if (match) {
        map[match.label].total++;
        if (CONNECTED_STATUSES.includes(c.status)) map[match.label].connected++;
        else if (NOT_CONNECTED_STATUSES.includes(c.status)) map[match.label].notConnected++;
        
        const type = (c.callType || "").toLowerCase();
        const isIncoming = type.startsWith("incoming");
        if (isIncoming) {
          map[match.label].incoming++;
        } else {
          map[match.label].outgoing++;
        }

        if (c.status === "Reg.Done") {
          map[match.label].conversions++;
          if (isIncoming) {
            map[match.label].incomingConversions++;
          } else {
            map[match.label].outgoingConversions++;
          }
        }
      }
    });

    return intervals.map(i => ({
      "Time Interval": i.label,
      "Total Calls": map[i.label].total,
      "Connected": map[i.label].connected,
      "Not Connected": map[i.label].notConnected,
      "Incoming": map[i.label].incoming,
      "Outgoing": map[i.label].outgoing,
      "Reg.Done (Conversions)": map[i.label].conversions,
      "Incoming Conversions": map[i.label].incomingConversions,
      "Outgoing Conversions": map[i.label].outgoingConversions
    }));
  }, [allAttempts]);

  const timeOfDayTotals = React.useMemo(() => {
    const totals = { 
      "Time Interval": "Total", 
      "Total Calls": 0, 
      "Connected": 0, 
      "Not Connected": 0, 
      "Incoming": 0, 
      "Outgoing": 0, 
      "Reg.Done (Conversions)": 0,
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0
    };
    timeOfDayTrend.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Connected"] += row["Connected"];
      totals["Not Connected"] += row["Not Connected"];
      totals["Incoming"] += row["Incoming"];
      totals["Outgoing"] += row["Outgoing"];
      totals["Reg.Done (Conversions)"] += row["Reg.Done (Conversions)"];
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
    });
    return totals;
  }, [timeOfDayTrend]);

  const attenderPerformance = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(c => {
      if (!map[c.attenderId]) {
        map[c.attenderId] = { name: c.attenderName, total: 0, connected: 0, notConnected: 0, incoming: 0, outgoing: 0, conversions: 0, incomingConversions: 0, outgoingConversions: 0, denominator: 0 };
      }
      const item = map[c.attenderId];
      item.total++;
      if (CONNECTED_STATUSES.includes(c.status)) item.connected++;
      else if (NOT_CONNECTED_STATUSES.includes(c.status)) item.notConnected++;
      
      const type = (c.callType || "").toLowerCase();
      const isIncoming = type.startsWith("incoming");
      if (isIncoming) {
        item.incoming++;
      } else {
        item.outgoing++;
      }

      if (c.status === "Reg.Done") {
        item.conversions++;
        if (isIncoming) {
          item.incomingConversions++;
        } else {
          item.outgoingConversions++;
        }
      }
      
      item.denominator += getConversionDenominator(c.status);
    });

    return Object.values(map).map(a => ({
      "Attender Name": a.name,
      "Total Calls": a.total,
      "Connected": a.connected,
      "Not Connected": a.notConnected,
      "Incoming": a.incoming,
      "Outgoing": a.outgoing,
      "Reg.Done (Conversions)": a.conversions,
      "Incoming Conversions": a.incomingConversions,
      "Outgoing Conversions": a.outgoingConversions,
      "denominator": a.denominator,
      "Conversion Rate (%)": a.denominator ? `${((a.conversions / a.denominator) * 100).toFixed(1)}%` : "0.0%"
    })).sort((a, b) => {
      if (b["Reg.Done (Conversions)"] !== a["Reg.Done (Conversions)"]) {
        return b["Reg.Done (Conversions)"] - a["Reg.Done (Conversions)"];
      }
      return parseFloat(b["Conversion Rate (%)"]) - parseFloat(a["Conversion Rate (%)"]);
    });
  }, [allAttempts]);

  const attenderPerformanceTotals = React.useMemo(() => {
    const totals = { 
      "Attender Name": "Total", 
      "Total Calls": 0, 
      "Connected": 0, 
      "Not Connected": 0, 
      "Incoming": 0, 
      "Outgoing": 0, 
      "Reg.Done (Conversions)": 0, 
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0,
      "Conversion Rate (%)": "0.0%" 
    };
    let totalDenominator = 0;
    attenderPerformance.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Connected"] += row["Connected"];
      totals["Not Connected"] += row["Not Connected"];
      totals["Incoming"] += row["Incoming"];
      totals["Outgoing"] += row["Outgoing"];
      totals["Reg.Done (Conversions)"] += row["Reg.Done (Conversions)"];
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
      totalDenominator += row["denominator"] || 0;
    });
    totals["Conversion Rate (%)"] = totalDenominator ? `${((totals["Reg.Done (Conversions)"] / totalDenominator) * 100).toFixed(1)}%` : "0.0%";
    return totals;
  }, [attenderPerformance]);

  const calledForBreakdown = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(c => {
      const calledFors = String(c.calledFor || "").trim()
        ? String(c.calledFor).split(",").map(x => x.trim()).filter(Boolean)
        : ["Unknown"];
      
      calledFors.forEach(prog => {
        if (!map[prog]) {
          map[prog] = { name: prog, total: 0, connected: 0, notConnected: 0, incoming: 0, outgoing: 0, conversions: 0, incomingConversions: 0, outgoingConversions: 0, query: 0, denominator: 0 };
        }
        const item = map[prog];
        item.total++;
        if (CONNECTED_STATUSES.includes(c.status)) item.connected++;
        else if (NOT_CONNECTED_STATUSES.includes(c.status)) item.notConnected++;
        
        const type = (c.callType || "").toLowerCase();
        const isIncoming = type.startsWith("incoming");
        if (isIncoming) {
          item.incoming++;
        } else {
          item.outgoing++;
        }

        if (c.status === "Reg.Done") {
          item.conversions++;
          if (isIncoming) {
            item.incomingConversions++;
          } else {
            item.outgoingConversions++;
          }
        }
        if (c.status === "Query") {
          item.query++;
        }
        
        item.denominator += getConversionDenominator(c.status);
      });
    });

    return Object.values(map).map(a => ({
      "Called For": a.name,
      "Total Calls": a.total,
      "Connected": a.connected,
      "Not Connected": a.notConnected,
      "Incoming": a.incoming,
      "Outgoing": a.outgoing,
      "Query Calls": a.query,
      "Reg.Done (Conversions)": a.conversions,
      "Incoming Conversions": a.incomingConversions,
      "Outgoing Conversions": a.outgoingConversions,
      "denominator": a.denominator,
      "Conversion Rate (%)": a.denominator ? `${((a.conversions / a.denominator) * 100).toFixed(1)}%` : "0.0%"
    })).sort((a, b) => b["Total Calls"] - a["Total Calls"]);
  }, [allAttempts]);

  const calledForBreakdownTotals = React.useMemo(() => {
    const totals = { 
      "Called For": "Total", 
      "Total Calls": 0, 
      "Connected": 0, 
      "Not Connected": 0, 
      "Incoming": 0, 
      "Outgoing": 0, 
      "Query Calls": 0,
      "Reg.Done (Conversions)": 0, 
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0,
      "Conversion Rate (%)": "0.0%" 
    };
    let totalDenominator = 0;
    calledForBreakdown.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Connected"] += row["Connected"];
      totals["Not Connected"] += row["Not Connected"];
      totals["Incoming"] += row["Incoming"];
      totals["Outgoing"] += row["Outgoing"];
      totals["Query Calls"] += row["Query Calls"];
      totals["Reg.Done (Conversions)"] += row["Reg.Done (Conversions)"];
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
      totalDenominator += row["denominator"] || 0;
    });
    totals["Conversion Rate (%)"] = totalDenominator ? `${((totals["Reg.Done (Conversions)"] / totalDenominator) * 100).toFixed(1)}%` : "0.0%";
    return totals;
  }, [calledForBreakdown]);

  const sourceBreakdown = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(c => {
      const src = String(c.source || "").trim() || "Unknown";
      if (!map[src]) {
        map[src] = { name: src, total: 0, connected: 0, notConnected: 0, incoming: 0, outgoing: 0, conversions: 0, incomingConversions: 0, outgoingConversions: 0, query: 0, denominator: 0 };
      }
      const item = map[src];
      item.total++;
      if (CONNECTED_STATUSES.includes(c.status)) item.connected++;
      else if (NOT_CONNECTED_STATUSES.includes(c.status)) item.notConnected++;
      
      const type = (c.callType || "").toLowerCase();
      const isIncoming = type.startsWith("incoming");
      if (isIncoming) {
        item.incoming++;
      } else {
        item.outgoing++;
      }

      if (c.status === "Reg.Done") {
        item.conversions++;
        if (isIncoming) {
          item.incomingConversions++;
        } else {
          item.outgoingConversions++;
        }
      }
      if (c.status === "Query") {
        item.query++;
      }
      
      item.denominator += getConversionDenominator(c.status);
    });

    return Object.values(map).map(a => ({
      "Source": a.name,
      "Total Calls": a.total,
      "Connected": a.connected,
      "Not Connected": a.notConnected,
      "Incoming": a.incoming,
      "Outgoing": a.outgoing,
      "Query Calls": a.query,
      "Reg.Done (Conversions)": a.conversions,
      "Incoming Conversions": a.incomingConversions,
      "Outgoing Conversions": a.outgoingConversions,
      "denominator": a.denominator,
      "Conversion Rate (%)": a.denominator ? `${((a.conversions / a.denominator) * 100).toFixed(1)}%` : "0.0%"
    })).sort((a, b) => b["Total Calls"] - a["Total Calls"]);
  }, [allAttempts]);

  const sourceBreakdownTotals = React.useMemo(() => {
    const totals = { 
      "Source": "Total", 
      "Total Calls": 0, 
      "Connected": 0, 
      "Not Connected": 0, 
      "Incoming": 0, 
      "Outgoing": 0, 
      "Query Calls": 0,
      "Reg.Done (Conversions)": 0, 
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0,
      "Conversion Rate (%)": "0.0%" 
    };
    let totalDenominator = 0;
    sourceBreakdown.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Connected"] += row["Connected"];
      totals["Not Connected"] += row["Not Connected"];
      totals["Incoming"] += row["Incoming"];
      totals["Outgoing"] += row["Outgoing"];
      totals["Query Calls"] += row["Query Calls"];
      totals["Reg.Done (Conversions)"] += row["Reg.Done (Conversions)"];
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
      totalDenominator += row["denominator"] || 0;
    });
    totals["Conversion Rate (%)"] = totalDenominator ? `${((totals["Reg.Done (Conversions)"] / totalDenominator) * 100).toFixed(1)}%` : "0.0%";
    return totals;
  }, [sourceBreakdown]);

  const sourceVsCalledForBreakdown = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(c => {
      const src = String(c.source || "").trim() || "Unknown";
      const calledFors = String(c.calledFor || "").trim()
        ? String(c.calledFor).split(",").map(x => x.trim()).filter(Boolean)
        : ["Unknown"];

      calledFors.forEach(prog => {
        const key = `${src} &&& ${prog}`;
        if (!map[key]) {
          map[key] = { 
            source: src, 
            calledFor: prog, 
            total: 0, 
            incoming: 0, 
            outgoing: 0, 
            conversions: 0, 
            incomingConversions: 0, 
            outgoingConversions: 0, 
            incomingDenominator: 0, 
            outgoingDenominator: 0 
          };
        }
        const item = map[key];
        item.total++;
        
        const type = (c.callType || "").toLowerCase();
        const isIncoming = type.startsWith("incoming");
        
        if (isIncoming) {
          item.incoming++;
        } else {
          item.outgoing++;
        }

        const denom = getConversionDenominator(c.status);
        if (isIncoming) {
          item.incomingDenominator += denom;
        } else {
          item.outgoingDenominator += denom;
        }

        if (c.status === "Reg.Done") {
          item.conversions++;
          if (isIncoming) {
            item.incomingConversions++;
          } else {
            item.outgoingConversions++;
          }
        }
      });
    });

    return Object.values(map).map(a => ({
      "Source": a.source,
      "Called For": a.calledFor,
      "Total Calls": a.total,
      "Incoming Calls": a.incoming,
      "Outgoing Calls": a.outgoing,
      "Total Conversions": a.conversions,
      "Incoming Conversions": a.incomingConversions,
      "Outgoing Conversions": a.outgoingConversions,
      "Incoming Denominator": a.incomingDenominator,
      "Outgoing Denominator": a.outgoingDenominator,
      "Incoming Conv. Rate (%)": a.incomingDenominator ? `${((a.incomingConversions / a.incomingDenominator) * 100).toFixed(1)}%` : "0.0%",
      "Outgoing Conv. Rate (%)": a.outgoingDenominator ? `${((a.outgoingConversions / a.outgoingDenominator) * 100).toFixed(1)}%` : "0.0%"
    })).sort((a, b) => b["Total Calls"] - a["Total Calls"]);
  }, [allAttempts]);

  const sourceVsCalledForBreakdownTotals = React.useMemo(() => {
    const totals = { 
      "Source": "Total", 
      "Called For": "-", 
      "Total Calls": 0, 
      "Incoming Calls": 0, 
      "Outgoing Calls": 0, 
      "Total Conversions": 0, 
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0,
      "Incoming Conv. Rate (%)": "0.0%", 
      "Outgoing Conv. Rate (%)": "0.0%" 
    };
    let totalIncomingDenominator = 0;
    let totalOutgoingDenominator = 0;
    sourceVsCalledForBreakdown.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Incoming Calls"] += row["Incoming Calls"];
      totals["Outgoing Calls"] += row["Outgoing Calls"];
      totals["Total Conversions"] += row["Total Conversions"];
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
      totalIncomingDenominator += row["Incoming Denominator"] || 0;
      totalOutgoingDenominator += row["Outgoing Denominator"] || 0;
    });
    totals["Incoming Conv. Rate (%)"] = totalIncomingDenominator ? `${((totals["Incoming Conversions"] / totalIncomingDenominator) * 100).toFixed(1)}%` : "0.0%";
    totals["Outgoing Conv. Rate (%)"] = totalOutgoingDenominator ? `${((totals["Outgoing Conversions"] / totalOutgoingDenominator) * 100).toFixed(1)}%` : "0.0%";
    return totals;
  }, [sourceVsCalledForBreakdown]);

  // Helper to determine if Khoji
  const isKhoji = (val) => {
    if (!val) return false;
    const v = String(val).toLowerCase().trim();
    return (
      v === "yes" ||
      v === "y" ||
      v === "true" ||
      v === "khoji" ||
      v.startsWith("yes") ||
      v.startsWith("y ") ||
      v.startsWith("y/") ||
      v.includes("हां") ||
      v.includes("हाँ") ||
      v.includes("dew d") ||
      v.includes("done") ||
      v.includes("completed") ||
      (v.includes("khoji") && !v.includes("not") && !v.includes("new"))
    );
  };

  const khojiSourceVsCalledForBreakdown = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(c => {
      if (!isKhoji(c.Khoji)) return; // Only Khoji

      const src = String(c.source || "").trim() || "Unknown";
      const calledFors = String(c.calledFor || "").trim()
        ? String(c.calledFor).split(",").map(x => x.trim()).filter(Boolean)
        : ["Unknown"];

      calledFors.forEach(prog => {
        const key = `${src} &&& ${prog}`;
        if (!map[key]) {
          map[key] = { 
            source: src, 
            calledFor: prog, 
            total: 0, 
            incoming: 0, 
            outgoing: 0, 
            conversions: 0, 
            incomingConversions: 0, 
            outgoingConversions: 0, 
            incomingDenominator: 0, 
            outgoingDenominator: 0 
          };
        }
        const item = map[key];
        item.total++;
        
        const type = (c.callType || "").toLowerCase();
        const isIncoming = type.startsWith("incoming");
        
        if (isIncoming) {
          item.incoming++;
        } else {
          item.outgoing++;
        }

        const denom = getConversionDenominator(c.status);
        if (isIncoming) {
          item.incomingDenominator += denom;
        } else {
          item.outgoingDenominator += denom;
        }

        if (c.status === "Reg.Done") {
          item.conversions++;
          if (isIncoming) {
            item.incomingConversions++;
          } else {
            item.outgoingConversions++;
          }
        }
      });
    });

    return Object.values(map).map(a => ({
      "Source": a.source,
      "Called For": a.calledFor,
      "Total Calls": a.total,
      "Incoming Calls": a.incoming,
      "Outgoing Calls": a.outgoing,
      "Total Conversions": a.conversions,
      "Incoming Conversions": a.incomingConversions,
      "Outgoing Conversions": a.outgoingConversions,
      "Incoming Denominator": a.incomingDenominator,
      "Outgoing Denominator": a.outgoingDenominator,
      "Incoming Conv. Rate (%)": a.incomingDenominator ? `${((a.incomingConversions / a.incomingDenominator) * 100).toFixed(1)}%` : "0.0%",
      "Outgoing Conv. Rate (%)": a.outgoingDenominator ? `${((a.outgoingConversions / a.outgoingDenominator) * 100).toFixed(1)}%` : "0.0%"
    })).sort((a, b) => b["Total Calls"] - a["Total Calls"]);
  }, [allAttempts]);

  const khojiSourceVsCalledForBreakdownTotals = React.useMemo(() => {
    const totals = { 
      "Source": "Total", 
      "Called For": "-", 
      "Total Calls": 0, 
      "Incoming Calls": 0, 
      "Outgoing Calls": 0, 
      "Total Conversions": 0, 
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0,
      "Incoming Conv. Rate (%)": "0.0%", 
      "Outgoing Conv. Rate (%)": "0.0%" 
    };
    let totalIncomingDenominator = 0;
    let totalOutgoingDenominator = 0;
    khojiSourceVsCalledForBreakdown.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Incoming Calls"] += row["Incoming Calls"];
      totals["Outgoing Calls"] += row["Outgoing Calls"];
      totals["Total Conversions"] += row["Total Conversions"];
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
      totalIncomingDenominator += row["Incoming Denominator"] || 0;
      totalOutgoingDenominator += row["Outgoing Denominator"] || 0;
    });
    totals["Incoming Conv. Rate (%)"] = totalIncomingDenominator ? `${((totals["Incoming Conversions"] / totalIncomingDenominator) * 100).toFixed(1)}%` : "0.0%";
    totals["Outgoing Conv. Rate (%)"] = totalOutgoingDenominator ? `${((totals["Outgoing Conversions"] / totalOutgoingDenominator) * 100).toFixed(1)}%` : "0.0%";
    return totals;
  }, [khojiSourceVsCalledForBreakdown]);

  const guestKhojiSourceVsCalledForBreakdown = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(c => {
      if (isKhoji(c.Khoji)) return; // Only Non-Khoji (Guest Khoji)

      const src = String(c.source || "").trim() || "Unknown";
      const calledFors = String(c.calledFor || "").trim()
        ? String(c.calledFor).split(",").map(x => x.trim()).filter(Boolean)
        : ["Unknown"];

      calledFors.forEach(prog => {
        const key = `${src} &&& ${prog}`;
        if (!map[key]) {
          map[key] = { 
            source: src, 
            calledFor: prog, 
            total: 0, 
            incoming: 0, 
            outgoing: 0, 
            conversions: 0, 
            incomingConversions: 0, 
            outgoingConversions: 0, 
            incomingDenominator: 0, 
            outgoingDenominator: 0 
          };
        }
        const item = map[key];
        item.total++;
        
        const type = (c.callType || "").toLowerCase();
        const isIncoming = type.startsWith("incoming");
        
        if (isIncoming) {
          item.incoming++;
        } else {
          item.outgoing++;
        }

        const denom = getConversionDenominator(c.status);
        if (isIncoming) {
          item.incomingDenominator += denom;
        } else {
          item.outgoingDenominator += denom;
        }

        if (c.status === "Reg.Done") {
          item.conversions++;
          if (isIncoming) {
            item.incomingConversions++;
          } else {
            item.outgoingConversions++;
          }
        }
      });
    });

    return Object.values(map).map(a => ({
      "Source": a.source,
      "Called For": a.calledFor,
      "Total Calls": a.total,
      "Incoming Calls": a.incoming,
      "Outgoing Calls": a.outgoing,
      "Total Conversions": a.conversions,
      "Incoming Conversions": a.incomingConversions,
      "Outgoing Conversions": a.outgoingConversions,
      "Incoming Denominator": a.incomingDenominator,
      "Outgoing Denominator": a.outgoingDenominator,
      "Incoming Conv. Rate (%)": a.incomingDenominator ? `${((a.incomingConversions / a.incomingDenominator) * 100).toFixed(1)}%` : "0.0%",
      "Outgoing Conv. Rate (%)": a.outgoingDenominator ? `${((a.outgoingConversions / a.outgoingDenominator) * 100).toFixed(1)}%` : "0.0%"
    })).sort((a, b) => b["Total Calls"] - a["Total Calls"]);
  }, [allAttempts]);

  const guestKhojiSourceVsCalledForBreakdownTotals = React.useMemo(() => {
    const totals = { 
      "Source": "Total", 
      "Called For": "-", 
      "Total Calls": 0, 
      "Incoming Calls": 0, 
      "Outgoing Calls": 0, 
      "Total Conversions": 0, 
      "Incoming Conversions": 0,
      "Outgoing Conversions": 0,
      "Incoming Conv. Rate (%)": "0.0%", 
      "Outgoing Conv. Rate (%)": "0.0%" 
    };
    let totalIncomingDenominator = 0;
    let totalOutgoingDenominator = 0;
    guestKhojiSourceVsCalledForBreakdown.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Incoming Calls"] += row["Incoming Calls"];
      totals["Outgoing Calls"] += row["Outgoing Calls"];
      totals["Total Conversions"] += row["Total Conversions"];
      totals["Incoming Conversions"] += row["Incoming Conversions"];
      totals["Outgoing Conversions"] += row["Outgoing Conversions"];
      totalIncomingDenominator += row["Incoming Denominator"] || 0;
      totalOutgoingDenominator += row["Outgoing Denominator"] || 0;
    });
    totals["Incoming Conv. Rate (%)"] = totalIncomingDenominator ? `${((totals["Incoming Conversions"] / totalIncomingDenominator) * 100).toFixed(1)}%` : "0.0%";
    totals["Outgoing Conv. Rate (%)"] = totalOutgoingDenominator ? `${((totals["Outgoing Conversions"] / totalOutgoingDenominator) * 100).toFixed(1)}%` : "0.0%";
    return totals;
  }, [guestKhojiSourceVsCalledForBreakdown]);

  const conversionsList = React.useMemo(() => {
    return allAttempts.filter(c => c.status === "Reg.Done");
  }, [allAttempts]);

  const searchedConversions = React.useMemo(() => {
    if (!conversionSearch.trim()) return conversionsList;
    const term = conversionSearch.toLowerCase();
    return conversionsList.filter(c => {
      return (
        (c.contactName || "").toLowerCase().includes(term) ||
        (c.contactPhone || "").toLowerCase().includes(term) ||
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
  const paginatedConversions = React.useMemo(() => {
    const start = (convPage - 1) * convPerPage;
    return searchedConversions.slice(start, start + convPerPage);
  }, [searchedConversions, convPage]);

  useEffect(() => {
    setConvPage(1);
  }, [conversionSearch]);

  const handleExport = () => {
    if (!monthFiltered.length) {
      toast.error("No data to export.");
      return;
    }
    const wb = XLSX.utils.book_new();

    const cleanRows = (list) => list.map(item => {
      const { 
        denominator, 
        Denominator, 
        incomingDenominator, 
        outgoingDenominator, 
        "Incoming Denominator": incDen, 
        "Outgoing Denominator": outDen, 
        ...rest 
      } = item;
      return rest;
    });

    // 1. Summary
    const wsSummary = XLSX.utils.json_to_sheet(section1);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary KPI");

    // 2. Connected
    const wsConnected = XLSX.utils.json_to_sheet(connectedBreakdown);
    XLSX.utils.book_append_sheet(wb, wsConnected, "Connected Breakdowns");

    // 3. Not Connected
    const wsNotConnected = XLSX.utils.json_to_sheet(notConnectedBreakdown);
    XLSX.utils.book_append_sheet(wb, wsNotConnected, "Not Connected Breakdowns");

    // 4. Day-wise
    const wsDay = XLSX.utils.json_to_sheet([...dayWiseTimeline, dayWiseTotals]);
    XLSX.utils.book_append_sheet(wb, wsDay, "Day-wise Calls Timeline");

    // 5. Time of day
    const wsTime = XLSX.utils.json_to_sheet([...timeOfDayTrend, timeOfDayTotals]);
    XLSX.utils.book_append_sheet(wb, wsTime, "Time of Day Trends");

    // 6. Attenders
    const wsAttenders = XLSX.utils.json_to_sheet(cleanRows([...attenderPerformance, attenderPerformanceTotals]));
    XLSX.utils.book_append_sheet(wb, wsAttenders, "Attender Performance");

    // 7. Called For Breakdown
    const wsCalledFor = XLSX.utils.json_to_sheet(cleanRows([...calledForBreakdown, calledForBreakdownTotals]));
    XLSX.utils.book_append_sheet(wb, wsCalledFor, "Called For Breakdowns");

    // 8. Source-wise Breakdown
    const wsSource = XLSX.utils.json_to_sheet(cleanRows([...sourceBreakdown, sourceBreakdownTotals]));
    XLSX.utils.book_append_sheet(wb, wsSource, "Source Breakdowns");

    // 9. Source vs Called For Breakdown
    const wsSourceVsCalledFor = XLSX.utils.json_to_sheet(cleanRows([...sourceVsCalledForBreakdown, sourceVsCalledForBreakdownTotals]));
    XLSX.utils.book_append_sheet(wb, wsSourceVsCalledFor, "Source vs Called For");

    // 10. Source vs Called For (Khoji)
    const wsKhojiSourceVsCalledFor = XLSX.utils.json_to_sheet(cleanRows([...khojiSourceVsCalledForBreakdown, khojiSourceVsCalledForBreakdownTotals]));
    XLSX.utils.book_append_sheet(wb, wsKhojiSourceVsCalledFor, "Source vs Called For (Khoji)");

    // 11. Source vs Called For (Guest Khoji)
    const wsGuestKhojiSourceVsCalledFor = XLSX.utils.json_to_sheet(cleanRows([...guestKhojiSourceVsCalledForBreakdown, guestKhojiSourceVsCalledForBreakdownTotals]));
    XLSX.utils.book_append_sheet(wb, wsGuestKhojiSourceVsCalledFor, "Src vs CF (Guest Khoji)");

    // Write file
    const startStr = startDate ? startDate.replace(/-/g, "") : "start";
    const endStr = endDate ? endDate.replace(/-/g, "") : "end";
    XLSX.writeFile(wb, `CallCenter_Report_${startStr}_to_${endStr}.xlsx`);
    toast.success("Excel analytics report downloaded successfully!");
  };

  const activeFilters = selectedProgramIds.length + selectedAttenderIds.length + selectedSources.length + selectedCalledFors.length + selectedStatuses.length;

  return (
    <div className="p-8 space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800">Call Center Analytics Report</h2>
          <p className="text-slate-500 mt-1">Generate comprehensive custom range analytics and export to Excel</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4">
        {/* Row 1: Dropdowns grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <MultiSelect
            options={programOptions}
            selected={selectedProgramIds}
            onChange={setSelectedProgramIds}
            placeholder="Tags"
            allLabel="🌟 All Tags"
          />

          <MultiSelect
            options={attenderOptions}
            selected={selectedAttenderIds}
            onChange={setSelectedAttenderIds}
            placeholder="Attenders"
            allLabel="👥 All Attenders"
          />

          <MultiSelect
            options={sourceOptions}
            selected={selectedSources}
            onChange={setSelectedSources}
            placeholder="Source"
            allLabel="📢 All Sources"
          />

          <MultiSelect
            options={calledForOptions}
            selected={selectedCalledFors}
            onChange={setSelectedCalledFors}
            placeholder="Called For"
            allLabel="📞 All Called For"
          />

          <MultiSelect
            options={statusOptions}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            placeholder="Status"
            allLabel="📊 All Statuses"
          />
        </div>

        {/* Row 2: Controls & Export */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-2xl font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-2xl font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {(() => {
              const todayObj = new Date();
              const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;
              const isTodaySelected = startDate === todayStr && endDate === todayStr;

              const yr = todayObj.getFullYear();
              const mn = todayObj.getMonth();
              const firstDayStr = `${yr}-${String(mn + 1).padStart(2, "0")}-01`;
              const lastDay = new Date(yr, mn + 1, 0).getDate();
              const lastDayStr = `${yr}-${String(mn + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
              const isThisMonthSelected = startDate === firstDayStr && endDate === lastDayStr;

              return (
                <>
                  <button
                    onClick={() => {
                      setStartDate(todayStr);
                      setEndDate(todayStr);
                    }}
                    className={`px-4 py-2 rounded-2xl text-xs font-black border transition-all duration-200 ${
                      isTodaySelected
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20 scale-[1.03]"
                        : "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100/80 hover:scale-[1.01]"
                    }`}
                  >
                    📅 Today
                  </button>
                  <button
                    onClick={() => {
                      setStartDate(firstDayStr);
                      setEndDate(lastDayStr);
                    }}
                    className={`px-4 py-2 rounded-2xl text-xs font-black border transition-all duration-200 ${
                      isThisMonthSelected
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20 scale-[1.03]"
                        : "bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100/80 hover:scale-[1.01]"
                    }`}
                  >
                    📅 This Month
                  </button>
                </>
              );
            })()}
          </div>

          <div className="flex items-center gap-3">
            {activeFilters > 0 && (
              <button
                onClick={() => {
                  setSelectedProgramIds([]);
                  setSelectedAttenderIds([]);
                  setSelectedSources([]);
                  setSelectedCalledFors([]);
                  setSelectedStatuses([]);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-2xl text-xs font-black hover:bg-red-100 transition animate-fade-in"
              >
                <X size={12} /> Clear filters
                <span className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{activeFilters}</span>
              </button>
            )}

            <button onClick={handleExport} disabled={!monthFiltered.length}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-sm transition-all disabled:opacity-50">
              <Download size={18} /> Export Excel Workbook
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400 font-bold">Loading report datasets...</div>
      ) : (!startDate || !endDate || monthFiltered.length === 0) ? (
        <div className="py-20 text-center text-gray-400 font-bold">No call history logs found for this period.</div>
      ) : (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                <Calendar size={22} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Average Daily Calls</p>
                <p className="text-2xl font-black text-gray-800 mt-1">{metrics.avgCallsPerDay}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                <TrendingUp size={22} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Busiest Day Peak</p>
                <p className="text-sm font-bold text-gray-800 mt-1 truncate max-w-[170px]" title={metrics.highestCallDay}>{metrics.highestCallDay}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
                <UserCheck size={22} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unique Connected Calls</p>
                <p className="text-2xl font-black text-gray-800 mt-1">{metrics.connectedCalls}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 shrink-0">
                <Smile size={22} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Direct Registrations (Period)</p>
                <p className="text-2xl font-black text-gray-800 mt-1">{metrics.totalConversions}</p>
              </div>
            </div>
          </div>

          {/* Collapsible Sections */}
          <MonthlySection title="Section 1: General KPIs Summary">
            <MonthlyTable
              headers={["metric", "value"]}
              rows={section1}
            />
          </MonthlySection>

          <MonthlySection title="Section 2: Connected Calls Status Breakdowns">
            <div className="flex items-center gap-2 mb-4 p-4 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-2xl">
              <Info size={16} />
              <span>These are calls where an attender was able to speak to the contact (e.g. Info given, Interested, Next time).</span>
            </div>
            <MonthlyTable
              headers={["Call Outcome Status", "No. of Calls", "Incoming", "Outgoing", "Percentage (%)"]}
              rows={connectedBreakdown}
            />
          </MonthlySection>

          <MonthlySection title="Section 3: Not Connected Calls Breakdowns">
            <div className="flex items-center gap-2 mb-4 p-4 bg-amber-50 text-amber-800 text-xs font-bold rounded-2xl">
              <Info size={16} />
              <span>These are attempts where no direct communication happened (e.g. Busy, Switched Off, Called by mistake).</span>
            </div>
            <MonthlyTable
              headers={["Call Outcome Status", "No. of Calls", "Incoming", "Outgoing", "Percentage (%)"]}
              rows={notConnectedBreakdown}
            />
          </MonthlySection>

          <MonthlySection title="Section 4: Called For Program Breakdowns">
            <MonthlyTable
              headers={["Called For", "Total Calls", "Connected", "Not Connected", "Incoming", "Outgoing", "Query Calls", "Reg.Done (Conversions)", "Incoming Conversions", "Outgoing Conversions", "Conversion Rate (%)"]}
              rows={calledForBreakdown}
              totals={calledForBreakdownTotals}
            />
          </MonthlySection>

          <MonthlySection title="Section 5: Source-wise Breakdowns & Conversions">
            <MonthlyTable
              headers={["Source", "Total Calls", "Connected", "Not Connected", "Incoming", "Outgoing", "Query Calls", "Reg.Done (Conversions)", "Incoming Conversions", "Outgoing Conversions", "Conversion Rate (%)"]}
              rows={sourceBreakdown}
              totals={sourceBreakdownTotals}
            />
          </MonthlySection>

          <MonthlySection title="Section 6: Source vs Called For Incoming & Outgoing Breakdown">
            <MonthlyTable
              headers={["Source", "Called For", "Total Calls", "Incoming Calls", "Outgoing Calls", "Total Conversions", "Incoming Conversions", "Outgoing Conversions", "Incoming Conv. Rate (%)", "Outgoing Conv. Rate (%)"]}
              rows={sourceVsCalledForBreakdown}
              totals={sourceVsCalledForBreakdownTotals}
            />
          </MonthlySection>

          <MonthlySection title="Section 7: Source vs Called For (Khoji) Incoming & Outgoing Breakdown">
            <MonthlyTable
              headers={["Source", "Called For", "Total Calls", "Incoming Calls", "Outgoing Calls", "Total Conversions", "Incoming Conversions", "Outgoing Conversions", "Incoming Conv. Rate (%)", "Outgoing Conv. Rate (%)"]}
              rows={khojiSourceVsCalledForBreakdown}
              totals={khojiSourceVsCalledForBreakdownTotals}
            />
          </MonthlySection>

          <MonthlySection title="Section 8: Source vs Called For (Guest Khoji) Incoming & Outgoing Breakdown">
            <MonthlyTable
              headers={["Source", "Called For", "Total Calls", "Incoming Calls", "Outgoing Calls", "Total Conversions", "Incoming Conversions", "Outgoing Conversions", "Incoming Conv. Rate (%)", "Outgoing Conv. Rate (%)"]}
              rows={guestKhojiSourceVsCalledForBreakdown}
              totals={guestKhojiSourceVsCalledForBreakdownTotals}
            />
          </MonthlySection>

          <MonthlySection title="🏆 Attender Productivity Leaderboard">
            {attenderPerformance.length === 0 ? (
              <div className="text-center py-6 text-slate-400 font-bold text-sm">No attender history logs found for this period.</div>
            ) : (
              <div className="space-y-4">
                <div className="hidden md:grid grid-cols-12 text-[10px] font-black text-slate-400 uppercase tracking-wider px-6 py-2">
                  <div className="col-span-1">Rank</div>
                  <div className="col-span-4">Attender Name</div>
                  <div className="col-span-4 text-center">Conversion Rate & Efficiency</div>
                  <div className="col-span-3 text-right">Metrics</div>
                </div>
                
                <div className="space-y-2.5">
                  {attenderPerformance.map((row, index) => {
                    const rank = index + 1;
                    const convRate = parseFloat(row["Conversion Rate (%)"]);
                    const isTop3 = rank <= 3;
                    const rankIcons = ["🥇", "🥈", "🥉"];
                    
                    return (
                      <div 
                        key={row["Attender Name"]} 
                        className={`grid grid-cols-1 md:grid-cols-12 items-center gap-4 px-6 py-4 rounded-3xl border transition-all ${
                          rank === 1 
                            ? "bg-amber-50/40 border-amber-100 shadow-sm" 
                            : rank === 2
                            ? "bg-slate-50/40 border-slate-100 shadow-sm"
                            : rank === 3
                            ? "bg-orange-50/40 border-orange-100 shadow-sm"
                            : "bg-white border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        {/* Rank */}
                        <div className="col-span-1 flex items-center font-bold text-sm text-slate-600">
                          {isTop3 ? (
                            <span className="text-2xl">{rankIcons[index]}</span>
                          ) : (
                            <span className="bg-gray-100 text-gray-500 rounded-full w-7 h-7 flex items-center justify-center text-xs font-black">
                              #{rank}
                            </span>
                          )}
                        </div>

                        {/* Name */}
                        <div className="col-span-4 font-black text-slate-800 text-base">
                          {row["Attender Name"]}
                        </div>

                        {/* Progress Bar & Conv Rate */}
                        <div className="col-span-4 flex items-center gap-3">
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                convRate > 20 
                                  ? "bg-emerald-500" 
                                  : convRate > 10 
                                  ? "bg-indigo-500" 
                                  : "bg-slate-400"
                              }`}
                              style={{ width: `${Math.min(convRate || 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-black text-slate-700 whitespace-nowrap">
                            {row["Conversion Rate (%)"]}
                          </span>
                        </div>

                        {/* Metrics details */}
                        <div className="col-span-3 flex justify-between md:justify-end items-center gap-3 text-xs font-semibold text-slate-500">
                          <div className="text-right">
                            <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Conversions</span>
                            <span className="text-sm font-black text-emerald-600">{row["Reg.Done (Conversions)"]}</span>
                            <span className="block text-[9px] font-semibold text-emerald-500">({row["Incoming Conversions"]} In / {row["Outgoing Conversions"]} Out)</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Incoming</span>
                            <span className="text-xs font-bold text-slate-700">{row["Incoming"]}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Outgoing</span>
                            <span className="text-xs font-bold text-slate-700">{row["Outgoing"]}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Connected</span>
                            <span className="text-xs font-bold text-slate-700">{row["Connected"]}</span>
                          </div>
                          <div className="text-right font-medium">
                            <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total</span>
                            <span className="text-xs font-bold text-slate-700">{row["Total Calls"]}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </MonthlySection>

          <MonthlySection title={`🏆 Registered & Converted Leads list (${conversionsList.length})`}>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
                <p className="text-xs text-gray-400">Leads whose call outcome in this period is marked as Registered/Reg.Done.</p>
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

              <div className="overflow-x-auto rounded-2xl border border-gray-100">
                <table className="w-full text-sm bg-white">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Name & Contact", "Attender", "Tag / Program", "Source / Called For", "Date & Time", "User Feedback", "Remarks"].map(h => (
                        <th key={h} className="px-6 py-3.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {paginatedConversions.map((c, idx) => {
                      const dateStr = c.timestamp instanceof Date && !isNaN(c.timestamp.getTime())
                        ? c.timestamp.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
                        : "N/A";
                      return (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          {/* Name & Contact */}
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-800">{c.contactName || "Unnamed"}</div>
                            <div className="text-xs text-gray-400 font-medium">{c.contactPhone || "No Phone"}</div>
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
                            {c.contactTags && c.contactTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {c.contactTags.slice(0, 2).map((t, index) => (
                                  <span key={index} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold">
                                    {t}
                                  </span>
                                ))}
                                {c.contactTags.length > 2 && (
                                  <span className="text-[9px] text-gray-400">+{c.contactTags.length - 2}</span>
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
                        <td colSpan={7} className="py-12 text-center text-gray-400 font-medium bg-white">
                          No conversions match the current filters and search query in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {totalConvPages > 1 && (
                <div className="p-4 flex items-center justify-between bg-gray-50/50 rounded-2xl border border-gray-100">
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
          </MonthlySection>
        </div>
      )}
    </div>
  );
}
