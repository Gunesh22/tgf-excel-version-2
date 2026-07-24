import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { ShieldCheck, Tag, HelpCircle, Loader, RefreshCw, CheckCircle2, AlertTriangle, Activity, Archive } from "lucide-react";
import { OptionsManagerCard } from "./OptionsManagerCard";
import { 
  getSettingsOptions, 
  updateCallCenterOptions, 
  rebuildCallCenterCache, 
  verifyCallCenterCache,
  getActiveCacheMonths,
  getLockedMonthlyReports
} from "../../../../lib/db";

export default function SettingsTab() {
  const [options, setOptions] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [activeMonths, setActiveMonths] = useState([]);
  const [lockedMonths, setLockedMonths] = useState([]);
  const [isLoadingMonths, setIsLoadingMonths] = useState(false);

  useEffect(() => {
    loadOptions();
    loadMonths();
  }, []);

  const loadOptions = async () => {
    setIsLoading(true);
    try {
      const data = await getSettingsOptions();
      setOptions(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load settings: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMonths = async () => {
    setIsLoadingMonths(true);
    try {
      const active = await getActiveCacheMonths();
      const locked = await getLockedMonthlyReports();
      setActiveMonths(active);
      setLockedMonths(locked);
    } catch (err) {
      console.error("Failed to load months:", err);
    } finally {
      setIsLoadingMonths(false);
    }
  };

  const handleOptionChange = async (type, action, val) => {
    const key = type === "status" ? "statusOptions" : type === "source" ? "sourceOptions" : "calledForOptions";
    const current = options[key] || [];
    
    let updated;
    if (action === "delete") {
      if (type === "status" && ["Reg.Done", "NA"].includes(val)) {
        toast.error(`Cannot delete required status: ${val}`);
        return;
      }
      updated = current.filter(x => x !== val);
    } else {
      if (!val || !val.trim()) return;
      if (current.includes(val.trim())) {
        toast.error("Option already exists!");
        return;
      }
      updated = [...current, val.trim()];
    }

    try {
      await updateCallCenterOptions({ [key]: updated });
      setOptions(prev => ({
        ...prev,
        [key]: updated
      }));
      toast.success("Option updated successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update option: " + err.message);
    }
  };

  const handleVerifyCache = async () => {
    setIsVerifying(true);
    setVerificationResult(null);
    try {
      const res = await verifyCallCenterCache();
      setVerificationResult(res);
      if (res.status === "healthy") {
        toast.success("Cache is fully verified and matching perfectly!");
      } else if (res.status === "mismatch") {
        toast.error("Cache discrepancies found. Recommend rebuilding!");
      } else {
        toast("Cache verification complete: " + res.message);
      }
    } catch (err) {
      console.error(err);
      toast.error("Cache verification failed: " + err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRebuildCache = async () => {
    if (!window.confirm("Are you sure you want to force-rebuild the cache document? This will fetch all active contacts and reset the cache.")) {
      return;
    }
    setIsRebuilding(true);
    try {
      await rebuildCallCenterCache();
      toast.success("Cache document rebuilt successfully!");
      setVerificationResult(null);
    } catch (err) {
      console.error(err);
      toast.error("Cache rebuild failed: " + err.message);
    } finally {
      setIsRebuilding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader size={32} className="text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-xl font-black text-gray-900">Call Center Options</h2>
        <p className="text-xs text-gray-400 font-medium mt-0.5">Configure dropdown values for Attenders globally.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <OptionsManagerCard
          title="Status Options"
          icon={ShieldCheck}
          options={options?.statusOptions || []}
          onAdd={(val) => handleOptionChange("status", "add", val)}
          onDelete={(val) => handleOptionChange("status", "delete", val)}
        />
        <OptionsManagerCard
          title="Source Options"
          icon={Tag}
          options={options?.sourceOptions || []}
          onAdd={(val) => handleOptionChange("source", "add", val)}
          onDelete={(val) => handleOptionChange("source", "delete", val)}
        />
        <OptionsManagerCard
          title="Called For Options"
          icon={HelpCircle}
          options={options?.calledForOptions || []}
          onAdd={(val) => handleOptionChange("calledFor", "add", val)}
          onDelete={(val) => handleOptionChange("calledFor", "delete", val)}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity size={20} className="text-indigo-600 animate-pulse" />
              <h3 className="font-bold text-gray-900 text-base">Database Cache & Performance Health</h3>
            </div>
            <p className="text-xs text-gray-400 font-medium">
              Validate or force-rebuild the single-document cloud cache used to load the Admin Dashboard and reports in exactly 1 read.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleVerifyCache}
              disabled={isVerifying || isRebuilding}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isVerifying ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Verify Cache Health
            </button>
            <button
              onClick={handleRebuildCache}
              disabled={isVerifying || isRebuilding}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isRebuilding ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Force Rebuild Cache
            </button>
          </div>
        </div>

        {verificationResult && (
          <div className={`p-4 rounded-xl border flex gap-3 text-xs leading-relaxed transition-all ${
            verificationResult.status === "healthy" 
              ? "bg-emerald-50/50 border-emerald-100 text-emerald-800" 
              : verificationResult.status === "mismatch"
              ? "bg-rose-50/50 border-rose-100 text-rose-800"
              : "bg-amber-50/50 border-amber-100 text-amber-800"
          }`}>
            <div className="mt-0.5">
              {verificationResult.status === "healthy" ? (
                <CheckCircle2 size={18} className="text-emerald-600" />
              ) : (
                <AlertTriangle size={18} className="text-rose-600" />
              )}
            </div>
            <div className="space-y-2 flex-1">
              <div className="font-bold flex items-center gap-2">
                Cache Status: {verificationResult.status.toUpperCase()}
              </div>
              <p className="font-medium opacity-90">{verificationResult.message}</p>
              
              {verificationResult.liveCount !== undefined && (
                <div className="text-[10px] font-bold tracking-wider uppercase opacity-75">
                  Verified {verificationResult.liveCount} contacts in database.
                </div>
              )}

              {verificationResult.mismatches && verificationResult.mismatches.length > 0 && (
                <div className="mt-3 space-y-1 bg-white p-3 rounded-lg border border-rose-100 max-h-48 overflow-y-auto">
                  <div className="font-bold text-rose-900 mb-1">Details (First 10):</div>
                  {verificationResult.mismatches.map((m, idx) => (
                    <div key={idx} className="font-mono text-[10px] text-rose-700">• {m}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Archive size={20} className="text-indigo-600" />
            <h3 className="font-bold text-gray-900 text-base">Archive & Purge Historical Call Logs</h3>
          </div>
          <p className="text-xs text-gray-400 font-medium">
            Historical call logs are automatically locked at the end of each month into static snapshots, and raw entries are purged from the database to optimize space.
          </p>
        </div>

        {isLoadingMonths ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
            <Loader size={16} className="animate-spin text-indigo-500" />
            Loading historical months...
          </div>
        ) : (
          <div className="overflow-hidden border border-gray-100 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-600 font-semibold">
                  <th className="p-3">Month</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeMonths.map(month => (
                  <tr key={month} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-3 font-bold text-gray-900">{month}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                        Active Month
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 font-medium">Live logs. Will be archived automatically at the end of the month.</td>
                  </tr>
                ))}

                {lockedMonths.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/50 bg-gray-50/20 transition-colors">
                    <td className="p-3 font-bold text-gray-900">{item.month}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Archived & Locked
                      </span>
                    </td>
                    <td className="p-3 text-gray-500">
                      Locked automatically by {item.lockedBy || "System"} on {item.lockedAt ? new Date(item.lockedAt).toLocaleDateString() : "month end"}. Contains {item.contactCount} contacts in {item.parts || 1} part(s). Raw logs purged.
                    </td>
                  </tr>
                ))}

                {activeMonths.length === 0 && lockedMonths.length === 0 && (
                  <tr>
                    <td colSpan="3" className="p-6 text-center text-gray-400 font-medium">
                      No historical months found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

