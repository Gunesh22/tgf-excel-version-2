import React from "react";
import { User, Phone, CheckCircle2, Flame } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

export const MyPerformanceDashboard = ({ stats }) => {
  const COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6 space-y-6">
      {/* Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Assigned Contacts", value: stats.assignedCount, icon: <User size={18} />, color: "border-l-indigo-500", text: "text-indigo-600" },
          { label: "Total Attempts", value: stats.totalAttempts, icon: <Phone size={18} />, color: "border-l-blue-500", text: "text-blue-600" },
          { label: "Connection Rate", value: stats.connectionRate + "%", icon: <CheckCircle2 size={18} />, color: "border-l-emerald-500", text: "text-emerald-600" },
          { label: "Conversion Rate", value: stats.registrationRate + "%", icon: <Flame size={18} />, color: "border-l-orange-500", text: "text-orange-500" },
        ].map((k, i) => (
          <div key={i} className={`bg-white rounded-2xl p-5 border border-gray-100 border-l-4 shadow-sm flex items-center justify-between ${k.color}`}>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{k.label}</p>
              <p className="text-3xl font-black text-slate-800 mt-1">{k.value}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center ${k.text}`}>
              {k.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Status distribution */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col h-[350px]">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4">Status Distribution</h3>
          {stats.statusChartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 font-bold">No calls logged yet.</div>
          ) : (
            <div className="flex-1 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stats.statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} contacts`, 'Status']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-800">{stats.connectedContacts}</span>
                <span className="text-[10px] text-gray-400 uppercase font-black">Connected</span>
              </div>
            </div>
          )}
        </div>

        {/* Middle column - Timeline */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col h-[350px] lg:col-span-2">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4">Day-wise Timeline (Attempts)</h3>
          {stats.dailyChartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 font-bold">No activity recorded.</div>
          ) : (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(226, 232, 240, 0.3)' }} formatter={(value) => [`${value} calls`, 'Attempts']} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Objection details */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4">Objections Logged</h3>
          {stats.objectionChartData.length === 0 ? (
            <p className="text-sm text-gray-400 font-bold py-4">No objections recorded for this period.</p>
          ) : (
            <div className="space-y-3">
              {stats.objectionChartData.map((obj, i) => {
                const percent = Math.round((obj.value / stats.assignedCount) * 100);
                return (
                  <div key={i} className="flex flex-col">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1">
                      <span>{obj.name}</span>
                      <span>{obj.value} ({percent}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Connection efficiency metrics */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Call Sheet Performance Analysis</h3>
          <div className="divide-y divide-gray-100">
            {[
              { label: "Average attempts per contact", value: stats.callsPerAssign, desc: "Total attempts divided by total unique assigned contacts." },
              { label: "Successful Connections", value: stats.connectedContacts, desc: "Contacts that were successfully spoken to." },
              { label: "Pending (Not called)", value: stats.assignedCount - stats.connectedContacts - stats.notConnectedContacts, desc: "Contacts waiting for first call or callback." },
              { label: "Total Registrations", value: stats.registrations, desc: "Conversations that ended with successful registration." }
            ].map((m, i) => (
              <div key={i} className="py-3 flex justify-between items-start gap-4">
                <div>
                  <p className="text-xs font-black text-slate-700">{m.label}</p>
                  <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{m.desc}</p>
                </div>
                <span className="text-lg font-black text-slate-800 whitespace-nowrap">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
