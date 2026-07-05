import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { ShieldCheck, Tag, HelpCircle, Loader, RefreshCw, CheckCircle2, AlertTriangle, Activity } from "lucide-react";
import { OptionsManagerCard } from "./OptionsManagerCard";
import { getSettingsOptions, updateCallCenterOptions, rebuildCallCenterCache, verifyCallCenterCache } from "../../../../lib/db";

export default function SettingsTab() {
  const [options, setOptions] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  useEffect(() => {
    loadOptions();
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

  const handleAdd = async (type, val) => {
    const key = type === "status" ? "statusOptions" : type === "source" ? "sourceOptions" : "calledForOptions";
    const current = options[key] || [];
    if (current.includes(val)) return;

    const updated = [...current, val];
    try {
      await updateCallCenterOptions({ [key]: updated });
      setOptions(prev => ({ ...prev, [key]: updated }));
      toast.success(`Added option: ${val}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes: " + err.message);
    }
  };

  const handleDelete = async (type, val) => {
    const key = type === "status" ? "statusOptions" : type === "source" ? "sourceOptions" : "calledForOptions";
    const current = options[key] || [];
    
    // Prevent deleting core required status options to avoid database issues
    if (type === "status" && ["Reg.Done", "NA"].includes(val)) {
      toast.error(`Cannot delete required status: ${val}`);
      return;
    }

    const updated = current.filter(x => x !== val);
    try {
      await updateCallCenterOptions({ [key]: updated });
      setOptions(prev => ({ ...prev, [key]: updated }));
      toast.success(`Deleted option: ${val}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes: " + err.message);
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
          onAdd={(val) => handleAdd("status", val)}
          onDelete={(val) => handleDelete("status", val)}
        />
        <OptionsManagerCard
          title="Source Options"
          icon={Tag}
          options={options?.sourceOptions || []}
          onAdd={(val) => handleAdd("source", val)}
          onDelete={(val) => handleDelete("source", val)}
        />
        <OptionsManagerCard
          title="Called For Options"
          icon={HelpCircle}
          options={options?.calledForOptions || []}
          onAdd={(val) => handleAdd("calledFor", val)}
          onDelete={(val) => handleDelete("calledFor", val)}
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
    </div>
  );
}

