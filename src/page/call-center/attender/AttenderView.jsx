import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import {
  Phone, ArrowLeft, Plus, Download, Search, ChevronLeft, ChevronRight,
  Edit3, X, Save, FileText, Calendar, Tag, User, MapPin, MessageSquare,
  Hash, Check, Clock, PhoneOff, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame, SlidersHorizontal,
} from "lucide-react";
import {
  subscribeToCallLogs, updateCallLog, addIncomingCallLog,
  assignContactsToAttender, getPrograms
} from "../../../lib/db";

const STATUS_OPTIONS = [
  "Interested", "Reg.Done", "Not interested", "NA", "Busy",
  "Call Cut", "switched off", "Invalid No", "Already Reg.d",
  "Info given", "Next time", "reminder", "Query", "Called by mistake",
  "Not possible", "Shivir done"
];

const OBJECTION_REASONS = [
  "Too Expensive", "Wrong Dates", "Location Too Far", "No Time", "Other"
];

const SOURCE_OPTIONS = [
  "Facebook", "Instagram", "WhatsApp", "YouTube", "Google",
  "Website", "Books", "Call Centre", "Program", "Other", "NA"
];

const CALLED_FOR_OPTIONS = [
  "TGF Info", "Course", "Dhyan", "Pranayam", "Program", "Shravan",
  "Books", "App", "Reminder", "SHSH", "Spiritual H", "Other", "NA"
];

const CALL_TYPE_OPTIONS = ["outgoing", "incoming", "outgoing f", "incoming f"];

const DEFAULT_COLUMNS = ["Name", "Phone", "Source", "City", "Called For", "Call Type", "Status", "Remark", "Callback Date"];

// ─── Edit Modal ───────────────────────────────
const EditModal = ({ row, attenderName = "Unknown", onSave, onDelete, onClose }) => {
  const [edited, setEdited] = useState({
    ...row,
    remark: (row.history && row.history.length > 0) ? "" : (row.remark || ""),
  });
  const [saving, setSaving] = useState(false);
  const [globalDup, setGlobalDup] = useState(null);
  const timerRef = useRef(null);
  const handleDismissRef = useRef(null); // B3 fix: stable ref for ESC key handler

  // Identify fields from the contact that aren't internal bookkeeping fields
  const dynamicFields = useMemo(() => {
    const internal = [
      "id", "contactid", "attenderid", "attendername", "programid", "programname",
      "status", "remark", "callbackdate", "calltype", "createdat", "updatedat",
      "_callbackdue", "_deleted", "iscallbackdue", "ishotlead", "registeredat",
      "type", "callback", "call type", "call_type", "followup", "followup date"
    ];
    let keys = Object.keys(row).filter(k => !internal.includes(k.toLowerCase()) && !k.startsWith("_"));

    // GUARANTEE Standard Fields appear so user can type them in if missing
    // NOTE: 'Remark' is intentionally omitted here because it has a dedicated textarea below.
    const standardKeys = ["Name", "Phone", "City", "Source", "Called For"];
    standardKeys.forEach(sk => {
      const hasMatch = keys.some(k => k.toLowerCase().includes(sk.toLowerCase()) ||
        (sk === "Phone" && (k.toLowerCase().includes("cont") || k.toLowerCase().includes("number"))) ||
        (sk === "City" && (k.toLowerCase().includes("khoji") || k.toLowerCase().includes("location")))
      );
      if (!hasMatch) {
        keys.push(sk);
      }
    });

    return keys.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const weightA = (aLower.includes("name") || aLower.includes("lead")) ? 1 : (aLower.includes("phone") || aLower.includes("cont") || aLower.includes("number")) ? 2 : aLower.includes("city") ? 3 : 4;
      const weightB = (bLower.includes("name") || bLower.includes("lead")) ? 1 : (bLower.includes("phone") || bLower.includes("cont") || bLower.includes("number")) ? 2 : bLower.includes("city") ? 3 : 4;
      if (weightA !== weightB) return weightA - weightB;
      return a.localeCompare(b);
    });
  }, [row]);

  // Debounced duplicate check — only on phone value change, not every keystroke
  const dupTimerRef = useRef(null);
  useEffect(() => {
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    const pKey = Object.keys(edited).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("number") || k.toLowerCase().includes("cont"));
    const phoneVal = pKey ? String(edited[pKey] || "").trim() : null;
    if (!phoneVal || phoneVal.length < 5) { setGlobalDup(null); return; }
    dupTimerRef.current = setTimeout(() => {
      import("../../../lib/db").then(({ checkGlobalDuplicate }) => {
        checkGlobalDuplicate(phoneVal, edited.contactId).then(setGlobalDup);
      });
    }, 1000);
    return () => { if (dupTimerRef.current) clearTimeout(dupTimerRef.current); };
  }, [edited, edited.contactId]);

  // Identity helpers
  const getLogName = () => {
    const key = Object.keys(edited).find(k => k.toLowerCase().includes("name") || k.toLowerCase().includes("lead"));
    return key ? edited[key] : "";
  };

  const handleChange = (key, val) => {
    setEdited(prev => ({ ...prev, [key]: val }));
  };

  // Smart field matching: find actual key name in data that matches an alias list
  const findField = (aliases) => {
    const keys = Object.keys(edited);
    return keys.find(k => aliases.some(a => k.toLowerCase().includes(a))) || aliases[0].charAt(0).toUpperCase() + aliases[0].slice(1);
  };
  const sourceField = findField(["source", "sourse", "from"]);
  const calledForField = findField(["called for", "called_for", "calledfor"]);

  const handleSaveAndClose = async () => {
    if (saving) return; // Prevent double save

    // Objection Tracker Validation
    if ((edited.status === "Not interested" || edited.status === "Not possible") && !edited.objectionReason) {
      toast.error(`Please select a reason for "${edited.status}" before saving.`, { duration: 4000, position: 'top-center' });
      return;
    }

    setSaving(true);

    // We update the local state for a snappy feel, but keep the modal open till DB confirms
    if (onSave) onSave(edited, true); // (true = optimistic flag, doesn't close modal yet)

    try {
      const { id, _callbackDue, ...rest } = edited;
      const updates = { ...rest };
      if (updates.callbackDate) {
        if (typeof updates.callbackDate === "string") {
          updates.callbackDate = new Date(updates.callbackDate);
        }
      } else {
        updates.callbackDate = null;
      }

      // Clean undefined values out of updates because Firebase will CRASH if any field is undefined.
      Object.keys(updates).forEach(key => {
        if (updates[key] === undefined) {
          delete updates[key];
        }
      });

      // Track call timestamp — always record when attender touched this contact
      updates.lastCalledAt = new Date().toISOString();
      if (!row.firstCalledAt && !edited.firstCalledAt) {
        updates.firstCalledAt = new Date().toISOString();
      }

      // Maintain a timeline of interactions
      if ((row.status !== updates.status) || (row.remark !== updates.remark)) {
        if (updates.status || updates.remark) {
          const safeName = attenderName || "Unknown";
          const newHist = {
            status: updates.status || "",
            remark: updates.remark || "",
            attenderName: safeName,
            timestamp: new Date().toISOString()
          };
          updates.history = [...(row.history || []), newHist];
        }
      }

      console.log("🔥 Attempting to save updates: ", updates);

      // If this is a NEW incoming entry (opened via Add Incoming), create it in Firebase
      if (row._isNew) {
        delete updates._isNew;
        await addIncomingCallLog(
          row.attenderId, row.attenderName, updates, row.programId, row.programName
        );
      } else {
        await updateCallLog(id, updates, rest.contactId || null);
      }

      console.log("✅ Save successful!");
      toast.success("Saved!", { duration: 4000, position: 'top-center' });

      // Now close the modal securely
      if (onClose) onClose();
    } catch (err) {
      console.error("❌ CRTICAL SAVE ERROR:", err.message || err);
      // Fallback alert because Toaster might be hidden/unmounted
      alert("FIREBASE REFUSED TO SAVE: " + (err.message || "Unknown Error"));
      toast.error("Save failed - Check network & rules.", { duration: 6000, position: 'top-center' });
    } finally {
      setSaving(false);
    }
  };

  // X / backdrop / ESC
  // B2 fix: removed duplicate onClose() — handleSaveAndClose already calls onClose() on success
  // B3 fix: use ref pattern to always have the latest function without stale closures
  const handleDismiss = async () => {
    await handleSaveAndClose();
  };
  handleDismissRef.current = handleDismiss;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") handleDismissRef.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleDelete = async () => {
    if (!window.confirm("Remove this entry?")) return;
    onDelete(row.id);
    onClose();
  };

  const getCallbackDateStr = () => {
    if (!edited.callbackDate) return "";
    if (typeof edited.callbackDate === "string") return edited.callbackDate;
    if (edited.callbackDate?.toDate) return edited.callbackDate.toDate().toISOString().split("T")[0];
    return "";
  };

  // U3 fix: Reset scroll position to top when modal opens with a new entry
  const modalScrollRef = useRef(null);
  useEffect(() => {
    if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0;
  }, [row?.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={handleDismiss}>
      <div
        className="bg-white rounded-3xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: "slideUp 0.15s ease-out" }}
      >
        {/* Modal Header */}
        <div className={`px-6 py-4 flex items-center justify-between ${edited._callbackDue ? "bg-red-600" : "bg-indigo-600 shadow-lg shadow-indigo-600/20"}`}>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white">
              {edited.callType === "incoming" ? <PhoneIncoming size={20} /> : <PhoneOutgoing size={20} />}
            </div>
            <div>
              <h3 className="text-white font-black text-xl leading-none">{getLogName() || "Unknown Entry"}</h3>
              <div className="flex items-center gap-3 mt-1">
                {edited.createdAt && (
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                    Assigned: {(edited.createdAt?.toDate ? edited.createdAt.toDate() : new Date(edited.createdAt)).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                )}
                {edited.lastCalledAt && (
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                    Last called: {new Date(edited.lastCalledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {edited.history && edited.history.length > 0 && (
                  <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded text-white/80">
                    {edited.history.length} call{edited.history.length > 1 ? "s" : ""}
                  </span>
                )}
                {globalDup && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-400 text-amber-950 font-bold text-[10px] rounded uppercase animate-pulse">
                    <AlertCircle size={10} /> Duplicate in: {globalDup.programName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleChange("isHotLead", !edited.isHotLead)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition ${edited.isHotLead ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30" : "bg-white/10 text-white/50 hover:bg-white/20"}`}
            >
              <Flame size={14} className={edited.isHotLead ? "animate-pulse" : ""} /> {edited.isHotLead ? "HOT LEAD" : "Mark Hot"}
            </button>
            {saving && <Loader size={16} className="text-white animate-spin" />}
            <button onClick={handleDismiss} className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition" title="Close without saving">
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={modalScrollRef} className="overflow-y-auto flex-1 p-8 space-y-8">
          {/* ── Smart Field Groups ── */}
          {(() => {
            const isQuestion = (f) => f.length > 40 || /^(what|how|why|describe|tell)[\s_]/i.test(f);
            const isCampaign = (f) => { const k = f.toLowerCase().replace(/[_\s]/g, ""); return k.includes("adid") || k.includes("adname") || k.includes("adsetid") || k.includes("adsetname") || k.includes("campaignid") || k.includes("campaignname") || k.includes("formid") || k.includes("formname") || k.includes("isorganic") || k.includes("createdtime"); };
            const iconFor = (f) => { const k = f.toLowerCase(); return k.includes("name") || k.includes("lead") || k.includes("khoji") || k.includes("caller") ? <User size={11} className="text-emerald-500" /> : k.includes("phone") || k.includes("mobile") ? <Phone size={11} className="text-blue-500" /> : k.includes("city") || k.includes("location") ? <MapPin size={11} className="text-red-500" /> : k.includes("email") ? <Hash size={11} className="text-purple-500" /> : k.includes("when") || k.includes("suitable") ? <Clock size={11} className="text-amber-500" /> : <Tag size={11} className="text-indigo-500" />; };
            const labelFor = (f) => f.replace(/_/g, " ").replace(/\?/g, "").trim();
            const basicFields = dynamicFields.filter(f => !isQuestion(f) && !isCampaign(f));
            const questionFields = dynamicFields.filter(f => isQuestion(f));
            const campaignFields = dynamicFields.filter(f => isCampaign(f));
            return (
              <>
                {/* Standard contact fields – 4-col grid */}
                {basicFields.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {basicFields.map(field => (
                      <div key={field} className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                          {iconFor(field)} {field}
                        </label>
                        <input
                          value={edited[field] || ""}
                          onChange={e => handleChange(field, e.target.value)}
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white transition"
                          placeholder={`Enter ${field}...`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {/* Lead form question responses – full-width textareas */}
                {questionFields.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1.5"><MessageSquare size={11} /> Lead Form Responses</p>
                    {questionFields.map(field => (
                      <div key={field} className="bg-purple-50/40 border border-purple-100 rounded-xl p-3 space-y-1.5">
                        <label className="text-[10px] font-semibold text-purple-700 leading-snug block">{labelFor(field)}</label>
                        <textarea
                          value={edited[field] || ""}
                          onChange={e => {
                            handleChange(field, e.target.value);
                            e.target.style.height = 'inherit';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          onFocus={e => {
                            e.target.style.height = 'inherit';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          ref={el => {
                            if (el) {
                              setTimeout(() => {
                                el.style.height = 'inherit';
                                el.style.height = `${el.scrollHeight}px`;
                              }, 0);
                            }
                          }}
                          rows={1}
                          className="w-full bg-white/80 border border-purple-100 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none overflow-hidden focus:outline-none focus:ring-2 focus:ring-purple-200 transition leading-relaxed placeholder:text-gray-300"
                          placeholder="No response..."
                        />
                      </div>
                    ))}
                  </div>
                )}
                {/* Campaign & Ads metadata – compact 3-col grid, always visible */}
                {campaignFields.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-1.5"><Tag size={10} /> Campaign / Ads Data</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-gray-50/50 border border-gray-100 rounded-xl">
                      {campaignFields.map(field => (
                        <div key={field} className="space-y-1">
                          <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest block">{labelFor(field)}</label>
                          <input
                            value={edited[field] || ""}
                            onChange={e => handleChange(field, e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border border-gray-100 rounded-lg text-xs font-mono text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-200 transition"
                            placeholder="—"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* ── Quick Select: Source ── */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Tag size={13} className="text-amber-500" /> Source ({sourceField})
            </label>
            <div className="flex flex-wrap gap-2">
              {SOURCE_OPTIONS.map(opt => (
                <button key={opt} onClick={() => handleChange(sourceField, String(edited[sourceField] || "") === opt ? "" : opt)}
                  className={`px-3 py-2 rounded-xl text-[11px] font-black border transition-all ${String(edited[sourceField] || "") === opt ? "bg-amber-600 text-white border-amber-600 shadow scale-105" : "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                    }`}>{opt}</button>
              ))}
            </div>
          </div>

          {/* ── Quick Select: Called For ── */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Phone size={13} className="text-blue-500" /> Called For ({calledForField})
            </label>
            <div className="flex flex-wrap gap-2">
              {CALLED_FOR_OPTIONS.map(opt => (
                <button key={opt} onClick={() => handleChange(calledForField, String(edited[calledForField] || "") === opt ? "" : opt)}
                  className={`px-3 py-2 rounded-xl text-[11px] font-black border transition-all ${String(edited[calledForField] || "") === opt ? "bg-blue-600 text-white border-blue-600 shadow scale-105" : "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100"
                    }`}>{opt}</button>
              ))}
            </div>
          </div>

          {/* ── Quick Select: Call Type ── */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              {edited.callType === "incoming" ? <PhoneIncoming size={13} className="text-green-500" /> : <PhoneOutgoing size={13} className="text-blue-500" />} Call Type
            </label>
            <div className="flex flex-wrap gap-2">
              {CALL_TYPE_OPTIONS.map(opt => (
                <button key={opt} onClick={() => handleChange("callType", opt)}
                  className={`px-3 py-2 rounded-xl text-[11px] font-black border transition-all ${edited.callType === opt ? "bg-slate-800 text-white border-slate-800 shadow scale-105" : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-200"
                    }`}>{opt}</button>
              ))}
            </div>
          </div>

          <div className="space-y-8">
            {/* Abhivyakti Quick Action & Call Status */}
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm uppercase tracking-wider">
                  <Flame size={16} /> Fast Registration
                </div>
                <button
                  onClick={() => handleChange("status", "Reg.Done")}
                  className={`w-full py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 ${edited.status === "Reg.Done" ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]" : "bg-white text-emerald-700 border-2 border-emerald-500 hover:bg-emerald-50"}`}
                >
                  <CheckCircle2 size={18} />
                  {edited.status === "Reg.Done" ? "Added to Abhivyakti Report" : "Add to Abhivyakti Report"}
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-indigo-500" /> General Result Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {STATUS_OPTIONS.map(opt => {
                    if (opt === "Reg.Done") return null; // Handled strictly above
                    return (
                      <button
                        key={opt}
                        onClick={() => handleChange("status", edited.status === opt ? "" : opt)}
                        className={`px-3 py-2.5 rounded-xl text-[11px] font-black border transition-all ${edited.status === opt
                          ? opt === "Interested" ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30 scale-105" :
                            "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/30 scale-105"
                          : "bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-300"
                          }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Objection Tracker (Conditional) ── */}
              {(edited.status === "Not interested" || edited.status === "Not possible") && (
                <div className="space-y-3 p-4 bg-red-50 border border-red-100 rounded-2xl animate-in fade-in zoom-in duration-200">
                  <label className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle size={13} /> Why are they {edited.status.toLowerCase()}?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {OBJECTION_REASONS.map(reason => (
                      <button
                        key={reason}
                        onClick={() => handleChange("objectionReason", edited.objectionReason === reason ? "" : reason)}
                        className={`px-3 py-2 rounded-xl text-[11px] font-black border transition-all ${edited.objectionReason === reason
                            ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20 scale-105"
                            : "bg-white text-red-600 border-red-200 hover:bg-red-100"
                          }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Note + Callback */}
            <div className="space-y-6">

              {/* ── Call Notes Timeline ── */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare size={13} className="text-indigo-500" /> Call Notes
                  {edited.history && edited.history.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-black">{edited.history.length} past</span>
                  )}
                </label>

                {/* Past history entries — newest first, editable */}
                {edited.history && edited.history.length > 0 && (
                  <div className="space-y-2 pr-1 border border-gray-100 rounded-2xl p-3 bg-gray-50/50">
                    {[...edited.history].reverse().map((h, revIdx) => {
                      const origIdx = edited.history.length - 1 - revIdx;
                      return (
                        <div key={origIdx} className="flex gap-2.5">
                          <div className="shrink-0 flex flex-col items-center pt-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-300 shrink-0" />
                            {revIdx < edited.history.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                          </div>
                          <div className="flex-1 bg-white rounded-xl p-3 border border-gray-100 shadow-sm mb-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide">
                                📅 {new Date(h.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                              {h.status && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${h.status === "Interested" ? "bg-blue-100 text-blue-700" :
                                  h.status === "Reg.Done" ? "bg-emerald-100 text-emerald-700" :
                                    "bg-gray-100 text-gray-600"
                                  }`}>{h.status}</span>
                              )}
                              <span className="text-[9px] text-gray-300 font-bold ml-auto truncate max-w-[80px]">{h.attenderName}</span>
                            </div>
                            <textarea
                              value={h.remark || ""}
                              onChange={e => {
                                const updatedHistory = [...edited.history];
                                updatedHistory[origIdx] = { ...updatedHistory[origIdx], remark: e.target.value };
                                handleChange("history", updatedHistory);
                                e.target.style.height = 'inherit';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                              }}
                              onFocus={e => {
                                e.target.style.height = 'inherit';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                              }}
                              ref={el => {
                                if (el) {
                                  // Setup initial height
                                  setTimeout(() => {
                                    el.style.height = 'inherit';
                                    el.style.height = `${el.scrollHeight}px`;
                                  }, 0);
                                }
                              }}
                              rows={1}
                              className="w-full bg-transparent text-sm text-gray-700 resize-none overflow-hidden focus:outline-none focus:bg-slate-50 focus:ring-2 focus:ring-indigo-100 rounded-lg px-1 py-0.5 transition leading-relaxed placeholder:text-gray-300"
                              placeholder="No note for this call..."
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* New note for current call */}
                <div className="relative">
                  <textarea
                    value={edited.remark || ""}
                    onChange={e => {
                      handleChange("remark", e.target.value);
                      e.target.style.height = 'inherit';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    onFocus={e => {
                      e.target.style.height = 'inherit';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    ref={el => {
                      if (el) {
                        setTimeout(() => {
                          el.style.height = 'inherit';
                          el.style.height = `${el.scrollHeight}px`;
                        }, 0);
                      }
                    }}
                    rows={2}
                    className="w-full px-4 py-3 bg-white border-2 border-indigo-200 rounded-2xl text-sm font-medium resize-none overflow-hidden focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition leading-relaxed"
                    placeholder="✏️ Add note for today's call..."
                  />
                  <span className="absolute bottom-3 right-3 text-[9px] text-indigo-300 font-black uppercase tracking-wider pointer-events-none">New Note</span>
                </div>
              </div>

              {/* ── Follow-up / Callback ── */}
              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${edited.callbackDate ? "text-amber-500" : "text-slate-400"}`}>
                  <CalendarDays size={13} /> {edited.callbackDate ? "Follow-up Scheduled" : "Schedule Follow-up"}
                </label>
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={getCallbackDateStr()}
                    onChange={e => {
                      handleChange("callbackDate", e.target.value);
                      if (e.target.value && !edited.callbackStatus) handleChange("callbackStatus", "pending");
                    }}
                    className={`flex-1 px-4 py-3 border rounded-2xl text-sm font-bold focus:outline-none transition ${edited.callbackDate ? "bg-amber-50 border-amber-200 text-amber-700 ring-4 ring-amber-500/10" : "bg-gray-50 border-gray-100 text-gray-700"}`}
                  />
                  {edited.callbackDate && (
                    <button onClick={() => { handleChange("callbackDate", null); handleChange("callbackStatus", null); }} className="px-4 py-2 bg-red-50 text-red-500 font-bold rounded-xl text-xs hover:bg-red-100 transition">Remove</button>
                  )}
                </div>

                {/* Follow-up status selector */}
                {edited.callbackDate && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    {[
                      { value: "pending", label: "⏳ Pending", activeClass: "bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-400/20", inactiveClass: "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100" },
                      { value: "done", label: "✅ Done", activeClass: "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-400/20", inactiveClass: "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100" },
                      { value: "rescheduled", label: "🔄 Rescheduled", activeClass: "bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-400/20", inactiveClass: "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100" },
                      { value: "cancelled", label: "❌ Cancelled", activeClass: "bg-red-500 text-white border-red-500 shadow-lg shadow-red-400/20", inactiveClass: "bg-red-50 text-red-500 border-red-200 hover:bg-red-100" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => handleChange("callbackStatus", opt.value)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${(edited.callbackStatus || "pending") === opt.value
                          ? opt.activeClass + " scale-105"
                          : opt.inactiveClass + " scale-95 hover:scale-100"
                          }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between shadow-inner">
          <button onClick={handleDelete} className="flex items-center gap-2 text-xs font-bold text-red-400 hover:text-red-600 transition">
            <Trash2 size={14} /> Remove Entry
          </button>
          <div className="flex items-center gap-4 text-xs font-bold text-gray-400 tracking-tighter uppercase">
            {saving ? "Saving..." : "All exits auto-save"}
          </div>
          <button disabled={saving} onClick={handleSaveAndClose} className="px-8 py-3 bg-indigo-600 border border-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition active:scale-95 leading-none flex items-center justify-center gap-2 disabled:opacity-50">
            {saving && <Loader size={14} className="animate-spin" />} Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Attender View ───────────────────────
export default function AttenderView({ attenderId, attenderName, onExit }) {
  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedProgramName, setSelectedProgramName] = useState("");
  const [selectedSubProgram, setSelectedSubProgram] = useState("");
  const [callLogs, setCallLogs] = useState([]);
  const [editingRow, setEditingRow] = useState(null);
  const [isLoadingProgram, setIsLoadingProgram] = useState(false); // U1: skeleton state
  const [requestCount, setRequestCount] = useState(10);
  const [isRequesting, setIsRequesting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterSource, setFilterSource] = useState("All");
  const [filterCity, setFilterCity] = useState("All");
  const [filterCalledFor, setFilterCalledFor] = useState("All");
  const [filterCallType, setFilterCallType] = useState("All");
  const [filterSubProgram, setFilterSubProgram] = useState("All");
  const [filterObjectionReason, setFilterObjectionReason] = useState("All");
  const [filterCallbackStatus, setFilterCallbackStatus] = useState("All");
  const [filterCallCount, setFilterCallCount] = useState("All");
  const [filterDateType, setFilterDateType] = useState("All");
  const [filterDateRange, setFilterDateRange] = useState("All");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const rowsPerPage = 50;
  const unsubRef = useRef(null);
  const didDrag = useRef(false);
  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  useEffect(() => {
    loadPrograms();
  }, []);

  useEffect(() => {
    // Subscribe by attenderId only — all this attender's logs across all programs
    setIsLoadingProgram(true);
    unsubRef.current = subscribeToCallLogs(attenderId, (logs) => {
      setCallLogs(logs);
      setIsLoadingProgram(false);
    });
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [attenderId]);

  // L4 fix: Refresh callback-due flags every 60 seconds for long-running sessions
  // Without this, callbacks don't become "due" if the app stays open overnight
  useEffect(() => {
    const interval = setInterval(() => {
      setCallLogs(prev => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let changed = false;
        const updated = prev.map(log => {
          if (log.callbackDate) {
            const cbDate = log.callbackDate.toDate ? log.callbackDate.toDate() : new Date(log.callbackDate);
            cbDate.setHours(0, 0, 0, 0);
            const shouldBeDue = cbDate <= today;
            if (log._callbackDue !== shouldBeDue) { changed = true; return { ...log, _callbackDue: shouldBeDue }; }
          }
          return log;
        });
        return changed ? updated : prev; // Only trigger re-render if something actually changed
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadPrograms = async () => {
    const progs = await getPrograms();
    setPrograms(progs);
  };

  const handleGetNumbers = async () => {
    if (!selectedProgramId) { toast.error("Select a program first."); return; }

    // Check if program has subPrograms and one is selected
    const selectedProgram = programs.find(p => p.id === selectedProgramId);
    if (selectedProgram?.subPrograms?.length > 0 && !selectedSubProgram) {
      toast.error("Please select a specific sheet first.");
      return;
    }
    // U5 fix: Warn before re-requesting if the sheet already has entries
    if (callLogs.length > 0) {
      if (!window.confirm(`You already have ${callLogs.length} entries in this sheet.\nGet ${requestCount} more contacts?`)) return;
    }
    setIsRequesting(true);
    try {
      const assigned = await assignContactsToAttender(
        selectedProgramId, selectedProgramName, attenderId, attenderName, requestCount, selectedSubProgram
      );
      if (assigned === 0) toast.error("No more available contacts in this program!");
      else {
        toast.success(`${assigned} contacts added to your sheet!`);
        setPage(1);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to get contacts.");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleAddIncoming = () => {
    // Incoming calls don't require a program — they go into the month sheet directly
    setEditingRow({
      _isNew: true,
      programId: null,
      programName: null,
      attenderId,
      attenderName,
      Name: "", Phone: "", Source: "", City: "",
      callType: "incoming", status: "", remark: "",
    });
  };

  const handleDeleteRow = async (id) => {
    // Soft delete — just clear the log (contact goes back automatically via db if contactId)
    try {
      await updateCallLog(id, { _deleted: true });
      toast.success("Entry removed.");
    } catch (err) {
      toast.error("Failed to remove.");
    }
  };

  const handleExport = () => {
    if (callLogs.length === 0) { toast.error("Nothing to export."); return; }
    const rows = callLogs.map(l => {
      const { id, _callbackDue, contactId, attenderId, history, isCallbackDue, isHotLead, _deleted, callCount, ...rest } = l;
      const row = { ...rest };
      if (row.callbackDate?.toDate) row.callbackDate = row.callbackDate.toDate().toLocaleDateString("en-IN");
      if (row.createdAt?.toDate) row.createdAt = row.createdAt.toDate().toLocaleString("en-IN");
      if (row.updatedAt?.toDate) row.updatedAt = row.updatedAt.toDate().toLocaleString("en-IN");

      let historyStr = "";
      if (history && Array.isArray(history)) {
        historyStr = history.map(h => `[${new Date(h.timestamp).toLocaleDateString("en-IN")}] ${h.attenderName}: ${h.status} - ${h.remark}`).join(" | ");
      }

      const nameKey = Object.keys(row).find(k => k.toLowerCase() === "name" || k.toLowerCase().includes("caller") || k.toLowerCase().includes("khoji")) || "Name";
      const nameVal = row[nameKey] || "";
      delete row[nameKey];

      return {
        [nameKey]: nameVal,
        ...row,
        "Call History": historyStr
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "My Sheet");
    XLSX.writeFile(wb, `${attenderName}_${selectedMonth || 'all'}_${new Date().toLocaleDateString("en-CA")}.xlsx`);
    toast.success("Exported!");
  };

  // ── Drag scroll ──
  const onMouseDown = useCallback((e) => {
    isDragging.current = true; didDrag.current = false;
    dragStartX.current = e.pageX - scrollRef.current.offsetLeft;
    dragScrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = "grabbing";
  }, []);
  const onMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - dragStartX.current) * 1.2;
    if (Math.abs(walk) > 3) didDrag.current = true;
    scrollRef.current.scrollLeft = dragScrollLeft.current - walk;
  }, []);
  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  }, []);

  // ── Available months (derived from data) ──
  const availableMonths = useMemo(() => {
    const months = new Set();
    // Always include current month
    const now = new Date();
    months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    callLogs.forEach(l => {
      if (l._deleted) return;
      // From createdAt
      const d = l.createdAt?.toDate ? l.createdAt.toDate() : l.createdAt ? new Date(l.createdAt) : null;
      if (d && !isNaN(d)) months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      // From callbackDate (carryover)
      const cb = l.callbackDate?.toDate ? l.callbackDate.toDate() : l.callbackDate ? new Date(l.callbackDate) : null;
      if (cb && !isNaN(cb)) months.add(`${cb.getFullYear()}-${String(cb.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(months).sort().reverse();
  }, [callLogs]);

  // ── Monthly filtered logs ──
  const monthFilteredLogs = useMemo(() => {
    if (!selectedMonth) return callLogs.filter(l => !l._deleted);
    const [year, month] = selectedMonth.split('-').map(Number);
    return callLogs.filter(l => {
      if (l._deleted) return false;
      // Include if created in this month
      const d = l.createdAt?.toDate ? l.createdAt.toDate() : l.createdAt ? new Date(l.createdAt) : null;
      if (d && !isNaN(d) && d.getFullYear() === year && d.getMonth() + 1 === month) return true;
      // Include if callback date is in this month (carryover from previous months)
      const cb = l.callbackDate?.toDate ? l.callbackDate.toDate() : l.callbackDate ? new Date(l.callbackDate) : null;
      if (cb && !isNaN(cb) && cb.getFullYear() === year && cb.getMonth() + 1 === month) return true;
      // Include if status is not final and it's an ongoing contact (Interested, Info given) with no specific month
      if (!d && !cb) return true;
      return false;
    });
  }, [callLogs, selectedMonth]);

  // ── Stats (now uses monthly data) ──
  const stats = useMemo(() => {
    const active = monthFilteredLogs;
    const total = active.length;
    const called = active.filter(l => l.status).length;
    const interested = active.filter(l => l.status === "Interested").length;
    const regDone = active.filter(l => l.status === "Reg.Done").length;
    const callbacks = active.filter(l => l._callbackDue).length;
    const incoming = active.filter(l => l.callType === "incoming").length;
    const outgoing = active.filter(l => l.callType !== "incoming").length;
    const hotLeads = active.filter(l => l.isHotLead).length;
    return { total, called, interested, regDone, callbacks, incoming, outgoing, hotLeads };
  }, [monthFilteredLogs]);

  // ── Unique values for dropdowns dynamically computed from month data ──
  const uniqueSources = useMemo(() => {
    const set = new Set();
    monthFilteredLogs.forEach(log => {
      const k = Object.keys(log).find(key => key.toLowerCase().includes("source") || key.toLowerCase().includes("sourse"));
      if (k && log[k]) set.add(String(log[k]).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const uniqueCities = useMemo(() => {
    const set = new Set();
    monthFilteredLogs.forEach(log => {
      const k = Object.keys(log).find(key => key.toLowerCase().includes("city") || key.toLowerCase().includes("location") || key.toLowerCase().includes("khoji city"));
      if (k && log[k]) set.add(String(log[k]).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const uniqueCalledFor = useMemo(() => {
    const set = new Set();
    monthFilteredLogs.forEach(log => {
      const k = Object.keys(log).find(key => key.toLowerCase().includes("called for") || key.toLowerCase().includes("called_for") || key.toLowerCase().includes("calledfor"));
      if (k && log[k]) set.add(String(log[k]).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const uniqueSubPrograms = useMemo(() => {
    const set = new Set();
    monthFilteredLogs.forEach(log => {
      if (log["Sub Program"]) set.add(String(log["Sub Program"]).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const uniqueObjectionReasons = useMemo(() => {
    const set = new Set();
    monthFilteredLogs.forEach(log => {
      if (log.objectionReason) set.add(String(log.objectionReason).trim());
    });
    return Array.from(set).sort();
  }, [monthFilteredLogs]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (filterStatus !== "All") count++;
    if (filterSource !== "All") count++;
    if (filterCity !== "All") count++;
    if (filterCalledFor !== "All") count++;
    if (filterCallType !== "All") count++;
    if (filterSubProgram !== "All") count++;
    if (filterObjectionReason !== "All") count++;
    if (filterCallbackStatus !== "All") count++;
    if (filterCallCount !== "All") count++;
    if (filterDateType !== "All" && filterDateRange !== "All") count++;
    return count;
  }, [
    searchQuery, filterStatus, filterSource, filterCity, filterCalledFor,
    filterCallType, filterSubProgram, filterObjectionReason,
    filterCallbackStatus, filterCallCount, filterDateType, filterDateRange
  ]);

  const handleClearAllFilters = () => {
    setSearchQuery("");
    setFilterStatus("All");
    setFilterSource("All");
    setFilterCity("All");
    setFilterCalledFor("All");
    setFilterCallType("All");
    setFilterSubProgram("All");
    setFilterObjectionReason("All");
    setFilterCallbackStatus("All");
    setFilterCallCount("All");
    setFilterDateType("All");
    setFilterDateRange("All");
    setCustomDateFrom("");
    setCustomDateTo("");
    setPage(1);
    toast.success("All filters cleared!");
  };

  // ── Filter (now uses monthly data & multi-criteria advanced filters) ──
  const filteredLogs = useMemo(() => {
    return monthFilteredLogs.filter(log => {
      // 1. Text Search Query
      const q = searchQuery.toLowerCase();
      if (q && !Object.values(log).join(" ").toLowerCase().includes(q)) return false;

      // 2. Quick Status Filter (General Status)
      if (filterStatus === "Hot Leads" && !log.isHotLead) return false;
      if (filterStatus === "Callback" && !log.callbackDate) return false;
      if (filterStatus === "Follow up" && !(log.callbackDate || log.status === "reminder" || log.status === "Next time")) return false;
      if (filterStatus !== "All" && filterStatus !== "Hot Leads" && filterStatus !== "Callback" && filterStatus !== "Follow up" && log.status !== filterStatus) return false;

      // 3. Source Filter
      if (filterSource !== "All") {
        const k = Object.keys(log).find(key => key.toLowerCase().includes("source") || key.toLowerCase().includes("sourse"));
        if (!k || String(log[k] || "").trim() !== filterSource) return false;
      }

      // 4. Called For Filter
      if (filterCalledFor !== "All") {
        const k = Object.keys(log).find(key => key.toLowerCase().includes("called for") || key.toLowerCase().includes("called_for") || key.toLowerCase().includes("calledfor"));
        if (!k || String(log[k] || "").trim() !== filterCalledFor) return false;
      }

      // 5. City/Location Filter
      if (filterCity !== "All") {
        const k = Object.keys(log).find(key => key.toLowerCase().includes("city") || key.toLowerCase().includes("location") || key.toLowerCase().includes("khoji city"));
        if (!k || String(log[k] || "").trim() !== filterCity) return false;
      }

      // 6. Call Type Filter
      if (filterCallType !== "All") {
        const cType = log.callType || "outgoing";
        if (cType !== filterCallType) return false;
      }

      // 7. Sub Program / Sheet Filter
      if (filterSubProgram !== "All") {
        if (String(log["Sub Program"] || "").trim() !== filterSubProgram) return false;
      }

      // 8. Objection Reason Filter
      if (filterObjectionReason !== "All") {
        if (String(log.objectionReason || "").trim() !== filterObjectionReason) return false;
      }

      // 9. Callback Status Filter
      if (filterCallbackStatus !== "All") {
        if (!log.callbackDate) return false;
        const cbStatus = log.callbackStatus || "pending";
        if (cbStatus !== filterCallbackStatus) return false;
      }

      // 10. Call Count Filter
      if (filterCallCount !== "All") {
        const count = log.history ? log.history.length : (log.status ? 1 : 0);
        if (filterCallCount === "0") {
          if (count !== 0) return false;
        } else if (filterCallCount === "1") {
          if (count !== 1) return false;
        } else if (filterCallCount === "2+") {
          if (count < 2) return false;
        }
      }

      // 11. Date / Activity Range Filter
      if (filterDateType !== "All" && filterDateRange !== "All") {
        let logDate = null;
        if (filterDateType === "lastCalledAt") {
          logDate = log.lastCalledAt ? new Date(log.lastCalledAt) : null;
        } else if (filterDateType === "createdAt") {
          logDate = log.createdAt?.toDate ? log.createdAt.toDate() : log.createdAt ? new Date(log.createdAt) : null;
        }

        if (!logDate || isNaN(logDate)) return false;

        const startOfDay = (d) => { const nd = new Date(d); nd.setHours(0, 0, 0, 0); return nd; };
        const endOfDay = (d) => { const nd = new Date(d); nd.setHours(23, 59, 59, 999); return nd; };

        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (filterDateRange === "Today") {
          if (logDate < startOfDay(today) || logDate > endOfDay(today)) return false;
        } else if (filterDateRange === "Yesterday") {
          if (logDate < startOfDay(yesterday) || logDate > endOfDay(yesterday)) return false;
        } else if (filterDateRange === "This Week") {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(today.getDate() - 7);
          if (logDate < startOfDay(sevenDaysAgo)) return false;
        } else if (filterDateRange === "Custom") {
          if (customDateFrom && logDate < startOfDay(new Date(customDateFrom))) return false;
          if (customDateTo && logDate > endOfDay(new Date(customDateTo))) return false;
        }
      }

      return true;
    });
  }, [
    monthFilteredLogs, searchQuery, filterStatus, filterSource, filterCalledFor,
    filterCity, filterCallType, filterSubProgram, filterObjectionReason,
    filterCallbackStatus, filterCallCount, filterDateType, filterDateRange,
    customDateFrom, customDateTo
  ]);

  // ── Dynamic columns from data ──
  // All internal/system keys — used to filter them from dynamic columns
  // We store them lowercase and compare with toLowerCase() to prevent duplicates
  const INTERNAL_KEYS_LOWER = useMemo(() => new Set([
    "id", "contactid", "attenderid", "attendername", "programid", "programname",
    "status", "remark", "callbackdate", "calltype", "createdat", "updatedat",
    "_callbackdue", "_deleted", "iscallbackdue", "ishotlead", "registeredat",
    "type", "callback", "call type", "call_type", "followup", "followup date",
    "history", "lastcalledat", "firstcalledat",
  ]), []);

  const dynamicCols = useMemo(() => {
    const allKeys = new Set();
    monthFilteredLogs.forEach(log => {
      Object.keys(log).forEach(k => {
        if (!INTERNAL_KEYS_LOWER.has(k.toLowerCase()) && !k.startsWith("_")) allKeys.add(k);
      });
    });
    // Sort: Name first, Phone second, then alphabetical
    return Array.from(allKeys).sort((a, b) => {
      const al = a.toLowerCase(), bl = b.toLowerCase();
      const wA = al.includes("name") || al.includes("lead") ? 1 : al.includes("phone") || al.includes("cont") || al.includes("number") ? 2 : al.includes("source") ? 3 : al.includes("city") || al.includes("khoji") ? 4 : 5;
      const wB = bl.includes("name") || bl.includes("lead") ? 1 : bl.includes("phone") || bl.includes("cont") || bl.includes("number") ? 2 : bl.includes("source") ? 3 : bl.includes("city") || bl.includes("khoji") ? 4 : 5;
      if (wA !== wB) return wA - wB;
      return a.localeCompare(b);
    });
  }, [monthFilteredLogs, INTERNAL_KEYS_LOWER]);

  const totalPages = Math.ceil(filteredLogs.length / rowsPerPage);
  const paginated = filteredLogs.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // U11 fix: Unified StatusBadge function — consistent pill style matching AdminPanel
  const getStatusBadge = (status) => {
    if (!status) return { bg: "bg-gray-100", text: "text-gray-400", label: "Pending" };
    if (status === "Reg.Done") return { bg: "bg-emerald-100", text: "text-emerald-700", label: status };
    if (status === "Interested") return { bg: "bg-blue-100", text: "text-blue-700", label: status };
    if (status === "Info given") return { bg: "bg-purple-100", text: "text-purple-700", label: status };
    if (["NA", "Busy", "Call Cut", "switched off", "Not interested", "Invalid No"].includes(status)) return { bg: "bg-red-100", text: "text-red-600", label: status };
    return { bg: "bg-indigo-100", text: "text-indigo-700", label: status };
  };

  const getCallbackStr = (log) => {
    if (!log.callbackDate) return "";
    if (log.callbackDate?.toDate) return log.callbackDate.toDate().toLocaleDateString("en-IN");
    return String(log.callbackDate).split("T")[0];
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-xl transition">
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
          <div>
            <h1 className="font-black text-gray-900 text-lg leading-none">My Call Sheet</h1>
            <p className="text-xs text-gray-400 font-medium">{attenderName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Get Numbers — program selector lives here */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5">
            <select
              value={selectedProgramId}
              onChange={e => {
                setSelectedProgramId(e.target.value);
                const p = programs.find(p => p.id === e.target.value);
                setSelectedProgramName(p?.name || "");
                setSelectedSubProgram(""); // Reset sub-program when program changes
              }}
              className="bg-transparent text-sm font-semibold text-blue-700 focus:outline-none cursor-pointer"
            >
              <option value="">Pick program...</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {/* Show sub-programs dropdown only if the selected program has them */}
            {programs.find(p => p.id === selectedProgramId)?.subPrograms?.length > 0 && (
              <select
                value={selectedSubProgram}
                onChange={e => setSelectedSubProgram(e.target.value)}
                className="bg-transparent text-sm font-semibold text-blue-700 focus:outline-none cursor-pointer border-l border-blue-200 pl-2 ml-1"
              >
                <option value="" disabled hidden>Pick a sheet...</option>
                {programs.find(p => p.id === selectedProgramId).subPrograms.map(sp => (
                  <option key={sp} value={sp}>{sp}</option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-1 bg-white/50 rounded-lg px-1">
              <button onClick={() => setRequestCount(c => Math.max(5, c - 5))} className="w-5 h-5 flex items-center justify-center text-blue-600 hover:text-blue-900 font-bold text-sm">-</button>
              <span className="w-7 text-center font-bold text-sm text-blue-700">{requestCount}</span>
              <button onClick={() => setRequestCount(c => c + 5)} className="w-5 h-5 flex items-center justify-center text-blue-600 hover:text-blue-900 font-bold text-sm">+</button>
            </div>
            <button
              onClick={handleGetNumbers}
              disabled={isRequesting || !selectedProgramId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 disabled:opacity-50 transition shadow shadow-blue-500/20"
            >
              {isRequesting ? <Loader size={13} className="animate-spin" /> : <PhoneOutgoing size={13} />}
              Get Numbers
            </button>
          </div>

          <button onClick={handleAddIncoming} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20">
            <PhoneIncoming size={15} /> Add Incoming
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#217346] text-[#217346] rounded-xl font-bold text-sm hover:bg-[#217346] hover:text-white transition">
            <Download size={15} /> Export
          </button>
        </div>
      </header>

      {/* Month Selector — always shown, this is the primary scope */}
      {availableMonths.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-3 shrink-0">
          <Calendar size={14} className="text-indigo-500 shrink-0" />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0">Month</span>
          <select
            value={selectedMonth}
            onChange={e => { setSelectedMonth(e.target.value); setPage(1); setFilterStatus("All"); }}
            className="px-4 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-black text-sm text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {availableMonths.map(m => {
              const [y, mo] = m.split('-').map(Number);
              const label = new Date(y, mo - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
              return <option key={m} value={m}>{label}</option>;
            })}
          </select>
          <span className="text-xs font-bold text-gray-400">{monthFilteredLogs.length} contacts</span>
        </div>
      )}

      {/* Stats Bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-6 text-sm shrink-0 overflow-x-auto">
        {[
          { label: "Total", value: stats.total, color: "text-gray-700" },
          { label: "Called", value: stats.called, color: "text-blue-600" },
          { label: "Pending", value: stats.total - stats.called, color: "text-amber-600" },
          { label: "Interested", value: stats.interested, color: "text-indigo-600" },
          { label: "Reg.Done", value: stats.regDone, color: "text-emerald-600" },
          { label: "Callbacks Due", value: stats.callbacks, color: "text-red-500" },
          { label: "Outgoing", value: stats.outgoing, color: "text-gray-500" },
          { label: "Incoming", value: stats.incoming, color: "text-green-600" },
          { label: "Hot Leads", value: stats.hotLeads, color: "text-orange-500" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-gray-400 text-xs uppercase tracking-wider">{s.label}</span>
            <span className={`font-black text-base ${s.color}`}>{s.value}</span>
            {s.label === "Callbacks Due" && s.value > 0 && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
          </div>
        ))}

        {/* Progress bar */}
        {stats.total > 0 && (
          <div className="ml-auto flex items-center gap-3 min-w-[200px]">
            <span className="text-xs text-gray-400 whitespace-nowrap">Progress</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.round((stats.called / stats.total) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-600 whitespace-nowrap">
              {Math.round((stats.called / stats.total) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Callback Reminder Banner — U4 fix: hidden when already viewing callbacks */}
      {stats.callbacks > 0 && filterStatus !== "Callback" && (
        <div className="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-3 flex items-center justify-between shrink-0 shadow-lg shadow-red-600/10 cursor-pointer" onClick={() => { setFilterStatus("Callback"); setPage(1); }}>
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center animate-pulse">
              <AlertCircle size={22} />
            </div>
            <div>
              <p className="font-black text-sm leading-none">You have {stats.callbacks} overdue callback{stats.callbacks > 1 ? "s" : ""}!</p>
              <p className="text-white/70 text-xs font-medium mt-0.5">Click here to view them. These people are waiting for your call.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl text-white font-black text-xs">
            <Phone size={14} /> Call Now
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3 overflow-x-auto flex-1">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shrink-0">
            <Search size={14} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="bg-transparent text-sm outline-none w-36"
            />
          </div>

          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
              showAdvancedFilters || activeFiltersCount > 0
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal size={13} />
            Advanced Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </button>

          <div className="flex items-center gap-2">
            {["All", "Hot Leads", "Follow up", "Callback", "Interested", "Reg.Done", "Not interested", "NA"].map(s => (
              <button
                key={s}
                onClick={() => { setFilterStatus(s); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${filterStatus === s
                  ? s === "Hot Leads" ? "bg-orange-500 text-white shadow" : s === "Follow up" ? "bg-blue-600 text-white shadow" : "bg-[#217346] text-white shadow"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                {s === "Hot Leads" && <Flame size={12} className={filterStatus === s ? "text-white" : "text-orange-500"} />}
                {s === "Follow up" && <Clock size={12} className={filterStatus === s ? "text-white" : "text-blue-500"} />}
                {s}
              </button>
            ))}
          </div>
        </div>

        {activeFiltersCount > 0 && (
          <button
            onClick={handleClearAllFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div className="bg-white border-b border-gray-200 px-6 py-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 shrink-0 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Source Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <Tag size={11} className="text-amber-500" /> Source
            </label>
            <select
              value={filterSource}
              onChange={e => { setFilterSource(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Sources</option>
              {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Called For Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <Phone size={11} className="text-blue-500" /> Called For
            </label>
            <select
              value={filterCalledFor}
              onChange={e => { setFilterCalledFor(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Purposes</option>
              {uniqueCalledFor.map(cf => <option key={cf} value={cf}>{cf}</option>)}
            </select>
          </div>

          {/* City Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <MapPin size={11} className="text-red-500" /> City / Location
            </label>
            <select
              value={filterCity}
              onChange={e => { setFilterCity(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Cities</option>
              {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Call Type Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <PhoneOutgoing size={11} className="text-emerald-500" /> Call Type
            </label>
            <select
              value={filterCallType}
              onChange={e => { setFilterCallType(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Types</option>
              <option value="outgoing">Outgoing</option>
              <option value="incoming">Incoming</option>
              <option value="outgoing f">Outgoing F</option>
              <option value="incoming f">Incoming F</option>
            </select>
          </div>

          {/* Sub Program / Sheet Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <FileText size={11} className="text-indigo-500" /> Sheet Name
            </label>
            <select
              value={filterSubProgram}
              onChange={e => { setFilterSubProgram(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Sheets</option>
              {uniqueSubPrograms.map(sp => <option key={sp} value={sp}>{sp}</option>)}
            </select>
          </div>

          {/* Objection Reason Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <AlertCircle size={11} className="text-rose-500" /> Objection
            </label>
            <select
              value={filterObjectionReason}
              onChange={e => { setFilterObjectionReason(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Reasons</option>
              {uniqueObjectionReasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Callback Status Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <Clock size={11} className="text-purple-500" /> Callback Status
            </label>
            <select
              value={filterCallbackStatus}
              onChange={e => { setFilterCallbackStatus(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Callbacks</option>
              <option value="pending">⏳ Pending</option>
              <option value="done">✅ Done</option>
              <option value="rescheduled">🔄 Rescheduled</option>
              <option value="cancelled">❌ Cancelled</option>
            </select>
          </div>

          {/* Call Count Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <User size={11} className="text-gray-500" /> Call Count
            </label>
            <select
              value={filterCallCount}
              onChange={e => { setFilterCallCount(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Counts</option>
              <option value="0">0 Calls (Never Called)</option>
              <option value="1">1 Call</option>
              <option value="2+">2+ Calls</option>
            </select>
          </div>

          {/* Date Type Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <CalendarDays size={11} className="text-teal-500" /> Date Filter By
            </label>
            <select
              value={filterDateType}
              onChange={e => { setFilterDateType(e.target.value); setPage(1); if (e.target.value === "All") setFilterDateRange("All"); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">No Date Filter</option>
              <option value="lastCalledAt">Last Called Date</option>
              <option value="createdAt">Assignment Date</option>
            </select>
          </div>

          {/* Date Range Selector */}
          {filterDateType !== "All" && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                <Calendar size={11} className="text-teal-500" /> Date Range
              </label>
              <select
                value={filterDateRange}
                onChange={e => { setFilterDateRange(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
              >
                <option value="All">All Dates</option>
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="This Week">Last 7 Days</option>
                <option value="Custom">Custom Range</option>
              </select>
            </div>
          )}

          {/* Custom Date Range Picker */}
          {filterDateType !== "All" && filterDateRange === "Custom" && (
            <>
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={e => { setCustomDateFrom(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition font-sans"
                />
              </div>
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={e => { setCustomDateTo(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition font-sans"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingRow && (
        <EditModal
          row={editingRow}
          attenderName={attenderName}
          onSave={(updated, isOptimistic) => {
            // Local update for immediate feedback
            setCallLogs(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
            if (!isOptimistic) setEditingRow(null);
          }}
          onDelete={handleDeleteRow}
          onClose={() => setEditingRow(null)}
        />
      )}

      {/* Sheet Table */}
      {isLoadingProgram ? (
        /* U1 fix: Skeleton loading state while program data loads */
        <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-3 animate-pulse">
          <div className="h-10 bg-gray-200 rounded-xl w-full" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-8 bg-gray-100 rounded-lg w-12" />
              <div className="h-8 bg-gray-100 rounded-lg flex-1" />
              <div className="h-8 bg-gray-100 rounded-lg w-24" />
              <div className="h-8 bg-gray-100 rounded-lg w-32" />
              <div className="h-8 bg-gray-50 rounded-lg flex-1" />
              <div className="h-8 bg-gray-100 rounded-lg w-28" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={scrollRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            className="flex-1 overflow-auto cursor-grab" style={{ userSelect: "none" }}>
            <table className="table-auto w-full text-left border-collapse text-sm">
              <thead className="bg-[#f8f9fa] border-b border-gray-300 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 text-xs font-black text-gray-600 uppercase w-12 border-r border-gray-200 bg-[#e9ecef]">#</th>
                  {dynamicCols.map(col => (
                    <th key={col} className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px] whitespace-nowrap">{col}</th>
                  ))}
                  <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[100px]">Type</th>
                  <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px]">Status</th>
                  <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[300px]">Remark</th>
                  <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase min-w-[120px]">Callback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map((log, idx) => {
                  const isDue = log._callbackDue;
                  const isHot = log.isHotLead;
                  const hasFollowup = log.callbackDate || log.status === "reminder" || log.status === "Next time";
                  const isCalled = !!log.status; // Changes are done if status is set

                  let rowBg = "hover:bg-green-50/50";
                  if (isDue) {
                    rowBg = "bg-red-100 border-l-[6px] border-l-red-600 shadow-sm";
                  } else if (isHot) {
                    rowBg = "bg-orange-100 border-l-[6px] border-l-orange-500";
                  } else if (hasFollowup) {
                    rowBg = "bg-blue-100 border-l-[6px] border-l-blue-500";
                  } else if (isCalled) {
                    rowBg = "bg-emerald-50 border-l-[6px] border-l-emerald-500";
                  }

                  return (
                    <tr
                      key={log.id}
                      className={`cursor-pointer transition-colors ${rowBg}`}
                      onClick={() => { if (!didDrag.current) setEditingRow(log); }}
                    >
                      <td className="py-4 px-4 text-xs font-bold text-gray-400 text-center bg-[#f8f9fa] border-r border-gray-200 align-top">
                        {(page - 1) * rowsPerPage + idx + 1}
                      </td>
                      {dynamicCols.map((col, ci) => {
                        const val = String(log[col] || "");
                        const isName = col.toLowerCase().includes("name") || col.toLowerCase().includes("lead");
                        return (
                          <td key={col} className={`py-4 px-4 border-r border-gray-100 text-sm ${isName ? "font-bold text-gray-900" : "text-gray-700"} min-w-[140px] whitespace-normal align-top`}>
                            {ci === 0 && log.isHotLead && <Flame size={15} className="text-orange-500 shrink-0 inline mr-1" fill="currentColor" />}
                            {val || "\u2014"}
                          </td>
                        );
                      })}
                      <td className="py-4 px-4 border-r border-gray-100 align-top">
                        <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-xl ${log.callType === "incoming" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                          {log.callType || "outgoing"}
                        </span>
                      </td>
                      <td className="py-4 px-4 border-r border-gray-100 align-top">
                        {/* U11 fix: Consistent pill badge matching Admin panel style */}
                        {(() => {
                          const s = log.status || log.Status;
                          const badge = getStatusBadge(s);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${badge.bg} ${badge.text}`}>
                              {log.isHotLead && <Flame size={10} className="inline" fill="currentColor" />}
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4 border-r border-gray-100 text-gray-700 text-sm leading-relaxed min-w-[300px] whitespace-normal align-top">
                        {log.remark || log.Remark || <span className="text-gray-200 font-medium">\u2014</span>}
                      </td>
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        {getCallbackStr(log) ? (
                          <div className="flex flex-col gap-1">
                            {isDue ? (
                              <span className="text-sm font-black text-red-600 flex items-center gap-1.5">
                                <Clock size={14} className="animate-pulse" /> {getCallbackStr(log)}
                              </span>
                            ) : (
                              <span className="text-sm font-semibold text-amber-600">{getCallbackStr(log)}</span>
                            )}
                            {log.callbackStatus && (
                              <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded w-fit ${log.callbackStatus === "done" ? "bg-emerald-100 text-emerald-700" :
                                log.callbackStatus === "rescheduled" ? "bg-blue-100 text-blue-700" :
                                  log.callbackStatus === "cancelled" ? "bg-red-100 text-red-600" :
                                    "bg-amber-100 text-amber-700"
                                }`}>
                                {log.callbackStatus === "done" ? "✅ Done" : log.callbackStatus === "rescheduled" ? "🔄 Rescheduled" : log.callbackStatus === "cancelled" ? "❌ Cancelled" : "⏳ Pending"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-200 font-medium">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={20}>
                      <div className="py-24 text-center pb-32">
                        <p className="text-xl font-bold text-gray-400">
                          {callLogs.length === 0
                            ? "Pick a program above and click 'Get Numbers' to start calling, or add an incoming call."
                            : "No entries match filters."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer / Pagination */}
          <div className="bg-[#217346] text-white px-6 py-3 flex items-center justify-between shrink-0 text-sm font-bold shadow-inner">
            <span>Total: {filteredLogs.length} entries · Called: {stats.called} · Pending: {stats.total - stats.called}</span>
            <div className="flex items-center gap-4">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center disabled:opacity-30 transition cursor-pointer">
                <ChevronLeft size={18} />
              </button>
              <span>Page {page} / {totalPages || 1}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center disabled:opacity-30 transition cursor-pointer">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
