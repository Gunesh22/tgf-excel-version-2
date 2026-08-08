import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { ShieldCheck, Key, Eye, EyeOff, Copy, Check, RotateCcw, Lock } from "lucide-react";
import { getAdminPassword, setAdminPassword, generateRandomPassword } from "../../../../lib/db";

export function AdminPasswordCard({ highlighted = true }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchCurrentAdminPassword();
  }, []);

  const fetchCurrentAdminPassword = async () => {
    try {
      const pass = await getAdminPassword();
      setCurrentPassword(pass);
    } catch (err) {
      console.error("Failed to load admin password", err);
    }
  };

  const handleUpdatePassword = async (e) => {
    if (e) e.preventDefault();
    const trimmed = newPassword.trim();
    if (!trimmed) {
      toast.error("Please enter a new password.");
      return;
    }

    if (trimmed.length < 4) {
      toast.error("Password should be at least 4 characters long.");
      return;
    }

    setIsUpdating(true);
    try {
      await setAdminPassword(trimmed);
      setCurrentPassword(trimmed);
      setNewPassword("");
      toast.success("Admin password updated successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update admin password: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopy = () => {
    if (!currentPassword) return;
    navigator.clipboard.writeText(currentPassword);
    setCopied(true);
    toast.success("Admin password copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-3xl p-5 shadow-sm border transition-all max-w-xl ${
      highlighted
        ? "bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white border-indigo-500/40 shadow-indigo-900/20"
        : "bg-white border-gray-100 text-gray-800"
    }`}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
            highlighted ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" : "bg-indigo-50 text-indigo-600"
          }`}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-black text-base ${highlighted ? "text-white" : "text-gray-900"}`}>
                Admin Security & Password
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500 text-white shadow-xs">
                Admin Only
              </span>
            </div>
            <p className={`text-xs ${highlighted ? "text-slate-400" : "text-gray-400"}`}>
              Change the 6-digit master passcode required to unlock Admin Panel.
            </p>
          </div>
        </div>
      </div>

      {/* Current Password Bar */}
      <div className={`p-3.5 rounded-2xl border mb-5 flex items-center justify-between ${
        highlighted ? "bg-slate-900/90 border-slate-800" : "bg-slate-50 border-slate-200/80"
      }`}>
        <div className="flex items-center gap-2">
          <Key size={16} className={highlighted ? "text-indigo-400" : "text-indigo-600"} />
          <span className={`text-xs font-bold ${highlighted ? "text-slate-300" : "text-gray-600"}`}>Current Admin Passcode:</span>
          <span className={`font-mono text-sm font-black tracking-widest ${highlighted ? "text-white" : "text-gray-900"}`}>
            {showCurrentPass ? currentPassword || "123456" : "••••••"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowCurrentPass(!showCurrentPass)}
            className={`p-1.5 rounded-xl transition ${
              highlighted ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-gray-200 text-gray-500"
            }`}
            title={showCurrentPass ? "Hide password" : "Show password"}
          >
            {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition ${
              highlighted
                ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
            }`}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Change Password Form */}
      <form onSubmit={handleUpdatePassword} className="space-y-3">
        <label className={`block text-xs font-bold uppercase tracking-wider ${
          highlighted ? "text-slate-400" : "text-gray-400"
        }`}>
          Set New Admin Password
        </label>
        
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showNewPass ? "text" : "password"}
              maxLength={6}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new 6-digit PIN"
              className={`w-full px-4 py-2.5 rounded-2xl text-sm font-mono tracking-widest font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                highlighted
                  ? "bg-slate-900 border border-slate-800 text-white placeholder:text-slate-600"
                  : "bg-slate-50 border border-slate-200 text-gray-900 placeholder:text-gray-400"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowNewPass(!showNewPass)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${
                highlighted ? "text-slate-400 hover:text-white" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const r = generateRandomPassword();
              setNewPassword(r);
              setShowNewPass(true);
            }}
            className={`px-3 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition ${
              highlighted
                ? "bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30"
                : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600"
            }`}
            title="Generate random 6-digit PIN"
          >
            <RotateCcw size={14} /> Auto-PIN
          </button>
        </div>

        <button
          type="submit"
          disabled={isUpdating || !newPassword.trim()}
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition"
        >
          <Lock size={15} />
          {isUpdating ? "Updating..." : "Save Admin Password"}
        </button>
      </form>
    </div>
  );
}
