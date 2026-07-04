import React, { useState, useMemo } from "react";
import { User, PhoneCall, CheckCircle2, TrendingUp, Clock, Sun, AlertCircle, ChevronDown } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { CONNECTED_STATUSES, NOT_CONNECTED_STATUSES } from "../utils";

// ─── Colour palette for pie ───────────────────────────────────────────────────
const PIE_COLORS = ["#4f46e5", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];

// ─── Date range helpers ───────────────────────────────────────────────────────
const DATE_FILTERS = [
  { label: "Today",      key: "today" },
  { label: "This Week",  key: "week" },
  { label: "This Month", key: "month" },
  { label: "Custom",     key: "custom" },
  { label: "All Time",   key: "all" },
];

function parseTimestamp(t) {
  if (!t) return null;
  if (t instanceof Date) return t;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t === "object" && t.seconds !== undefined) {
    return new Date(t.seconds * 1000 + Math.round((t.nanoseconds || 0) / 1000000));
  }
  return new Date(t);
}

function getTimestampFromLog(log) {
  if (log.updatedAt) {
    return parseTimestamp(log.updatedAt);
  }
  if (log.createdAt) {
    return parseTimestamp(log.createdAt);
  }
  return null;
}

function filterLogsByDate(logs, range, customStart, customEnd) {
  if (range === "all") return logs;
  let start = null;
  let end = null;
  const now = new Date();

  if (range === "today") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // Sunday
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (range === "custom") {
    if (customStart) {
      start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
    }
    if (customEnd) {
      end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
    }
  }

  return logs.filter(log => {
    // Use history entries to determine activity in range
    const hist = log.history || [];
    if (hist.length > 0) {
      return hist.some(h => {
        const d = parseTimestamp(h.timestamp);
        if (!d) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }
    const ts = getTimestampFromLog(log);
    if (!ts) return false;
    if (start && ts < start) return false;
    if (end && ts > end) return false;
    return true;
  });
}

function getAttenderAttempts(logs, attenderName, attenderId) {
  const attempts = [];
  const attNameLower = attenderName ? String(attenderName).toLowerCase().trim() : "";
  const attIdLower = attenderId ? String(attenderId).toLowerCase().trim() : "";

  logs.forEach(log => {
    if (log._deleted) return;

    const nameKey = Object.keys(log).find(k => ["name", "lead name", "caller name", "lead"].includes(k.toLowerCase()));
    const contactName = nameKey ? log[nameKey] : "Unknown";
    const phoneKey = Object.keys(log).find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
      || Object.keys(log).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
    const contactPhone = phoneKey ? log[phoneKey] : "";

    const processAttemptObj = (att, isHistory, index) => {
      const status = att.status || "Pending";
      const dateVal = att.timestamp || att.updatedAt;
      const attemptDate = parseTimestamp(dateVal) || parseTimestamp(log.updatedAt || log.createdAt);

      return {
        ...log,
        id: `${log.id}_${isHistory ? `h_${index}` : "latest"}`,
        contactId: log.id,
        Name: contactName,
        Phone: contactPhone,
        status: status,
        remark: att.remark || "",
        callType: att.callType || "outgoing",
        updatedAt: attemptDate,
      };
    };

    // Helper to determine if an attender matches
    const isOurAttender = (name, id) => {
      if (attIdLower && id && String(id).toLowerCase().trim() === attIdLower) return true;
      if (attNameLower && name && String(name).toLowerCase().trim() === attNameLower) return true;
      // If we don't have id/name matching but there's no other attender, count it (since logs are pre-filtered by parent)
      return !id && !name;
    };

    if (log.attenderStates && Object.keys(log.attenderStates).length > 0) {
      Object.entries(log.attenderStates).forEach(([attId, state]) => {
        const stateAttName = state.attenderName || "";
        if (!isOurAttender(stateAttName, attId)) return;

        if (state.history && Array.isArray(state.history) && state.history.length > 0) {
          state.history.forEach((h, index) => {
            const att = processAttemptObj(
              {
                timestamp: h.timestamp,
                status: h.status,
                remark: h.remark,
                callType: h.callType,
                attenderName: h.attenderName
              },
              true,
              index
            );
            if (att) attempts.push(att);
          });
        } else if (state.lastCalledAt || (state.status && state.status !== "Pending") || state.remark) {
          const att = processAttemptObj(
            {
              timestamp: state.lastCalledAt || state.updatedAt,
              status: state.status,
              remark: state.remark,
              callType: state.callType
            },
            false
          );
          if (att) attempts.push(att);
        }
      });
    } else {
      // Legacy structure
      const stateAttName = log.attenderName || "";
      const stateAttId = log.attenderId || "";
      if (!isOurAttender(stateAttName, stateAttId)) return;

      if (log.history && Array.isArray(log.history) && log.history.length > 0) {
        log.history.forEach((h, index) => {
          const att = processAttemptObj(
            {
              timestamp: h.timestamp,
              status: h.status,
              remark: h.remark,
              callType: h.callType,
              attenderName: h.attenderName
            },
            true,
            index
          );
          if (att) attempts.push(att);
        });
      } else {
        if (log.lastCalledAt || (log.status && log.status !== "Pending") || log.remark) {
          const att = processAttemptObj(
            {
              timestamp: log.lastCalledAt || log.updatedAt || log.createdAt,
              status: log.status,
              remark: log.remark,
              callType: log.callType
            },
            false
          );
          if (att) attempts.push(att);
        }
      }
    }
  });

  return attempts;
}

function filterAttemptsByDate(attempts, range, customStart, customEnd) {
  if (range === "all") return attempts;
  let start = null;
  let end = null;
  const now = new Date();

  if (range === "today") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // Sunday
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (range === "custom") {
    if (customStart) {
      start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
    }
    if (customEnd) {
      end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
    }
  }

  return attempts.filter(att => {
    const d = att.updatedAt;
    if (!d || isNaN(d.getTime())) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

// ─── Small stat number block ──────────────────────────────────────────────────
const Stat = ({ label, value, accent = "text-slate-800", sub }) => (
  <div className="flex flex-col">
    <span className={`text-2xl font-black ${accent}`}>{value}</span>
    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{label}</span>
    {sub && <span className="text-[10px] text-gray-300 font-semibold">{sub}</span>}
  </div>
);

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export const MyPerformanceDashboard = ({ logs = [], attenderName, attenderId }) => {
  const [dateRange, setDateRange] = useState("all");
  const todayStrISO = new Date().toISOString().split("T")[0];
  const [customStart, setCustomStart] = useState(todayStrISO);
  const [customEnd, setCustomEnd] = useState(todayStrISO);

  // Extract all attempts all-time
  const allAttempts = useMemo(() => getAttenderAttempts(logs, attenderName, attenderId), [logs, attenderName, attenderId]);

  // Today's calls count
  const todayCallCount = useMemo(() => {
    const today = new Date();
    const start = new Date(today); start.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setHours(23, 59, 59, 999);
    return allAttempts.filter(att => {
      const d = att.updatedAt;
      return d && d >= start && d <= end;
    }).length;
  }, [allAttempts]);

  // Callbacks Due (all time)
  const callbacksDue = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return logs.filter(l => {
      if (!l.callbackDate) return false;
      const d = l.callbackDate.toDate ? l.callbackDate.toDate() : new Date(l.callbackDate);
      d.setHours(0, 0, 0, 0);
      return d <= today && l.callbackStatus !== "done";
    }).length;
  }, [logs]);

  // Date-filtered logs (leads) - used for the "Assigned" lead count
  const filteredLogs = useMemo(() => filterLogsByDate(logs, dateRange, customStart, customEnd), [logs, dateRange, customStart, customEnd]);

  // Date-filtered call attempts
  const filteredAttempts = useMemo(() => filterAttemptsByDate(allAttempts, dateRange, customStart, customEnd), [allAttempts, dateRange, customStart, customEnd]);

  const stats = useMemo(() => {
    let connected = 0, notConnected = 0, registrations = 0, interested = 0, infoGiven = 0;
    const statusCounts = {};

    filteredAttempts.forEach(att => {
      const s = att.status || "Pending";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      
      // Exclude "Pending" from counting as connected or notConnected
      if (s !== "Pending") {
        if (NOT_CONNECTED_STATUSES.includes(s)) {
          notConnected++;
        } else {
          connected++;
          if (s === "Reg.Done") registrations++;
          else if (s === "Interested") interested++;
          else if (s === "Info given") infoGiven++;
        }
      }
    });

    const total = filteredLogs.length; // Number of unique active/assigned leads in the range
    const called = filteredAttempts.length; // Number of call attempts made in the range

    // Uncalled leads are unique leads in filteredLogs that have 0 attempts in the range
    const uniqueCalledContactIds = new Set(filteredAttempts.map(att => att.contactId));
    const uncalledLeads = filteredLogs.filter(log => !uniqueCalledContactIds.has(log.id));
    const uncalled = uncalledLeads.length;

    const connectionRate = called > 0 ? Math.round((connected / called) * 100) : 0;
    const conversionRate = total > 0 ? Math.round((registrations / total) * 100) : 0;

    const statusChartData = Object.entries(statusCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { total, called, uncalled, connected, notConnected, registrations, interested, infoGiven, connectionRate, conversionRate, statusChartData };
  }, [filteredLogs, filteredAttempts]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa] p-6 space-y-4">

      {/* ── Header + Date Filter ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-800">My Performance</h2>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">{attenderName}</p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {/* Pill filter */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-0.5 gap-0.5 shadow-sm">
            {DATE_FILTERS.map(f => {
              const isActive = dateRange === f.key;
              let activeStyle = "";
              if (isActive) {
                if (f.key === "today") {
                  activeStyle = "bg-emerald-600 text-white shadow-md shadow-emerald-600/10 scale-[1.03]";
                } else if (f.key === "week") {
                  activeStyle = "bg-teal-600 text-white shadow-md shadow-teal-600/10 scale-[1.03]";
                } else if (f.key === "month") {
                  activeStyle = "bg-indigo-600 text-white shadow-md shadow-indigo-600/10 scale-[1.03]";
                } else if (f.key === "custom") {
                  activeStyle = "bg-blue-600 text-white shadow-md shadow-blue-600/10 scale-[1.03]";
                } else {
                  activeStyle = "bg-slate-700 text-white shadow-md scale-[1.03]";
                }
              } else {
                activeStyle = "text-gray-400 hover:text-gray-700 hover:bg-gray-50/50";
              }
              return (
                <button
                  key={f.key}
                  onClick={() => setDateRange(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all duration-200 ${activeStyle}`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Pickers */}
          {dateRange === "custom" && (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1.5 px-2.5 shadow-sm animate-fadeIn">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Range:</span>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-2 py-1 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50/50"
              />
              <span className="text-gray-400 text-xs font-semibold">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-2 py-1 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50/50"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Row 1: 6 key numbers ── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Assigned",    value: stats.total,          accent: "text-indigo-600" },
          { label: "Called",      value: stats.called,         accent: "text-blue-600" },
          { label: "Connected",   value: stats.connected,      accent: "text-emerald-600" },
          { label: "Reg. Done",   value: stats.registrations,  accent: "text-green-600" },
          { label: "Interested",  value: stats.interested,     accent: "text-purple-600" },
          { label: "Not Reached", value: stats.notConnected,   accent: "text-red-500" },
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <Stat label={item.label} value={item.value} accent={item.accent} />
          </div>
        ))}
      </div>

      {/* ── Row 2: Rates + Today + Callbacks ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-0.5">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Connection Rate</span>
          <span className="text-3xl font-black text-slate-800">{stats.connectionRate}%</span>
          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
            <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${stats.connectionRate}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-0.5">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Conversion Rate</span>
          <span className="text-3xl font-black text-slate-800">{stats.conversionRate}%</span>
          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
            <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${stats.conversionRate}%` }} />
          </div>
        </div>

        <div className={`rounded-2xl p-4 border shadow-sm flex flex-col gap-0.5 ${
          todayCallCount > 0 ? "bg-amber-50 border-amber-100" : "bg-white border-gray-100"
        }`}>
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
            <Sun size={11} className="text-amber-400" /> Today's Calls
          </span>
          <span className="text-3xl font-black text-slate-800">{todayCallCount}</span>
          <span className="text-[10px] text-gray-400 font-semibold">
            {todayCallCount === 0 ? "None yet today" : `call${todayCallCount !== 1 ? "s" : ""} so far`}
          </span>
        </div>

        <div className={`rounded-2xl p-4 border shadow-sm flex flex-col gap-0.5 ${
          callbacksDue > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-100"
        }`}>
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
            <Clock size={11} className={callbacksDue > 0 ? "text-red-400" : "text-gray-400"} /> Callbacks Due
          </span>
          <span className={`text-3xl font-black ${callbacksDue > 0 ? "text-red-600" : "text-slate-800"}`}>{callbacksDue}</span>
          <span className="text-[10px] text-gray-400 font-semibold">
            {callbacksDue === 0 ? "All on track" : "overdue callbacks"}
          </span>
        </div>
      </div>

      {/* ── Row 3: Status Breakdown ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
          Status Breakdown
          {dateRange !== "all" && (
            <span className="ml-2 normal-case text-indigo-400">
              ({DATE_FILTERS.find(f => f.key === dateRange)?.label})
            </span>
          )}
        </h3>

        {stats.statusChartData.length === 0 ? (
          <p className="text-sm text-gray-400 font-semibold text-center py-8">No calls logged for this period.</p>
        ) : (
          <div className="flex items-center gap-8">
            {/* Pie */}
            <div className="relative w-32 h-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.statusChartData} cx="50%" cy="50%" innerRadius={38} outerRadius={52} paddingAngle={2} dataKey="value">
                    {stats.statusChartData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v}`, ""]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base font-black text-slate-800">{stats.called}</span>
                <span className="text-[8px] text-gray-400 uppercase font-black">called</span>
              </div>
            </div>

            {/* Legend grid */}
            <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-2">
              {stats.statusChartData.map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-xs min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-slate-500 font-semibold truncate">{entry.name}</span>
                  </div>
                  <span className="font-black text-slate-800 ml-3 shrink-0">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
