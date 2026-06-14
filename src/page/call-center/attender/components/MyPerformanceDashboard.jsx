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
  { label: "All Time",   key: "all" },
];

function getTimestampFromLog(log) {
  if (log.updatedAt) {
    return log.updatedAt.toDate ? log.updatedAt.toDate() : new Date(log.updatedAt);
  }
  if (log.createdAt) {
    return log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
  }
  return null;
}

function filterLogsByDate(logs, range) {
  if (range === "all") return logs;
  const now = new Date();
  const start = new Date();
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    start.setDate(now.getDate() - now.getDay()); // Sunday
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return logs.filter(log => {
    // Use history entries to determine activity in range
    const hist = log.history || [];
    if (hist.length > 0) {
      return hist.some(h => new Date(h.timestamp) >= start);
    }
    const ts = getTimestampFromLog(log);
    return ts && ts >= start;
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
export const MyPerformanceDashboard = ({ logs = [], attenderName }) => {
  const [dateRange, setDateRange] = useState("all");

  // All-time stats for today/callbacks (always full logs)
  const todayStr = new Date().toLocaleDateString("en-IN");
  const todayCallCount = useMemo(() => {
    let count = 0;
    logs.forEach(log => {
      (log.history || []).forEach(h => {
        if (new Date(h.timestamp).toLocaleDateString("en-IN") === todayStr) count++;
      });
    });
    return count;
  }, [logs]);

  const callbacksDue = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return logs.filter(l => {
      if (!l.callbackDate) return false;
      const d = l.callbackDate.toDate ? l.callbackDate.toDate() : new Date(l.callbackDate);
      d.setHours(0, 0, 0, 0);
      return d <= today && l.callbackStatus !== "done";
    }).length;
  }, [logs]);

  // Date-filtered stats
  const filtered = useMemo(() => filterLogsByDate(logs, dateRange), [logs, dateRange]);

  const stats = useMemo(() => {
    let connected = 0, notConnected = 0, registrations = 0, interested = 0, infoGiven = 0;
    const statusCounts = {};

    filtered.forEach(log => {
      const s = log.status;
      if (s) {
        statusCounts[s] = (statusCounts[s] || 0) + 1;
        if (CONNECTED_STATUSES.includes(s)) {
          connected++;
          if (s === "Reg.Done") registrations++;
          else if (s === "Interested") interested++;
          else if (s === "Info given") infoGiven++;
        } else if (NOT_CONNECTED_STATUSES.includes(s)) {
          notConnected++;
        }
      }
    });

    const total = filtered.length;
    const called = filtered.filter(l => l.status || l.callbackDate || l.remark || l.remarks).length;
    const uncalled = total - called;
    const connectionRate = total > 0 ? Math.round((connected / total) * 100) : 0;
    const conversionRate = total > 0 ? Math.round((registrations / total) * 100) : 0;

    const statusChartData = Object.entries(statusCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { total, called, uncalled, connected, notConnected, registrations, interested, infoGiven, connectionRate, conversionRate, statusChartData };
  }, [filtered]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f8fa] p-6 space-y-4">

      {/* ── Header + Date Filter ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-800">My Performance</h2>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">{attenderName}</p>
        </div>
        {/* Pill filter */}
        <div className="flex items-center bg-white border border-gray-200 rounded-xl p-0.5 gap-0.5 shadow-sm">
          {DATE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setDateRange(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                dateRange === f.key
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
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
