import React, { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import { Heart, Settings, BarChart3, Users, FileSpreadsheet, ClipboardCheck, ChevronRight, UserCheck, Phone, Lock, Eye, EyeOff, ShieldCheck, User } from "lucide-react";
import { getAttenders, getAdminPassword, getSettingsOptions } from "../../lib/db";
import { updateDynamicOptions } from "./attender/utils";
import AttenderView from "./attender/AttenderView";
import AdminPanel from "./admin/AdminPanel";

const SESSION_KEY = "tgf_user_session";

export default function CallCenterApp() {
  const [mode, setMode] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.mode === "attender" && parsed.attenderId) return "attender";
        if (parsed.mode === "admin") return "admin";
      }
    } catch (e) {}
    return null;
  });
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.mode === "admin") return "admin";
      }
    } catch (e) {}
    return "attender";
  });
  const [attenders, setAttenders] = useState([]);
  const [selectedAttenderId, setSelectedAttenderId] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.mode === "attender" && parsed.attenderId) return parsed.attenderId;
      }
    } catch (e) {}
    return "";
  });
  const [selectedAttenderName, setSelectedAttenderName] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.mode === "attender" && parsed.attenderName) return parsed.attenderName;
      }
    } catch (e) {}
    return "";
  });
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
    getSettingsOptions()
      .then(data => {
        if (data) {
          updateDynamicOptions(data);
          setOptionsVersion(v => v + 1);
        }
      })
      .catch(err => console.warn("Failed to load call center options:", err));
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
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        mode: "attender",
        attenderId: selectedAttenderId,
        attenderName: attenderObj.name
      }));
    } catch (e) {}
    setSelectedAttenderName(attenderObj.name);
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
        setAdminPasswordInput("");
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify({ mode: "admin" }));
        } catch (e) {}
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 font-medium text-xs tracking-wide">Loading Call Center Workspace...</p>
        </div>
      </div>
    );
  }

  if (mode === "attender") {
    return (
      <>
        <Toaster position="top-right" />
        <AttenderView
          attenderId={selectedAttenderId}
          attenderName={selectedAttenderName}
          optionsVersion={optionsVersion}
          onExit={() => {
            try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
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
        <AdminPanel
          onExit={() => {
            try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
            setMode(null);
          }}
          onAttendersChange={load}
        />
      </>
    );
  }

  // Unified Portal View - V2 Professional SaaS Light Mode
  return (
    <>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-4 relative font-sans">
        
        <div className="w-full max-w-md space-y-5 relative z-10">
          
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center space-y-1.5">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm text-white mb-0.5">
              <Phone size={24} fill="currentColor" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">TGF Call Center</h1>
            <p className="text-xs text-slate-500 font-medium">Internal Operations & Lead Management V2</p>
          </div>

          {/* Segmented Tab Switcher */}
          <div className="bg-slate-200/70 p-1 rounded-xl grid grid-cols-2 gap-1 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveTab("attender")}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg font-semibold text-xs transition-all ${
                activeTab === "attender"
                  ? "bg-white text-blue-700 shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <UserCheck size={15} /> Attender Portal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("admin")}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg font-semibold text-xs transition-all ${
                activeTab === "admin"
                  ? "bg-white text-indigo-700 shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <ShieldCheck size={15} /> Admin Panel
            </button>
          </div>

          {/* Login Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            
            {/* ATTENDER TAB */}
            {activeTab === "attender" && (
              <form onSubmit={handleAttenderStart} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Select Your Name
                    </label>
                    {selectedAttenderName && (
                      <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                        {selectedAttenderName}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      value={selectedAttenderId}
                      onChange={e => {
                        setSelectedAttenderId(e.target.value);
                        const found = attenders.find(a => a.id === e.target.value);
                        setSelectedAttenderName(found?.name || "");
                        setAttenderPassword("");
                      }}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">-- Select Attender Account --</option>
                      {attenders.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                      ▼
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    6-Digit Security PIN
                  </label>
                  <div className="relative">
                    <input
                      type={showAttenderPass ? "text" : "password"}
                      maxLength={6}
                      disabled={!selectedAttenderId}
                      placeholder="••••••"
                      value={attenderPassword}
                      onChange={e => setAttenderPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-center text-lg tracking-[0.3em] font-bold placeholder:tracking-[0.2em] placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAttenderPass(!showAttenderPass)}
                      disabled={!selectedAttenderId}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors p-1"
                    >
                      {showAttenderPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!selectedAttenderId || !attenderPassword || attenderRemainingLockSecs > 0}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm rounded-lg transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  {attenderRemainingLockSecs > 0 ? `🔒 Locked out (${attenderRemainingLockSecs}s)` : <>Start Calling Session <ChevronRight size={16} /></>}
                </button>
              </form>
            )}

            {/* ADMIN TAB */}
            {activeTab === "admin" && (
              <form onSubmit={handleAdminAuthSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Admin Access PIN
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
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-center text-lg tracking-[0.3em] font-bold placeholder:tracking-[0.2em] placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPass(!showAdminPass)}
                      disabled={adminRemainingLockSecs > 0}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors p-1"
                    >
                      {showAdminPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Capabilities preview */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Admin Privileges</span>
                  <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-700 font-medium">
                    <div className="flex items-center gap-1.5"><FileSpreadsheet size={13} className="text-indigo-600" /> Lead Worksheets</div>
                    <div className="flex items-center gap-1.5"><Users size={13} className="text-indigo-600" /> Attender Accounts</div>
                    <div className="flex items-center gap-1.5"><BarChart3 size={13} className="text-indigo-600" /> Real-time Analytics</div>
                    <div className="flex items-center gap-1.5"><ClipboardCheck size={13} className="text-indigo-600" /> EOD Reports</div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isVerifyingAdmin || !adminPasswordInput || adminRemainingLockSecs > 0}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm rounded-lg transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  {adminRemainingLockSecs > 0 
                    ? `🔒 Locked out (${adminRemainingLockSecs}s)` 
                    : (isVerifyingAdmin ? "Verifying PIN..." : <>Open Admin Panel <ChevronRight size={16} /></>)}
                </button>
              </form>
            )}

          </div>

          <div className="text-center">
            <p className="text-[11px] text-slate-400 font-medium">TGF Management System • Modern SaaS V2</p>
          </div>

        </div>
      </div>
      <Toaster position="top-right" />
    </>
  );
}

