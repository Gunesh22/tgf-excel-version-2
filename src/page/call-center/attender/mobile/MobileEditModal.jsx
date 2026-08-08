import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Phone, Plus, X, Tag, User, MapPin, MessageSquare,
  Hash, Clock, CheckCircle2, AlertCircle, Trash2,
  CalendarDays, Loader, Flame, Edit3, ArrowLeft
} from "lucide-react";
import {
  addIncomingCallLog, updateCallLog, checkGlobalDuplicate
} from "../../../../lib/db";
import { searchCRMByPhone } from "../../../../lib/ghl";
import {
  STATUS_OPTIONS,
  OBJECTION_REASONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  isKhojiField,
  getFieldWithFallback,
  formatContactName,
  isNotConnectedStatus
} from "../utils";

import SearchableDropdown from "../components/edit-modal/SearchableDropdown";
import DuplicateBanner from "../components/edit-modal/DuplicateBanner";
import HistoryTimeline from "../components/edit-modal/HistoryTimeline";
import CityAutofillInput from "../components/edit-modal/CityAutofillInput";
import EditHistoryModal from "../components/edit-modal/EditHistoryModal";

function parseTimestamp(t) {
  if (!t) return null;
  if (t instanceof Date) return t;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t === "object" && t.seconds !== undefined) {
    return new Date(t.seconds * 1000 + Math.round((t.nanoseconds || 0) / 1000000));
  }
  return new Date(t);
}

export default function MobileEditModal({
  row,
  attenderId,
  attenderName = "Unknown",
  programs = [],
  onSave,
  onDelete,
  onClose
}) {
  const getNormalizedRow = () => {
    const normalized = { ...row };
    if (normalized.callType) {
      normalized.callType = String(normalized.callType).toLowerCase();
    }
    
    const standardFields = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Tags", "Source", "Called For"];
    const standardVals = {};
    standardFields.forEach(col => {
      standardVals[col] = getFieldWithFallback(row, col);
    });

    const keysToDelete = new Set();
    const keys = Object.keys(row);
    keys.forEach(k => {
      const kLower = k.toLowerCase();
      if (["name", "caller", "caller name", "lead name", "lead", "name of caller"].includes(kLower)) keysToDelete.add(k);
      if (["phone", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "contact no", "contact_no"].includes(kLower)) keysToDelete.add(k);
      if (["mobile", "mobile no", "mobile number"].includes(kLower)) keysToDelete.add(k);
      if (["email", "mail", "e-mail", "email id", "emailaddress"].includes(kLower)) keysToDelete.add(k);
      if (["city", "location", "khoji city", "place", "city name"].includes(kLower)) keysToDelete.add(k);
      if (["state", "state name", "province", "region"].includes(kLower)) keysToDelete.add(k);
      if (isKhojiField(kLower)) keysToDelete.add(k);
      if (["source", "sourse", "source of informiton", "source of information"].includes(kLower)) keysToDelete.add(k);
      if (["tags", "tag"].includes(kLower)) keysToDelete.add(k);
      if (["called for", "called_for", "calledfor"].includes(kLower)) keysToDelete.add(k);
    });

    keysToDelete.forEach(k => delete normalized[k]);
    standardFields.forEach(col => { normalized[col] = standardVals[col]; });

    if (row._isNew && !normalized.Khoji) {
      normalized.Khoji = "No";
    }

    return normalized;
  };

  const [savedRow, setSavedRow] = useState(() => getNormalizedRow());
  const [edited, setEdited] = useState(() => getNormalizedRow());

  useEffect(() => {
    const norm = getNormalizedRow();
    setSavedRow(norm);
    setEdited(norm);
  }, [row]);

  const calledForField = useMemo(() => {
    if (edited["Called For"] !== undefined) return "Called For";
    return "calledFor";
  }, [edited]);

  const sourceField = useMemo(() => {
    if (edited.Source !== undefined) return "Source";
    if (edited.Sourse !== undefined) return "Sourse";
    return "source";
  }, [edited]);

  const [activeTab, setActiveTab] = useState("call");
  const [saving, setSaving] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [showCalledForPrompt, setShowCalledForPrompt] = useState(false);
  const [promptSelection, setPromptSelection] = useState("");
  const [pendingSave, setPendingSave] = useState(false);
  const [showUndoStatusPrompt, setShowUndoStatusPrompt] = useState(false);

  const [globalDup, setGlobalDup] = useState(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [isSearchingCRM, setIsSearchingCRM] = useState(false);

  const newNoteRef = useRef(null);
  const isSavingRef = useRef(false);

  const handleChange = (field, val) => {
    setEdited(prev => ({ ...prev, [field]: val }));
  };

  const handleCallTypeChange = (ct) => {
    setEdited(prev => ({ ...prev, callType: ct }));
  };

  const getEditable = (field) => {
    if (row._isNew) return true;
    const attState = row.attenderStates && row.attenderStates[attenderId];
    if (!attState) return true;
    return true;
  };

  const handleSaveAndClose = async (overrideFields = null) => {
    if (saving || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaving(true);

    const targetEdited = (overrideFields && typeof overrideFields === "object" && !overrideFields.target)
      ? { ...edited, ...overrideFields }
      : { ...edited };

    if (targetEdited.status === "Reg.Done") {
      targetEdited.callbackDate = null;
      targetEdited.callbackStatus = null;
    }

    try {
      const { id, _callbackDue, _isNew, ...rest } = targetEdited;
      const updates = { ...rest };
      if (updates.Name) updates.Name = formatContactName(updates.Name);

      delete updates.attenderStates;
      delete updates.assignedTo;
      delete updates.assignedName;

      updates.lastEditedBy = attenderName || "Unknown";

      if (row._isNew) {
        delete updates._isNew;
        await addIncomingCallLog(
          row.attenderId, row.attenderName, updates, targetEdited.programId, targetEdited.programName
        );
      } else {
        await updateCallLog(id, updates, attenderId, attenderName);
      }

      toast.success("Saved!", { duration: 3000, position: 'top-center' });
      if (onClose) onClose();
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Save failed. Please check connection.", { duration: 4000, position: 'top-center' });
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Remove this entry from sheet?")) return;
    if (onDelete) onDelete(row.id);
    if (onClose) onClose();
  };

  const getLogName = () => edited.Name || edited.name || row.Name || row.name || "";
  const getCallbackDateStr = () => {
    if (!edited.callbackDate) return "";
    const d = parseTimestamp(edited.callbackDate);
    return d && !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : "";
  };

  const mergedHistory = useMemo(() => {
    return edited.history || row.history || [];
  }, [edited.history, row.history]);

  return (
    <div className="fixed inset-0 z-50 bg-white sm:bg-black/60 sm:backdrop-blur-sm flex flex-col justify-between sm:justify-center animate-fade-in h-full w-full min-h-screen sm:min-h-0">
      <div className="bg-white rounded-none sm:rounded-3xl w-full h-full sm:max-w-lg sm:max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-slide-up">
        
        {/* 1. Header Card - Emerald Green */}
        <div className="bg-[#009669] px-5 py-4 text-white flex flex-col gap-3.5 relative shrink-0 pt-6 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center font-bold shrink-0">
                <User size={22} />
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-extrabold text-lg leading-tight truncate">
                  {getLogName() || "Unknown Entry"}
                </h3>
                <div className="text-[10px] font-bold text-white/80 uppercase tracking-wider mt-0.5 truncate">
                  {edited.createdAt && (
                    <span>ASSIGNED: {(edited.createdAt?.toDate ? edited.createdAt.toDate() : new Date(edited.createdAt)).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  )}
                  {edited.lastCalledAt && (
                    <span> - LAST CALLED: {new Date(edited.lastCalledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition shrink-0 active:scale-95"
              title="Close modal"
            >
              <X size={20} />
            </button>
          </div>

          {/* Action Buttons Row: Call & WhatsApp */}
          <div className="flex items-center gap-2.5 pt-1">
            <a
              href={`tel:${edited.Phone || edited.Mobile}`}
              className="flex-1 py-2.5 px-4 rounded-full border border-white/40 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <Phone size={15} /> Call
            </a>
            <a
              href={`https://wa.me/${(edited.Phone || edited.Mobile || "").replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2.5 px-4 rounded-full bg-[#10b981] hover:bg-[#059669] active:bg-[#047857] text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md"
            >
              <MessageSquare size={15} /> WhatsApp
            </a>
          </div>
        </div>

        {/* 2. Fit 3 Tabs Side-by-Side (Zero Scroll) */}
        <div className="grid grid-cols-3 w-full border-b border-slate-200 px-2 pt-2.5 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("call")}
            className={`pb-2.5 text-[11px] font-extrabold tracking-tight uppercase flex items-center justify-center gap-1 border-b-2 transition-all ${
              activeTab === "call"
                ? "border-[#009669] text-[#009669]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <Phone size={13} className={activeTab === "call" ? "text-[#009669]" : "text-gray-400"} />
            Call Entry
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`pb-2.5 text-[11px] font-extrabold tracking-tight uppercase flex items-center justify-center gap-1 border-b-2 transition-all ${
              activeTab === "profile"
                ? "border-[#009669] text-[#009669]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <User size={13} className={activeTab === "profile" ? "text-[#009669]" : "text-gray-400"} />
            Profile
          </button>

          <button
            type="button"
            onClick={() => setShowEditHistory(true)}
            className="pb-2.5 text-[11px] font-extrabold tracking-tight uppercase flex items-center justify-center gap-1 border-b-2 border-transparent text-amber-600 hover:text-amber-700 transition-all"
          >
            <Edit3 size={13} className="text-amber-600" />
            Past Logs
          </button>
        </div>

        {/* 3. Modal Body Content */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5 bg-white">
          {activeTab === "call" ? (
            <div className="space-y-4">
              {/* Call Type pills */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  CALL TYPE
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {["outgoing", "incoming", "outgoing f", "incoming f"].map(opt => {
                    const isSelected = edited.callType === opt;
                    const labelText = opt === "outgoing f" ? "Outgoing (F)" : opt === "incoming f" ? "Incoming (F)" : opt.charAt(0).toUpperCase() + opt.slice(1);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleCallTypeChange(opt)}
                        className={`py-2 px-3 rounded-full text-xs font-bold transition-all border ${
                          isSelected
                            ? "bg-[#009669] text-white border-[#009669] shadow-md scale-[1.02]"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {labelText}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Called For */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={13} className="text-blue-500" /> CALLED FOR <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>
                <SearchableDropdown
                  options={CALLED_FOR_OPTIONS}
                  selected={String(edited[calledForField] || "")}
                  onChange={val => handleChange(calledForField, val)}
                  placeholder="Search & select..."
                  isMulti={true}
                  colorClass="blue"
                  disabled={!getEditable(calledForField)}
                />
              </div>

              {/* Source */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag size={13} className="text-amber-500" /> SOURCE <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>
                <SearchableDropdown
                  options={SOURCE_OPTIONS}
                  selected={String(edited[sourceField] || "")}
                  onChange={val => handleChange(sourceField, val)}
                  placeholder="Search & select source..."
                  colorClass="amber"
                  disabled={!getEditable(sourceField)}
                />
              </div>

              {/* General Result Status */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-blue-500" /> GENERAL RESULT STATUS <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>
                <SearchableDropdown
                  options={STATUS_OPTIONS}
                  selected={edited.status || ""}
                  onChange={val => handleChange("status", val)}
                  placeholder="Search & select status..."
                  colorClass="indigo"
                />
              </div>

              {/* Objection tracker if not interested */}
              {(edited.status === "Not interested" || edited.status === "Not possible") && (
                <div className="space-y-2 p-3 bg-red-50/50 border border-red-100 rounded-2xl">
                  <label className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1.5">
                    <AlertCircle size={13} /> Reason for {edited.status.toLowerCase()}?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {OBJECTION_REASONS.map(reason => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => handleChange("objectionReason", edited.objectionReason === reason ? "" : reason)}
                        className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black border transition-all ${
                          edited.objectionReason === reason
                            ? "bg-red-500 text-white border-red-500 shadow-md"
                            : "bg-white text-red-600 border-red-200"
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Call Notes & History */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-indigo-500" /> CALL NOTES
                  </label>
                  {mergedHistory && mergedHistory.length > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase">
                      {mergedHistory.length} PAST
                    </span>
                  )}
                </div>

                <HistoryTimeline
                  mergedHistory={mergedHistory}
                  historyList={edited.history}
                  onChangeHistory={updated => handleChange("history", updated)}
                />

                <textarea
                  value={edited.remark || ""}
                  onChange={e => handleChange("remark", e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-[#f8fafc] border border-slate-200 rounded-2xl text-xs font-medium resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#009669] transition"
                  placeholder="Write notes for this call..."
                />
              </div>

              {/* Follow-up / Callback scheduling */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <CalendarDays size={13} /> {edited.callbackDate ? "Follow-up Scheduled" : "Schedule Follow-up"}
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={getCallbackDateStr()}
                    onChange={e => {
                      handleChange("callbackDate", e.target.value);
                      if (e.target.value && !edited.callbackStatus) handleChange("callbackStatus", "pending");
                    }}
                    className="flex-1 px-3 py-2 border rounded-xl text-xs font-bold bg-[#f8fafc] border-slate-200 text-slate-700"
                  />
                  {edited.callbackDate && (
                    <button
                      type="button"
                      onClick={() => { handleChange("callbackDate", null); handleChange("callbackStatus", null); }}
                      className="px-3 py-2 bg-red-50 text-red-500 font-bold rounded-xl text-xs"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Profile Details Tab */
            <div className="space-y-4">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PERSONAL INFORMATION</h4>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 flex items-center gap-1">
                    <User size={11} className="text-emerald-500" /> NAME
                  </label>
                  <input
                    value={edited.Name || ""}
                    onChange={e => handleChange("Name", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 flex items-center gap-1">
                    <Phone size={11} className="text-blue-500" /> PHONE *
                  </label>
                  <input
                    value={edited.Phone || ""}
                    onChange={e => handleChange("Phone", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 flex items-center gap-1">
                    <Phone size={11} className="text-cyan-500" /> MOBILE
                  </label>
                  <input
                    value={edited.Mobile || ""}
                    onChange={e => handleChange("Mobile", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 flex items-center gap-1">
                    <Hash size={11} className="text-purple-500" /> EMAIL
                  </label>
                  <input
                    value={edited.Email || ""}
                    onChange={e => handleChange("Email", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LOCATION INFO</h4>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 flex items-center gap-1">
                    <MapPin size={11} className="text-red-500" /> CITY *
                  </label>
                  <CityAutofillInput
                    value={edited.City || ""}
                    onChange={val => handleChange("City", val)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 flex items-center gap-1">
                    <MapPin size={11} className="text-amber-500" /> STATE
                  </label>
                  <input
                    value={edited.State || ""}
                    onChange={e => handleChange("State", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-800"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Modal Footer Bar */}
        <div className="px-5 py-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0 shadow-lg pb-6 sm:pb-4">
          {(!row._isNew && row.id) ? (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-700 transition active:scale-95 py-1 px-1"
            >
              <Trash2 size={16} /> Remove
            </button>
          ) : (
            <div />
          )}

          <div className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase text-center px-1">
            {saving ? "Saving..." : "ALL EXITS AUTO-SAVE"}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSaveAndClose()}
            className="px-7 py-3 bg-[#6366f1] hover:bg-[#4f46e5] active:bg-[#4338ca] text-white font-extrabold text-xs rounded-full shadow-lg shadow-indigo-500/25 transition active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving && <Loader size={14} className="animate-spin text-white" />} Save & Close
          </button>
        </div>
      </div>

      {/* Edit History Modal Overlay */}
      {showEditHistory && (
        <EditHistoryModal
          row={edited}
          attenderId={attenderId}
          attenderName={attenderName}
          onClose={() => setShowEditHistory(false)}
          onHistoryUpdated={(newHistory) => {
            handleChange("history", newHistory);
          }}
        />
      )}
    </div>
  );
}
