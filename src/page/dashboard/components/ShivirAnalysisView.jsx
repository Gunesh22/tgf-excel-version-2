import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { } from "../utils";

export const ShivirAnalysisView = ({ data, colsMap }) => {
    const { shivirCol } = colsMap;

    const stats = useMemo(() => {
        const counts = {};
        const displayLabel = {};
        data.forEach(r => {
            const raw = String(r[shivirCol] || "Unknown").replace(/[\s\u00A0\u200B\t]+/g, " ").trim();
            const key = raw.toLowerCase();
            if (!displayLabel[key]) displayLabel[key] = raw;
            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1])
            .map(([k, v]) => ({ shivir: displayLabel[k], leads: v, pct: ((v / data.length) * 100).toFixed(1) }));
    }, [data, shivirCol]);

    const barOpts = {
        chart: { type: "bar", toolbar: { show: false }, background: "transparent" },
        plotOptions: { bar: { horizontal: false, borderRadius: 4, distributed: true } },
        xaxis: { categories: stats.map(s => s.shivir), labels: { rotate: -45, style: { fontSize: "11px" } } },
        dataLabels: { enabled: false },
        legend: { show: false }
    };

    return (
        <div className="flex flex-col gap-6 p-8 h-[calc(100vh-64px)] overflow-hidden">
            <div className="flex flex-col gap-1 mb-2 shrink-0">
                <h1 className="text-2xl font-bold text-gray-900">Shivir Analysis Overview</h1>
                <p className="text-sm text-gray-500">Real-time performance metrics for all campaign types.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 min-w-0">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-[400px]">
                    <h3 className="font-semibold text-gray-900 mb-6">Leads by Shivir (Ranking)</h3>
                    <ReactApexChart type="bar" height="100%" series={[{ name: "Leads", data: stats.map(s => s.leads) }]} options={barOpts} />
                </div>

                <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden min-h-[400px]">
                    <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-wrap gap-4 items-center justify-between shrink-0">
                        <h3 className="font-semibold text-gray-900">Shivir Performance Ranking</h3>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr><th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">Shivir Name</th><th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">Total Interest</th><th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">% Share</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {stats.map(s => (
                                    <tr key={s.shivir} className="hover:bg-gray-50 transition-colors"><td className="py-3 px-4 text-sm text-gray-700 font-medium">{s.shivir}</td><td className="py-3 px-4 text-sm text-gray-700">{s.leads}</td><td className="py-3 px-4 text-sm text-center"><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">{s.pct}%</span></td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
