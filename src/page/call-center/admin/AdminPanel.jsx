import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Settings, ArrowLeft, ChevronRight, Loader } from "lucide-react";
import { getPrograms, getAttenders, subscribeToCallCenterOptions, subscribeToAllCallLogs, subscribeToRegistrations, getRegistrationMonths, runAutoLockAndPurgeCheck } from "../../../lib/db";
import { updateDynamicOptions } from "../attender/utils";
import ImportContacts from "../ImportContacts";
import { TAB_ITEMS } from "./utils.jsx";
import DashboardTab from "./components/DashboardTab";
import MonthlyReportTab from "./components/MonthlyReportTab";
import ProgramsTab from "./components/ProgramsTab";
import AttendersTab from "./components/AttendersTab";
import AbhivyaktiTab from "./components/AbhivyaktiTab";
import SettingsTab from "./components/SettingsTab";
import AllAttendersSheetTab from "./components/AllAttendersSheetTab";

export default function AdminPanel({ onExit, onAttendersChange }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [programs, setPrograms] = useState([]);
  const [attenders, setAttenders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsOptions, setSettingsOptions] = useState({ statusOptions: [], sourceOptions: [], calledForOptions: [] });

  const [callLogs, setCallLogs] = useState([]);
  const [callLogsLoading, setCallLogsLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [registrations, setRegistrations] = useState([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [monthOptions, setMonthOptions] = useState([]);

  useEffect(() => {
    loadAll();
    const unsub = subscribeToCallCenterOptions((data) => {
      setSettingsOptions(data);
      updateDynamicOptions(data);
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Hoisted subscription to all call logs
  useEffect(() => {
    if (!selectedMonth) return;
    setCallLogsLoading(true);
    const unsubLogs = subscribeToAllCallLogs("ALL", selectedMonth, (logs) => {
      setCallLogs(logs);
      setCallLogsLoading(false);
    });
    return () => {
      if (unsubLogs) unsubLogs();
    };
  }, [selectedMonth]);

  // Hoisted month loading logic
  useEffect(() => {
    const loadMonths = async () => {
      try {
        const months = await getRegistrationMonths();
        setMonthOptions(months);
        const rangeOptions = ["ALL"];
        if (months.length > 0 && !months.includes(selectedMonth) && !rangeOptions.includes(selectedMonth)) {
          setSelectedMonth(months[0]);
        }
      } catch (err) {
        console.error("Failed to load registration months", err);
      }
    };
    loadMonths();
  }, []);

  // Hoisted subscription to registrations — ALL months scope cached in IndexedDB
  useEffect(() => {
    if (activeTab !== "abhivyakti") return;
    setRegistrationsLoading(true);
    const unsubRegs = subscribeToRegistrations("ALL", (data) => {
      setRegistrations(data);
      setRegistrationsLoading(false);
    });
    return () => {
      if (unsubRegs) unsubRegs();
    };
  }, [activeTab]);

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
    <div className="flex flex-col md:flex-row h-screen bg-[#F0F2F5] font-sans overflow-hidden">
      {/* Mobile Top Header */}
      <div className="flex md:hidden flex-col bg-slate-950 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between p-3 border-b border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Settings size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-xs leading-none">Admin Panel</p>
              <p className="text-slate-500 text-[9px] font-medium mt-0.5">TGF Call Center</p>
            </div>
          </div>
          <button onClick={onExit} className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition">
            <ArrowLeft size={14} /> Exit
          </button>
        </div>
        {/* Horizontal Scrollable Tabs */}
        <div className="flex items-center gap-1.5 p-2 overflow-x-auto no-scrollbar">
          {TAB_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === item.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-950 flex-col h-full shrink-0">
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
      <main className="flex-1 overflow-hidden flex flex-col h-full">

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader size={32} className="text-indigo-500 animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === "dashboard" && (
                callLogsLoading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
                    <Loader size={32} className="text-indigo-500 animate-spin" />
                    <p className="text-slate-400 font-bold text-sm">Loading call database...</p>
                  </div>
                ) : (
                  <DashboardTab programs={programs} attenders={attenders} settingsOptions={settingsOptions} callLogs={callLogs} />
                )
              )}
              {activeTab === "all-attenders" && (
                <AllAttendersSheetTab
                  callLogs={callLogs}
                  attenders={attenders}
                  programs={programs}
                  selectedMonth={selectedMonth}
                  setSelectedMonth={setSelectedMonth}
                  monthOptions={monthOptions}
                  settingsOptions={settingsOptions}
                  callLogsLoading={callLogsLoading}
                />
              )}
              {activeTab === "monthly" && (
                callLogsLoading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
                    <Loader size={32} className="text-indigo-500 animate-spin" />
                    <p className="text-slate-400 font-bold text-sm">Loading call database...</p>
                  </div>
                ) : (
                  <MonthlyReportTab programs={programs} attenders={attenders} settingsOptions={settingsOptions} callLogs={callLogs} />
                )
              )}
              {activeTab === "programs" && <ProgramsTab programs={programs} attenders={attenders} onReloadPrograms={refreshAll} />}
              {activeTab === "import" && <ImportContacts programs={programs} onImportComplete={refreshAll} />}
              {activeTab === "attenders" && <AttendersTab attenders={attenders} programs={programs} onReloadAttenders={refreshAll} />}
              {activeTab === "abhivyakti" && (
                <AbhivyaktiTab
                  registrations={registrations}
                  loading={registrationsLoading}
                />
              )}
              {activeTab === "settings" && <SettingsTab />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
