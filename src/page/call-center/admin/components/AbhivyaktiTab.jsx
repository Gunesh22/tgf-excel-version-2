import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Download, Calendar, TrendingUp, UserCheck, Smile, Info
} from "lucide-react";
import { subscribeToRegistrations, getRegistrationMonths } from "../../../../lib/db";

export default function AbhivyaktiTab({
  selectedMonth,
  setSelectedMonth,
  registrations = [],
  loading = false,
  monthOptions = []
}) {

  const monthFiltered = React.useMemo(() => {
    return registrations.filter(r => !r._deleted);
  }, [registrations]);

  const metrics = React.useMemo(() => {
    const stats = {
      totalRegistrations: monthFiltered.length,
      avgPerDay: 0,
      highestDay: "-",
      totalAttenderAssisted: 0,
      conversionRate: "0.0%"
    };

    const dayMap = {};
    monthFiltered.forEach(r => {
      const d = r.registeredAt?.toDate ? r.registeredAt.toDate() : r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt ? new Date(r.createdAt) : null;
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
  }, [monthFiltered]);

  const section1 = React.useMemo(() => {
    return [
      { metric: "Total Registrations Count", value: metrics.totalRegistrations },
      { metric: "Average Registrations Per Day", value: metrics.avgPerDay },
      { metric: "Attender Assisted Conversions", value: metrics.totalAttenderAssisted },
      { metric: "Direct Online / Unassisted Registrations", value: metrics.totalRegistrations - metrics.totalAttenderAssisted }
    ];
  }, [metrics]);

  const sourceBreakdown = React.useMemo(() => {
    const map = {};
    let total = 0;
    monthFiltered.forEach(r => {
      const src = r.conversionSource || r.Source || "Online/Direct";
      map[src] = (map[src] || 0) + 1;
      total++;
    });
    return Object.entries(map).map(([src, count]) => ({
      "Registration Source": src,
      "Count": count,
      "Percentage (%)": total ? `${((count / total) * 100).toFixed(1)}%` : "0.0%"
    })).sort((a, b) => b.Count - a.Count);
  }, [monthFiltered]);

  const dayWiseTimeline = React.useMemo(() => {
    const map = {};
    monthFiltered.forEach(r => {
      const d = r.registeredAt?.toDate ? r.registeredAt.toDate() : r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt ? new Date(r.createdAt) : null;
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
        const data = map[dStr] || { date: dStr, total: 0, assisted: 0, direct: 0 };
        list.push({
          "Date": dStr,
          "Total Registrations": data.total,
          "Attender Assisted": data.assisted,
          "Direct Online": data.direct
        });
      }
    } else {
      // For range scopes, gather dates present in monthFiltered, sort chronologically, and display
      const allDates = Array.from(new Set(monthFiltered.map(r => {
        const d = r.registeredAt?.toDate ? r.registeredAt.toDate() : r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt ? new Date(r.createdAt) : null;
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
  }, [monthFiltered, selectedMonth]);

  const dayWiseTotals = React.useMemo(() => {
    const totals = { "Date": "Total", "Total Registrations": 0, "Attender Assisted": 0, "Direct Online": 0 };
    dayWiseTimeline.forEach(row => {
      totals["Total Registrations"] += row["Total Registrations"];
      totals["Attender Assisted"] += row["Attender Assisted"];
      totals["Direct Online"] += row["Direct Online"];
    });
    return totals;
  }, [dayWiseTimeline]);

  const attenderPerformance = React.useMemo(() => {
    const map = {};
    monthFiltered.forEach(r => {
      const name = r.convertedBy || r.attenderName;
      if (!name || name === "Unknown") return;
      if (!map[name]) {
        map[name] = { name, count: 0 };
      }
      map[name].count++;
    });

    return Object.values(map).map(a => ({
      "Attender Name": a.name,
      "Conversions Registered": a.count
    })).sort((a, b) => b["Conversions Registered"] - a["Conversions Registered"]);
  }, [monthFiltered]);

  const attenderPerformanceTotals = React.useMemo(() => {
    const totals = { "Attender Name": "Total", "Conversions Registered": 0 };
    attenderPerformance.forEach(row => {
      totals["Conversions Registered"] += row["Conversions Registered"];
    });
    return totals;
  }, [attenderPerformance]);

  const handleExport = () => {
    if (!monthFiltered.length) {
      toast.error("No registration data to export.");
      return;
    }
    const wb = XLSX.utils.book_new();

    // 1. Raw Data
    const rows = monthFiltered.map(r => {
      const { id, attenderId, contactId, history, _deleted, _callbackDue, isCallbackDue, isHotLead, callCount, ...rest } = r;
      const row = { ...rest };
      ["registeredAt", "createdAt", "updatedAt", "assignedAt", "importedAt"].forEach(k => {
        if (row[k]?.toDate) row[k] = row[k].toDate().toLocaleString("en-IN");
      });
      if (row.callbackDate?.toDate) row.callbackDate = row.callbackDate.toDate().toLocaleDateString("en-IN");
      const attendedBy = (r.attenderName && r.attenderName !== "Unknown") ? r.attenderName : ((r.convertedBy && r.convertedBy !== "Unknown") ? r.convertedBy : "Direct / Online");
      row["Attended By"] = attendedBy;
      return row;
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
          <button onClick={handleExport} disabled={!monthFiltered.length}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-sm transition-all disabled:opacity-50">
            <Download size={18} /> Export Workbook
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400 font-bold">Loading registrations database...</div>
      ) : monthFiltered.length === 0 ? (
        <div className="py-20 text-center text-gray-400 font-bold">No registration records found for this period.</div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {/* Summary Metric Cards */}
          <div className="md:col-span-1 space-y-6">
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
                <p className="text-sm font-bold text-gray-800 mt-1 truncate max-w-[170px]" title={metrics.highestDay}>{metrics.highestDay}</p>
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

          {/* Tables and Pivot lists */}
          <div className="md:col-span-2 space-y-6">
            {/* Source breakdown */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4">Registration Channels Distribution</h3>
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
            </div>

            {/* Attender Productivity */}
            {attenderPerformance.length > 0 && (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4">Attender Assisted Conversions</h3>
                <div className="overflow-x-auto rounded-2xl border border-gray-100">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3">Attender Name</th>
                        <th className="px-6 py-3 text-right">Conversions Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                      {attenderPerformance.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-3.5 font-bold text-gray-800">{r["Attender Name"]}</td>
                          <td className="px-6 py-3.5 text-right font-black text-emerald-600">{r["Conversions Registered"]}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50/70 border-t border-gray-100 font-bold text-gray-900">
                        <td className="px-6 py-4">Total Assisted</td>
                        <td className="px-6 py-4 text-right">{attenderPerformanceTotals["Conversions Registered"]}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Day Wise timeline */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4">Day-wise Timeline</h3>
              <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 bg-gray-50">Date</th>
                      <th className="px-6 py-3 bg-gray-50 text-right">Total Registrations</th>
                      <th className="px-6 py-3 bg-gray-50 text-right">Attender Assisted</th>
                      <th className="px-6 py-3 bg-gray-50 text-right">Direct Online</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                    {dayWiseTimeline.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-gray-800">{r["Date"]}</td>
                        <td className="px-6 py-3.5 text-right font-black text-indigo-600">{r["Total Registrations"]}</td>
                        <td className="px-6 py-3.5 text-right text-emerald-600">{r["Attender Assisted"]}</td>
                        <td className="px-6 py-3.5 text-right text-purple-600">{r["Direct Online"]}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50/70 border-t border-gray-100 font-bold text-gray-900 sticky bottom-0">
                      <td className="px-6 py-4 bg-gray-50">Total</td>
                      <td className="px-6 py-4 bg-gray-50 text-right">{dayWiseTotals["Total Registrations"]}</td>
                      <td className="px-6 py-4 bg-gray-50 text-right">{dayWiseTotals["Attender Assisted"]}</td>
                      <td className="px-6 py-4 bg-gray-50 text-right">{dayWiseTotals["Direct Online"]}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
