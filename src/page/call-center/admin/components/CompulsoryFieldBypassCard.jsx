import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  PhoneCall,
  PhoneOff
} from "lucide-react";
import toast from "react-hot-toast";
import { updateCallCenterOptions, DEFAULT_NOT_CONNECTED_STATUSES } from "../../../../lib/db";
import { updateDynamicOptions } from "../../attender/utils";

export default function CompulsoryFieldBypassCard({ options, setOptions }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [togglingStatus, setTogglingStatus] = useState(null);

  const statusOptions = options?.statusOptions || [];
  const connectedStatuses = options?.connectedStatuses || [];
  const notConnectedStatuses = options?.notConnectedStatuses || DEFAULT_NOT_CONNECTED_STATUSES;
  const optionalCompulsoryStatuses = options?.optionalCompulsoryStatuses || notConnectedStatuses;

  const filteredStatuses = useMemo(() => {
    if (!searchTerm.trim()) return statusOptions;
    return statusOptions.filter(s =>
      s.toLowerCase().includes(searchTerm.toLowerCase().trim())
    );
  }, [statusOptions, searchTerm]);

  const handleToggle = async (status) => {
    setTogglingStatus(status);
    const exists = optionalCompulsoryStatuses.some(
      s => s.toLowerCase() === status.toLowerCase()
    );
    const nextBypass = exists
      ? optionalCompulsoryStatuses.filter(s => s.toLowerCase() !== status.toLowerCase())
      : [...optionalCompulsoryStatuses, status];

    try {
      const updatePayload = {
        optionalCompulsoryStatuses: nextBypass
      };
      await updateCallCenterOptions(updatePayload);
      setOptions(prev => ({
        ...prev,
        ...updatePayload
      }));
      updateDynamicOptions(updatePayload);
      toast.success(
        exists
          ? `Compulsory fields are now REQUIRED for "${status}"`
          : `Compulsory fields are now OPTIONAL for "${status}"`
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to update setting: " + err.message);
    } finally {
      setTogglingStatus(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">
              Compulsory Field Exemption Settings
            </h3>
            <p className="text-xs text-gray-400 font-medium">
              Unanswered Callback Rules (Allow empty City, Source, Called For & Khoji)
            </p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <span className="font-bold">How compulsory fields work:</span> When an attender adds or edits a call entry, statuses toggled as <strong className="text-amber-800">"Optional"</strong> below allow compulsory fields (<code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900">City</code>, <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900">Source</code>, <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900">Called For</code>, <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900">Khoji</code>) to remain empty. Changes auto-save instantly.
        </div>
      </div>

      {/* Search & Counter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search status..."
            className="w-full pl-9 pr-8 py-2 text-xs font-semibold bg-gray-50/80 border border-gray-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all placeholder:text-gray-400"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-200/50">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            {optionalCompulsoryStatuses.length} Statuses Optional
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200/50">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            {statusOptions.length - optionalCompulsoryStatuses.length} Statuses Required
          </span>
        </div>
      </div>

      {/* Status Table */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="max-h-[440px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50 z-10">
                <th className="py-3 px-4">Status Name</th>
                <th className="py-3 px-4">Call Classification</th>
                <th className="py-3 px-4">Compulsory Fields Rule</th>
                <th className="py-3 px-4">Category Output</th>
                <th className="py-3 px-4 text-right">Toggle Option</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filteredStatuses.map(status => {
                const isNotConn = notConnectedStatuses.some(
                  s => s.toLowerCase() === status.toLowerCase()
                );
                const isConn = connectedStatuses.some(
                  s => s.toLowerCase() === status.toLowerCase()
                );
                const isBypassed = optionalCompulsoryStatuses.some(
                  s => s.toLowerCase() === status.toLowerCase()
                );
                const isToggling = togglingStatus === status;

                return (
                  <tr
                    key={status}
                    className={`hover:bg-gray-50/60 transition-colors ${
                      isBypassed ? "bg-amber-50/10" : ""
                    }`}
                  >
                    {/* Status Name */}
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {status}
                    </td>

                    {/* Call Classification Badge */}
                    <td className="py-3 px-4">
                      {isConn ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                          <PhoneCall size={11} /> Connected
                        </span>
                      ) : isNotConn ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">
                          <PhoneOff size={11} /> Not Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                          Unassigned
                        </span>
                      )}
                    </td>

                    {/* Compulsory Fields Rule */}
                    <td className="py-3 px-4">
                      {isBypassed ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300/60">
                          <CheckCircle2 size={12} className="text-amber-600" />
                          Optional (Bypass allowed)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Required (Must fill)
                        </span>
                      )}
                    </td>

                    {/* Category Output */}
                    <td className="py-3 px-4 font-medium text-gray-600">
                      {isBypassed ? (
                        <span className="text-amber-800 font-bold bg-amber-100/60 px-2 py-0.5 rounded-lg text-[11px]">
                          Unanswered Callback
                        </span>
                      ) : (
                        <span className="text-gray-600 font-medium">
                          Normal Call Entry
                        </span>
                      )}
                    </td>

                    {/* Toggle Switch */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleToggle(status)}
                        disabled={isToggling}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                          isBypassed ? "bg-amber-500" : "bg-gray-200"
                        } ${isToggling ? "opacity-50 cursor-wait" : ""}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            isBypassed ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredStatuses.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 text-xs font-semibold">
                    No matching status options found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
