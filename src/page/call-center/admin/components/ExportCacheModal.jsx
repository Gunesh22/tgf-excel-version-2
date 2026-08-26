import React, { useState, useEffect } from "react";
import { 
  Download, 
  X, 
  Calendar, 
  Database, 
  Clock, 
  Layers, 
  Loader, 
  CheckCircle2, 
  Sparkles,
  ArrowRight
} from "lucide-react";
import toast from "react-hot-toast";
import { exportCallCenterCacheToJson, getCachePartitionsDetail } from "../../../../lib/db";

export default function ExportCacheModal({ isOpen, onClose }) {
  const [duration, setDuration] = useState("all"); // 'all' | 'current_month' | 'last_3_months' | 'last_6_months' | 'custom'
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [partitionDetails, setPartitionDetails] = useState([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPartitionDetails();
      // Set default start/end months
      const now = new Date();
      const curStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      setEndMonth(curStr);
      
      const prevStr = `${now.getFullYear()}-01`;
      setStartMonth(prevStr);
    }
  }, [isOpen]);

  const loadPartitionDetails = async () => {
    setIsLoadingDetails(true);
    try {
      const details = await getCachePartitionsDetail();
      setPartitionDetails(details || []);
    } catch (err) {
      console.error("Failed to fetch partition details:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  if (!isOpen) return null;

  // Calculate matching partitions count based on selected duration
  const getMatchingPartitions = () => {
    if (!partitionDetails || partitionDetails.length === 0) return [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let targetMonths = new Set();

    if (duration === "current_month") {
      targetMonths.add(`${currentYear}-${String(currentMonth).padStart(2, "0")}`);
    } else if (duration === "last_3_months") {
      for (let i = 0; i < 3; i++) {
        const d = new Date(currentYear, currentMonth - 1 - i, 1);
        targetMonths.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    } else if (duration === "last_6_months") {
      for (let i = 0; i < 6; i++) {
        const d = new Date(currentYear, currentMonth - 1 - i, 1);
        targetMonths.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    } else if (duration === "custom") {
      if (startMonth && endMonth) {
        const [sY, sM] = startMonth.split("-").map(Number);
        const [eY, eM] = endMonth.split("-").map(Number);
        let curr = new Date(sY, sM - 1, 1);
        const end = new Date(eY, eM - 1, 1);
        while (curr <= end) {
          targetMonths.add(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, "0")}`);
          curr.setMonth(curr.getMonth() + 1);
        }
      }
    } else {
      // 'all'
      return partitionDetails;
    }

    return partitionDetails.filter((p) => {
      const pMonth = p.docId.slice(0, 7);
      return targetMonths.has(pMonth);
    });
  };

  const matchingParts = getMatchingPartitions();
  const estimatedContactsCount = matchingParts.reduce((acc, p) => acc + (p.count || 0), 0);
  const estimatedSizeBytes = matchingParts.reduce((acc, p) => acc + (p.sizeBytes || 0), 0);

  const handleExportSubmit = async (e) => {
    e.preventDefault();
    if (duration === "custom") {
      if (!startMonth || !endMonth) {
        toast.error("Please select both start and end months for custom duration!");
        return;
      }
      if (startMonth > endMonth) {
        toast.error("Start month cannot be later than end month!");
        return;
      }
    }

    setIsExporting(true);
    try {
      const result = await exportCallCenterCacheToJson({
        duration,
        startMonth,
        endMonth
      });
      toast.success(
        `Successfully exported ${result.docCount} cache partitions (${result.totalContactsCount} contacts, ${Math.round(
          result.byteSize / 1024
        )} KB) to JSON!`
      );
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Database size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                Export Call Center Cache
                <Sparkles size={16} className="text-emerald-500" />
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                Select duration to download partition cache JSON
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleExportSubmit} className="p-6 space-y-6 overflow-y-auto">
          {/* Duration Options */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={14} className="text-emerald-600" />
              Select Duration Scope
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: All Time */}
              <div
                onClick={() => setDuration("all")}
                className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  duration === "all"
                    ? "bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                    : "bg-gray-50/50 border-gray-200/80 hover:bg-gray-100/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-900">All Time</span>
                  {duration === "all" && <CheckCircle2 size={16} className="text-emerald-600" />}
                </div>
                <p className="text-[11px] text-gray-500 mt-1 font-medium">
                  Export entire callCenterCache database partitions
                </p>
              </div>

              {/* Option 2: Current Month */}
              <div
                onClick={() => setDuration("current_month")}
                className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  duration === "current_month"
                    ? "bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                    : "bg-gray-50/50 border-gray-200/80 hover:bg-gray-100/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-900">Current Month</span>
                  {duration === "current_month" && <CheckCircle2 size={16} className="text-emerald-600" />}
                </div>
                <p className="text-[11px] text-gray-500 mt-1 font-medium">
                  Active month data only ({new Date().toLocaleString("default", { month: "short", year: "numeric" })})
                </p>
              </div>

              {/* Option 3: Last 3 Months */}
              <div
                onClick={() => setDuration("last_3_months")}
                className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  duration === "last_3_months"
                    ? "bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                    : "bg-gray-50/50 border-gray-200/80 hover:bg-gray-100/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-900">Last 3 Months</span>
                  {duration === "last_3_months" && <CheckCircle2 size={16} className="text-emerald-600" />}
                </div>
                <p className="text-[11px] text-gray-500 mt-1 font-medium">
                  Recent quarterly partition cache snapshot
                </p>
              </div>

              {/* Option 4: Last 6 Months */}
              <div
                onClick={() => setDuration("last_6_months")}
                className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  duration === "last_6_months"
                    ? "bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                    : "bg-gray-50/50 border-gray-200/80 hover:bg-gray-100/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-900">Last 6 Months</span>
                  {duration === "last_6_months" && <CheckCircle2 size={16} className="text-emerald-600" />}
                </div>
                <p className="text-[11px] text-gray-500 mt-1 font-medium">
                  Half-year partition cache snapshot
                </p>
              </div>
            </div>

            {/* Custom Option */}
            <div
              onClick={() => setDuration("custom")}
              className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
                duration === "custom"
                  ? "bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
                  : "bg-gray-50/50 border-gray-200/80 hover:bg-gray-100/50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar size={15} className="text-emerald-600" />
                  <span className="text-xs font-black text-gray-900">Custom Month Range</span>
                </div>
                {duration === "custom" && <CheckCircle2 size={16} className="text-emerald-600" />}
              </div>

              {duration === "custom" && (
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-emerald-200/60 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">
                      Start Month (YYYY-MM)
                    </label>
                    <input
                      type="month"
                      value={startMonth}
                      onChange={(e) => setStartMonth(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">
                      End Month (YYYY-MM)
                    </label>
                    <input
                      type="month"
                      value={endMonth}
                      onChange={(e) => setEndMonth(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Export Estimation Preview Badge */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 border border-emerald-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Layers size={18} className="text-emerald-600" />
              <div>
                <p className="text-xs font-bold text-gray-900">
                  {isLoadingDetails ? "Calculating estimation..." : `${matchingParts.length} Partition Docs Selected`}
                </p>
                <p className="text-[11px] text-gray-500 font-medium">
                  {estimatedContactsCount} total contacts (~{Math.round(estimatedSizeBytes / 1024)} KB JSON export size)
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
              {duration.replace("_", " ")}
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isExporting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader size={15} className="animate-spin" />
                  Generating JSON...
                </>
              ) : (
                <>
                  <Download size={15} />
                  Download Cache JSON
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
