import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Settings, ArrowLeft, ChevronRight, Loader } from "lucide-react";
import { getPrograms, getAttenders, subscribeToCallCenterOptions } from "../../../lib/db";
import ImportContacts from "../ImportContacts";
import { TAB_ITEMS } from "./utils.jsx";
import DashboardTab from "./components/DashboardTab";
import MonthlyReportTab from "./components/MonthlyReportTab";
import ProgramsTab from "./components/ProgramsTab";
import AttendersTab from "./components/AttendersTab";
import AbhivyaktiTab from "./components/AbhivyaktiTab";
import SettingsTab from "./components/SettingsTab";

export default function AdminPanel({ onExit, onAttendersChange }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [programs, setPrograms] = useState([]);
  const [attenders, setAttenders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsOptions, setSettingsOptions] = useState({ statusOptions: [], sourceOptions: [], calledForOptions: [] });

  useEffect(() => {
    loadAll();
    const unsub = subscribeToCallCenterOptions((data) => {
      setSettingsOptions(data);
    });
    return () => {
      if (unsub) unsub();
    };
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader size={32} className="text-indigo-500 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === "dashboard" && <DashboardTab programs={programs} attenders={attenders} settingsOptions={settingsOptions} />}
            {activeTab === "monthly" && <MonthlyReportTab programs={programs} attenders={attenders} settingsOptions={settingsOptions} />}
            {activeTab === "programs" && <ProgramsTab programs={programs} attenders={attenders} onReloadPrograms={refreshAll} />}
            {activeTab === "import" && <ImportContacts programs={programs} onImportComplete={refreshAll} />}
            {activeTab === "attenders" && <AttendersTab attenders={attenders} programs={programs} onReloadAttenders={refreshAll} />}
            {activeTab === "abhivyakti" && <AbhivyaktiTab />}
            {activeTab === "settings" && <SettingsTab />}
          </>
        )}
      </main>
    </div>
  );
}
