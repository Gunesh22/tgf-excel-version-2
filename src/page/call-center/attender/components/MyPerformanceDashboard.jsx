import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  PhoneCall, CheckCircle2, TrendingUp, Clock, Calendar,
  Search, Filter, Sparkles, User, Award, CheckCircle,
  XCircle, AlertCircle, ArrowUpRight, Copy, Check, MessageSquare,
  BarChart3, PieChart as PieIcon, RefreshCw, ChevronRight, Layers, FileText
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { CONNECTED_STATUSES, NOT_CONNECTED_STATUSES, getCanonicalStatus } from "../utils";

// ─── Status Color Token System ────────────────────────────────────────────────
const STATUS_THEMES = {
  "Reg.Done": { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", iconClass: "text-emerald-600" },
  "Interested": { bg: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", iconClass: "text-blue-600" },
  "Info Given": { bg: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500", iconClass: "text-indigo-600" },
  "Next Time": { bg: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500", iconClass: "text-sky-600" },
  "Busy": { bg: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", iconClass: "text-amber-600" },
  "No Answer": { bg: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500", iconClass: "text-rose-600" },
  "Not Interested": { bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-500", iconClass: "text-slate-600" },
  "Pending": { bg: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400", iconClass: "text-gray-500" }
};

const PIE_COLORS = ["#10b981", "#3b82f6", "#6366f1", "#0284c7", "#f59e0b", "#f43f5e", "#64748b", "#8b5cf6"];

// ─── Date Filter Options ──────────────────────────────────────────────────────
const DATE_FILTERS = [
  { label: "Today",      key: "today" },
  { label: "This Week",  key: "week" },
  { label: "This Month", key: "month" },
  { label: "Custom",     key: "custom" },
  { label: "All Time",   key: "all" },
];

// ─── Date & Timestamp Parser ─────────────────────────────────────────────────
function parseTimestamp(t) {
  if (!t) return null;
  if (t instanceof Date) return isNaN(t.getTime()) ? null : t;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t === "object" && t.seconds !== undefined) {
    return new Date(t.seconds * 1000 + Math.round((t.nanoseconds || 0) / 1000000));
  }
  const parsed = new Date(t);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ─── Extract Attender Call Attempts (Strict Isolation Logic) ──────────────────
function getAttenderAttempts(logs, attenderName, attenderId) {
  const attNameLower = attenderName ? String(attenderName).toLowerCase().trim() : "";
  const attIdLower = attenderId ? String(attenderId).toLowerCase().trim() : "";

  // Strict identity matching helper
  const isOurAttender = (name, id) => {
    const nLower = name ? String(name).toLowerCase().trim() : "";
    const iLower = id ? String(id).toLowerCase().trim() : "";
    if (!nLower && !iLower) return false;
    if (attIdLower && iLower && iLower === attIdLower) return true;
    if (attNameLower && nLower && nLower === attNameLower) return true;
    if (attNameLower && iLower && iLower === attNameLower) return true;
    if (attIdLower && nLower && nLower === attIdLower) return true;
    return false;
  };

  const list = [];

  logs.forEach(log => {
    if (!log || log._deleted) return;

    const nameKey = Object.keys(log).find(k => ["name", "lead name", "caller name", "lead"].includes(k.toLowerCase()));
    const contactName = nameKey ? log[nameKey] : "Unknown Lead";
    const phoneKey = Object.keys(log).find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
      || Object.keys(log).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
    const contactPhone = phoneKey ? log[phoneKey] : "";

    const sourceKey = Object.keys(log).find(k => ["source", "sourse", "source of information", "source of informiton"].includes(k.toLowerCase()));
    const sourceVal = sourceKey ? String(log[sourceKey] || "").trim() : "";

    const calledForKey = Object.keys(log).find(k => ["called for", "called_for", "calledfor"].includes(k.toLowerCase()));
    const calledForVal = calledForKey ? String(log[calledForKey] || "").trim() : "";

    const createAttemptObj = (status, dateVal, remark, callType, source, calledFor, attId, attName, isHistory, index) => {
      const canonicalStatus = getCanonicalStatus(status || "Pending");
      const attemptDate = parseTimestamp(dateVal) || parseTimestamp(log.createdAt);
      if (!attemptDate) return null;

      return {
        ...log,
        id: `${log.id}_${attId || "att"}_${isHistory ? `h_${index}` : "latest"}_${attemptDate.getTime()}`,
        contactId: log.id,
        Name: contactName,
        Phone: contactPhone,
        programId: log.programId,
        programName: log.programName || "Unknown Program",
        tags: log.tags || [],
        attenderId: attId,
        attenderName: attName,
        status: canonicalStatus,
        remark: remark || "",
        callType: callType || "outgoing",
        createdAt: parseTimestamp(log.createdAt) || attemptDate,
        timestamp: attemptDate,
        updatedAt: attemptDate,
        source: source || sourceVal,
        calledFor: calledFor || calledForVal
      };
    };

    const hasAttenderStates = log.attenderStates && Object.keys(log.attenderStates).length > 0;
    const hasTopHistory = Array.isArray(log.history) && log.history.length > 0;

    // Track processed event keys per lead document to prevent double-counting
    const seenEventKeys = new Set();

    const addAttemptIfNew = (status, dateVal, remark, callType, source, calledFor, attId, attName, isHistory, index) => {
      const canonicalStatus = getCanonicalStatus(status || "Pending");
      const attemptDate = parseTimestamp(dateVal) || parseTimestamp(log.createdAt);
      if (!attemptDate) return;

      const eventKey = `${log.id}_${attemptDate.getTime()}_${canonicalStatus}`;
      if (seenEventKeys.has(eventKey)) return;
      seenEventKeys.add(eventKey);

      const att = createAttemptObj(
        canonicalStatus,
        attemptDate,
        remark,
        callType,
        source,
        calledFor,
        attId,
        attName,
        isHistory,
        index
      );
      if (att) list.push(att);
    };

    // Tier 1: Extract from matching attenderStates
    if (hasAttenderStates) {
      Object.entries(log.attenderStates).forEach(([attId, state]) => {
        if (!state) return;
        const stateAttName = state.attenderName;

        if (!isOurAttender(stateAttName, attId)) return;

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
              index
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
            0
          );
        }
      });
    }

    // Tier 2: Extract from top-level log.history (scanning for events owned by our attender)
    if (hasTopHistory) {
      log.history.forEach((h, index) => {
        const itemAttId = h.attenderId || log.attenderId;
        const itemAttName = h.attenderName || log.attenderName;

        if (isOurAttender(itemAttName, itemAttId)) {
          const dateVal = h.timestamp || h.date || h.createdAt || h.updatedAt;
          addAttemptIfNew(
            h.status,
            dateVal,
            h.remark,
            h.callType,
            h.source,
            h.calledFor,
            itemAttId || "legacy",
            itemAttName || "Legacy Attender",
            true,
            index
          );
        }
      });
    }

    // Tier 3: Extract from top-level document fields (if legacy without attenderStates & without history)
    if (!hasAttenderStates && !hasTopHistory) {
      if (isOurAttender(log.attenderName, log.attenderId)) {
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
            0
          );
        }
      }
    }
  });

  return list;
}

// ─── Filter Attempts by Date Range ───────────────────────────────────────────
function filterAttemptsByDate(attempts, range, customStart, customEnd) {
  if (range === "all") return attempts;
  let start = null;
  let end = null;
  const now = new Date();

  if (range === "today") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
  } else if (range === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // Sunday
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
  } else if (range === "month") {
    start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
  } else if (range === "custom") {
    if (customStart) start = new Date(customStart + "T00:00:00");
    if (customEnd) end = new Date(customEnd + "T23:59:59.999");
  }

  return attempts.filter(att => {
    const d = att.timestamp || att.updatedAt;
    if (!d || isNaN(d.getTime())) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

// ─── Filter Lead Documents by Date Range ─────────────────────────────────────
function filterLogsByDate(logs, range, customStart, customEnd, attenderName, attenderId) {
  if (range === "all") return logs.filter(log => !log._deleted);
  let start = null;
  let end = null;
  const now = new Date();

  if (range === "today") {
    start = new Date(now); start.setHours(0, 0, 0, 0);
    end = new Date(now); end.setHours(23, 59, 59, 999);
  } else if (range === "week") {
    start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0);
    end = new Date(now); end.setHours(23, 59, 59, 999);
  } else if (range === "month") {
    start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0);
    end = new Date(now); end.setHours(23, 59, 59, 999);
  } else if (range === "custom") {
    if (customStart) start = new Date(customStart + "T00:00:00");
    if (customEnd) end = new Date(customEnd + "T23:59:59.999");
  }

  const attNameLower = attenderName ? String(attenderName).toLowerCase().trim() : "";
  const attIdLower = attenderId ? String(attenderId).toLowerCase().trim() : "";

  const isOurAttender = (name, id) => {
    const nLower = name ? String(name).toLowerCase().trim() : "";
    const iLower = id ? String(id).toLowerCase().trim() : "";
    if (!nLower && !iLower) return false;
    if (attIdLower && iLower && iLower === attIdLower) return true;
    if (attNameLower && nLower && nLower === attNameLower) return true;
    if (attNameLower && iLower && iLower === attNameLower) return true;
    if (attIdLower && nLower && nLower === attIdLower) return true;
    return false;
  };

  return logs.filter(log => {
    if (log._deleted) return false;
    const timestamps = [];

    if (log.attenderStates && typeof log.attenderStates === "object") {
      Object.entries(log.attenderStates).forEach(([attId, state]) => {
        if (!state) return;
        const stateAttName = state.attenderName;
        if (Array.isArray(state.history)) {
          state.history.forEach(h => {
            const hAttId = h.attenderId || (attId !== "legacy" ? attId : null);
            const hAttName = h.attenderName || stateAttName;
            if (isOurAttender(hAttName, hAttId)) {
              const d = parseTimestamp(h.timestamp || h.date || h.createdAt || h.updatedAt);
              if (d) timestamps.push(d);
            }
          });
        }
        if (isOurAttender(stateAttName, attId) && state.lastCalledAt) {
          const d = parseTimestamp(state.lastCalledAt);
          if (d) timestamps.push(d);
        }
      });
    }

    if (Array.isArray(log.history)) {
      log.history.forEach(h => {
        if (isOurAttender(h.attenderName, h.attenderId)) {
          const d = parseTimestamp(h.timestamp || h.date);
          if (d) timestamps.push(d);
        }
      });
    }

    if (timestamps.length === 0) return false;
    return timestamps.some(d => {
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  });
}

// ─── Main MyPerformanceDashboard Component ─────────────────────────────────────
export function MyPerformanceDashboard({
  logs = [],
  attenderName = "",
  attenderId = "",
  tag = "ALL"
}) {
  const [dateRange, setDateRange] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [copiedId, setCopiedId] = useState(null);

  // Extract all-time attempts strictly for THIS attender
  const allAttempts = useMemo(() => {
    return getAttenderAttempts(logs, attenderName, attenderId);
  }, [logs, attenderName, attenderId]);

  // Filtered attempts by date range
  const filteredAttempts = useMemo(() => {
    return filterAttemptsByDate(allAttempts, dateRange, customStart, customEnd);
  }, [allAttempts, dateRange, customStart, customEnd]);

  // Filtered assigned lead documents by date range
  const filteredLogs = useMemo(() => {
    return filterLogsByDate(logs, dateRange, customStart, customEnd, attenderName, attenderId);
  }, [logs, dateRange, customStart, customEnd, attenderName, attenderId]);

  useEffect(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayAttempts = allAttempts.filter(a => a.timestamp >= todayStart && a.timestamp <= todayEnd);
    const monthAttempts = allAttempts.filter(a => a.timestamp >= monthStart && a.timestamp <= todayEnd);

    const todayRegs = todayAttempts.filter(a => a.status === "Reg.Done").length;
    const monthRegs = monthAttempts.filter(a => a.status === "Reg.Done").length;

    console.log(
      `%c📊 [PERFORMANCE AUDIT] ${attenderName} (${attenderId}) | Active: "${dateRange}" (${filteredAttempts.length} calls) | Today: ${todayAttempts.length} calls (${todayRegs} Reg) | This Month: ${monthAttempts.length} calls (${monthRegs} Reg) | All-Time: ${allAttempts.length} calls`,
      "background: #1e1b4b; color: #818cf8; font-weight: bold; padding: 6px 12px; border-radius: 6px; font-size: 12px;",
      {
        Attender: attenderName,
        AttenderId: attenderId,
        ActiveFilter: dateRange,
        IndexedDBLeads: logs.length,
        DisplayedCalls: filteredAttempts.length,
        TodayCalls: todayAttempts.length,
        TodayRegs: todayRegs,
        ThisMonthCalls: monthAttempts.length,
        ThisMonthRegs: monthRegs,
        AllTimeCalls: allAttempts.length,
        DisplayedAttemptsSample: filteredAttempts
      }
    );
  }, [logs, attenderName, attenderId, allAttempts, filteredAttempts, dateRange]);

  // Today's calls count
  const todayCallsCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return allAttempts.filter(att => att.timestamp >= start && att.timestamp <= end).length;
  }, [allAttempts]);

  // Callbacks Due (all time)
  const callbacksDueCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return logs.filter(l => {
      if (l._deleted) return false;
      let callbackDate = l.callbackDate;
      let callbackStatus = l.callbackStatus;

      if (attenderId && l.attenderStates?.[attenderId]) {
        const state = l.attenderStates[attenderId];
        if (state.callbackDate) callbackDate = state.callbackDate;
        if (state.callbackStatus) callbackStatus = state.callbackStatus;
      }

      if (!callbackDate) return false;
      const d = parseTimestamp(callbackDate);
      if (!d || isNaN(d.getTime())) return false;
      const cbDay = new Date(d); cbDay.setHours(0, 0, 0, 0);
      return cbDay <= today && callbackStatus !== "done";
    }).length;
  }, [logs, attenderId]);

  // Key KPI Statistics
  const stats = useMemo(() => {
    let connected = 0;
    let notConnected = 0;
    let interested = 0;
    let infoGiven = 0;
    let nextTime = 0;
    let notInterested = 0;

    const statusCounts = {};
    const uniqueRegKeys = new Set();

    filteredAttempts.forEach(att => {
      const s = getCanonicalStatus(att.status || "Pending");
      statusCounts[s] = (statusCounts[s] || 0) + 1;

      if (s !== "Pending") {
        if (NOT_CONNECTED_STATUSES.includes(s)) {
          notConnected++;
        } else {
          connected++;
          const sLower = s.toLowerCase().trim();
          if (s === "Reg.Done") {
            const prog = att.programId || att.calledFor || att["Called For"] || "default";
            uniqueRegKeys.add(`${att.contactId || att.id}_${String(prog).toLowerCase().trim()}`);
          } else if (sLower === "interested" || sLower === "intersted") {
            interested++;
          } else if (sLower === "info given") {
            infoGiven++;
          } else if (sLower === "next time") {
            nextTime++;
          } else if (sLower === "not interested" || sLower === "not intrested") {
            notInterested++;
          }
        }
      }
    });

    const totalLeads = filteredLogs.length;
    const totalCalls = filteredAttempts.length;
    const registrations = uniqueRegKeys.size;
    const connectionRate = totalCalls > 0 ? Math.round((connected / totalCalls) * 100) : 0;
    const conversionDenominator = registrations + infoGiven + interested + nextTime + notInterested;
    const conversionRate = conversionDenominator > 0 ? Math.round((registrations / conversionDenominator) * 100) : 0;

    const statusChartData = Object.entries(statusCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalLeads,
      totalCalls,
      connected,
      notConnected,
      registrations,
      interested,
      infoGiven,
      nextTime,
      notInterested,
      connectionRate,
      conversionRate,
      statusCounts,
      statusChartData
    };
  }, [filteredLogs, filteredAttempts]);

  // Search & Filter Call Log Items for Table Display
  const displayedAttempts = useMemo(() => {
    return filteredAttempts.filter(att => {
      if (statusFilter !== "ALL" && getCanonicalStatus(att.status) !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = String(att.Name || "").toLowerCase().includes(q);
        const matchPhone = String(att.Phone || "").toLowerCase().includes(q);
        const matchRemark = String(att.remark || "").toLowerCase().includes(q);
        const matchProg = String(att.calledFor || att.programName || "").toLowerCase().includes(q);
        return matchName || matchPhone || matchRemark || matchProg;
      }
      return true;
    });
  }, [filteredAttempts, statusFilter, searchTerm]);

  // Copy phone helper
  const handleCopyPhone = (phone, id) => {
    if (!phone) return;
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-full bg-slate-50/60 p-4 sm:p-6 lg:p-8 space-y-6 font-sans text-slate-800">
      
      {/* ─── Header & Date Filter Bar ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white/80 backdrop-blur-md p-5 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">My Performance</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                0-Read IndexedDB Active
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Attender: <span className="font-semibold text-slate-700">{attenderName || "Personal Dashboard"}</span>
            </p>
          </div>
        </div>

        {/* Date Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100/80 p-1 rounded-2xl border border-slate-200/80">
            {DATE_FILTERS.map(filter => {
              const isActive = dateRange === filter.key;
              return (
                <button
                  key={filter.key}
                  onClick={() => setDateRange(filter.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? "bg-white text-indigo-600 shadow-sm scale-[1.02]"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Range Pickers */}
          {dateRange === "custom" && (
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
              />
              <span className="text-slate-400 text-xs font-bold">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── Top 4 KPI Gradient Cards Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Calls / Pulses */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-3xl p-5 text-white shadow-xl shadow-indigo-600/15 group hover:scale-[1.01] transition-all">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-indigo-100/80">Total Call Pulses</span>
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white">
              <PhoneCall size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">{stats.totalCalls}</span>
            <span className="text-xs font-medium text-indigo-200">attempts</span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-indigo-100">
            <span>Today's Calls:</span>
            <span className="font-bold text-white bg-white/20 px-2 py-0.5 rounded-full">{todayCallsCount}</span>
          </div>
        </div>

        {/* Card 2: Registrations */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-5 text-white shadow-xl shadow-emerald-600/15 group hover:scale-[1.01] transition-all">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-emerald-100/80">Registrations (Reg.Done)</span>
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white">
              <Award size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">{stats.registrations}</span>
            <span className="text-xs font-medium text-emerald-200">unique leads</span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-emerald-100">
            <span>Conversion Rate:</span>
            <span className="font-bold text-white bg-white/20 px-2 py-0.5 rounded-full">{stats.conversionRate}%</span>
          </div>
        </div>

        {/* Card 3: Connection Rate */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-cyan-700 rounded-3xl p-5 text-white shadow-xl shadow-blue-600/15 group hover:scale-[1.01] transition-all">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-blue-100/80">Connected Calls</span>
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">{stats.connected}</span>
            <span className="text-xs font-medium text-blue-200">/ {stats.totalCalls} calls</span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-blue-100">
            <span>Connection Rate:</span>
            <span className="font-bold text-white bg-white/20 px-2 py-0.5 rounded-full">{stats.connectionRate}%</span>
          </div>
        </div>

        {/* Card 4: Callbacks Due */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-5 text-white shadow-xl shadow-amber-500/15 group hover:scale-[1.01] transition-all">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-amber-100/80">Callbacks Due</span>
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">{callbacksDueCount}</span>
            <span className="text-xs font-medium text-amber-100">pending</span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-amber-100">
            <span>Assigned Leads:</span>
            <span className="font-bold text-white bg-white/20 px-2 py-0.5 rounded-full">{stats.totalLeads}</span>
          </div>
        </div>

      </div>

      {/* ─── Middle Section: Analytics & Status Distribution ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Call Result Breakdown Progress List (2 Columns Wide) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <BarChart3 size={18} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Call Outcome Analytics</h3>
                <p className="text-[11px] text-slate-400 font-medium">Distribution of call attempt results for this attender</p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              {stats.totalCalls} Total Events
            </span>
          </div>

          {stats.statusChartData.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs">
              <FileText size={32} className="stroke-[1.5] mb-2 opacity-50" />
              <span>No call attempts found for the selected date range.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {stats.statusChartData.map((item, index) => {
                const theme = STATUS_THEMES[item.name] || STATUS_THEMES["Pending"];
                const percentage = stats.totalCalls > 0 ? Math.round((item.value / stats.totalCalls) * 100) : 0;
                
                return (
                  <div key={item.name} className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 hover:border-slate-200 transition-all">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <div className="flex items-center gap-2 font-bold text-slate-800">
                        <span className={`w-2.5 h-2.5 rounded-full ${theme.dot}`}></span>
                        <span>{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-900">{item.value}</span>
                        <span className="text-[10px] text-slate-400 font-medium">({percentage}%)</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${theme.dot}`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Status Distribution Donut Chart */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <div className="p-2 rounded-xl bg-violet-50 text-violet-600">
              <PieIcon size={18} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Outcome Share</h3>
              <p className="text-[11px] text-slate-400 font-medium">Visual proportion of call statuses</p>
            </div>
          </div>

          <div className="w-full h-[220px] flex items-center justify-center">
            {stats.statusChartData.length === 0 ? (
              <span className="text-xs text-slate-400 font-medium">No data to display</span>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats.statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {stats.statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Connection Efficiency:</span>
            <span className="font-bold text-slate-800">{stats.connectionRate}%</span>
          </div>
        </div>

      </div>

      {/* ─── Bottom Section: Searchable Call History Log Table ───────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4">
        
        {/* Table Filter & Search Header */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
              <Layers size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Call History & Activity Log</h3>
              <p className="text-xs text-slate-400 font-medium">Showing personal call attempts logged for {attenderName || "this attender"}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search lead, phone, note..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <XCircle size={14} />
                </button>
              )}
            </div>

            {/* Status Filter Dropdown */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full sm:w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            >
              <option value="ALL">All Statuses</option>
              <option value="Reg.Done">Reg.Done</option>
              <option value="Interested">Interested</option>
              <option value="Info Given">Info Given</option>
              <option value="Next Time">Next Time</option>
              <option value="Busy">Busy</option>
              <option value="No Answer">No Answer</option>
              <option value="Not Interested">Not Interested</option>
            </select>
          </div>
        </div>

        {/* Call Logs Table */}
        <div className="overflow-x-auto">
          {displayedAttempts.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
              <FileText size={36} className="stroke-[1.5] text-slate-300" />
              <span className="font-semibold text-slate-600">No call records found matching criteria</span>
              <span className="text-[11px] text-slate-400">Try adjusting your date range, search query, or status filter.</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-5">Contact Lead</th>
                  <th className="py-3.5 px-4 text-center">Calls Done</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Called For / Program</th>
                  <th className="py-3.5 px-4">Call Type</th>
                  <th className="py-3.5 px-5">Call Note / Remark</th>
                  <th className="py-3.5 px-5 text-right">Event Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {displayedAttempts.map((att, idx) => {
                  const theme = STATUS_THEMES[att.status] || STATUS_THEMES["Pending"];
                  const dateFormatted = att.timestamp
                    ? att.timestamp.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "Unknown";
                  const targetId = attenderId || att.attenderId;
                  const targetName = (attenderName || att.attenderName || "").toLowerCase().trim();
                  let callsDoneCount = 0;

                  if (targetId && att.attenderStates && att.attenderStates[targetId]) {
                    const st = att.attenderStates[targetId];
                    if (Array.isArray(st.history) && st.history.length > 0) {
                      callsDoneCount = st.history.length;
                    } else if (st.lastCalledAt || st.status || st.remark) {
                      callsDoneCount = 1;
                    }
                  } else if (Array.isArray(att.history) && att.history.length > 0) {
                    const attenderHistory = att.history.filter(h => {
                      if (targetId && (h.attenderId === targetId || h.assignedTo === targetId)) return true;
                      const hName = (h.attenderName || h.name || "").toLowerCase().trim();
                      if (targetName && hName === targetName) return true;
                      return false;
                    });
                    callsDoneCount = attenderHistory.length > 0 ? attenderHistory.length : 1;
                  } else if (att.status || att.remark || att.lastCalledAt) {
                    callsDoneCount = 1;
                  }

                  return (
                    <tr key={`${att.id || 'att'}_${idx}`} className="hover:bg-slate-50/60 transition-colors group">
                      
                      {/* Contact Lead */}
                      <td className="py-3.5 px-5">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {att.Name || "Unknown Lead"}
                          </span>
                          {att.Phone && (
                            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500 font-medium">
                              <span>{att.Phone}</span>
                              <button
                                onClick={() => handleCopyPhone(att.Phone, att.id)}
                                className="text-slate-300 hover:text-indigo-600 transition"
                                title="Copy Phone Number"
                              >
                                {copiedId === att.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Calls Done */}
                      <td className="py-3.5 px-4 text-center font-bold">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] border border-slate-200">
                          📞 {callsDoneCount}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${theme.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`}></span>
                          {att.status}
                        </span>
                      </td>

                      {/* Program */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-semibold text-[11px]">
                          {att.calledFor || att.programName || "General"}
                        </span>
                      </td>

                      {/* Call Type */}
                      <td className="py-3.5 px-4 capitalize">
                        <span className="text-slate-500 font-semibold">
                          {att.callType || "outgoing"}
                        </span>
                      </td>

                      {/* Remark */}
                      <td className="py-3.5 px-5 max-w-xs">
                        <p className="text-slate-600 font-normal line-clamp-2 italic" title={att.remark}>
                          {att.remark ? `"${att.remark}"` : <span className="text-slate-300 font-sans not-italic">No note recorded</span>}
                        </p>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-5 text-right font-medium text-slate-400 text-[11px]">
                        {dateFormatted}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-400">
          <span>Showing {displayedAttempts.length} of {filteredAttempts.length} call events</span>
          <span className="font-semibold text-slate-500">IndexedDB Zero-Read Dataset</span>
        </div>

      </div>

    </div>
  );
}

export default MyPerformanceDashboard;
