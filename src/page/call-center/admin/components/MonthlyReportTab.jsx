import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Download, ChevronRight, ChevronDown, Calendar, TrendingUp, UserCheck, Smile, Info
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

export default function MonthlyReportTab({ programs }) {
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const unsubRef = React.useRef(null);

  useEffect(() => {
    if (unsubRef.current) unsubRef.current();
    if (!selectedProgramId) {
      setCallLogs([]);
      return;
    }
    setLoading(true);
    unsubRef.current = subscribeToAllCallLogs(selectedProgramId, (logs) => {
      setCallLogs(logs);
      setLoading(false);
    });
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [selectedProgramId]);

  const monthOptions = React.useMemo(() => {
    const months = new Set();
    callLogs.forEach(l => {
      if (l._deleted) return;
      const d = l.createdAt?.toDate ? l.createdAt.toDate() : l.createdAt ? new Date(l.createdAt) : null;
      if (d) {
        months.add(d.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit" }));
      }
    });
    const arr = Array.from(months).sort((a, b) => b.localeCompare(a));
    if (arr.length > 0 && !selectedMonth) {
      setSelectedMonth(arr[0]);
    }
    return arr;
  }, [callLogs]);

  const monthFiltered = React.useMemo(() => {
    if (!selectedMonth) return [];
    const [yr, mn] = selectedMonth.split("-");
    return callLogs.filter(l => {
      if (l._deleted) return false;
      const d = l.createdAt?.toDate ? l.createdAt.toDate() : l.createdAt ? new Date(l.createdAt) : null;
      if (!d) return false;
      return d.getFullYear() === parseInt(yr) && (d.getMonth() + 1) === parseInt(mn);
    });
  }, [callLogs, selectedMonth]);

  const allAttempts = React.useMemo(() => {
    const attempts = [];
    monthFiltered.forEach(log => {
      const logName = Object.keys(log).find(k => k.toLowerCase().includes("name") || k.toLowerCase().includes("lead"));
      const contactName = logName ? log[logName] : "Unknown";
      
      if (log.history && Array.isArray(log.history)) {
        log.history.forEach(h => {
          attempts.push({
            timestamp: h.timestamp ? new Date(h.timestamp) : null,
            attenderId: h.attenderId || log.attenderId,
            attenderName: h.attenderName || log.attenderName || "Unknown",
            status: h.status,
            remark: h.remark,
            contactName,
            programName: log.programName || "Unknown",
            contactId: log.contactId || "",
            callType: h.callType || log.callType || "outgoing"
          });
        });
      } else if (log.lastCalledAt) {
        attempts.push({
          timestamp: new Date(log.lastCalledAt),
          attenderId: log.attenderId,
          attenderName: log.attenderName || "Unknown",
          status: log.status || "Viewed",
          remark: log.remark,
          contactName,
          programName: log.programName || "Unknown",
          contactId: log.contactId || "",
          callType: log.callType || "outgoing"
        });
      }
    });
    return attempts;
  }, [monthFiltered]);

  const metrics = React.useMemo(() => {
    const stats = {
      connectedCalls: 0,
      notConnectedCalls: 0,
      totalCalls: 0,
      avgCallsPerDay: 0,
      highestCallDay: "-",
      totalConversions: 0,
    };

    allAttempts.forEach(c => {
      stats.totalCalls++;
      if (CONNECTED_STATUSES.includes(c.status)) {
        stats.connectedCalls++;
      } else if (NOT_CONNECTED_STATUSES.includes(c.status)) {
        stats.notConnectedCalls++;
      }
      if (c.status === "Reg.Done") {
        stats.totalConversions++;
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
      { metric: "Total Unique Call Attempts", value: allAttempts.length },
      { metric: "Connected Calls", value: metrics.connectedCalls },
      { metric: "Not Connected Calls", value: metrics.notConnectedCalls },
      { metric: "Direct Registrations / Conversions (Reg.Done)", value: metrics.totalConversions },
    ];
    const totalContactsInMonth = new Set(monthFiltered.map(l => l.contactId)).size;
    list.push({ metric: "Unique Leads Contacted", value: totalContactsInMonth });
    return list;
  }, [allAttempts, metrics, monthFiltered]);

  const connectedBreakdown = React.useMemo(() => {
    const map = {};
    CONNECTED_STATUSES.forEach(s => { map[s] = 0; });
    let total = 0;
    allAttempts.forEach(c => {
      if (CONNECTED_STATUSES.includes(c.status)) {
        map[c.status] = (map[c.status] || 0) + 1;
        total++;
      }
    });
    return Object.entries(map).map(([status, count]) => ({
      "Call Outcome Status": status,
      "No. of Calls": count,
      "Percentage (%)": total ? `${((count / total) * 100).toFixed(1)}%` : "0.0%"
    }));
  }, [allAttempts]);

  const notConnectedBreakdown = React.useMemo(() => {
    const map = {};
    NOT_CONNECTED_STATUSES.forEach(s => { map[s] = 0; });
    let total = 0;
    allAttempts.forEach(c => {
      if (NOT_CONNECTED_STATUSES.includes(c.status)) {
        map[c.status] = (map[c.status] || 0) + 1;
        total++;
      }
    });
    return Object.entries(map).map(([status, count]) => ({
      "Call Outcome Status": status,
      "No. of Calls": count,
      "Percentage (%)": total ? `${((count / total) * 100).toFixed(1)}%` : "0.0%"
    }));
  }, [allAttempts]);

  const dayWiseTimeline = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(c => {
      if (!c.timestamp) return;
      const dStr = c.timestamp.toLocaleDateString("en-IN");
      if (!map[dStr]) {
        map[dStr] = { date: dStr, total: 0, connected: 0, notConnected: 0, conversions: 0 };
      }
      map[dStr].total++;
      if (CONNECTED_STATUSES.includes(c.status)) map[dStr].connected++;
      else if (NOT_CONNECTED_STATUSES.includes(c.status)) map[dStr].notConnected++;
      if (c.status === "Reg.Done") map[dStr].conversions++;
    });

    const parsedMonth = selectedMonth ? new Date(selectedMonth + "-01") : new Date();
    const daysInMonth = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth() + 1, 0).getDate();
    const list = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const checkDate = new Date(parsedMonth.getFullYear(), parsedMonth.getMonth(), day);
      const dStr = checkDate.toLocaleDateString("en-IN");
      const data = map[dStr] || { date: dStr, total: 0, connected: 0, notConnected: 0, conversions: 0 };
      list.push({
        "Date": dStr,
        "Total Calls": data.total,
        "Connected": data.connected,
        "Not Connected": data.notConnected,
        "Reg.Done (Conversions)": data.conversions
      });
    }
    return list;
  }, [allAttempts, selectedMonth]);

  const dayWiseTotals = React.useMemo(() => {
    const totals = { "Date": "Total", "Total Calls": 0, "Connected": 0, "Not Connected": 0, "Reg.Done (Conversions)": 0 };
    dayWiseTimeline.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Connected"] += row["Connected"];
      totals["Not Connected"] += row["Not Connected"];
      totals["Reg.Done (Conversions)"] += row["Reg.Done (Conversions)"];
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
      map[i.label] = { total: 0, connected: 0, notConnected: 0, conversions: 0 };
    });

    allAttempts.forEach(c => {
      if (!c.timestamp) return;
      const hr = c.timestamp.getHours();
      const match = intervals.find(i => hr >= i.start && hr < i.end);
      if (match) {
        map[match.label].total++;
        if (CONNECTED_STATUSES.includes(c.status)) map[match.label].connected++;
        else if (NOT_CONNECTED_STATUSES.includes(c.status)) map[match.label].notConnected++;
        if (c.status === "Reg.Done") map[match.label].conversions++;
      }
    });

    return intervals.map(i => ({
      "Time Interval": i.label,
      "Total Calls": map[i.label].total,
      "Connected": map[i.label].connected,
      "Not Connected": map[i.label].notConnected,
      "Reg.Done (Conversions)": map[i.label].conversions
    }));
  }, [allAttempts]);

  const timeOfDayTotals = React.useMemo(() => {
    const totals = { "Time Interval": "Total", "Total Calls": 0, "Connected": 0, "Not Connected": 0, "Reg.Done (Conversions)": 0 };
    timeOfDayTrend.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Connected"] += row["Connected"];
      totals["Not Connected"] += row["Not Connected"];
      totals["Reg.Done (Conversions)"] += row["Reg.Done (Conversions)"];
    });
    return totals;
  }, [timeOfDayTrend]);

  const attenderPerformance = React.useMemo(() => {
    const map = {};
    allAttempts.forEach(c => {
      if (!map[c.attenderId]) {
        map[c.attenderId] = { name: c.attenderName, total: 0, connected: 0, notConnected: 0, conversions: 0 };
      }
      const item = map[c.attenderId];
      item.total++;
      if (CONNECTED_STATUSES.includes(c.status)) item.connected++;
      else if (NOT_CONNECTED_STATUSES.includes(c.status)) item.notConnected++;
      if (c.status === "Reg.Done") item.conversions++;
    });

    return Object.values(map).map(a => ({
      "Attender Name": a.name,
      "Total Calls": a.total,
      "Connected": a.connected,
      "Not Connected": a.notConnected,
      "Reg.Done (Conversions)": a.conversions,
      "Conversion Rate (%)": a.total ? `${((a.conversions / a.total) * 100).toFixed(1)}%` : "0.0%"
    })).sort((a, b) => b["Total Calls"] - a["Total Calls"]);
  }, [allAttempts]);

  const attenderPerformanceTotals = React.useMemo(() => {
    const totals = { "Attender Name": "Total", "Total Calls": 0, "Connected": 0, "Not Connected": 0, "Reg.Done (Conversions)": 0, "Conversion Rate (%)": "0.0%" };
    attenderPerformance.forEach(row => {
      totals["Total Calls"] += row["Total Calls"];
      totals["Connected"] += row["Connected"];
      totals["Not Connected"] += row["Not Connected"];
      totals["Reg.Done (Conversions)"] += row["Reg.Done (Conversions)"];
    });
    totals["Conversion Rate (%)"] = totals["Total Calls"] ? `${((totals["Reg.Done (Conversions)"] / totals["Total Calls"]) * 100).toFixed(1)}%` : "0.0%";
    return totals;
  }, [attenderPerformance]);

  const handleExport = () => {
    if (!monthFiltered.length) {
      toast.error("No data to export.");
      return;
    }
    const wb = XLSX.utils.book_new();

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
    const wsAttenders = XLSX.utils.json_to_sheet([...attenderPerformance, attenderPerformanceTotals]);
    XLSX.utils.book_append_sheet(wb, wsAttenders, "Attender Performance");

    // Write file
    XLSX.writeFile(wb, `CallCenter_MonthlyReport_${selectedMonth}.xlsx`);
    toast.success("Excel monthly analytics report downloaded successfully!");
  };

  return (
    <div className="p-8 space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800">Monthly Call Center Analytics</h2>
          <p className="text-slate-500 mt-1">Generate comprehensive monthly analytics and export to Excel</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-2xl font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">-- Select Program --</option>
            <option value="ALL">🌟 ALL PROGRAMS (Master)</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {monthOptions.length > 0 && (
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-2xl font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {monthOptions.map(m => {
                const [y, mn] = m.split("-");
                const dateObj = new Date(parseInt(y), parseInt(mn) - 1, 1);
                const display = dateObj.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
                return <option key={m} value={m}>{display}</option>;
              })}
            </select>
          )}

          <button onClick={handleExport} disabled={!monthFiltered.length}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-sm transition-all disabled:opacity-50">
            <Download size={18} /> Export Excel Workbook
          </button>
        </div>
      </div>

      {!selectedProgramId ? (
        <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl text-gray-400">
          <div className="text-center">
            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
            <p>Select a program to fetch monthly report metrics</p>
          </div>
        </div>
      ) : loading ? (
        <div className="py-20 text-center text-gray-400 font-bold">Loading monthly report datasets...</div>
      ) : monthFiltered.length === 0 ? (
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
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Direct Registrations (Month)</p>
                <p className="text-2xl font-black text-gray-800 mt-1">{metrics.totalConversions}</p>
              </div>
            </div>
          </div>

          {/* Collapsible Sections */}
          <MonthlySection title="Section 1: General Monthly KPIs Summary">
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
              headers={["Call Outcome Status", "No. of Calls", "Percentage (%)"]}
              rows={connectedBreakdown}
            />
          </MonthlySection>

          <MonthlySection title="Section 3: Not Connected Calls Breakdowns">
            <div className="flex items-center gap-2 mb-4 p-4 bg-amber-50 text-amber-800 text-xs font-bold rounded-2xl">
              <Info size={16} />
              <span>These are attempts where no direct communication happened (e.g. Busy, Switched Off, Called by mistake).</span>
            </div>
            <MonthlyTable
              headers={["Call Outcome Status", "No. of Calls", "Percentage (%)"]}
              rows={notConnectedBreakdown}
            />
          </MonthlySection>

          <MonthlySection title="Section 4: Day-wise Calls & Conversions Timeline" defaultOpen={false}>
            <MonthlyTable
              headers={["Date", "Total Calls", "Connected", "Not Connected", "Reg.Done (Conversions)"]}
              rows={dayWiseTimeline}
              totals={dayWiseTotals}
            />
          </MonthlySection>

          <MonthlySection title="Section 5: Time of Day Calling Trends">
            <MonthlyTable
              headers={["Time Interval", "Total Calls", "Connected", "Not Connected", "Reg.Done (Conversions)"]}
              rows={timeOfDayTrend}
              totals={timeOfDayTotals}
            />
          </MonthlySection>

          <MonthlySection title="Section 6: Attender Wise Productivity & Conversion Rates">
            <MonthlyTable
              headers={["Attender Name", "Total Calls", "Connected", "Not Connected", "Reg.Done (Conversions)", "Conversion Rate (%)"]}
              rows={attenderPerformance}
              totals={attenderPerformanceTotals}
            />
          </MonthlySection>
        </div>
      )}
    </div>
  );
}
