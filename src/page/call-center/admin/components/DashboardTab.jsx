import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  BarChart3, Download, PhoneCall
} from "lucide-react";
import { subscribeToAllCallLogs } from "../../../../lib/db";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { COLORS, cleanExportRow } from "../utils.jsx";

export default function DashboardTab({ programs, attenders }) {
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [callLogs, setCallLogs] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedAttenderId, setSelectedAttenderId] = useState("");
  const unsubRef = React.useRef(null);

  useEffect(() => {
    if (unsubRef.current) unsubRef.current();
    if (!selectedProgramId) return;
    unsubRef.current = subscribeToAllCallLogs(selectedProgramId, setCallLogs);
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [selectedProgramId]);

  const filteredLogs = React.useMemo(() => {
    return callLogs.filter(log => {
      if (log._deleted) return false;
      if (selectedAttenderId && log.attenderId !== selectedAttenderId) return false;
      if (!dateFrom && !dateTo) return true;
      const logDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
      if (dateFrom && logDate < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && logDate > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [callLogs, dateFrom, dateTo, selectedAttenderId]);

  const attenderStats = React.useMemo(() => {
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
      if (!log.status) s.pending++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredLogs]);

  const outcomeData = React.useMemo(() => {
    const map = {};
    filteredLogs.forEach(l => {
      const s = l.status || "(no status)";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredLogs]);

  const totalCalled = filteredLogs.filter(l => l.status).length;
  const totalRegDone = filteredLogs.filter(l => l.status === "Reg.Done").length;
  const totalInterested = filteredLogs.filter(l => l.status === "Interested").length;
  const totalPending = filteredLogs.filter(l => !l.status).length;

  const callsByHour = React.useMemo(() => {
    const map = Array(24).fill(0).map((_, i) => ({ hour: `${i}:00`, calls: 0 }));
    filteredLogs.forEach(l => {
      if (l.status) { // Only count if actually called
        const d = l.updatedAt?.toDate ? l.updatedAt.toDate() : l.updatedAt ? new Date(l.updatedAt) : null;
        if (d) map[d.getHours()].calls++;
      }
    });
    
    const startIndex = map.findIndex(m => m.calls > 0);
    let endIndex = 23;
    for (let i = map.length - 1; i >= 0; i--) { if (map[i].calls > 0) { endIndex = i; break; } }
    if (startIndex === -1) return []; // No calls at all
    return map.slice(Math.max(0, startIndex - 1), Math.min(24, endIndex + 2));
  }, [filteredLogs]);

  const interestedOverTime = React.useMemo(() => {
    const map = {};
    const msPerDay = 1000 * 60 * 60 * 24;
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * msPerDay);
      map[d.toLocaleDateString("en-US", { month: "short", day: "numeric" })] = { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), interested: 0, registered: 0 };
    }
    filteredLogs.forEach(l => {
      if (l.status === "Interested" || l.status === "Reg.Done") {
        const d = l.updatedAt?.toDate ? l.updatedAt.toDate() : l.updatedAt ? new Date(l.updatedAt) : null;
        if (d) {
          const dayStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          if (map[dayStr]) {
            if (l.status === "Interested") map[dayStr].interested++;
            if (l.status === "Reg.Done") map[dayStr].registered++;
          }
        }
      }
    });

    return Object.values(map);
  }, [filteredLogs]);

  const handleExportReport = () => {
    if (filteredLogs.length === 0) {
      toast.error("No data to export for this selection.");
      return;
    }
    const cleanData = filteredLogs.map(cleanExportRow);
    const ws = XLSX.utils.json_to_sheet(cleanData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Report");
    XLSX.writeFile(wb, `CallCenter_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Report downloaded successfully!");
  };

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800">Analytics Dashboard</h2>
          <p className="text-slate-500 mt-1">Real-time call performance across all attenders.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-2xl font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">-- Select Sheet / Tag --</option>
            <option value="ALL">🌟 ALL TAGS / PROGRAMS (Master)</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={selectedAttenderId} onChange={e => setSelectedAttenderId(e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-2xl font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Attenders</option>
            {attenders.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <span className="text-gray-400 text-sm font-medium">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />

          <button
            onClick={handleExportReport}
            disabled={!selectedProgramId || filteredLogs.length === 0}
            className="ml-2 flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition disabled:opacity-50"
          >
            <Download size={16} /> Export Report
          </button>
        </div>
      </div>

      {!selectedProgramId ? (
        <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl text-gray-400">
          <div className="text-center"><BarChart3 size={40} className="mx-auto mb-3 opacity-30" /><p>Select a sheet or tag to view analytics</p></div>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { label: "Total Entries", value: filteredLogs.length, color: "blue", sub: "all entries" },
              { label: "Actions Done", value: totalCalled, color: "indigo", sub: "have a status" },
              { label: "Interested", value: totalInterested, color: "purple", sub: "hot leads" },
              { label: "Reg.Done", value: totalRegDone, color: "emerald", sub: "conversions" },
            ].map(s => (
              <div key={s.label} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm group hover:-translate-y-1 transition-all duration-300">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
                <p className={`text-4xl font-black text-${s.color}-600 mt-2`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Charts Row 1 */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm col-span-1">
              <h3 className="text-sm font-bold text-gray-700 mb-4">Outcome Distribution</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={outcomeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {outcomeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm col-span-1">
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

          {/* Charts Row 2 */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm col-span-1">
              <h3 className="text-sm font-bold text-gray-700 mb-4">Calls / Actions by Hour</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={callsByHour}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="calls" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm col-span-1">
              <h3 className="text-sm font-bold text-gray-700 mb-4">Interested & Registered (Last 7 Days)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={interestedOverTime}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} padding={{ left: 10, right: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={36} />
                  <Line type="monotone" dataKey="interested" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Interested" />
                  <Line type="monotone" dataKey="registered" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Registered" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Attender Detail Table */}
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
                    <tr><td colSpan={8} className="py-10 text-center text-gray-400">No call data for this program yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><PhoneCall size={18} className="text-green-500" /> Live Activity Feed</h3>
                <p className="text-xs text-gray-400 mt-0.5">Real-time actions by all attenders</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-xl">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Live</span>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
              {(() => {
                const allActivity = [];
                filteredLogs.forEach(log => {
                  const logName = Object.keys(log).find(k => k.toLowerCase().includes("name") || k.toLowerCase().includes("lead"));
                  const contactName = logName ? log[logName] : "Unknown";
                  if (log.history && Array.isArray(log.history)) {
                    log.history.forEach(h => {
                      allActivity.push({
                        attender: h.attenderName || log.attenderName || "Unknown",
                        contact: contactName,
                        status: h.status,
                        remark: h.remark,
                        time: h.timestamp,
                        program: log.programName,
                      });
                    });
                  }
                  if (log.lastCalledAt && (!log.history || log.history.length === 0)) {
                    allActivity.push({
                      attender: log.attenderName || "Unknown",
                      contact: contactName,
                      status: log.status || "Viewed",
                      remark: log.remark,
                      time: log.lastCalledAt,
                      program: log.programName,
                    });
                  }
                });
                allActivity.sort((a, b) => new Date(b.time) - new Date(a.time));
                const top50 = allActivity.slice(0, 50);
                if (top50.length === 0) {
                  return <div className="py-16 text-center text-gray-400 font-medium">No activity yet. Attenders will appear here as they make calls.</div>;
                }
                const timeAgo = (ts) => {
                  const diff = Date.now() - new Date(ts).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) return "just now";
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  const days = Math.floor(hrs / 24);
                  return `${days}d ago`;
                };
                return top50.map((a, i) => (
                  <div key={i} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                    <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                      <span className="font-black text-indigo-600 text-xs">{(a.attender || "?")[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-800">{a.attender}</span>
                        <span className="text-gray-400 text-xs">→</span>
                        <span className="text-sm text-gray-600 truncate">{a.contact}</span>
                      </div>
                      {a.remark && <p className="text-xs text-gray-400 truncate mt-0.5">{a.remark}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.status && (
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${a.status === "Reg.Done" ? "bg-emerald-100 text-emerald-700" :
                          a.status === "Interested" ? "bg-blue-100 text-blue-700" :
                            a.status === "Info given" ? "bg-purple-100 text-purple-700" :
                              "bg-gray-100 text-gray-600"
                          }`}>{a.status}</span>
                      )}
                      <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">{timeAgo(a.time)}</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
