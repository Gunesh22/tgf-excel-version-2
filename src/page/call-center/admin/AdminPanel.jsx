import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Settings, ArrowLeft, ChevronRight, Loader, RefreshCw, Database } from "lucide-react";
import { getPrograms, getAttenders, getSettingsOptions, subscribeToAllCallLogs, subscribeToRegistrations, getRegistrationMonths, runAutoLockAndPurgeCheck, clearAdminIDBCache, rebuildCallCenterCache } from "../../../lib/db";
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRebuildingCache, setIsRebuildingCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [nextFetchIn, setNextFetchIn] = useState(45);
  const [settingsOptions, setSettingsOptions] = useState({ statusOptions: [], sourceOptions: [], calledForOptions: [] });

  // Live 1-second ticker counting exact elapsed seconds & countdown to next 45s fetch
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000);
      setSecondsAgo(elapsed);
      const remaining = Math.max(0, 45 - (elapsed % 45));
      setNextFetchIn(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastSyncedAt]);

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
    getSettingsOptions()
      .then((data) => {
        if (data) {
          setSettingsOptions(data);
          updateDynamicOptions(data);
        }
      })
      .catch(() => {});
  }, []);

  // Periodic 45-second background sync cycle
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log("[ADMIN BACKGROUND SYNC] 45s periodic background sync running...");
      loadAllSilently();
    }, 45000);
    return () => clearInterval(intervalId);
  }, []);

  const loadAllSilently = async () => {
    try {
      console.log("[ADMIN BACKGROUND SYNC] Executing silent 45s metadata refresh...");
      const [progs, atts] = await Promise.all([getPrograms(), getAttenders()]);
      setPrograms(progs);
      setAttenders(atts);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.warn("[ADMIN BACKGROUND SYNC] Silent sync failed:", err);
    }
  };

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Hoisted subscription to all call logs
  useEffect(() => {
    if (!selectedMonth) return;
    setCallLogsLoading(true);
    const unsubLogs = subscribeToAllCallLogs("ALL", selectedMonth, (logs) => {
      setCallLogs(logs);
      setCallLogsLoading(false);
      setLastSyncedAt(new Date());
    }, refreshTrigger > 0);
    return () => {
      if (unsubLogs) unsubLogs();
    };
  }, [selectedMonth, refreshTrigger]);

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
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error(err);
      toast.error("Failed to load data: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    const toastId = toast.loading("Clearing cache & fetching fresh data from server...");
    try {
      // Clear local IndexedDB cache for admin call logs to ensure server fresh state
      await clearAdminIDBCache();

      const [progs, atts] = await Promise.all([getPrograms(), getAttenders()]);
      setPrograms(progs);
      setAttenders(atts);

      // Cleanly trigger re-subscription to call logs
      setRefreshTrigger(prev => prev + 1);

      if (onAttendersChange) onAttendersChange();
      setLastSyncedAt(new Date());
      toast.success(`Refreshed ${progs.length} programs & ${atts.length} attenders directly from server!`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Refresh failed: " + err.message, { id: toastId });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleForceRebuildCache = async () => {
    if (!window.confirm("Are you sure you want to rebuild the call center cache from master records? This will update all partition documents.")) {
      return;
    }
    setIsRebuildingCache(true);
    const toastId = toast.loading("Rebuilding call center cache from master contacts...");
    try {
      const res = await rebuildCallCenterCache(false, true);
      await clearAdminIDBCache();

      setRefreshTrigger(prev => prev + 1);

      toast.success(`Cache rebuilt successfully! (${res.totalContacts || 0} contacts in ${res.newPartsCount || 0} partitions)`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Cache rebuild failed: " + err.message, { id: toastId });
    } finally {
      setIsRebuildingCache(false);
    }
  };

  const refreshAll = async () => {
    await loadAll();
    if (onAttendersChange) onAttendersChange();
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Mobile Top Header */}
      <div className="flex md:hidden flex-col bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between p-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <Settings size={16} />
            </div>
            <div>
              <p className="text-slate-900 font-bold text-xs leading-none">Admin Panel</p>
              <p className="text-slate-500 text-[10px] font-medium mt-0.5">TGF Operations V2</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || isRebuildingCache}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-medium transition disabled:opacity-50 border border-slate-200 cursor-pointer"
              title="Clear Local IDB Cache & Refresh"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin text-indigo-600" : ""} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleForceRebuildCache}
              disabled={isRebuildingCache || isRefreshing}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium transition disabled:opacity-50 cursor-pointer"
              title="Force Rebuild Call Center Cache"
            >
              <Database size={13} className={isRebuildingCache ? "animate-spin text-amber-600" : ""} />
              <span>Rebuild</span>
            </button>
            <button onClick={onExit} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-medium transition border border-slate-200 cursor-pointer">
              <ArrowLeft size={13} /> Exit
            </button>
          </div>
        </div>
        {/* Horizontal Scrollable Tabs */}
        <div className="flex items-center gap-1 p-2 overflow-x-auto no-scrollbar">
          {TAB_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === item.id
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 bg-white border-r border-slate-200 flex-col h-full shrink-0 shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-xs">
              <Settings size={17} />
            </div>
            <div>
              <p className="text-slate-900 font-bold text-sm leading-none">Admin Panel</p>
              <p className="text-slate-500 text-[10px] font-medium mt-0.5">TGF Management V2</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || isRebuildingCache}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-lg transition border border-slate-200 cursor-pointer"
              title="Clear Local Cache & Refresh Data"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin text-indigo-600" : ""} />
            </button>
            <button
              onClick={handleForceRebuildCache}
              disabled={isRebuildingCache || isRefreshing}
              className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition border border-amber-200 cursor-pointer"
              title="Force Rebuild Partition Cache"
            >
              <Database size={14} className={isRebuildingCache ? "animate-spin text-amber-600" : ""} />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {TAB_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === item.id
                  ? "bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span className={activeTab === item.id ? "text-indigo-600" : "text-slate-400"}>
                {item.icon}
              </span>
              {item.label}
              {activeTab === item.id && <ChevronRight size={13} className="ml-auto text-indigo-600" />}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <button onClick={onExit} className="w-full flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-medium transition cursor-pointer">
            <ArrowLeft size={15} /> Back to Portal
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col h-full bg-slate-50">

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader size={28} className="text-indigo-600 animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === "dashboard" && (
                callLogsLoading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 py-20">
                    <Loader size={28} className="text-indigo-600 animate-spin" />
                    <p className="text-slate-500 font-semibold text-xs">Loading call database...</p>
                  </div>
                ) : (
                  <DashboardTab
                    programs={programs}
                    attenders={attenders}
                    settingsOptions={settingsOptions}
                    callLogs={callLogs}
                    registrations={registrations}
                    lastSyncedAt={lastSyncedAt}
                    secondsAgo={secondsAgo}
                    nextFetchIn={nextFetchIn}
                  />
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
                  <div className="h-full flex flex-col items-center justify-center gap-3 py-20">
                    <Loader size={28} className="text-indigo-600 animate-spin" />
                    <p className="text-slate-500 font-semibold text-xs">Loading call database...</p>
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
