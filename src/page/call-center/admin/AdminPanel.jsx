import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Settings, ArrowLeft, BarChart3, Users, FileSpreadsheet,
  ClipboardCheck, Plus, Trash2, RefreshCw, Eye, Download,
  Upload, FolderOpen, ChevronRight, TrendingUp, PhoneCall,
  UserCheck, AlertTriangle, Check, X, Calendar, Filter, Loader, Flame, FileText, Search, ArrowRight, Columns
} from "lucide-react";
import {
  getPrograms, createProgram, deleteProgram, importContacts, getProgramContactStats,
  getAttenders, createAttender, updateAttender, deleteAttender,
  subscribeToAllCallLogs, getAttenderCallLogs, reassignContactsToPool,
  subscribeToRegistrations, reassignContactsBetweenAttenders,
  subscribeToCallLogs, updateCallLog, getProgramCallLogs,
  getProgramChunkContacts, remapProgramContacts
} from "../../../lib/db";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import ImportContacts from "../ImportContacts";

const COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];
const TAB_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={18} /> },
  { id: "monthly", label: "Monthly Report", icon: <FileText size={18} /> },
  { id: "programs", label: "Programs", icon: <FolderOpen size={18} /> },
  { id: "import", label: "Lead Distribution 📂", icon: <Upload size={18} /> },
  { id: "attenders", label: "Attenders", icon: <Users size={18} /> },
  { id: "abhivyakti", label: "Abhivyakti", icon: <ClipboardCheck size={18} /> },
];

const cleanExportRow = (log) => {
  const INTERNAL_KEYS = [
    "id", "programId", "programName", "contactId", "attenderId", "createdAt", "updatedAt",
    "history", "_callbackDue", "_deleted", "isCallbackDue", "isHotLead", "callCount",
    "callbackStatus", "lastCalledAt", "firstCalledAt", "registeredAt", "conversionSource",
    "convertedBy", "subProgram", "objectionReason"
  ];

  const row = {};
  
  // Find standard field mappings
  const findValue = (obj, keysList) => {
    const foundKey = Object.keys(obj).find(k => keysList.includes(k.toLowerCase()));
    return foundKey ? obj[foundKey] : "";
  };

  const nameVal = findValue(log, ["name", "caller", "caller name", "lead name", "lead", "name of caller"]);
  const phoneVal = findValue(log, ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number"]);
  const emailVal = findValue(log, ["email", "mail", "e-mail", "email id", "emailaddress"]);
  const cityVal = findValue(log, ["city", "location", "khoji city", "place", "city name"]);
  const countryVal = findValue(log, ["country", "nation"]);
  const tagsVal = findValue(log, ["tags", "tag"]);
  const statusVal = log.status || "Pending";
  const remarkVal = log.remark || "";
  const subProgramVal = log["Sub Program"] || log.subProgram || "";

  let callbackDateStr = "";
  if (log.callbackDate) {
    const d = log.callbackDate.toDate ? log.callbackDate.toDate() : new Date(log.callbackDate);
    if (d && !isNaN(d)) {
      callbackDateStr = d.toLocaleDateString("en-IN");
    }
  }

  row["Name"] = nameVal;
  row["Phone"] = phoneVal;
  row["Email"] = emailVal;
  row["City"] = cityVal;
  row["Country"] = countryVal;
  row["Tags"] = tagsVal;
  row["Sub Program"] = subProgramVal;
  row["Status"] = statusVal;
  row["Remark"] = remarkVal;
  row["Callback Date"] = callbackDateStr;

  // Add all other dynamic/custom keys from GHL / Excel
  Object.keys(log).forEach(key => {
    if (INTERNAL_KEYS.includes(key) || key.startsWith("_")) return;
    
    // Skip if it was mapped to a standard field above
    const isStandard = [
      "name", "caller", "caller name", "lead name", "lead", "name of caller",
      "phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number",
      "email", "mail", "e-mail", "email id", "emailaddress",
      "city", "location", "khoji city", "place", "city name",
      "country", "nation", "tags", "tag", "status", "remark", "callbackdate", "sub program"
    ].includes(key.toLowerCase());
    
    if (!isStandard) {
      row[key] = log[key];
    }
  });

  if (log.attenderName) {
    row["Attended By"] = log.attenderName;
  }

  let historyStr = "";
  if (log.history && Array.isArray(log.history)) {
    historyStr = log.history.map(h => `[${new Date(h.timestamp).toLocaleDateString("en-IN")}] ${h.attenderName}: ${h.status} - ${h.remark}`).join(" | ");
  }
  row["Call History Timeline"] = historyStr;

  return row;
};

export default function AdminPanel({ onExit, onAttendersChange }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [programs, setPrograms] = useState([]);
  const [attenders, setAttenders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [progs, atts] = await Promise.all([getPrograms(), getAttenders()]);
      setPrograms(progs);
      setAttenders(atts);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load data: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshAll = async () => {
    await loadAll();
    if (onAttendersChange) onAttendersChange();
  };

  return (
    <div className="flex h-screen bg-[#F0F2F5] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-2xl flex items-center justify-center">
              <Settings size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-sm leading-none">Admin Panel</p>
              <p className="text-slate-500 text-[10px] font-medium mt-0.5">TGF Call Center</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {TAB_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${activeTab === item.id
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
            >
              {item.icon}
              {item.label}
              {activeTab === item.id && <ChevronRight size={14} className="ml-auto" />}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button onClick={onExit} className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-white hover:bg-slate-800 rounded-2xl text-sm font-medium transition">
            <ArrowLeft size={18} /> Back to Home
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader size={32} className="text-indigo-500 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === "dashboard" && <DashboardTab programs={programs} attenders={attenders} />}
            {activeTab === "monthly" && <MonthlyReportTab programs={programs} attenders={attenders} />}
            {activeTab === "programs" && <ProgramsTab programs={programs} attenders={attenders} onRefresh={refreshAll} />}
            {activeTab === "import" && <ImportContacts programs={programs} onImportComplete={refreshAll} />}
            {activeTab === "attenders" && <AttendersTab attenders={attenders} programs={programs} onRefresh={refreshAll} />}
            {activeTab === "abhivyakti" && <AbhivyaktiTab programs={programs} />}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────
function DashboardTab({ programs, attenders }) {
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
    // Find first and last active hour to trim empty edges
    // A1 fix: findIndex returns -1 when nothing found; don't coerce with || 0
    const startIndex = map.findIndex(m => m.calls > 0);
    // Browser-compatible replacement for findLastIndex (ES2023)
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
            <option value="">-- Select Program --</option>
            <option value="ALL">🌟 ALL PROGRAMS (Master)</option>
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
          <div className="text-center"><BarChart3 size={40} className="mx-auto mb-3 opacity-30" /><p>Select a program to view analytics</p></div>
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
                // Extract all history entries from all logs, flatten, sort by timestamp desc
                const allActivity = [];
                filteredLogs.forEach(log => {
                  const logName = Object.keys(log).find(k => k.toLowerCase().includes("name") || k.toLowerCase().includes("lead"));
                  const contactName = logName ? log[logName] : "Unknown";
                  // From history array
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
                  // Also show lastCalledAt if available but no history
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

// ─── Programs Tab ─────────────────────────────
// Standard mapping targets for the field mapping modal
const STANDARD_TARGETS = ["Name", "Phone", "Email", "City", "Country", "Tags", "Source", "Called For", "Custom", "Ignore"];

function getDefaultExcelMapping(colName) {
  const c = colName.trim().toLowerCase();
  if (["name", "caller", "caller name", "lead name", "lead", "name of caller", "first name", "last name", "contact name"].includes(c)) return "Name";
  if (["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number", "cont no"].includes(c)) return "Phone";
  if (["email", "mail", "e-mail", "email id", "emailaddress"].includes(c)) return "Email";
  if (["city", "location", "khoji city", "place", "city name"].includes(c)) return "City";
  if (["country", "nation"].includes(c)) return "Country";
  if (["tags", "tag"].includes(c)) return "Tags";
  if (["source", "sourse", "origin"].includes(c)) return "Source";
  if (["called for", "called_for", "calledfor"].includes(c)) return "Called For";
  if (["sub program", "subprogram", "sheet"].includes(c)) return "Ignore";
  // Long survey questions → auto-ignore
  if (colName.length > 40 || colName.includes("?") || colName.toLowerCase().includes("how ") || colName.toLowerCase().includes("enter ") || colName.toLowerCase().includes("please ")) return "Ignore";
  return "Custom";
}

function ProgramsTab({ programs, attenders, onRefresh }) {
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(null);
  const [stats, setStats] = useState({});
  const [expandedProgram, setExpandedProgram] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  // Field mapping state (shared for new-upload and remap-existing flows)
  const [mappingStep, setMappingStep] = useState(false);
  const [remapProgram, setRemapProgram] = useState(null); // set when remapping existing program
  const [columnMappings, setColumnMappings] = useState({});
  const [skipEmptySettings, setSkipEmptySettings] = useState({});
  const [excelColumns, setExcelColumns] = useState([]);
  const [excelSampleRows, setExcelSampleRows] = useState({});
  const [isRemapping, setIsRemapping] = useState(false);

  useEffect(() => {
    // P1 fix: use Promise.all instead of forEach(async) to handle errors and avoid fire-and-forget
    Promise.all(programs.map(p => getProgramContactStats(p.id).then(s => ({ id: p.id, s }))))
      .then(results => {
        const next = {};
        results.forEach(({ id, s }) => { next[id] = s; });
        setStats(prev => ({ ...prev, ...next }));
      })
      .catch(err => console.error("Failed to load program stats:", err));
  }, [programs]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      await createProgram(newName.trim());
      setNewName("");
      toast.success("Program created!");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to create program: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete program "${name}"?\n\n⚠️ Already-assigned contacts will become orphaned. Consider reassigning them first.`)) return;
    // A3 fix: wrap in try/catch so errors are shown instead of silently dropped
    try {
      await deleteProgram(id);
      toast.success("Program deleted.");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete program: " + err.message);
    }
  };

  const handleFileUpload = async (e, program) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary", cellDates: true });
        setPendingUpload({
          program,
          wb,
          sheetNames: wb.SheetNames,
          selectedSheets: [wb.SheetNames[0]]
        });
      } catch (err) {
        toast.error("Failed to parse Excel file.");
      }
      e.target.value = null;
    };
    reader.readAsBinaryString(file);
  };

  // Called after sheet selection is confirmed — scans columns and opens mapping modal
  const handleOpenMappingStep = () => {
    if (!pendingUpload || pendingUpload.selectedSheets.length === 0) return;
    const { wb, selectedSheets } = pendingUpload;

    // Collect all unique column names + sample values across selected sheets
    const colSet = new Set();
    const samples = {};
    selectedSheets.forEach(sheetName => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: false, defval: "" });
      rows.slice(0, 10).forEach(row => {
        Object.entries(row).forEach(([col, val]) => {
          if (col === "Sub Program") return;
          colSet.add(col);
          if (!samples[col]) samples[col] = [];
          const strVal = String(val || "").trim();
          if (strVal && samples[col].length < 3 && !samples[col].includes(strVal)) {
            samples[col].push(strVal);
          }
        });
      });
    });

    const cols = Array.from(colSet);
    const initMappings = {};
    const initSkipEmpty = {};
    cols.forEach(col => {
      initMappings[col] = getDefaultExcelMapping(col);
      initSkipEmpty[col] = true; // skip empty by default
    });

    setExcelColumns(cols);
    setExcelSampleRows(samples);
    setColumnMappings(initMappings);
    setSkipEmptySettings(initSkipEmpty);
    setMappingStep(true);
  };

  // Open mapping dialog for an ALREADY-IMPORTED program
  const handleOpenRemapDialog = async (program) => {
    const toastId = toast.loading(`Loading contacts from "${program.name}"...`);
    try {
      const contacts = await getProgramChunkContacts(program.id);
      if (!contacts.length) { toast.error("No contacts found in this program.", { id: toastId }); return; }

      const SKIP_KEYS = ["_contactRefId", "_mappedFields", "normalizedPhone", "GHL_ID"];
      const colSet = new Set();
      const samples = {};

      contacts.slice(0, 50).forEach(contact => {
        Object.entries(contact).forEach(([col, val]) => {
          if (SKIP_KEYS.includes(col) || col.startsWith("_")) return;
          colSet.add(col);
          if (!samples[col]) samples[col] = [];
          const strVal = String(val || "").trim();
          if (strVal && samples[col].length < 3 && !samples[col].includes(strVal)) {
            samples[col].push(strVal);
          }
        });
      });

      const cols = Array.from(colSet);
      const initMappings = {};
      const initSkipEmpty = {};
      cols.forEach(col => {
        initMappings[col] = getDefaultExcelMapping(col);
        initSkipEmpty[col] = true;
      });

      toast.dismiss(toastId);
      setRemapProgram(program);
      setExcelColumns(cols);
      setExcelSampleRows(samples);
      setColumnMappings(initMappings);
      setSkipEmptySettings(initSkipEmpty);
      setMappingStep(true);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load contacts: " + err.message, { id: toastId });
    }
  };

  // Apply remapping to existing program data
  const handleConfirmRemap = async () => {
    if (!remapProgram) return;
    setIsRemapping(true);
    setMappingStep(false);
    try {
      const count = await remapProgramContacts(remapProgram.id, columnMappings, skipEmptySettings);
      toast.success(`Remapped ${count} contacts in "${remapProgram.name}"!`);
    } catch (err) {
      console.error(err);
      toast.error("Remap failed: " + err.message);
    } finally {
      setIsRemapping(false);
      setRemapProgram(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingUpload) return;
    setIsUploading(pendingUpload.program.id);
    const { program, wb, selectedSheets } = pendingUpload;
    setMappingStep(false);
    setPendingUpload(null);

    try {
      const mappedFieldsList = [];
      Object.entries(columnMappings).forEach(([col, target]) => {
        if (col === "Sub Program" || target === "Ignore") return;
        mappedFieldsList.push(target === "Custom" ? col : target);
      });
      const uniqueMappedFields = Array.from(new Set(mappedFieldsList));

      let combinedJson = [];
      selectedSheets.forEach(sheetName => {
        const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: false, defval: "" });
        const mappedRows = rawRows.map(row => {
          const newRow = {};

          uniqueMappedFields.forEach(f => {
            newRow[f] = "";
          });

          // Always carry sub-program (sheet name)
          newRow["Sub Program"] = sheetName;

          Object.entries(row).forEach(([col, val]) => {
            if (col === "Sub Program") return;
            const target = columnMappings[col] ?? "Custom";
            const skipEmpty = !!skipEmptySettings[col];
            const strVal = String(val ?? "").trim();
            if (skipEmpty && !strVal) return;
            if (target === "Ignore") return;

            if (target === "Custom") {
              newRow[col] = strVal;
            } else {
              // Standard target (Name, Phone, Email, etc.)
              if (newRow[target]) {
                // Concatenate if already set (e.g. first+last name)
                newRow[target] = `${newRow[target]} ${strVal}`.trim();
              } else {
                newRow[target] = strVal;
              }
            }
          });

          newRow._mappedFields = uniqueMappedFields;
          return newRow;
        });
        combinedJson = combinedJson.concat(mappedRows);
      });

      if (combinedJson.length === 0) { toast.error("Empty sheets selected!"); setIsUploading(null); return; }

      const imported = await importContacts(program.id, program.name, combinedJson, selectedSheets);
      toast.success(`Imported ${imported} contacts into "${program.name}"!`);
      const s = await getProgramContactStats(program.id);
      setStats(prev => ({ ...prev, [program.id]: s }));
    } catch (err) {
      console.error(err);
      toast.error("Import failed: " + err.message);
    } finally {
      setIsUploading(null);
    }
  };

  const handleExportExcel = async (program) => {
    try {
      toast.loading(`Downloading ${program.name}...`, { id: "export" });
      const logs = await getProgramCallLogs(program.id);

      if (!logs || logs.length === 0) {
        toast.dismiss("export");
        toast.error("No entries to export.");
        return;
      }

      const INTERNAL_KEYS = ["id", "programId", "programName", "contactId", "attenderId", "createdAt", "updatedAt", "history", "_callbackDue", "_deleted", "isCallbackDue", "isHotLead", "callCount"];

      const exportData = logs.map(log => {
        const cleanRow = {};
        Object.keys(log).forEach(key => {
          if (!INTERNAL_KEYS.includes(key) && !key.startsWith("_")) {
            cleanRow[key] = log[key];
          }
        });

        // Format dates correctly from Firebase Timestamp to String
        if (cleanRow.callbackDate && cleanRow.callbackDate.toDate) {
          cleanRow.callbackDate = cleanRow.callbackDate.toDate().toLocaleString("en-IN");
        }

        let historyStr = "";
        if (log.history && Array.isArray(log.history)) {
          historyStr = log.history.map(h => `[${new Date(h.timestamp).toLocaleDateString("en-IN")}] ${h.attenderName}: ${h.status} - ${h.remark}`).join(" | ");
        }

        const nameKey = Object.keys(cleanRow).find(k => k.toLowerCase() === "name" || k.toLowerCase().includes("caller") || k.toLowerCase().includes("khoji")) || "Name";
        const nameVal = cleanRow[nameKey] || "";
        delete cleanRow[nameKey];

        return {
          [nameKey]: nameVal,
          ...cleanRow,
          "History Timeline": historyStr
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Call_Logs");
      XLSX.writeFile(wb, `${program.name.replace(/[^a-zA-Z0-9]/g, '_')}_Master.xlsx`);

      toast.dismiss("export");
      toast.success("Download complete!");
    } catch (err) {
      console.error(err);
      toast.dismiss("export");
      toast.error("Export failed!");
    }
  };

  return (
    <div className="relative">
      {/* Step 1 — Sheet selector */}
      {pendingUpload && !mappingStep && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)' }}>
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', width: '420px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h3 className="text-xl font-black text-slate-800 mb-2">Select Sheets to Import</h3>
            <p className="text-sm text-slate-500 mb-4">File contains {pendingUpload.sheetNames.length} sheet(s). Select the ones to add to <strong>{pendingUpload.program.name}</strong>.</p>

            <div className="overflow-y-auto space-y-2 mb-6 pr-2 flex-1">
              {pendingUpload.sheetNames.map(sheet => (
                <label key={sheet} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={pendingUpload.selectedSheets.includes(sheet)}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setPendingUpload(prev => ({
                        ...prev,
                        selectedSheets: isChecked
                          ? [...prev.selectedSheets, sheet]
                          : prev.selectedSheets.filter(s => s !== sheet)
                      }));
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-sm text-slate-700">{sheet}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3 mt-auto shrink-0">
              <button onClick={() => setPendingUpload(null)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition">Cancel</button>
              <button
                onClick={handleOpenMappingStep}
                disabled={pendingUpload.selectedSheets.length === 0}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                Next: Map Fields <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — Field mapping modal (same design as Lead Management tab) */}
      {mappingStep && (pendingUpload || remapProgram) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-150 animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Map Excel Columns</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Choose how Excel columns align with Dialer contact fields. Ignored columns will be skipped during import.
                </p>
              </div>
              <button
                onClick={() => setMappingStep(false)}
                className="text-slate-400 hover:text-slate-700 p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 pb-3">
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/4">Column in file</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/4">Sample values</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/8">Status</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/8">Object</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/4">Field</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/6 text-center">Update empty values</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {excelColumns.map(col => {
                    const samples = excelSampleRows[col] || [];
                    const target = columnMappings[col];
                    const isMapped = target && target !== "Ignore";
                    const skipEmpty = !!skipEmptySettings[col];
                    return (
                      <tr key={col} className="hover:bg-slate-50/50 transition-colors">
                        {/* Column name */}
                        <td className="py-4 pr-4 font-extrabold text-slate-700 text-sm align-top">{col}</td>

                        {/* Sample values */}
                        <td className="py-4 pr-4 text-xs text-slate-500 leading-relaxed align-top whitespace-pre-line font-medium">
                          {samples.length > 0 ? (
                            samples.map((s, idx) => (
                              <div key={idx} className="truncate max-w-xs">{s}</div>
                            ))
                          ) : (
                            <span className="text-gray-300 italic">No values</span>
                          )}
                        </td>

                        {/* Status badge */}
                        <td className="py-4 pr-4 align-top pt-5">
                          {isMapped ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase">
                              <Check size={10} className="stroke-[3px]" /> Mapped
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-500 border border-gray-200 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase">
                              <X size={10} className="stroke-[3px]" /> Ignored
                            </span>
                          )}
                        </td>

                        {/* Object */}
                        <td className="py-4 pr-4 text-xs text-slate-500 font-bold align-top pt-5">Contact</td>

                        {/* Field dropdown */}
                        <td className="py-4 pr-4 align-top">
                          <select
                            value={target}
                            onChange={e => setColumnMappings(prev => ({ ...prev, [col]: e.target.value }))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-sm"
                          >
                            <optgroup label="Standard Fields">
                              <option value="Name">Name (Caller Name)</option>
                              <option value="Phone">Phone</option>
                              <option value="Email">Email</option>
                              <option value="City">City</option>
                              <option value="Country">Country</option>
                              <option value="Tags">Tags</option>
                              <option value="Source">Source</option>
                              <option value="Called For">Called For</option>
                              <option value="Date Added">Date Added</option>
                            </optgroup>
                            <optgroup label="Options">
                              <option value="Custom">Keep as Custom Field</option>
                              <option value="Ignore">Don't Import (Ignore)</option>
                            </optgroup>
                          </select>
                        </td>

                        {/* Skip empty checkbox */}
                        <td className="py-4 text-center align-top pt-5">
                          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={skipEmpty}
                              onChange={e => setSkipEmptySettings(prev => ({ ...prev, [col]: e.target.checked }))}
                              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition cursor-pointer"
                            />
                            <span className="text-[11px] font-semibold text-slate-600">Skip empty values</span>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-gray-100 flex justify-between bg-slate-50 shrink-0">
              <button
                onClick={() => { setMappingStep(false); if (remapProgram) setRemapProgram(null); }}
                className="px-5 py-2.5 bg-gray-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-gray-200 transition"
              >
                Back
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => { setMappingStep(false); setPendingUpload(null); setRemapProgram(null); }}
                  className="px-5 py-2.5 text-slate-500 hover:text-slate-700 font-bold text-xs transition"
                >
                  Cancel
                </button>
                {remapProgram ? (
                  <button
                    onClick={handleConfirmRemap}
                    className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-xs transition shadow-md shadow-violet-200 flex items-center gap-2"
                  >
                    <RefreshCw size={12} /> Apply Remapping
                  </button>
                ) : (
                  <button
                    onClick={handleConfirmImport}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs transition shadow-md shadow-blue-200 flex items-center gap-2"
                  >
                    <span>Import Now</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}


      {(isUploading || isRemapping) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)' }}>
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '350px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '1rem', backgroundColor: isRemapping ? '#f5f3ff' : '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
              {isRemapping ? <RefreshCw size={30} className="text-violet-600 animate-spin" /> : <Upload size={30} className="text-indigo-600 animate-bounce" />}
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{isRemapping ? "Applying Field Mapping" : "Uploading to Cloud"}</h3>
            <p className="text-sm text-slate-500 text-center flex flex-col items-center gap-2">
              <span>{isRemapping ? "Rewriting field mapping across all contacts in Firestore..." : "Securely processing Excel data and writing chunks to Firebase..."}</span>
              <span className="text-indigo-500 font-bold flex items-center gap-2 mt-2">
                <Loader size={12} className="animate-spin" /> Please don't close this tab
              </span>
            </p>
          </div>
        </div>
      )}

      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-800">Programs / Folders</h2>
            <p className="text-slate-500 mt-1">Organize contacts by source or campaign.</p>
          </div>
        </div>

        {/* Create new */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex gap-4">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="New program name (e.g. Facebook Ads March, Shivir April)"
            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button onClick={handleCreate} disabled={isCreating || !newName.trim()}
            className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-60 transition flex items-center gap-2">
            <Plus size={16} /> Create Program
          </button>
        </div>

        {/* Programs List */}
        <div className="space-y-4">
          {programs.map(p => {
            const s = stats[p.id] || {};
            return (
              <div key={p.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                      <FolderOpen size={22} className="text-indigo-500" />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-800 text-lg">{p.name}</h3>
                      <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                        <span>{s.total || 0} total</span>
                        <span className="text-green-600 font-semibold">{s.available || 0} available</span>
                        <span className="text-blue-600 font-semibold">{s.assigned || 0} assigned</span>
                        <span className="text-gray-500">{s.done || 0} done</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Remap Fields button (for existing programs) */}
                    <button
                      onClick={() => handleOpenRemapDialog(p)}
                      className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold cursor-pointer transition bg-violet-50 text-violet-600 hover:bg-violet-100"
                      title="Remap the field columns for all existing contacts in this program"
                    >
                      <Columns size={15} /> Remap Fields
                    </button>

                    {/* Download Master Excel button */}
                    <button
                      onClick={() => handleExportExcel(p)}
                      className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold cursor-pointer transition bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                    >
                      <Download size={15} /> Download
                    </button>

                    {/* Upload button */}
                    <label className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold cursor-pointer transition ${isUploading === p.id ? "bg-gray-100 text-gray-400" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>
                      {isUploading === p.id ? <Loader size={15} className="animate-spin" /> : <Upload size={15} />}
                      {isUploading === p.id ? "Uploading..." : "Upload Excel"}
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFileUpload(e, p)} disabled={!!isUploading} />
                    </label>
                    <button onClick={() => handleDelete(p.id, p.name)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {s.total > 0 && (
                  <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round(((s.assigned || 0) + (s.done || 0)) / s.total * 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {programs.length === 0 && (
            <div className="h-40 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl text-gray-400">
              No programs yet. Create one above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Attenders Tab ────────────────────────────
function AttendersTab({ attenders, programs, onRefresh }) {
  const [newName, setNewName] = useState("");
  const [viewingAttender, setViewingAttender] = useState(null);
  const [viewProgramId, setViewProgramId] = useState(""); // Only used for reassign operations
  const [viewLogs, setViewLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [viewMonth, setViewMonth] = useState(""); // Admin month filter in sheet viewer
  const [viewSearchQuery, setViewSearchQuery] = useState("");
  const [viewSortBy, setViewSortBy] = useState("activityDesc");
  const [viewFilterStatus, setViewFilterStatus] = useState("All");

  // Compute available months from viewLogs for the month picker
  const viewAvailableMonths = React.useMemo(() => {
    const months = new Set();
    viewLogs.forEach(l => {
      const d = l.updatedAt?.toDate ? l.updatedAt.toDate() : l.createdAt?.toDate ? l.createdAt.toDate() : null;
      if (d) months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(months).sort().reverse();
  }, [viewLogs]);

  // Compute duplicate phone map inside the selected program/attender queues to show "Same Person" tag
  const adminDuplicatePhoneMap = React.useMemo(() => {
    const map = {}; // programId -> { phone -> count }
    viewLogs.forEach(l => {
      const progId = l.programId || "incoming";
      const keys = Object.keys(l);
      const phoneKey = keys.find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
        || keys.find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
      const phone = phoneKey ? String(l[phoneKey] || "").replace(/[\s\-\.\(\)\+]/g, "").trim() : "";
      if (phone) {
        if (!map[progId]) map[progId] = {};
        map[progId][phone] = (map[progId][phone] || 0) + 1;
      }
    });
    return map;
  }, [viewLogs]);

  // Apply month and program filters
  const filteredViewLogs = React.useMemo(() => {
    let logs = viewLogs;
    if (viewMonth) {
      const [y, mo] = viewMonth.split('-').map(Number);
      logs = logs.filter(l => {
        const d = l.updatedAt?.toDate ? l.updatedAt.toDate() : l.createdAt?.toDate ? l.createdAt.toDate() : null;
        if (!d) return true;
        return d.getFullYear() === y && d.getMonth() + 1 === mo;
      });
    }
    if (viewProgramId) {
      logs = logs.filter(l => l.programId === viewProgramId);
    }
    if (viewSearchQuery) {
      const q = viewSearchQuery.toLowerCase();
      logs = logs.filter(log => Object.values(log).join(" ").toLowerCase().includes(q));
    }
    if (viewFilterStatus !== "All") {
      if (viewFilterStatus === "Hot Leads") {
        logs = logs.filter(log => log.isHotLead);
      } else if (viewFilterStatus === "Callback") {
        logs = logs.filter(log => log.callbackDate);
      } else if (viewFilterStatus === "Follow up") {
        logs = logs.filter(log => log.callbackDate || log.status === "reminder" || log.status === "Next time");
      } else if (viewFilterStatus === "Pending") {
        // U4 fix: Pending = no status set at all
        logs = logs.filter(log => !log.status);
      } else if (viewFilterStatus === "Called") {
        // U4 fix: Called = has any status (was actually called)
        logs = logs.filter(log => !!log.status);
      } else if (viewFilterStatus === "Callbacks Due") {
        // U5 fix: Callbacks Due = has a callbackDate that is today or past
        logs = logs.filter(log => log._callbackDue);
      } else {
        logs = logs.filter(log => log.status === viewFilterStatus);
      }
    }
    return logs;
  }, [viewLogs, viewMonth, viewProgramId, viewSearchQuery, viewFilterStatus]);

  const sortedViewLogs = React.useMemo(() => {
    const list = [...filteredViewLogs];
    list.sort((a, b) => {
      // Keep overdue callbacks at the top
      const aDue = a._callbackDue ? 1 : 0;
      const bDue = b._callbackDue ? 1 : 0;
      if (aDue !== bDue) return bDue - aDue;

      if (viewSortBy === "nameAsc") {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        const aNameKey = aKeys.find(k => k.toLowerCase() === "name" || k.toLowerCase().includes("caller") || k.toLowerCase().includes("khoji")) || "Name";
        const bNameKey = bKeys.find(k => k.toLowerCase() === "name" || k.toLowerCase().includes("caller") || k.toLowerCase().includes("khoji")) || "Name";
        const aName = String(a[aNameKey] || "").toLowerCase();
        const bName = String(b[bNameKey] || "").toLowerCase();
        return aName.localeCompare(bName);
      } else if (viewSortBy === "createdDesc") {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt ? new Date(a.createdAt) : new Date(0);
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt) : new Date(0);
        return bDate - aDate;
      } else {
        // Default: activityDesc
        const aDate = a.lastCalledAt ? new Date(a.lastCalledAt) : a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt ? new Date(a.createdAt) : new Date(0);
        const bDate = b.lastCalledAt ? new Date(b.lastCalledAt) : b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt) : new Date(0);
        return bDate - aDate;
      }
    });
    return list;
  }, [filteredViewLogs, viewSortBy]);

  const viewLogCols = React.useMemo(() => {
    if (sortedViewLogs.length === 0) return [];
    const internal = [
      "id", "contactId", "attenderId", "attenderName", "programId", "programName",
      "status", "remark", "callbackDate", "callType", "createdAt", "updatedAt",
      "_callbackDue", "_deleted", "isCallbackDue", "history", "isHotLead",
      "sub program", "subprogram", "ghl_id", "_contactrefid", "objectionreason"
    ];
    const order = ["name", "phone", "email", "city", "profession", "country", "tags", "khoji"];
    return Array.from(new Set(sortedViewLogs.flatMap(l => Object.keys(l)).filter(k => !internal.includes(k.toLowerCase()) && !k.startsWith("_")))).sort((a, b) => {
      const idxA = order.findIndex(o => a.toLowerCase().includes(o));
      const idxB = order.findIndex(o => b.toLowerCase().includes(o));
      const weightA = idxA !== -1 ? idxA : 100;
      const weightB = idxB !== -1 ? idxB : 100;
      if (weightA !== weightB) return weightA - weightB;
      return a.localeCompare(b);
    });
  }, [sortedViewLogs]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    // A3 fix: try/catch so errors surface instead of silently failing
    try {
      await createAttender(newName.trim());
      setNewName("");
      toast.success("Attender added!");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add attender: " + err.message);
    }
  };

  const handleToggleActive = async (attender) => {
    await updateAttender(attender.id, { isActive: !attender.isActive });
    toast.success(`${attender.name} ${attender.isActive ? "deactivated" : "activated"}`);
    onRefresh();
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete attender "${name}"?\n\n⚠️ WARNING: All call logs assigned to this attender will remain in the system but become orphaned. Consider reassigning their contacts to pool or another attender first.`)) return;
    // A3 fix: try/catch so errors surface
    try {
      await deleteAttender(id);
      toast.success("Attender removed.");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete attender: " + err.message);
    }
  };

  const handleReassign = async (attender) => {
    if (!viewProgramId) { toast.error("Select a program first."); return; }
    if (!window.confirm(`Move all unworked calls from ${attender.name} back to pool?`)) return;
    const count = await reassignContactsToPool(attender.id, viewProgramId);
    toast.success(`${count} contacts returned to pool.`);
  };

  const handleReassignToAttender = async (fromAttender, toAttenderId) => {
    if (!viewProgramId) { toast.error("Select a program first."); return; }
    const toAttender = attenders.find(a => a.id === toAttenderId);
    if (!toAttender) return;
    if (!window.confirm(`Move unworked contacts from ${fromAttender.name} → ${toAttender.name}?`)) return;
    const count = await reassignContactsBetweenAttenders(fromAttender.id, toAttenderId, toAttender.name, viewProgramId);
    toast.success(`${count} contacts moved to ${toAttender.name}.`);
  };

  const viewUnsubRef = React.useRef(null);

  const handleViewSheet = (attender) => {
    setViewingAttender(attender);
    setIsLoadingLogs(true);
    setViewMonth(""); // Reset month filter on open
    // Clean up any previous subscription
    if (viewUnsubRef.current) viewUnsubRef.current();
    // Real-time subscription by attenderId — month/program filtering done client-side
    viewUnsubRef.current = subscribeToCallLogs(attender.id, (logs) => {
      setViewLogs(logs.filter(l => !l._deleted));
      setIsLoadingLogs(false);
    });
  };

  const handleCloseViewSheet = () => {
    setViewingAttender(null);
    setViewLogs([]);
    setViewMonth("");
    if (viewUnsubRef.current) { viewUnsubRef.current(); viewUnsubRef.current = null; }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => { if (viewUnsubRef.current) viewUnsubRef.current(); };
  }, []);



  const handleExportSheet = () => {
    if (!sortedViewLogs.length) return;
    const rows = sortedViewLogs.map(cleanExportRow);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet");
    XLSX.writeFile(wb, `${viewingAttender.name}_sheet_${new Date().toLocaleDateString("en-CA")}.xlsx`);
    toast.success("Exported!");
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-black text-slate-800">Attenders</h2>
        <p className="text-slate-500 mt-1">Manage who has access to the call center.</p>
      </div>

      {/* Add attender */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex gap-4">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          placeholder="Attender name (e.g. Priya, Rahul)"
          className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button onClick={handleCreate} disabled={!newName.trim()}
          className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-60 transition flex items-center gap-2">
          <Plus size={16} /> Add Attender
        </button>
      </div>

      {/* Program selector — used for reassign only, plus sheet filter */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
        <span className="text-sm font-bold text-gray-500 whitespace-nowrap">Reassign for program:</span>
        <select value={viewProgramId} onChange={e => setViewProgramId(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none">
          <option value="">-- All Programs --</option>
          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-xs text-gray-400 font-medium">Select a program before using 'To Pool' or 'Move to'</span>
      </div>

      {/* Attenders list */}
      <div className="space-y-3">
        {attenders.map(a => (
          <div key={a.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center font-black text-indigo-600 shrink-0">
              {a.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-800">{a.name}</p>
              <p className={`text-xs font-semibold ${a.isActive ? "text-green-500" : "text-red-400"}`}>
                {a.isActive ? "● Active" : "○ Deactivated"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleViewSheet(a)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition">
                <Eye size={13} /> View Sheet
              </button>
              <button onClick={() => handleReassign(a)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition">
                <RefreshCw size={13} /> To Pool
              </button>
              <select
                defaultValue=""
                onChange={e => { if (e.target.value) { handleReassignToAttender(a, e.target.value); e.target.value = ""; } }}
                className="px-2 py-2 text-xs font-bold bg-blue-50 text-blue-600 rounded-xl border-0 cursor-pointer focus:outline-none hover:bg-blue-100 transition"
              >
                <option value="">Move to...</option>
                {attenders.filter(at => at.id !== a.id && at.isActive).map(at => (
                  <option key={at.id} value={at.id}>{at.name}</option>
                ))}
              </select>
              <button onClick={() => handleToggleActive(a)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition ${a.isActive ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                {a.isActive ? <><X size={13} /> Deactivate</> : <><Check size={13} /> Activate</>}
              </button>
              <button onClick={() => handleDelete(a.id, a.name)}
                className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
        {attenders.length === 0 && (
          <div className="h-32 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl text-gray-400">
            No attenders yet.
          </div>
        )}
      </div>

      {/* Sheet Viewer Modal */}
      {viewingAttender && (
        // L2 fix: backdrop click uses handleCloseViewSheet (not setViewingAttender(null)) to properly cancel the Firestore listener
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={handleCloseViewSheet}>
          <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
              <div>
                <h3 className="font-black text-xl">{viewingAttender.name}'s Sheet</h3>
                <p className="text-white/70 text-sm font-medium">
                  {sortedViewLogs.length} entries
                  {viewMonth && ` · ${new Date(viewMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`}
                  {viewProgramId && ` · ${programs.find(p => p.id === viewProgramId)?.name}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Month picker */}
                <select
                  value={viewMonth}
                  onChange={e => setViewMonth(e.target.value)}
                  className="px-3 py-2 bg-white/20 text-white rounded-xl text-sm font-bold focus:outline-none cursor-pointer"
                >
                  <option value="">All Months</option>
                  {viewAvailableMonths.map(m => {
                    const [y, mo] = m.split('-').map(Number);
                    const label = new Date(y, mo - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
                    return <option key={m} value={m}>{label}</option>;
                  })}
                </select>
                {/* Program filter */}
                <select
                  value={viewProgramId}
                  onChange={e => setViewProgramId(e.target.value)}
                  className="px-3 py-2 bg-white/20 text-white rounded-xl text-sm font-bold focus:outline-none cursor-pointer"
                >
                  <option value="">All Programs</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={handleExportSheet} className="flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-black transition">
                  <Download size={15} /> Export Excel
                </button>
                <button onClick={handleCloseViewSheet} className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Toolbar row */}
            <div className="bg-gray-50 border-b border-gray-100 px-6 py-3 flex flex-wrap items-center gap-3">
              {/* Search input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search name, phone, city..."
                  value={viewSearchQuery}
                  onChange={e => setViewSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Status Filter */}
              <select
                value={viewFilterStatus}
                onChange={e => setViewFilterStatus(e.target.value)}
                className="px-3.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending (Never Called)</option>
                <option value="Called">Called (Has Any Status)</option>
                <option value="Interested">Interested</option>
                <option value="Reg.Done">Reg.Done</option>
                <option value="Callbacks Due">Callbacks Due</option>
                <option value="Callback">Callback Set</option>
                <option value="Follow up">Follow Up</option>
                <option value="Hot Leads">Hot Leads</option>
              </select>

              {/* Sort By */}
              <select
                value={viewSortBy}
                onChange={e => setViewSortBy(e.target.value)}
                className="px-3.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="activityDesc">Sort by Last Call Date</option>
                <option value="createdDesc">Sort by Date Imported</option>
                <option value="nameAsc">Sort Alphabetically (Name)</option>
              </select>
            </div>

            <div className="flex-1 overflow-auto">
              {isLoadingLogs ? (
                <div className="py-20 flex items-center justify-center"><Loader size={24} className="animate-spin text-indigo-500" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">#</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Call Type</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Program</th>
                      {viewLogCols.map(col => (
                        <th key={col} className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">{col}</th>
                      ))}
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Remark</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">Callback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedViewLogs.map((log, i) => {
                      return (
                        <tr key={log.id} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="px-4 py-3 text-gray-400 text-xs font-bold">{i + 1}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${log.isHotLead ? "bg-orange-100 text-orange-700" :
                              log.status === "Reg.Done" ? "bg-emerald-100 text-emerald-700" :
                                log.status === "Interested" ? "bg-blue-100 text-blue-700" :
                                  log.status ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-400"
                              }`}>
                              {log.isHotLead && <Flame size={10} className="inline mr-1" fill="currentColor" />}
                              {log.status || "Pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3"><span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${log.callType === "incoming" ? "bg-green-50 text-green-600" : "bg-slate-50 text-slate-500"}`}>{log.callType || "outgoing"}</span></td>
                          <td className="px-4 py-3 text-xs font-bold text-indigo-600 whitespace-nowrap">{log.programName || <span className="text-gray-300">—</span>}</td>
                          {viewLogCols.map(c => {
                            const v = log[c];
                            const display = (v && typeof v === "object") ? JSON.stringify(v) : (v || "\u2014");
                            const isName = c.toLowerCase().includes("name") || c.toLowerCase().includes("lead");
                            
                            const keys = Object.keys(log);
                            const phoneKey = keys.find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
                              || keys.find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
                            const phone = phoneKey ? String(log[phoneKey] || "").replace(/[\s\-\.\(\)\+]/g, "").trim() : "";
                            const isDupInProg = isName && phone && adminDuplicatePhoneMap[log.programId || "incoming"]?.[phone] > 1;

                            return (
                              <td key={c} className="px-4 py-3 text-xs font-bold text-slate-700 whitespace-nowrap align-middle">
                                {display}
                                {isDupInProg && (
                                  <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                                    Same Person
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{log.remark || "—"}</td>
                          <td className="px-4 py-3 text-xs font-bold text-amber-600">
                            {log.callbackDate?.toDate ? log.callbackDate.toDate().toLocaleDateString() : log.callbackDate || "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {sortedViewLogs.length === 0 && <tr><td colSpan={15} className="py-20 text-center text-gray-400 font-bold">No entries found for this filter.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Live View · Changes appear in real-time</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Monthly Report Tab ──────────────────────
// L3 fix: Synced exactly with AttenderView.jsx CONNECTED_STATUSES / NOT_CONNECTED_STATUSES
const CONNECTED_STATUSES = ["Info given", "Interested", "Reg.Done", "reminder", "Query", "Already Reg.d", "Next time", "Shivir done", "Not possible"];
const NOT_CONNECTED_STATUSES = ["NA", "Busy", "Call Cut", "switched off", "Invalid No", "Not interested", "Called by mistake", "no network", "wrong no.", "no answer"];


const MonthlySection = ({ id, label, badge, isOpen, onToggle, children, color = "slate" }) => {
  const themes = {
    slate: { border: "border-l-slate-400", bg: "bg-slate-50 hover:bg-slate-100", text: "text-slate-800", badge: "bg-white text-slate-600 border-slate-200" },
    blue: { border: "border-l-blue-500", bg: "bg-blue-50 hover:bg-blue-100", text: "text-blue-900", badge: "bg-white text-blue-700 border-blue-200" },
    emerald: { border: "border-l-emerald-500", bg: "bg-emerald-50 hover:bg-emerald-100", text: "text-emerald-900", badge: "bg-white text-emerald-700 border-emerald-200" },
    indigo: { border: "border-l-indigo-500", bg: "bg-indigo-50 hover:bg-indigo-100", text: "text-indigo-900", badge: "bg-white text-indigo-700 border-indigo-200" },
    purple: { border: "border-l-purple-500", bg: "bg-purple-50 hover:bg-purple-100", text: "text-purple-900", badge: "bg-white text-purple-700 border-purple-200" },
    orange: { border: "border-l-orange-500", bg: "bg-orange-50 hover:bg-orange-100", text: "text-orange-900", badge: "bg-white text-orange-700 border-orange-200" },
    rose: { border: "border-l-rose-500", bg: "bg-rose-50 hover:bg-rose-100", text: "text-rose-900", badge: "bg-white text-rose-700 border-rose-200" }
  };
  const theme = themes[color] || themes.slate;

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 border-l-4 shadow-sm overflow-hidden ${theme.border}`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300 ${theme.bg}`}
      >
        <div className="flex items-center gap-3">
          <span className={`text-sm font-black ${theme.text}`}>{label}</span>
          {badge !== undefined && (
            <span className={`px-2 py-0.5 border rounded-lg text-xs font-black ${theme.badge}`}>{badge}</span>
          )}
        </div>
        <div className={`flex items-center gap-1.5 opacity-60 text-xs font-bold ${theme.text}`}>
          {isOpen ? 'Hide' : 'Show'}
          <svg className={`w-3 h-3 transform transition-transform duration-300 ease-out ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden bg-white">
          <div className="border-t border-gray-100 overflow-x-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

const MonthlyTable = ({ heads, rows, footer }) => (
  <table className="w-full text-xs min-w-max">
    <thead>
      <tr className="bg-gray-50 border-b border-gray-100">
        {heads.map((h, i) => (
          <th key={i} className={`px-4 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap ${i === 0 ? 'text-left' : 'text-center'}`}>{h}</th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-50">
      {rows.map((row, i) => (
        <tr key={i} className={(i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30') + ' hover:bg-indigo-50/20 transition-colors'}>
          {row.map((cell, j) => (
            <td key={j} className={`px-4 py-2 ${j === 0 ? 'font-black text-slate-700 whitespace-nowrap' : 'text-center font-bold text-slate-600'}`}>{cell ?? '—'}</td>
          ))}
        </tr>
      ))}
      {rows.length === 0 && (
        <tr><td colSpan={heads.length} className="py-10 text-center text-gray-300 font-bold">No data for this period.</td></tr>
      )}
    </tbody>
    {footer && (
      <tfoot>
        <tr className="bg-slate-100 border-t-2 border-slate-200">
          {footer.map((cell, i) => (
            <td key={i} className={`px-4 py-2.5 font-black text-slate-800 ${i === 0 ? 'text-left' : 'text-center'}`}>{cell}</td>
          ))}
        </tr>
      </tfoot>
    )}
  </table>
);

function MonthlyReportTab({ programs, attenders }) {
  const [selectedProgramIds, setSelectedProgramIds] = useState(["ALL"]);

  const toggleProgram = (id) => {
    if (id === "ALL") {
      setSelectedProgramIds(["ALL"]);
      return;
    }
    setSelectedProgramIds(prev => {
      const withoutAll = prev.filter(x => x !== "ALL");
      if (withoutAll.includes(id)) {
        const next = withoutAll.filter(x => x !== id);
        return next.length === 0 ? ["ALL"] : next;
      } else {
        return [...withoutAll, id];
      }
    });
  };
  const [callLogs, setCallLogs] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const unsubRef = React.useRef(null);

  useEffect(() => {
    if (unsubRef.current) unsubRef.current();
    // A5 fix: pass "ALL" sentinel (not null) so subscribeToAllCallLogs fetches across all programs
    unsubRef.current = subscribeToAllCallLogs("ALL", (logs) => {
      setCallLogs(logs.filter(l => !l._deleted));
    });
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, []);

  // FIX #2: Use history entry timestamps for month filtering (not updatedAt which changes on edits)
  const monthLogs = React.useMemo(() => {
    let filtered = callLogs;
    if (!selectedProgramIds.includes("ALL")) {
      filtered = filtered.filter(l => selectedProgramIds.includes(l.programId));
    }

    if (!selectedMonth) return filtered;
    const [year, month] = selectedMonth.split("-").map(Number);
    return filtered.filter(l => {
      if (l.history && l.history.length > 0) {
        return l.history.some(h => {
          if (!h.timestamp) return false;
          const d = new Date(h.timestamp);
          return !isNaN(d) && d.getFullYear() === year && d.getMonth() + 1 === month;
        });
      }
      const d = l.updatedAt?.toDate ? l.updatedAt.toDate() : l.createdAt?.toDate ? l.createdAt.toDate() : null;
      if (!d) return true;
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [callLogs, selectedMonth, selectedProgramIds]);

  // FIX #1 + #8: Extract attempts filtered to the selected month only
  const allAttempts = React.useMemo(() => {
    const [year, month] = selectedMonth ? selectedMonth.split("-").map(Number) : [0, 0];
    const attempts = [];
    monthLogs.forEach(log => {
      const getIso = d => d?.toDate ? d.toDate().toISOString() : d ? new Date(d).toISOString() : null;
      if (log.history && Array.isArray(log.history) && log.history.length > 0) {
        log.history.forEach(h => {
          if (selectedMonth && h.timestamp) {
            const ts = new Date(h.timestamp);
            if (!isNaN(ts) && (ts.getFullYear() !== year || ts.getMonth() + 1 !== month)) return;
          }
          attempts.push({
            status: h.status || log.status,
            attenderName: h.attenderName || log.attenderName || "Unknown",
            callType: log.callType,
            programName: log.programName,
            timestamp: h.timestamp || getIso(log.updatedAt || log.createdAt),
            log,
          });
        });
      } else if (log.status) {
        attempts.push({
          status: log.status,
          attenderName: log.attenderName || "Unknown",
          callType: log.callType,
          programName: log.programName,
          timestamp: getIso(log.updatedAt || log.createdAt),
          log,
        });
      }
    });
    return attempts;
  }, [monthLogs, selectedMonth]);

  const totalAttempts = allAttempts.length;
  const totalContacts = monthLogs.length;

  // FIX #6: useCallback for stable reference — prevents pivot useMemos re-computing every render
  const findFieldKey = React.useCallback((log, aliases) => {
    return Object.keys(log).find(k => aliases.some(a => k.toLowerCase() === a.toLowerCase()))
      || Object.keys(log).find(k => aliases.some(a => k.toLowerCase().includes(a.toLowerCase())))
      || null;
  }, []);

  const section1 = React.useMemo(() => {
    const attConnected = allAttempts.filter(a => CONNECTED_STATUSES.includes(a.status));
    const attNotConnected = allAttempts.filter(a => NOT_CONNECTED_STATUSES.includes(a.status));
    const attConnIncoming = attConnected.filter(a => a.callType === "incoming" || a.callType === "incoming f").length;
    const attConnOutgoing = attConnected.length - attConnIncoming;
    const attNotIncoming = attNotConnected.filter(a => a.callType === "incoming" || a.callType === "incoming f").length;
    const attNotOutgoing = attNotConnected.length - attNotIncoming;
    const ucConnected = monthLogs.filter(l => CONNECTED_STATUSES.includes(l.status));
    const ucNotConnected = monthLogs.filter(l => NOT_CONNECTED_STATUSES.includes(l.status));
    const ucConnIncoming = ucConnected.filter(l => l.callType === "incoming" || l.callType === "incoming f").length;
    const ucConnOutgoing = ucConnected.length - ucConnIncoming;
    const ucNotIncoming = ucNotConnected.filter(l => l.callType === "incoming" || l.callType === "incoming f").length;
    const ucNotOutgoing = ucNotConnected.length - ucNotIncoming;
    return {
      attConnected: attConnected.length, attNotConnected: attNotConnected.length,
      attConnIncoming, attConnOutgoing, attNotIncoming, attNotOutgoing,
      ucConnected: ucConnected.length, ucNotConnected: ucNotConnected.length,
      ucConnIncoming, ucConnOutgoing, ucNotIncoming, ucNotOutgoing
    };
  }, [allAttempts, monthLogs]);

  const connectedBreakdown = React.useMemo(() => {
    const map = {};
    CONNECTED_STATUSES.forEach(s => { map[s] = { att: 0, attIn: 0, attOut: 0, uc: 0, ucIn: 0, ucOut: 0 }; });
    allAttempts.filter(a => CONNECTED_STATUSES.includes(a.status)).forEach(a => {
      if (!map[a.status]) map[a.status] = { att: 0, attIn: 0, attOut: 0, uc: 0, ucIn: 0, ucOut: 0 };
      map[a.status].att++;
      if (a.callType === "incoming" || a.callType === "incoming f") map[a.status].attIn++; else map[a.status].attOut++;
    });
    monthLogs.filter(l => CONNECTED_STATUSES.includes(l.status)).forEach(l => {
      if (!map[l.status]) map[l.status] = { att: 0, attIn: 0, attOut: 0, uc: 0, ucIn: 0, ucOut: 0 };
      map[l.status].uc++;
      if (l.callType === "incoming" || l.callType === "incoming f") map[l.status].ucIn++; else map[l.status].ucOut++;
    });
    return Object.entries(map).filter(([, v]) => v.att > 0 || v.uc > 0).map(([status, v]) => ({ status, ...v }));
  }, [allAttempts, monthLogs]);

  const notConnectedBreakdown = React.useMemo(() => {
    const map = {};
    NOT_CONNECTED_STATUSES.forEach(s => { map[s] = { att: 0, attIn: 0, attOut: 0, uc: 0, ucIn: 0, ucOut: 0 }; });
    allAttempts.filter(a => NOT_CONNECTED_STATUSES.includes(a.status)).forEach(a => {
      if (!map[a.status]) map[a.status] = { att: 0, attIn: 0, attOut: 0, uc: 0, ucIn: 0, ucOut: 0 };
      map[a.status].att++;
      if (a.callType === "incoming" || a.callType === "incoming f") map[a.status].attIn++; else map[a.status].attOut++;
    });
    monthLogs.filter(l => NOT_CONNECTED_STATUSES.includes(l.status)).forEach(l => {
      if (!map[l.status]) map[l.status] = { att: 0, attIn: 0, attOut: 0, uc: 0, ucIn: 0, ucOut: 0 };
      map[l.status].uc++;
      if (l.callType === "incoming" || l.callType === "incoming f") map[l.status].ucIn++; else map[l.status].ucOut++;
    });
    return Object.entries(map).filter(([, v]) => v.att > 0 || v.uc > 0).map(([status, v]) => ({ status, ...v }));
  }, [allAttempts, monthLogs]);

  const connectedContacts = React.useMemo(() => monthLogs.filter(l => CONNECTED_STATUSES.includes(l.status)), [monthLogs]);

  const khojiBreakdown = React.useMemo(() => {
    const map = {};
    connectedContacts.forEach(l => {
      const key = findFieldKey(l, ["khoji/new", "khoji", "new/khoji"]);
      const val = (key ? String(l[key] || "").trim() : "") || "Unknown";
      map[val] = (map[val] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [connectedContacts, findFieldKey]);

  const calledForBreakdown = React.useMemo(() => {
    const map = {};
    connectedContacts.forEach(l => {
      const key = findFieldKey(l, ["called for", "called_for", "calledfor", "call for"]);
      const val = (key ? String(l[key] || "").trim() : "") || "Unknown";
      map[val] = (map[val] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [connectedContacts, findFieldKey]);

  const sourceBreakdown = React.useMemo(() => {
    const map = {};
    connectedContacts.forEach(l => {
      const key = findFieldKey(l, ["source", "sourse"]);
      const val = (key ? String(l[key] || "").trim() : "") || "Unknown";
      map[val] = (map[val] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [connectedContacts, findFieldKey]);

  const infoGivenCount = React.useMemo(() => monthLogs.filter(l => l.status === "Info given").length, [monthLogs]);
  const interestedCount = React.useMemo(() => monthLogs.filter(l => l.status === "Interested").length, [monthLogs]);
  const regDoneCount = React.useMemo(() => monthLogs.filter(l => l.status === "Reg.Done").length, [monthLogs]);
  const infoGivenAttempts = React.useMemo(() => allAttempts.filter(a => a.status === "Info given").length, [allAttempts]);
  const interestedAttempts = React.useMemo(() => allAttempts.filter(a => a.status === "Interested").length, [allAttempts]);
  const regDoneAttempts = React.useMemo(() => allAttempts.filter(a => a.status === "Reg.Done").length, [allAttempts]);

  // FIX #3 + #5 + #7: Attender performance — single source from allAttempts only
  // No more ghost rows or mixed denominators
  const attenderPerformance = React.useMemo(() => {
    // FIX #7: Complete no-answer list including Invalid No and wrong no.
    const NO_ANSWER_STATUSES = ["NA", "Busy", "Call Cut", "switched off", "no answer", "no network", "Invalid No", "wrong no."];
    const map = {};

    // 1. Initialize for all attenders based on assigned contacts in monthLogs
    monthLogs.forEach(l => {
      const staff = l.attenderName || "Unknown";
      if (!map[staff]) {
        map[staff] = { staff, contacts: 0, attempts: 0, connected: 0, notConnected: 0, noAnswer: 0, infoGiven: 0, registrations: 0 };
      }
      map[staff].contacts++;
    });

    // 2. Aggregate attempts from allAttempts
    allAttempts.forEach(a => {
      const staff = a.attenderName || "Unknown";
      if (!map[staff]) {
        map[staff] = { staff, contacts: 0, attempts: 0, connected: 0, notConnected: 0, noAnswer: 0, infoGiven: 0, registrations: 0 };
      }
      map[staff].attempts++;
      if (CONNECTED_STATUSES.includes(a.status)) map[staff].connected++;
      else if (NOT_CONNECTED_STATUSES.includes(a.status)) map[staff].notConnected++;
      if (NO_ANSWER_STATUSES.includes(a.status)) map[staff].noAnswer++;
      if (a.status === "Info given") map[staff].infoGiven++;
      if (a.status === "Reg.Done") map[staff].registrations++;
    });

    return Object.values(map)
      .sort((a, b) => b.attempts - a.attempts)
      .map(m => {
        const contacts = m.contacts || 0;
        return {
          ...m,
          connRate: m.attempts > 0 ? Math.round((m.connected / m.attempts) * 100) + '%' : '0%',
          regRate: m.attempts > 0 ? Math.round((m.registrations / m.attempts) * 100) + '%' : '0%',
          perAssignConversion: contacts > 0 ? Math.round((m.registrations / contacts) * 100) + '%' : '0%',
          callsPerAssign: contacts > 0 ? (m.attempts / contacts).toFixed(1) : '0.0',
        };
      });
  }, [allAttempts, monthLogs]);

  // B) Day-wise Trend
  const dayWiseTrend = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(a => {
      if (!a.timestamp) return;
      const dateObj = new Date(a.timestamp);
      if (isNaN(dateObj)) return;
      const day = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const sortKey = dateObj.toISOString().split('T')[0];
      if (!map[day]) map[day] = { sortKey, day, attempts: 0, connected: 0, registrations: 0 };
      map[day].attempts++;
      if (CONNECTED_STATUSES.includes(a.status)) map[day].connected++;
      if (a.status === "Reg.Done") map[day].registrations++;
    });
    return Object.values(map)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(m => ({ day: m.day, attempts: m.attempts, connected: m.connected, registrations: m.registrations }));
  }, [allAttempts]);

  // F) Program-wise detailed view
  const programWiseDetails = React.useMemo(() => {
    const map = {};
    monthLogs.forEach(l => {
      const pName = l.programName || "Unknown";
      if (!map[pName]) map[pName] = { program: pName, attempts: 0, contacts: 0, connected: 0, registrations: 0 };
      map[pName].contacts++;
      if (CONNECTED_STATUSES.includes(l.status)) map[pName].connected++;
      if (l.status === "Reg.Done") map[pName].registrations++;
    });
    allAttempts.forEach(a => {
      const pName = a.programName || "Unknown";
      if (!map[pName]) map[pName] = { program: pName, attempts: 0, contacts: 0, connected: 0, registrations: 0 };
      map[pName].attempts++;
    });
    return Object.values(map)
      .sort((a, b) => b.contacts - a.contacts)
      .map(m => ({
        ...m,
        connRate: m.contacts > 0 ? Math.round((m.connected / m.contacts) * 100) + '%' : '0%',
        regRate: m.contacts > 0 ? Math.round((m.registrations / m.contacts) * 100) + '%' : '0%'
      }));
  }, [allAttempts, monthLogs]);

  // G) Time-of-day analysis
  const timeOfDayTrend = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(a => {
      if (!a.timestamp) return;
      const dateObj = new Date(a.timestamp);
      if (isNaN(dateObj)) return;
      const hour = dateObj.getHours(); // 0-23
      const hourLabel = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;
      if (!map[hourLabel]) map[hourLabel] = { hour, label: hourLabel, attempts: 0, connected: 0 };
      map[hourLabel].attempts++;
      if (CONNECTED_STATUSES.includes(a.status)) map[hourLabel].connected++;
    });
    return Object.values(map)
      .sort((a, b) => a.hour - b.hour)
      .map(m => ({
        time: m.label,
        attempts: m.attempts,
        connected: m.connected,
        rate: m.attempts > 0 ? Math.round((m.connected / m.attempts) * 100) + '%' : '0%'
      }));
  }, [allAttempts]);

  // I) Day-of-week analysis
  const dayOfWeekTrend = React.useMemo(() => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const map = days.map((name, i) => ({ day: name, index: i, attempts: 0, connected: 0, registrations: 0 }));
    allAttempts.forEach(a => {
      if (!a.timestamp) return;
      const d = new Date(a.timestamp);
      if (isNaN(d)) return;
      const dayIdx = d.getDay();
      map[dayIdx].attempts++;
      if (CONNECTED_STATUSES.includes(a.status)) map[dayIdx].connected++;
      if (a.status === "Reg.Done") map[dayIdx].registrations++;
    });
    return map;
  }, [allAttempts]);

  // J) Callback & Hot Lead efficiency
  const efficiencyMetrics = React.useMemo(() => {
    const scheduledCallbacks = monthLogs.filter(l => l.callbackDate).length;
    const resolvedCallbacks = monthLogs.filter(l => l.callbackDate && l.status && l.status !== "reminder").length;
    const hotLeads = monthLogs.filter(l => l.isHotLead).length;
    const hotLeadConversions = monthLogs.filter(l => l.isHotLead && l.status === "Reg.Done").length;

    return {
      callbackRate: scheduledCallbacks > 0 ? Math.round((resolvedCallbacks / scheduledCallbacks) * 100) : 0,
      hotLeadConversionRate: hotLeads > 0 ? Math.round((hotLeadConversions / hotLeads) * 100) : 0,
      totalHotLeads: hotLeads,
      totalCallbacks: scheduledCallbacks
    };
  }, [monthLogs]);

  // H) Combined Granular Breakdown (Shivir, Attender, Call Type, Khoji/New)
  const combinedGranular = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(a => {
      const pName = a.programName || "Unknown";
      const attName = a.attenderName || "Unknown";
      const cType = a.callType || "outgoing";
      const log = a.log || {};
      const khojiKey = findFieldKey(log, ["khoji/new", "khoji", "new/khoji"]);
      const khojiVal = (khojiKey ? String(log[khojiKey] || "").trim() : "") || "Unknown";

      const key = `${pName}|${attName}|${cType}|${khojiVal}`;
      if (!map[key]) {
        map[key] = {
          program: pName,
          attender: attName,
          callType: cType,
          khoji: khojiVal,
          attempts: 0,
          connected: 0,
          registrations: 0
        };
      }
      map[key].attempts++;
      if (CONNECTED_STATUSES.includes(a.status)) map[key].connected++;
      if (a.status === "Reg.Done") map[key].registrations++;
    });
    return Object.values(map).sort((a, b) =>
      a.program.localeCompare(b.program) ||
      a.attender.localeCompare(b.attender) ||
      a.khoji.localeCompare(b.khoji)
    );
  }, [allAttempts, findFieldKey]);

  // ── Source / Khoji Program Pivots (uses findFieldKey already defined above) ──
  const monthlyPrograms = React.useMemo(() => [...new Set(monthLogs.map(l => l.programName || 'Unknown'))].sort(), [monthLogs]);
  const monthlySourcePivot = React.useMemo(() => {
    const m = {};
    monthLogs.forEach(l => {
      const k = findFieldKey(l, ['source', 'sourse']);
      const src = k ? String(l[k] || '').trim() || 'Unknown' : 'Unknown';
      const p = l.programName || 'Unknown';
      if (!m[src]) m[src] = { _total: 0 };
      m[src][p] = (m[src][p] || 0) + 1;
      m[src]._total++;
    }); return m;
  }, [monthLogs, findFieldKey]);
  const monthlyIncomingSourcePivot = React.useMemo(() => {
    const m = {};
    monthLogs.filter(l => l.callType === 'incoming' || l.callType === 'incoming f').forEach(l => {
      const k = findFieldKey(l, ['source', 'sourse']);
      const src = k ? String(l[k] || '').trim() || 'Unknown' : 'Unknown';
      const p = l.programName || 'Unknown';
      if (!m[src]) m[src] = { _total: 0 };
      m[src][p] = (m[src][p] || 0) + 1;
      m[src]._total++;
    }); return m;
  }, [monthLogs, findFieldKey]);
  const monthlyKhojiPivot = React.useMemo(() => {
    const m = {};
    monthLogs.forEach(l => {
      const k = findFieldKey(l, ['khoji/new', 'khoji', 'new/khoji']);
      const val = k ? String(l[k] || '').trim() || 'Unknown' : 'Unknown';
      const p = l.programName || 'Unknown';
      if (!m[val]) m[val] = { _total: 0 };
      m[val][p] = (m[val][p] || 0) + 1;
      m[val]._total++;
    }); return m;
  }, [monthLogs, findFieldKey]);

  // ── Export ──
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ["TGF MONTHLY REPORT", "", selectedMonth || "All Months"],
      ["", "Call Attempts = every call made | Unique Contacts = each person's final status"],
      [],
      ["SECTION 1: TOTAL CALLS", "Attempts", "", "", "Unique Contacts"],
      ["", "Incoming", "Outgoing", "Total", "Incoming", "Outgoing", "Total"],
      ["Total", allAttempts.filter(a => a.callType === "incoming" || a.callType === "incoming f").length, allAttempts.filter(a => a.callType !== "incoming" && a.callType !== "incoming f").length, totalAttempts,
        monthLogs.filter(l => l.callType === "incoming" || l.callType === "incoming f").length, monthLogs.filter(l => l.callType !== "incoming" && l.callType !== "incoming f").length, totalContacts],
      ["Connected", section1.attConnIncoming, section1.attConnOutgoing, section1.attConnected, section1.ucConnIncoming, section1.ucConnOutgoing, section1.ucConnected],
      ["Not Connected", section1.attNotIncoming, section1.attNotOutgoing, section1.attNotConnected, section1.ucNotIncoming, section1.ucNotOutgoing, section1.ucNotConnected],
      [],
      ["CONNECTED BREAKDOWN", "Attempts", "", "", "Unique Contacts"],
      ["Status", "In", "Out", "Total", "In", "Out", "Total"],
      ...connectedBreakdown.map(r => [r.status, r.attIn, r.attOut, r.att, r.ucIn, r.ucOut, r.uc]),
      [],
      ["NOT CONNECTED BREAKDOWN", "Attempts", "", "", "Unique Contacts"],
      ["Status", "In", "Out", "Total", "In", "Out", "Total"],
      ...notConnectedBreakdown.map(r => [r.status, r.attIn, r.attOut, r.att, r.ucIn, r.ucOut, r.uc]),
      [],
      ["SECTION 2: CONNECTED CALLS — BREAKDOWNS"],
      [],
      ["Khoji / New Wise", "Contacts"],
      ...khojiBreakdown.map(r => [r.name, r.count]),
      [],
      ["Called For Wise", "Contacts"],
      ...calledForBreakdown.map(r => [r.name, r.count]),
      [],
      ["Source Wise", "Contacts"],
      ...sourceBreakdown.map(r => [r.name, r.count]),
      [],
      ["SECTION 3: INFO GIVEN / ABHIVYAKTI", "Attempts", "Unique Contacts"],
      ["Info Given", infoGivenAttempts, infoGivenCount],
      ["Interested", interestedAttempts, interestedCount],
      ["Reg.Done (Abhivyakti)", regDoneAttempts, regDoneCount],
      [],
      ["SECTION 4: DETAILED BREAKDOWNS"],
      [],
      ["Attender Performance", "Assigned Contacts", "Total Calls", "Calls/Assign", "Connected", "Conn %", "Registrations", "Reg %", "Per Assign Conversion"],
      ...attenderPerformance.map(r => [r.staff, r.contacts, r.attempts, r.callsPerAssign, r.connected, r.connRate, r.registrations, r.regRate, r.perAssignConversion]),
      [],
      ["Program Wise Details", "Attempts", "Contacts", "Connected", "Conn %", "Registrations", "Reg %"],
      ...programWiseDetails.map(r => [r.program, r.attempts, r.contacts, r.connected, r.connRate, r.registrations, r.regRate]),
      [],
      ["Day-Wise Timeline", "Attempts", "Connected", "Registrations"],
      ...dayWiseTrend.map(r => [r.day, r.attempts, r.connected, r.registrations]),
      [],
      ["Time Of Day Analysis", "Attempts", "Connected", "Conn %"],
      ...timeOfDayTrend.map(r => [r.time, r.attempts, r.connected, r.rate]),
      [],
      ["Day Of Week Analysis", "Attempts", "Connected", "Registrations", "Conn %"],
      ...dayOfWeekTrend.map(r => [r.day, r.attempts, r.connected, r.registrations, r.attempts > 0 ? Math.round((r.connected / r.attempts) * 100) + '%' : '0%']),
      [],
      ["Efficiency Metrics", "Metric", "Value"],
      ["Callback Resolution Rate", efficiencyMetrics.callbackRate + "%"],
      ["Hot Lead Conversion Rate", efficiencyMetrics.hotLeadConversionRate + "%"],
      ["Total Hot Leads Identified", efficiencyMetrics.totalHotLeads],
      ["Total Callbacks Scheduled", efficiencyMetrics.totalCallbacks],
      [],
      ["SECTION 5: GRANULAR COMBINED BREAKDOWN", "Shivir", "Attender", "Call Type", "Khoji/New", "Attempts", "Connected", "Reg.Done"],
      ...combinedGranular.map(r => ["", r.program, r.attender, r.callType, r.khoji, r.attempts, r.connected, r.registrations])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Report");
    XLSX.writeFile(wb, `TGF_Monthly_Report_${selectedMonth || "All"}.xlsx`);
    toast.success("Monthly report exported!");
  };

  const MiniTable = ({ headers, rows, highlight }) => (
    <div className="overflow-x-auto rounded-2xl border border-gray-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {headers.map((h, i) => <th key={i} className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
              {row.map((cell, j) => <td key={j} className={`px-4 py-3 font-bold whitespace-nowrap ${j === 0 ? "text-gray-800" : highlight ? "text-indigo-600" : "text-gray-600"}`}>{cell}</td>)}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={headers.length} className="py-8 text-center text-gray-400 font-medium">No data</td></tr>}
        </tbody>
      </table>
    </div>
  );

  // ── Collapsible Section helper ──
  const [openSections, setOpenSections] = React.useState({ s1: true, s2: true, sAbhivyakti: true, s3: true, s4: true, s5: false, s6: false });
  const toggle = (k) => setOpenSections(p => ({ ...p, [k]: !p[k] }));

  // Attender totals footer
  const attTotals = attenderPerformance.length > 1
    ? attenderPerformance.reduce((acc, r) => ({
      contacts: acc.contacts + (r.contacts || 0),
      attempts: acc.attempts + r.attempts,
      connected: acc.connected + r.connected,
      notConnected: acc.notConnected + r.notConnected,
      noAnswer: acc.noAnswer + r.noAnswer,
      infoGiven: acc.infoGiven + r.infoGiven,
      registrations: acc.registrations + r.registrations,
    }), { contacts: 0, attempts: 0, connected: 0, notConnected: 0, noAnswer: 0, infoGiven: 0, registrations: 0 })
    : null;

  return (
    <div className="p-6 space-y-3">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Monthly Report</h2>
          <p className="text-slate-400 text-xs mt-0.5">Attempts = every call made &nbsp;·&nbsp; Contacts = each person's final status</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5 shadow-sm shrink-0">
            <FileSpreadsheet size={14} className="text-indigo-500 shrink-0" />
            <select
              value={selectedProgramIds.includes("ALL") ? "ALL" : selectedProgramIds[0] || "ALL"}
              onChange={e => {
                const val = e.target.value;
                setSelectedProgramIds(val === "ALL" ? ["ALL"] : [val]);
              }}
              className="bg-transparent text-[11px] font-black text-indigo-700 focus:outline-none cursor-pointer min-w-[150px] md:min-w-[180px] pr-2 font-sans"
            >
              <option value="ALL">ALL SHEETS</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl font-bold text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <button onClick={() => setSelectedMonth('')} className="px-3 py-2 text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">All Months</button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs hover:bg-emerald-700 transition shadow-md shadow-emerald-600/20 active:scale-95">
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[
          { label: 'Total Attempts', value: totalAttempts, color: 'bg-slate-800 text-white' },
          { label: 'Unique Contacts', value: totalContacts, color: 'bg-indigo-600 text-white' },
          { label: 'Connected', value: section1.ucConnected, color: 'bg-emerald-600 text-white' },
          { label: 'Not Connected', value: section1.ucNotConnected, color: 'bg-red-500 text-white' },
          { label: 'Info Given', value: infoGivenCount, color: 'bg-blue-500 text-white' },
          { label: 'Registrations', value: regDoneCount, color: 'bg-purple-600 text-white' },
        ].map(k => (
          <div key={k.label} className={`${k.color} rounded-xl p-3 text-center shadow-sm`}>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-70">{k.label}</p>
            <p className="text-2xl font-black mt-0.5">{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Section 1: Calls Summary ── */}
      <MonthlySection color="blue" id="s1" onToggle={toggle} isOpen={openSections["s1"]} label="Section 1 — Calls Summary" badge={totalAttempts + ' attempts'}>
        <MonthlyTable
          heads={['Category', 'Att In', 'Att Out', 'Att Total', 'UC In', 'UC Out', 'UC Total']}
          rows={[
            ['Connected', section1.attConnIncoming, section1.attConnOutgoing, section1.attConnected, section1.ucConnIncoming, section1.ucConnOutgoing, section1.ucConnected],
            ['Not Connected', section1.attNotIncoming, section1.attNotOutgoing, section1.attNotConnected, section1.ucNotIncoming, section1.ucNotOutgoing, section1.ucNotConnected],
          ]}
          footer={[
            'Grand Total',
            totalAttempts,
            '',
            totalAttempts,
            monthLogs.filter(l => l.callType === 'incoming' || l.callType === 'incoming f').length,
            monthLogs.filter(l => l.callType !== 'incoming' && l.callType !== 'incoming f').length,
            totalContacts,
          ]}
        />
        <div className="grid md:grid-cols-2 gap-0 border-t border-gray-100">
          <div className="border-r border-gray-100">
            <div className="px-4 py-2.5 bg-emerald-50/50 border-b border-gray-100">
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Connected — Status Breakdown</span>
            </div>
            <MonthlyTable heads={['Status', 'Attempts', 'Contacts']}
              rows={connectedBreakdown.map(r => [r.status, r.att, r.uc])} />
          </div>
          <div>
            <div className="px-4 py-2.5 bg-red-50/50 border-b border-gray-100">
              <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Not Connected — Status Breakdown</span>
            </div>
            <MonthlyTable heads={['Status', 'Attempts', 'Contacts']}
              rows={notConnectedBreakdown.map(r => [r.status, r.att, r.uc])} />
          </div>
        </div>
      </MonthlySection>

      {/* ── Section 2: Connected Breakdowns ── */}
      <MonthlySection color="emerald" id="s2" onToggle={toggle} isOpen={openSections["s2"]} label="Section 2 — Connected Calls Breakdown" badge={section1.ucConnected + ' connected contacts'}>
        <div className="grid md:grid-cols-3 gap-0 divide-x divide-gray-100">
          {[
            { label: 'Khoji / New', rows: khojiBreakdown.map(r => [r.name, r.count]) },
            { label: 'Called For', rows: calledForBreakdown.map(r => [r.name, r.count]) },
            { label: 'Source', rows: sourceBreakdown.map(r => [r.name, r.count]) },
          ].map(({ label, rows }) => (
            <div key={label}>
              <div className="px-4 py-2.5 bg-indigo-50/50 border-b border-gray-100">
                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">{label}</span>
              </div>
              <MonthlyTable heads={[label, 'Contacts']} rows={rows} />
            </div>
          ))}
        </div>
      </MonthlySection>

      {/* ── Section 3: Attender Performance ── */}
      <MonthlySection color="rose" id="sAbhivyakti" label="Section — Abhivyakti Info &amp; Reg Stats" badge="Info Given &amp; Registrations" onToggle={toggle} isOpen={openSections["sAbhivyakti"]}>
        <div className="grid grid-cols-3 gap-0 divide-x divide-gray-100">
          {[
            // A4 fix: extract phone using normalised key search instead of l.phone (which is never the actual field name)
            { label: "Info Given", attempts: monthLogs.filter(l => l.status === "Info given").length, contacts: Array.from(new Set(monthLogs.filter(l => l.status === "Info given").map(l => { const k = Object.keys(l).find(k => ["phone","mobile","whatsapp","phone number","whatsapp number","whatsappno"].includes(k.toLowerCase())) || Object.keys(l).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile")); return k ? String(l[k] || "").trim() : l.id; }))).length, color: "bg-blue-50 text-blue-700 border-blue-100" },
            { label: "Interested", attempts: monthLogs.filter(l => l.status === "Interested").length, contacts: Array.from(new Set(monthLogs.filter(l => l.status === "Interested").map(l => { const k = Object.keys(l).find(k => ["phone","mobile","whatsapp","phone number","whatsapp number","whatsappno"].includes(k.toLowerCase())) || Object.keys(l).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile")); return k ? String(l[k] || "").trim() : l.id; }))).length, color: "bg-purple-50 text-purple-700 border-purple-100" },
            { label: "Reg.Done (Abhivyakti)", attempts: monthLogs.filter(l => l.status === "Reg.Done").length, contacts: Array.from(new Set(monthLogs.filter(l => l.status === "Reg.Done").map(l => { const k = Object.keys(l).find(k => ["phone","mobile","whatsapp","phone number","whatsapp number","whatsappno"].includes(k.toLowerCase())) || Object.keys(l).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile")); return k ? String(l[k] || "").trim() : l.id; }))).length, color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
          ].map(s => (
            <div key={s.label} className={`${s.color} p-6 text-center border-b border-gray-100`}>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{s.label}</p>
              <p className="text-3xl font-black mt-2">{s.contacts}</p>
              <p className="text-xs font-bold opacity-60 mt-1">{s.attempts} attempt{s.attempts !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      </MonthlySection>

      <MonthlySection color="indigo" id="s3" onToggle={toggle} isOpen={openSections["s3"]} label="Section 3 — Attender Performance" badge={attenderPerformance.length + ' attenders'}>
        <MonthlyTable
          heads={['Attender', 'Assigned Contacts', 'Total Calls', 'Calls/Assign', 'Connected', 'Conn %', 'No Answer', 'Info Given', 'Reg.Done', 'Reg %', 'Per Assign Conversion']}
          rows={attenderPerformance.map(r => [
            r.staff, r.contacts, r.attempts, r.callsPerAssign, r.connected, r.connRate, r.noAnswer, r.infoGiven, r.registrations, r.regRate, r.perAssignConversion
          ])}
          footer={attTotals ? [
            'Grand Total',
            attTotals.contacts,
            attTotals.attempts,
            attTotals.contacts > 0 ? (attTotals.attempts / attTotals.contacts).toFixed(1) : '0.0',
            attTotals.connected,
            attTotals.attempts > 0 ? Math.round((attTotals.connected / attTotals.attempts) * 100) + '%' : '0%',
            attTotals.noAnswer,
            attTotals.infoGiven,
            attTotals.registrations,
            attTotals.attempts > 0 ? Math.round((attTotals.registrations / attTotals.attempts) * 100) + '%' : '0%',
            attTotals.contacts > 0 ? Math.round((attTotals.registrations / attTotals.contacts) * 100) + '%' : '0%',
          ] : undefined}
        />
      </MonthlySection>

      {/* ── Section 4: Program-Wise ── */}
      <MonthlySection color="purple" id="s4" onToggle={toggle} isOpen={openSections["s4"]} label="Section 4 — Program Wise Details" badge={programWiseDetails.length + ' programs'}>
        <MonthlyTable
          heads={['Program', 'Attempts', 'Contacts', 'Connected', 'Conn %', 'Reg.Done', 'Reg %']}
          rows={programWiseDetails.map(r => [r.program, r.attempts, r.contacts, r.connected, r.connRate, r.registrations, r.regRate])}
        />
      </MonthlySection>

      {/* ── Section 5: Source & Khoji Pivot Tables ── */}
      <MonthlySection color="orange" id="s5" onToggle={toggle} isOpen={openSections["s5"]} label="Section 5 — Abhivyakti Report Analysis" badge="3 pivot tables">
        {[
          { label: 'All Calls — Source × Program', rowMap: monthlySourcePivot },
          { label: 'Incoming Calls Only — Source × Program', rowMap: monthlyIncomingSourcePivot },
          { label: 'Khoji / New × Program', rowMap: monthlyKhojiPivot },
        ].map(({ label, rowMap }) => {
          const rows = Object.keys(rowMap).filter(r => r !== '_total').sort();
          const colTotals = {};
          monthlyPrograms.forEach(p => { colTotals[p] = 0; });
          rows.forEach(r => monthlyPrograms.forEach(p => { colTotals[p] += (rowMap[r][p] || 0); }));
          const grandTotal = rows.reduce((s, r) => s + (rowMap[r]._total || 0), 0);
          return (
            <div key={label} className="border-b border-gray-100 last:border-0">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{label}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-[10px] font-black text-gray-500 uppercase whitespace-nowrap">↓ Source / Program →</th>
                      {monthlyPrograms.map(p => (
                        <th key={p} className="px-3 py-2.5 text-center text-[10px] font-black text-gray-500 uppercase whitespace-nowrap">{p}</th>
                      ))}
                      <th className="px-3 py-2.5 text-center text-[10px] font-black text-slate-800 uppercase bg-slate-100">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row, i) => (
                      <tr key={i} className={(i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30') + ' hover:bg-indigo-50/20 transition-colors'}>
                        <td className="px-4 py-2 font-black text-slate-700 whitespace-nowrap">{row}</td>
                        {monthlyPrograms.map(p => (
                          <td key={p} className="px-3 py-2 text-center">
                            {rowMap[row][p]
                              ? <span className="px-2 py-0.5 rounded-lg font-black text-xs text-indigo-700 bg-indigo-50">{rowMap[row][p]}</span>
                              : <span className="text-gray-200">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center font-black text-slate-700 bg-gray-50">{rowMap[row]._total || 0}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={monthlyPrograms.length + 2} className="py-8 text-center text-gray-300 font-bold">No data for this period.</td></tr>
                    )}
                    <tr className="bg-slate-100 border-t-2 border-slate-200">
                      <td className="px-4 py-2 font-black text-slate-800 text-[10px] uppercase tracking-wide">Grand Total</td>
                      {monthlyPrograms.map(p => (
                        <td key={p} className="px-3 py-2 text-center font-black text-slate-700">{colTotals[p] || '—'}</td>
                      ))}
                      <td className="px-3 py-2 text-center font-black text-slate-900 bg-slate-200">{grandTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </MonthlySection>

      {/* ── Section 6: Combined Granular + Time Analysis ── */}
      <MonthlySection color="slate" id="s6" onToggle={toggle} isOpen={openSections["s6"]} label="Section 6 — Deep Dive (Day · Time · Granular)" badge="collapsed by default">
        <div className="grid md:grid-cols-2 gap-0 divide-x divide-gray-100 border-b border-gray-100">
          <div>
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Day-Wise Timeline</span>
            </div>
            <MonthlyTable heads={['Date', 'Attempts', 'Connected', 'Registrations']}
              rows={dayWiseTrend.map(r => [r.day, r.attempts, r.connected, r.registrations])} />
          </div>
          <div>
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Time of Day (Starts At)</span>
            </div>
            <MonthlyTable heads={['Hour', 'Attempts', 'Connected', 'Conn %']}
              rows={timeOfDayTrend.map(r => [r.time, r.attempts, r.connected, r.rate])} />
          </div>
        </div>
      </MonthlySection>

    </div>
  );
}

// ─── Abhivyakti Report Tab ────────────────────
function AbhivyaktiTab({ programs }) {
  const [selectedProgramId, setSelectedProgramId] = useState("ALL");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [registrations, setRegistrations] = useState([]);
  const unsubRef = React.useRef(null);

  useEffect(() => {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = subscribeToRegistrations(selectedProgramId, setRegistrations);
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [selectedProgramId]);

  // Filter by month
  const monthFiltered = React.useMemo(() => {
    if (!selectedMonth) return registrations;
    const [year, month] = selectedMonth.split("-").map(Number);
    return registrations.filter(r => {
      const d = r.registeredAt?.toDate ? r.registeredAt.toDate() : r.createdAt?.toDate ? r.createdAt.toDate() : null;
      if (!d) return true;
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [registrations, selectedMonth]);

  const handleExport = () => {
    if (!monthFiltered.length) { toast.error("No registrations to export."); return; }
    const rows = monthFiltered.map(r => {
      const { id, attenderId, contactId, history, _deleted, _callbackDue, isCallbackDue, isHotLead, callCount, ...rest } = r;
      const row = { ...rest };
      ["registeredAt", "createdAt", "updatedAt", "assignedAt", "importedAt"].forEach(k => {
        if (row[k]?.toDate) row[k] = row[k].toDate().toLocaleString("en-IN");
      });
      if (row.callbackDate?.toDate) row.callbackDate = row.callbackDate.toDate().toLocaleDateString("en-IN");

      let historyStr = "";
      if (history && Array.isArray(history)) {
        historyStr = history.map(h => `[${new Date(h.timestamp).toLocaleDateString("en-IN")}] ${h.attenderName}: ${h.status} - ${h.remark}`).join(" | ");
      }

      const nameKey = Object.keys(row).find(k => k.toLowerCase() === "name" || k.toLowerCase().includes("caller") || k.toLowerCase().includes("khoji")) || "Name";
      const nameVal = row[nameKey] || "";
      delete row[nameKey];

      return {
        [nameKey]: nameVal,
        ...row,
        "History Timeline": historyStr
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Abhivyakti");
    const monthLabel = selectedMonth || "All";
    XLSX.writeFile(wb, `Abhivyakti_Report_${monthLabel}.xlsx`);
    toast.success(`Exported ${monthFiltered.length} registrations!`);
  };

  const allColumns = React.useMemo(() => {
    if (monthFiltered.length === 0) return ["Name", "Phone", "programName", "attenderName", "registeredAt"];
    const internal = ["id", "contactId", "attenderId", "callbackDate", "_deleted", "isCallbackDue", "history", "isHotLead"];
    const keys = new Set(["Name", "Phone", "programName", "attenderName", "registeredAt"]);
    monthFiltered.forEach(r => Object.keys(r).forEach(k => {
      if (!internal.includes(k) && !k.startsWith("_")) keys.add(k);
    }));
    return Array.from(keys);
  }, [monthFiltered]);

  // ── Abhivyakti Analytics ──
  const abvFindVal = (obj, aliases) => {
    const key = Object.keys(obj).find(k => aliases.some(a => k.toLowerCase().includes(a)));
    return key ? String(obj[key] || '').trim() || 'Unknown' : 'Unknown';
  };
  const abvPrograms = React.useMemo(() => [...new Set(monthFiltered.map(r => r.programName || 'Unknown'))].sort(), [monthFiltered]);
  const sourcePivot = React.useMemo(() => {
    const m = {};
    monthFiltered.forEach(r => {
      const s = abvFindVal(r, ['source', 'sourse']); const p = r.programName || 'Unknown';
      if (!m[s]) m[s] = {}; m[s][p] = (m[s][p] || 0) + 1;
    }); return m;
  }, [monthFiltered]);
  const khojiPivot = React.useMemo(() => {
    const m = {};
    monthFiltered.forEach(r => {
      const k = abvFindVal(r, ['khoji/new', 'khoji', 'new']); const p = r.programName || 'Unknown';
      if (!m[k]) m[k] = {}; m[k][p] = (m[k][p] || 0) + 1;
    }); return m;
  }, [monthFiltered]);
  const callTypePivot = React.useMemo(() => {
    const m = {};
    monthFiltered.forEach(r => {
      const ct = r.callType || 'outgoing'; const p = r.programName || 'Unknown';
      if (!m[ct]) m[ct] = {}; m[ct][p] = (m[ct][p] || 0) + 1;
    }); return m;
  }, [monthFiltered]);
  const abvAttenders = React.useMemo(() => {
    const m = {};
    monthFiltered.forEach(r => { const a = r.attenderName || 'Unknown'; m[a] = (m[a] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [monthFiltered]);

  const AbvPivotTable = ({ title, rowMap, colHeaders, color = 'indigo' }) => {
    const rows = Object.keys(rowMap).sort();
    const colTotals = {}; colHeaders.forEach(p => { colTotals[p] = 0; });
    rows.forEach(r => colHeaders.forEach(p => { colTotals[p] += (rowMap[r][p] || 0); }));
    const grandTotal = Object.values(colTotals).reduce((a, b) => a + b, 0);
    const chip = color === 'emerald' ? 'text-emerald-700 bg-emerald-50' : color === 'amber' ? 'text-amber-700 bg-amber-50' : 'text-indigo-700 bg-indigo-50';
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{title}</p>
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase whitespace-nowrap">&#x2193; / Program &#x2192;</th>
              {colHeaders.map(p => <th key={p} className="px-3 py-3 text-center text-[10px] font-black text-gray-500 uppercase whitespace-nowrap">{p}</th>)}
              <th className="px-3 py-3 text-center text-[10px] font-black text-gray-800 uppercase bg-slate-100">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => {
                const rowTotal = colHeaders.reduce((sum, p) => sum + (rowMap[row][p] || 0), 0); return (
                  <tr key={i} className={(i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40') + ' hover:bg-blue-50/20 transition-colors'}>
                    <td className="px-4 py-2.5 font-black text-slate-700 whitespace-nowrap">{row}</td>
                    {colHeaders.map(p => <td key={p} className="px-3 py-2.5 text-center">{rowMap[row][p] ? <span className={'px-2 py-0.5 rounded-lg font-black text-xs ' + chip}>{rowMap[row][p]}</span> : <span className="text-gray-200">&mdash;</span>}</td>)}
                    <td className="px-3 py-2.5 text-center font-black text-slate-800 bg-gray-50">{rowTotal}</td>
                  </tr>);
              })}
              <tr className="bg-slate-100 border-t-2 border-slate-200">
                <td className="px-4 py-2.5 font-black text-slate-800 uppercase text-[10px]">Grand Total</td>
                {colHeaders.map(p => <td key={p} className="px-3 py-2.5 text-center font-black text-slate-700">{colTotals[p] || <span className="text-gray-300">&mdash;</span>}</td>)}
                <td className="px-3 py-2.5 text-center font-black text-slate-900 bg-slate-200">{grandTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Abhivyakti Report</h2>
          <p className="text-slate-500 mt-1 font-medium">All contacts marked as "Reg.Done" across programs.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-2xl font-black text-sm shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition">
            <option value="ALL">All Programs</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-2xl font-black text-sm shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition" />
          <button onClick={() => setSelectedMonth("")} className="px-3 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-2xl transition">All Months</button>
          <button onClick={handleExport}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 active:scale-95 leading-none">
            <Download size={16} /> Export {selectedMonth || "All"}
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 border border-emerald-500 rounded-3xl p-8 flex items-center justify-between text-white shadow-xl shadow-emerald-700/10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
            <ClipboardCheck size={32} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100/70 opacity-80">Total Conversions {selectedMonth ? `(${selectedMonth})` : ""}</p>
            <p className="font-black text-5xl leading-tight">{monthFiltered.length}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-white/60 mb-1 leading-none uppercase tracking-tighter">Live Tracker</p>
          <p className="text-xl font-black leading-none">Abhivyakti 2026</p>
        </div>
      </div>

      {/* ── Analytics Section ── */}
      {monthFiltered.length > 0 && (
        <div className="space-y-8">
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">Registration Analytics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Registrations", val: monthFiltered.length, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
              { label: "Programs", val: abvPrograms.length, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
              { label: "Attenders", val: abvAttenders.length, color: "bg-amber-50 text-amber-700 border-amber-200" },
              { label: "Incoming Regs", val: monthFiltered.filter(r => r.callType === "incoming" || r.callType === "incoming f").length, color: "bg-blue-50 text-blue-700 border-blue-200" },
            ].map(s => (
              <div key={s.label} className={`${s.color} border rounded-2xl p-5 text-center`}>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{s.label}</p>
                <p className="text-4xl font-black mt-2">{s.val}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <AbvPivotTable title="Source Wise x Program (Registrations)" rowMap={sourcePivot} colHeaders={abvPrograms} color="indigo" />
          </div>
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <AbvPivotTable title="Khoji / New Wise x Program (Registrations)" rowMap={khojiPivot} colHeaders={abvPrograms} color="emerald" />
          </div>
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <AbvPivotTable title="Call Type x Program (Incoming vs Outgoing)" rowMap={callTypePivot} colHeaders={abvPrograms} color="amber" />
          </div>
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-4">Attender Wise — Registrations Done</p>
            <div className="flex flex-wrap gap-3">
              {abvAttenders.map(([name, count]) => (
                <div key={name} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl">
                  <span className="font-black text-emerald-800 text-sm">{name}</span>
                  <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-lg text-xs font-black">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <h3 className="text-2xl font-black text-slate-800 tracking-tight pt-4">Full Registration List</h3>
        </div>
      )}

      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                {allColumns.map(col => (
                  <th key={col} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{col}</th>
                ))}
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {monthFiltered.map((r, i) => (
                <tr key={r.id} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="px-6 py-4 text-gray-400 text-xs font-bold">{i + 1}</td>
                  {allColumns.map(col => {
                    let val = r[col];
                    if (val?.toDate) val = val.toDate().toLocaleDateString("en-IN");
                    if (val && typeof val === "object") val = JSON.stringify(val);
                    return (
                      <td key={col} className="px-6 py-4">
                        <span className={`text-sm font-bold ${col === 'programName' ? 'text-indigo-600' : col === 'attenderName' ? 'text-emerald-700' : 'text-gray-700'} whitespace-nowrap`}>
                          {val || "\u2014"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 max-w-[200px] truncate text-xs font-medium text-gray-500">{r.remark || "\u2014"}</td>
                </tr>
              ))}
              {monthFiltered.length === 0 && (
                <tr><td colSpan={20} className="py-24 text-center text-gray-400 font-bold">No registrations for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
