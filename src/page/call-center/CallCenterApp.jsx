import React, { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import { Heart, Settings, BarChart3, Users, FileSpreadsheet, ClipboardCheck, ChevronRight, UserCheck, Phone, Lock, Eye, EyeOff, ShieldCheck, User } from "lucide-react";
import { getAttenders, getAdminPassword, subscribeToCallCenterOptions } from "../../lib/db";
import { updateDynamicOptions } from "./attender/utils";
import AttenderView from "./attender/AttenderView";
import AdminPanel from "./admin/AdminPanel";
import CelebrationFeed from "./components/CelebrationFeed";

export default function CallCenterApp() {
  const [mode, setMode] = useState(null); // null | "attender" | "admin"
  const [activeTab, setActiveTab] = useState("attender"); // "attender" | "admin"
  const [attenders, setAttenders] = useState([]);
  const [selectedAttenderId, setSelectedAttenderId] = useState("");
  const [selectedAttenderName, setSelectedAttenderName] = useState("");
  const [attenderPassword, setAttenderPassword] = useState("");
  const [showAttenderPass, setShowAttenderPass] = useState(false);

  // Admin Auth State
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [optionsVersion, setOptionsVersion] = useState(0);

  useEffect(() => {
    load();
    const unsub = subscribeToCallCenterOptions((data) => {
      updateDynamicOptions(data);
      setOptionsVersion(v => v + 1);
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const load = async () => {
    try {
      const list = await getAttenders();
      setAttenders(list.filter(a => a.isActive));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load attenders: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Failed Attempt & Rate Limiting Lockout State
  const [attenderFailedCount, setAttenderFailedCount] = useState(0);
  const [attenderLockoutUntil, setAttenderLockoutUntil] = useState(0);
  const [adminFailedCount, setAdminFailedCount] = useState(0);
  const [adminLockoutUntil, setAdminLockoutUntil] = useState(0);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const attenderRemainingLockSecs = Math.max(0, Math.ceil((attenderLockoutUntil - currentTime) / 1000));
  const adminRemainingLockSecs = Math.max(0, Math.ceil((adminLockoutUntil - currentTime) / 1000));

  const handleAttenderStart = (e) => {
    if (e) e.preventDefault();
    if (attenderRemainingLockSecs > 0) {
      toast.error(`Too many failed attempts. Locked for ${attenderRemainingLockSecs}s.`);
      return;
    }
    if (!selectedAttenderId) { toast.error("Please select your name."); return; }
    
    const attenderObj = attenders.find(a => a.id === selectedAttenderId);
    if (!attenderObj) { toast.error("Attender not found."); return; }

    const inputTrimmed = String(attenderPassword || "").trim();
    if (!inputTrimmed) {
      toast.error("Please enter your 6-digit password.");
      return;
    }

    if (attenderObj.password && inputTrimmed !== String(attenderObj.password).trim()) {
      const nextFail = attenderFailedCount + 1;
      setAttenderFailedCount(nextFail);
      if (nextFail >= 5) {
        const lockoutTime = Date.now() + 60000;
        setAttenderLockoutUntil(lockoutTime);
        setAttenderFailedCount(0);
        toast.error("Too many failed attempts! Account locked for 60 seconds.", { duration: 6000 });
      } else {
        toast.error(`Incorrect password. ${5 - nextFail} attempt(s) remaining.`);
      }
      return;
    }

    setAttenderFailedCount(0);
    setAttenderLockoutUntil(0);
    toast.success(`Welcome back, ${attenderObj.name}!`);
    setMode("attender");
  };

  const handleAdminAuthSubmit = async (e) => {
    if (e) e.preventDefault();
    if (adminRemainingLockSecs > 0) {
      toast.error(`Too many failed attempts. Locked for ${adminRemainingLockSecs}s.`);
      return;
    }
    const inputTrimmed = String(adminPasswordInput || "").trim();
    if (!inputTrimmed) {
      toast.error("Please enter 6-digit admin password.");
      return;
    }

    setIsVerifyingAdmin(true);
    try {
      const realAdminPassword = await getAdminPassword();
      if (inputTrimmed === String(realAdminPassword).trim()) {
        setAdminFailedCount(0);
        setAdminLockoutUntil(0);
        toast.success("Admin access granted!");
        setAdminPasswordInput("");
        setMode("admin");
      } else {
        const nextFail = adminFailedCount + 1;
        setAdminFailedCount(nextFail);
        if (nextFail >= 5) {
          const lockoutTime = Date.now() + 60000;
          setAdminLockoutUntil(lockoutTime);
          setAdminFailedCount(0);
          toast.error("Too many failed attempts! Admin login locked for 60 seconds.", { duration: 6000 });
        } else {
          toast.error(`Incorrect Admin Password. ${5 - nextFail} attempt(s) remaining.`);
        }
      }
    } catch (err) {
      toast.error("Authentication error: " + err.message);
    } finally {
      setIsVerifyingAdmin(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium text-sm">Loading Call Center...</p>
        </div>
      </div>
    );
  }

  if (mode === "attender") {
    return (
      <>
        <Toaster position="top-right" />
        <CelebrationFeed />
        <AttenderView
          attenderId={selectedAttenderId}
          attenderName={selectedAttenderName}
          optionsVersion={optionsVersion}
          onExit={() => {
            setMode(null);
            setSelectedAttenderId("");
            setSelectedAttenderName("");
            setAttenderPassword("");
          }}
        />
      </>
    );
  }

  if (mode === "admin") {
    return (
      <>
        <Toaster position="top-right" />
        <CelebrationFeed />
        <AdminPanel onExit={() => setMode(null)} onAttendersChange={load} />
      </>
    );
  }

  // Unified Portal View
  return (
    <>
      <CelebrationFeed />
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient Glows */}
        <div className="absolute top-[-180px] left-[-180px] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-[-180px] right-[-180px] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="w-full max-w-md space-y-6 relative z-10">
          
          {/* Logo & Header */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20 mb-1 p-3">
              <Phone size={28} fill="white" className="text-white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">TGF Call Center</h1>
          </div>


          {/* Segmented Tab Switcher */}
          <div className="bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl grid grid-cols-2 gap-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => setActiveTab("attender")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === "attender"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <UserCheck size={16} /> Attender Portal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("admin")}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all ${
                activeTab === "admin"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <ShieldCheck size={16} /> Admin Panel
            </button>
          </div>

          {/* Card Content Area */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl transition-all">
            
            {/* ATTENDER TAB */}
            {activeTab === "attender" && (
              <form onSubmit={handleAttenderStart} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
                    <span>1. Select Your Name</span>
                    {selectedAttenderName && <span className="text-blue-400">{selectedAttenderName}</span>}
                  </label>
                  <div className="relative">
                    <select
                      value={selectedAttenderId}
                      onChange={e => {
                        setSelectedAttenderId(e.target.value);
                        const found = attenders.find(a => a.id === e.target.value);
                        setSelectedAttenderName(found?.name || "");
                        setAttenderPassword("");
                      }}
                      className="w-full px-4 py-3 bg-slate-800/90 border border-slate-700/80 rounded-2xl text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">-- Choose Name --</option>
                      {attenders.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                      ▼
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                    Enter 6-Digit Password
                  </label>
                  <div className="relative">
                    <input
                      type={showAttenderPass ? "text" : "password"}
                      maxLength={6}
                      disabled={!selectedAttenderId}
                      placeholder="••••••"
                      value={attenderPassword}
                      onChange={e => setAttenderPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/90 border border-slate-700/80 rounded-2xl text-white font-mono text-center text-lg tracking-[0.3em] font-bold placeholder:tracking-[0.2em] placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAttenderPass(!showAttenderPass)}
                      disabled={!selectedAttenderId}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {showAttenderPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>


                <button
                  type="submit"
                  disabled={!selectedAttenderId || !attenderPassword || attenderRemainingLockSecs > 0}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 pt-3.5 pb-3.5"
                >
                  {attenderRemainingLockSecs > 0 ? `🔒 Locked out (${attenderRemainingLockSecs}s)` : <>Start Calling <ChevronRight size={18} /></>}
                </button>
              </form>
            )}

            {/* ADMIN TAB */}
            {activeTab === "admin" && (
              <form onSubmit={handleAdminAuthSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                    Enter Admin Password
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminPass ? "text" : "password"}
                      maxLength={6}
                      autoFocus
                      disabled={adminRemainingLockSecs > 0}
                      placeholder="••••••"
                      value={adminPasswordInput}
                      onChange={e => setAdminPasswordInput(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/90 border border-slate-700/80 rounded-2xl text-white font-mono text-center text-lg tracking-[0.3em] font-bold placeholder:tracking-[0.2em] placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPass(!showAdminPass)}
                      disabled={adminRemainingLockSecs > 0}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {showAdminPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Features preview */}
                <div className="bg-slate-950/60 rounded-2xl p-3.5 border border-slate-800/80 space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Admin Capabilities</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 font-medium">
                    <div className="flex items-center gap-1.5"><FileSpreadsheet size={13} className="text-indigo-400" /> Worksheets</div>
                    <div className="flex items-center gap-1.5"><Users size={13} className="text-indigo-400" /> Attenders & PINs</div>
                    <div className="flex items-center gap-1.5"><BarChart3 size={13} className="text-indigo-400" /> Analytics</div>
                    <div className="flex items-center gap-1.5"><ClipboardCheck size={13} className="text-indigo-400" /> Reports</div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isVerifyingAdmin || !adminPasswordInput || adminRemainingLockSecs > 0}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 pt-3.5 pb-3.5"
                >
                  {adminRemainingLockSecs > 0 
                    ? `🔒 Locked out (${adminRemainingLockSecs}s)` 
                    : (isVerifyingAdmin ? "Verifying..." : <>Unlock Admin Panel <ChevronRight size={18} /></>)}
                </button>
              </form>
            )}

          </div>

        </div>
      </div>
      <Toaster position="top-right" />
    </>
  );
}
