import React, { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import { Heart, Settings, BarChart3, Users, FileSpreadsheet, ClipboardCheck, ChevronRight, Layers, UserCheck, Phone } from "lucide-react";
import { getAttenders, subscribeToCallCenterOptions } from "../../lib/db";
import { updateDynamicOptions } from "./attender/utils";
import AttenderView from "./attender/AttenderView";
import AdminPanel from "./admin/AdminPanel";
import CelebrationFeed from "./components/CelebrationFeed";

export default function CallCenterApp() {
  const [mode, setMode] = useState(null); // null | "attender" | "admin"
  const [attenders, setAttenders] = useState([]);
  const [selectedAttenderId, setSelectedAttenderId] = useState("");
  const [selectedAttenderName, setSelectedAttenderName] = useState("");
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

  const handleAttenderStart = () => {
    if (!selectedAttenderId) { toast.error("Please select your name."); return; }
    setMode("attender");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium">Loading...</p>
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
          onExit={() => { setMode(null); setSelectedAttenderId(""); setSelectedAttenderName(""); }}
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

  // Landing / role selector
  return (
    <>
      <CelebrationFeed />
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background glows */}
      <div className="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[140px]" />
      <div className="absolute bottom-[-200px] right-[-200px] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px]" />

      {/* Logo */}
      <div className="flex items-center gap-3 mb-12">
        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/30">
          <Phone size={28} fill="white" className="text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">TGF Call Center</h1>
          <p className="text-slate-500 font-medium text-sm">Happy Thoughts Foundation</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 w-full max-w-2xl">
        {/* Attender Entry */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col gap-6 hover:border-blue-500/50 transition-all duration-300 group">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors duration-300">
              <UserCheck size={24} />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">I'm an Attender</h2>
              <p className="text-slate-500 text-xs">Start calling contacts</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Your Name</label>
            <select
              value={selectedAttenderId}
              onChange={e => {
                setSelectedAttenderId(e.target.value);
                const found = attenders.find(a => a.id === e.target.value);
                setSelectedAttenderName(found?.name || "");
              }}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Name --</option>
              {attenders.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleAttenderStart}
            disabled={!selectedAttenderId}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
          >
            Start Calling <ChevronRight size={18} />
          </button>
        </div>

        {/* Admin Entry */}
        <div
          onClick={() => setMode("admin")}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col gap-4 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors duration-300">
              <Settings size={24} />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Admin Panel</h2>
              <p className="text-slate-500 text-xs">Manage data & view reports</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            {[
              { icon: <FileSpreadsheet size={16} />, text: "Upload & manage programs" },
              { icon: <Users size={16} />, text: "Manage attenders" },
              { icon: <BarChart3 size={16} />, text: "Live dashboard & analytics" },
              { icon: <ClipboardCheck size={16} />, text: "Abhivyakti registration report" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-slate-400 text-sm">
                <span className="text-indigo-400">{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4">
            <div className="w-full py-3 bg-indigo-600/10 text-indigo-400 font-bold rounded-2xl flex items-center justify-center gap-2 group-hover:bg-indigo-600 group-hover:text-white transition-all">
              Open Admin Panel <ChevronRight size={18} />
            </div>
          </div>
        </div>
      </div>
    </div>
    <Toaster position="top-right" />
    </>
  );
}
