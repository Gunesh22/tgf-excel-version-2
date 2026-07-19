import React, { useState } from "react";
import { X, Trash2, Save } from "lucide-react";
import { doc } from "firebase/firestore";
import { db } from "../../../../../lib/firebase";
import { toast } from "react-hot-toast";
import { updateCallLog } from "../../../../../lib/db";
import SearchableDropdown from "./SearchableDropdown";
import {
  STATUS_OPTIONS,
  CALL_TYPE_OPTIONS,
  CALLED_FOR_OPTIONS,
  SOURCE_OPTIONS
} from "../../utils";

// Helper to convert date to datetime-local string format YYYY-MM-DDTHH:MM
const getDatetimeLocalString = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function EditHistoryModal({
  isOpen,
  onClose,
  edited,
  setEdited,
  row,
  onSave,
  calledForField,
  sourceField,
  attenderId,
  onParentClose,
  onSaveAll,
}) {
  if (!isOpen) return null;

  

  const [historyList, setHistoryList] = useState(() => {
    return (edited.history || []).map((h, index) => ({
      id: index,
      timestamp: h.timestamp || new Date().toISOString(),
      status: h.status || "",
      remark: h.remark || "",
      attenderName: h.attenderName || edited.attenderName || "Unknown",
      calledFor: h.calledFor || edited["Called For"] || edited.calledFor || "",
      source: h.source || edited.Source || edited.source || "",
      callType: h.callType || edited.callType || "outgoing"
    }));
  });

  const [saving, setSaving] = useState(false);

  const handleRemoveField = (id) => {
    setHistoryList(prev => {
      const updated = prev.filter(h => h.id !== id);
      // Immediately sync deletion to parent (wrapped setEdited will update savedRow)
      const cleanedHistory = updated.map(h => ({
        timestamp: h.timestamp,
        status: h.status,
        remark: h.remark,
        attenderName: h.attenderName,
        calledFor: h.calledFor,
        source: h.source,
        callType: h.callType,
      }));
      setEdited(prevEdited => {
        const next = { ...prevEdited, history: cleanedHistory };
        if (calledForField) next[calledForField] = cleanedHistory[cleanedHistory.length - 1]?.calledFor || '';
        if (sourceField) next[sourceField] = cleanedHistory[cleanedHistory.length - 1]?.source || '';
        return next;
      });
      return updated;
    });
  };

  const handleChange = (id, field, value) => {
    setHistoryList(prev =>
      prev.map(h => {
        if (h.id === id) {
          if (field === "timestamp") {
            // value is from datetime-local input, parse it
            const parsedDate = new Date(value);
            return { ...h, [field]: isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString() };
          }
          return { ...h, [field]: value };
        }
        return h;
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const toastId = toast.loading("Saving call history logs...");
    try {
      // Map back to Firestore schema format
      const cleanedHistory = historyList.map(h => ({
        timestamp: h.timestamp || new Date().toISOString(),
        status: h.status || "",
        remark: h.remark || "",
        attenderName: h.attenderName || "Unknown",
        calledFor: h.calledFor || "",
        source: h.source || "",
        callType: h.callType || "outgoing"
      }));

      const latest = cleanedHistory[cleanedHistory.length - 1] || null;
      const latestStatus = latest ? latest.status : "";
      const latestRemark = latest ? latest.remark : "";
      const latestCalledFor = latest ? latest.calledFor : "";
      const latestSource = latest ? latest.source : "";
      const latestCallType = latest ? latest.callType : "outgoing";

      if (onSaveAll) {
        const updates = {
          history: cleanedHistory,
          status: latestStatus,
          remark: latestRemark,
          callType: latestCallType
        };
        if (calledForField) {
          updates[calledForField] = latestCalledFor;
        }
        if (sourceField) {
          updates[sourceField] = latestSource;
        }

        // Also update local/parent state so it matches
        setEdited(prev => {
          const next = {
            ...prev,
            history: cleanedHistory,
            status: latestStatus,
            remark: latestRemark,
            callType: latestCallType
          };
          if (calledForField) next[calledForField] = latestCalledFor;
          if (sourceField) next[sourceField] = latestSource;
          return next;
        });

        await onSaveAll(updates, true);
        toast.dismiss(toastId);
        return;
      }

      // Update parent state
      setEdited(prev => {
        const next = {
          ...prev,
          history: cleanedHistory,
          status: latestStatus,
          remark: latestRemark,
          callType: latestCallType
        };
        if (calledForField) next[calledForField] = latestCalledFor;
        if (sourceField) next[sourceField] = latestSource;
        return next;
      });

      // Update AttenderView parent state optimistically
      if (onSave) {
        const updatedRow = {
          ...edited,
          history: cleanedHistory,
          status: latestStatus,
          remark: latestRemark,
          callType: latestCallType
        };
        if (calledForField) updatedRow[calledForField] = latestCalledFor;
        if (sourceField) updatedRow[sourceField] = latestSource;
        onSave(updatedRow, true);
      }

      // If not a brand new contact, persist using updateCallLog to trigger all registration & cache sync pipelines
      if (!row._isNew && row.id) {
        const updates = {
          history: cleanedHistory,
          status: latestStatus,
          remark: latestRemark,
          callType: latestCallType
        };
        if (calledForField) {
          updates[calledForField] = latestCalledFor;
        }
        if (sourceField) {
          updates[sourceField] = latestSource;
        }
        await updateCallLog(row.id, updates, attenderId || null, edited.attenderName || "Admin");
      }

      toast.success("Call history logs updated successfully!", { id: toastId });
      onClose(); // close history modal
      if (onParentClose) onParentClose(); // close outer EditModal — no extra Save needed
    } catch (err) {
      console.error("Failed to save history logs:", err);
      toast.error("Failed to save history: " + err.message, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      onClick={e => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-lg font-black text-slate-800">Edit Call Logs History</h3>
            <p className="text-xs text-slate-400 mt-0.5">Manage and correct all past entries for {edited.Name || "Contact"}</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-xl transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{historyList.length} total entries</span>
          </div>

          {historyList.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-bold border-2 border-dashed border-slate-100 rounded-3xl">
              No history entries found.
            </div>
          ) : (
            <div className="space-y-4">
              {historyList.map((h, idx) => (
                <div key={h.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 relative space-y-3">
                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveField(h.id)}
                    className="absolute top-3 right-3 p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                    title="Delete call entry"
                  >
                    <Trash2 size={15} />
                  </button>

                  <div className="text-xs font-black text-indigo-600 uppercase tracking-wide">
                    Log Entry #{idx + 1}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Timestamp */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Date & Time</label>
                      <input
                        type="datetime-local"
                        value={getDatetimeLocalString(h.timestamp)}
                        disabled={true}
                        className="w-full px-3 py-2 bg-slate-100 border border-gray-200 rounded-xl text-xs font-semibold text-slate-500 cursor-not-allowed focus:outline-none transition"
                      />
                    </div>

                    {/* Attender Name */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Attender Name</label>
                      <input
                        type="text"
                        value={h.attenderName}
                        disabled={true}
                        placeholder="Attender Name"
                        className="w-full px-3 py-2 bg-slate-100 border border-gray-200 rounded-xl text-xs font-semibold text-slate-500 cursor-not-allowed focus:outline-none transition"
                      />
                    </div>

                    {/* Call Type */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Call Type</label>
                      <SearchableDropdown
                        options={CALL_TYPE_OPTIONS}
                        selected={h.callType}
                        onChange={(val) => handleChange(h.id, "callType", val)}
                        placeholder="Select call type..."
                        colorClass="indigo"
                      />
                    </div>

                    {/* Called For */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Called For</label>
                      <SearchableDropdown
                        options={CALLED_FOR_OPTIONS}
                        selected={String(h.calledFor || "")}
                        onChange={(val) => handleChange(h.id, "calledFor", val)}
                        placeholder="Search & select multiple..."
                        isMulti={true}
                        colorClass="blue"
                      />
                    </div>

                    {/* Source */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Source</label>
                      <SearchableDropdown
                        options={SOURCE_OPTIONS}
                        selected={String(h.source || "")}
                        onChange={(val) => handleChange(h.id, "source", val)}
                        placeholder="Search & select source..."
                        colorClass="amber"
                      />
                    </div>

                    {/* General Result Status */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Result Status</label>
                      <SearchableDropdown
                        options={STATUS_OPTIONS}
                        selected={h.status || ""}
                        onChange={(val) => handleChange(h.id, "status", val)}
                        placeholder="Search & select status..."
                        colorClass="indigo"
                      />
                    </div>
                  </div>

                  {/* Remark Textarea */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Call Note / Remark</label>
                    <textarea
                      value={h.remark}
                      onChange={(e) => handleChange(h.id, "remark", e.target.value)}
                      placeholder="Write notes for this call..."
                      rows={2}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-slate-500 hover:text-slate-700 text-xs font-black rounded-xl hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition disabled:opacity-50"
          >
            {saving ? "Saving..." : <><Save size={14} /> Save History</>}
          </button>
        </div>

      </div>
    </div>
  );
}
