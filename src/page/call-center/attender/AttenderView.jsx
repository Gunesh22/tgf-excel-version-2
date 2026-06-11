import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import {
  Phone, ArrowLeft, Plus, Download, Search, ChevronLeft, ChevronRight,
  Edit3, X, Save, FileText, Calendar, Tag, User, MapPin, MessageSquare,
  Hash, Check, Clock, PhoneOff, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame, SlidersHorizontal, FileSpreadsheet, CheckSquare
} from "lucide-react";
import {
  subscribeToCallLogs, updateCallLog, addIncomingCallLog,
  assignContactsToAttender, getPrograms, normalizePhone
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

const CONNECTED_STATUSES = ["Info given", "Interested", "Reg.Done", "reminder", "Query", "Already Reg.d", "Next time", "Shivir done", "Not possible"];
const NOT_CONNECTED_STATUSES = ["NA", "Busy", "Call Cut", "switched off", "Invalid No", "Not interested", "Called by mistake", "no network", "wrong no.", "no answer"];

const DEFAULT_COLUMNS = ["Name", "Phone", "Source", "City", "Called For", "Call Type", "Status", "Remark", "Callback Date"];

import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

const IGNORED_FIELDS = [
  "consent", "consent in hindi", "current date", "current_date",
  "21day current date", "21day_current date", "21day challenge day", "21day_challenge_day",
  "date added", "date_added", "program name", "razorpay", "program payment status",
  "payment status", "payment event", "khoji status", "possibility",
  "understand that this is an offline event and agree to attend in person",
  "have completed 15 days of meditation nonstop without fail",
  "confirm that i will definitely attend this event",
  "acknowledgement",
  "event startdate", "event type", "base amount",
  "program_payment_status", "payment_status", "payment_event", "khoji_status",
  "event_startdate", "event_type", "base_amount",
  "d2e payment status", "d2e_payment_status", "total registrations", "total_registrations",
  "organization type", "organization_type", "total number of registration", "total_number_of_registration",
  "total number of registrations", "total_number_of_registrations",
  "a serious business person", "form ai tools", "form_ai_tools",
  "ai टूल से", "from ai tools", "aapne kaise convice kiya",
  "actual online event count", "adhar card", "age", "your age",
  "attended", "not attended-reason", "attendy", "attender",
  "be 100% honest", "stopping you", "closed airport to venue",
  "company", "consent in gujarati", "cont no", "mobile number",
  "estimated budget", "event address", "event day", "event name", "event details",
  "guest category", "guest designation", "guest email id", "guest name",
  "have you done maha aasmani param gyan shivir", "how did you hear about us",
  "how would you like to attend the retreat", "ioc-ppc", "incremental challenge day",
  "khoji id", "khoji, new", "khoji/ new", "last run time",
  "ma not possible reason", "mahaasmani", "middle name", "number of students",
  "organization", "other video editing tool", "pan card number", "person - label",
  "person - phone", "person - closed deals", "person - open deals", "person - next activity date",
  "position/title", "position", "title", "profession", "profession details", "profession info",
  "prog. feedback", "projected budget", "registration_count_group", "registration count group",
  "school name", "select service", "shivir done", "shivir name", "shivir/event category",
  "shivir_code", "source of information", "specialization", "specific month",
  "tejasthan", "what is your tejstan/center name", "tell me briefly about your business",
  "tentative date of the mini shivir", "the preferred language of the retreat",
  "todays_date_25daychallenge", "todays date 25daychallenge", "type of the event",
  "what are you looking to achieve or explore", "what do you want to get out of this call",
  "what interests you the most about joining this retreat", "what is stopping you from hitting results",
  "what is your time slot", "what makes you different from the other applications",
  "whats the business", "whats your message", "when you want to attend the event",
  "where will you attend the program", "which mini shivir did you attend",
  "your area of living", "your city name", "your current monthly revenue",
  "your health issues", "your message", "your selfless service is a gift",
  "zone", "अन्य टूल", "other tool", "अपना प्रश्न यहाँ लिखें",
  "आप कितने समय से अध्यात्म की खोज में हैं", "ग्राफ़िक डिजाइनिंग", "graphic designing",
  "फोटोग्राफी और वीडियो शूटिंग", "photography & video shooting", "वीडियो एडिटिंग", "video editing",
  "वेबसाइट और लैंडिंग पेज", "website & landing page",
  "date", "content", "enter trainer name", "how would you like to attend the shivir", "how would you like to attend"
];

const isIgnoredField = (key) => {
  if (!key) return true;
  const k = key.toLowerCase().trim().replace(/_/g, " ");
  return IGNORED_FIELDS.some(ignored => {
    // Only allow substring matching for longer ignored terms,
    // require exact match for short terms like "date" and "content" to prevent blocking valid fields like "Registration Date"
    if (ignored === "date" || ignored === "content") {
      return k === ignored;
    }
    return k === ignored || k.includes(ignored);
  });
};

const getKhojiValue = (log) => {
  if (log.Khoji !== undefined && log.Khoji !== null) return String(log.Khoji).trim();
  const k = Object.keys(log).find(key => 
    ["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani"].includes(key.toLowerCase()) || 
    key.toLowerCase().includes("asmani") || 
    key.toLowerCase().includes("aasmani") || 
    key.toLowerCase().includes("आसमानी")
  );
  return k ? String(log[k] || "").trim() : "";
};

const isKhojiAffirmative = (val) => {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return v === "yes" || v === "y" || v === "true" || v === "khoji" || v.includes("dew d") || v.includes("done") || v.includes("completed") || (v.includes("khoji") && !v.includes("not") && !v.includes("new"));
};

// ─── Edit Modal ───────────────────────────────
const EditModal = ({ row, attenderName = "Unknown", onSave, onDelete, onClose }) => {
  const [edited, setEdited] = useState(() => {
    const normalized = { ...row };
    
    // Normalize alternate spellings first to avoid duplicates or missing fields
    const sourceAliases = ["source", "sourse"];
    const calledForAliases = ["called for", "called_for", "calledfor"];
    const stateAliases = ["state", "state name", "province", "region"];
    const khojiAliases = ["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani"];
    
    let sourceVal = "";
    let sourceKeyToClean = null;
    Object.keys(normalized).forEach(k => {
      if (sourceAliases.includes(k.toLowerCase())) {
        if (normalized[k]) {
          sourceVal = normalized[k];
        }
        sourceKeyToClean = k;
      }
    });
    if (sourceKeyToClean) {
      delete normalized[sourceKeyToClean];
    }
    normalized["Source"] = sourceVal;

    let calledForVal = "";
    let calledForKeyToClean = null;
    Object.keys(normalized).forEach(k => {
      if (calledForAliases.includes(k.toLowerCase())) {
        if (normalized[k]) {
          calledForVal = normalized[k];
        }
        calledForKeyToClean = k;
      }
    });
    if (calledForKeyToClean) {
      delete normalized[calledForKeyToClean];
    }
    normalized["Called For"] = calledForVal;

    let stateVal = "";
    let stateKeyToClean = null;
    Object.keys(normalized).forEach(k => {
      if (stateAliases.includes(k.toLowerCase())) {
        if (normalized[k]) {
          stateVal = normalized[k];
        }
        stateKeyToClean = k;
      }
    });
    if (stateKeyToClean) {
      delete normalized[stateKeyToClean];
    }
    normalized["State"] = stateVal;

    let khojiVal = "";
    let khojiKeyToClean = null;
    Object.keys(normalized).forEach(k => {
      if (khojiAliases.includes(k.toLowerCase()) || k.toLowerCase().includes("asmani") || k.toLowerCase().includes("aasmani") || k.toLowerCase().includes("आसमानी")) {
        if (normalized[k]) {
          khojiVal = normalized[k];
        }
        khojiKeyToClean = k;
      }
    });
    if (khojiKeyToClean) {
      delete normalized[khojiKeyToClean];
    }
    normalized["Khoji"] = khojiVal;

    const whitelist = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Country", "Tags", "Source", "Called For"];
    whitelist.forEach(col => {
      if (normalized[col] === undefined || normalized[col] === null) {
        const foundKey = Object.keys(normalized).find(k => k.toLowerCase() === col.toLowerCase());
        if (foundKey) {
          normalized[col] = normalized[foundKey];
          if (foundKey !== col) delete normalized[foundKey];
        } else {
          normalized[col] = "";
        }
      }
    });
    return {
      ...normalized,
      remark: (row.history && row.history.length > 0) ? "" : (row.remark || ""),
    };
  });
  const [saving, setSaving] = useState(false);
  const [globalDup, setGlobalDup] = useState(null);
  const timerRef = useRef(null);
  const handleDismissRef = useRef(null); // B3 fix: stable ref for ESC key handler
  const [addedFields, setAddedFields] = useState([]);

  const handleAddField = () => {
    const name = window.prompt("Enter new field name:");
    if (!name) return;
    const cleanName = name.trim();
    if (!cleanName) return;

    // Check if standard or already exists
    const existingKeys = Object.keys(edited).map(k => k.toLowerCase());
    if (existingKeys.includes(cleanName.toLowerCase())) {
      toast.error("Field already exists!");
      return;
    }

    setAddedFields(prev => [...prev, cleanName]);
    setEdited(prev => ({
      ...prev,
      [cleanName]: ""
    }));
  };

  // Identify fields from the contact that aren't internal bookkeeping fields
  const dynamicFields = useMemo(() => {
    const standardOrder = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Country", "Tags", "Source", "Called For"];
    const internalKeys = [
      "id", "contactId", "programId", "programName", "attenderId", "attenderName",
      "callType", "status", "remark", "callbackDate", "callbackStatus", "isCallbackDue",
      "isHotLead", "createdAt", "updatedAt", "lastCalledAt", "firstCalledAt", "history",
      "_callbackDue", "_deleted", "_isNew", "registeredAt", "conversionSource", "convertedBy",
      "GHL_ID", "Sub Program", "subProgram", "objectionReason"
    ];

    const contactKeys = Object.keys(edited).filter(k => {
      if (internalKeys.includes(k)) return false;
      if (k.startsWith("_")) return false;
      
      // Always show standard fields
      if (standardOrder.includes(k)) return true;

      // Always show newly added fields in this modal session
      if (addedFields.includes(k)) return true;

      // If the contact has recorded mapped fields list, only allow if explicitly mapped.
      if (edited._mappedFields && Array.isArray(edited._mappedFields)) {
        return edited._mappedFields.includes(k);
      }

      if (isIgnoredField(k)) return false;
      
      // Only show other fields if they have a non-empty, non-dummy value
      const val = edited[k];
      if (val === null || val === undefined) return false;
      const strVal = String(val).trim();
      if (!strVal) return false;
      
      const lowerVal = strVal.toLowerCase();
      if (["none", "n/a", "null", "undefined", "false"].includes(lowerVal)) return false;
      
      return true;
    });

    const sortedKeys = [...contactKeys].sort((a, b) => {
      const idxA = standardOrder.indexOf(a);
      const idxB = standardOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedKeys;
  }, [edited, addedFields]);

  // Debounced duplicate check — only on phone value change, not every keystroke
  const dupTimerRef = useRef(null);
  useEffect(() => {
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    const pKey = Object.keys(edited).find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("number") || k.toLowerCase().includes("cont"));
    const phoneVal = pKey ? String(edited[pKey] || "").trim() : null;
    if (!phoneVal || phoneVal.length < 5) { setGlobalDup(null); return; }
    dupTimerRef.current = setTimeout(() => {
      import("../../../lib/db").then(({ checkGlobalDuplicate }) => {
        checkGlobalDuplicate(phoneVal, edited.contactId || row.id).then(setGlobalDup);
      });
    }, 1000);
    return () => { if (dupTimerRef.current) clearTimeout(dupTimerRef.current); };
  }, [edited]);
  // A7 fix: used `edited` not `edited.contactId` so dep is correct; fallback to row.id prevents self-match on undefined contactId

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

      // Ensure any newly added fields are marked as mapped so they show up in the table/attender view
      if (addedFields.length > 0) {
        const currentMapped = Array.isArray(updates._mappedFields) ? [...updates._mappedFields] : [];
        addedFields.forEach(f => {
          if (!currentMapped.includes(f)) {
            currentMapped.push(f);
          }
        });
        updates._mappedFields = currentMapped;
      }

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

  // A6 fix: handleDismiss is now a TRUE cancel — does NOT save.
  // The X button, backdrop click, and ESC all discard changes.
  // Only the "Save & Close" button (or handleSaveAndClose) actually saves.
  const handleDismiss = () => {
    if (saving) return; // Don't close mid-save
    if (onClose) onClose();
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
            <button onClick={handleDismiss} className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition" title="Discard changes & close">
              <X size={18} />
            </button>
            <button
              onClick={handleSaveAndClose}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-white text-xs font-black transition disabled:opacity-50"
              title="Save changes & close"
            >
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
          </div>
        </div>

        <div ref={modalScrollRef} className="overflow-y-auto flex-1 p-8 space-y-8">
          {/* ── Smart Field Groups ── */}
          {(() => {
            const isQuestion = (f) => f.length > 40 || /^(what|how|why|describe|tell)[\s_]/i.test(f);
            const isCampaign = (f) => { const k = f.toLowerCase().replace(/[_\s]/g, ""); return k.includes("adid") || k.includes("adname") || k.includes("adsetid") || k.includes("adsetname") || k.includes("campaignid") || k.includes("campaignname") || k.includes("formid") || k.includes("formname") || k.includes("isorganic") || k.includes("createdtime"); };
            const iconFor = (f) => { const k = f.toLowerCase(); return k.includes("name") || k.includes("lead") || k.includes("khoji") || k.includes("caller") ? <User size={11} className="text-emerald-500" /> : k.includes("phone") || k.includes("mobile") ? <Phone size={11} className="text-blue-500" /> : k.includes("city") || k.includes("location") ? <MapPin size={11} className="text-red-500" /> : k.includes("email") ? <Hash size={11} className="text-purple-500" /> : k.includes("when") || k.includes("suitable") ? <Clock size={11} className="text-amber-500" /> : k.includes("asmani") || k.includes("aasmani") || k.includes("आसमानी") ? <CheckCircle2 size={11} className="text-pink-500" /> : <Tag size={11} className="text-indigo-500" />; };
            const labelFor = (f) => f.replace(/_/g, " ").replace(/\?/g, "").trim();
            const basicFields = dynamicFields.filter(f => !isQuestion(f) && !isCampaign(f));
            const questionFields = dynamicFields.filter(f => isQuestion(f));
            const campaignFields = dynamicFields.filter(f => isCampaign(f));

            const isIncoming = edited._isNew || edited.callType === "incoming" || edited.callType === "incoming f";
            const getEditable = (field) => {
              if (isIncoming) return true;
              if (addedFields.includes(field)) return true;
              return ["source", "called for"].includes(field.toLowerCase());
            };

            return (
              <>
                {/* Standard contact fields – 4-col grid */}
                {basicFields.length > 0 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {basicFields.map(field => {
                        const editable = getEditable(field);
                        return (
                          <div
                            key={field}
                            className={`space-y-1 ${
                              field === "Tags"
                                ? "col-span-2 md:col-span-4"
                                : [
                                    "What do you want to get out of this call",
                                    "How Did You Hear About Us?",
                                    "What is stopping you from hitting results...",
                                    "Tentative Date of the Mini Shivir you attended",
                                    "Which Mini Shivir did you attend?",
                                    "Your Health issues",
                                    "What is your Tejstan/Center name"
                                  ].includes(field)
                                ? "col-span-2 md:col-span-4"
                                : [
                                    "Profession", "Source of Information", "When You want to attend the event:", 
                                    "Shivir/event category", "Guest Designation", "Platform Name:"
                                  ].includes(field) || field.length > 15
                                ? "col-span-2 md:col-span-2"
                                : "col-span-1 md:col-span-1"
                            }`}
                          >
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                              {iconFor(field)} {field}
                            </label>
                            {field === "Tags" ? (
                              editable ? (
                                <input
                                  value={edited[field] || ""}
                                  onChange={e => handleChange(field, e.target.value)}
                                  className="w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                                  placeholder="Enter tags (comma separated)..."
                                />
                              ) : (
                                <div className="flex flex-wrap gap-1.5 py-1 min-h-[38px] items-center">
                                  {(() => {
                                    const tagList = (edited[field] || "")
                                      .split(",")
                                      .map(t => t.trim())
                                      .filter(Boolean);
                                    return tagList.length > 0 ? (
                                      tagList.map((tag, idx) => (
                                        <span
                                          key={idx}
                                          className="inline-flex items-center px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold border border-indigo-100"
                                        >
                                          {tag}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-gray-400 text-xs italic">—</span>
                                    );
                                  })()}
                                </div>
                              )
                            ) : (field.toLowerCase().includes("asmani") || field.toLowerCase().includes("aasmani") || field.toLowerCase().includes("आसमानी") || field.toLowerCase().includes("shivir done") || (field.toLowerCase().includes("khoji") && !field.toLowerCase().includes("id"))) ? (
                              <div className="flex gap-2 py-1 items-center min-h-[38px]">
                                {(() => {
                                   const isYes = String(edited[field] || "").toLowerCase() === "yes";
                                   const isNo = String(edited[field] || "").toLowerCase() === "no";
                                   return (
                                     <>
                                       <button
                                         type="button"
                                         onClick={() => handleChange(field, "Yes")}
                                         disabled={!editable}
                                         className={`px-4 py-1.5 rounded-full text-xs font-bold border transition ${
                                           isYes
                                             ? "bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20"
                                             : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                         } ${!editable ? "opacity-60 cursor-not-allowed" : ""}`}
                                       >
                                         Yes
                                       </button>
                                       <button
                                         type="button"
                                         onClick={() => handleChange(field, "No")}
                                         disabled={!editable}
                                         className={`px-4 py-1.5 rounded-full text-xs font-bold border transition ${
                                           isNo
                                             ? "bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20"
                                             : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                         } ${!editable ? "opacity-60 cursor-not-allowed" : ""}`}
                                       >
                                         No
                                       </button>
                                     </>
                                   );
                                })()}
                              </div>
                            ) : (
                              <input
                                value={edited[field] || ""}
                                onChange={e => handleChange(field, e.target.value)}
                                readOnly={!editable}
                                className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold placeholder:text-gray-300 focus:outline-none focus:ring-4 transition ${
                                  !editable
                                    ? "bg-gray-100/60 border-gray-150 text-gray-500 cursor-not-allowed focus:ring-0 focus:border-gray-150"
                                    : "bg-gray-50 border-gray-100 text-gray-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white"
                                }`}
                                placeholder={`Enter ${field}...`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddField}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 rounded-xl text-xs font-black transition-all border border-indigo-100/80 shadow-sm hover:shadow-md cursor-pointer"
                      >
                        <Plus size={14} className="stroke-[3]" /> Add Custom Field
                      </button>
                    </div>
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
                          readOnly={true}
                          ref={el => {
                            if (el) {
                              setTimeout(() => {
                                el.style.height = 'inherit';
                                el.style.height = `${el.scrollHeight}px`;
                              }, 0);
                            }
                          }}
                          rows={1}
                          className="w-full bg-gray-100/60 border border-purple-100/80 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed resize-none overflow-hidden focus:outline-none transition leading-relaxed placeholder:text-gray-300"
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
                            readOnly={true}
                            className="w-full px-2 py-1.5 bg-gray-100/60 border border-gray-150 rounded-lg text-xs font-mono text-gray-400 cursor-not-allowed focus:outline-none transition"
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

const MyPerformanceDashboard = ({ stats }) => {
  const COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6 space-y-6">
      {/* Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Assigned Contacts", value: stats.assignedCount, icon: <User size={18} />, color: "border-l-indigo-500", text: "text-indigo-600" },
          { label: "Total Attempts", value: stats.totalAttempts, icon: <Phone size={18} />, color: "border-l-blue-500", text: "text-blue-600" },
          { label: "Connection Rate", value: stats.connectionRate + "%", icon: <CheckCircle2 size={18} />, color: "border-l-emerald-500", text: "text-emerald-600" },
          { label: "Conversion Rate", value: stats.registrationRate + "%", icon: <Flame size={18} />, color: "border-l-orange-500", text: "text-orange-500" },
        ].map((k, i) => (
          <div key={i} className={`bg-white rounded-2xl p-5 border border-gray-100 border-l-4 shadow-sm flex items-center justify-between ${k.color}`}>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{k.label}</p>
              <p className="text-3xl font-black text-slate-800 mt-1">{k.value}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center ${k.text}`}>
              {k.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Status distribution */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col h-[350px]">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4">Status Distribution</h3>
          {stats.statusChartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 font-bold">No calls logged yet.</div>
          ) : (
            <div className="flex-1 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stats.statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} contacts`, 'Status']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-800">{stats.connectedContacts}</span>
                <span className="text-[10px] text-gray-400 uppercase font-black">Connected</span>
              </div>
            </div>
          )}
        </div>

        {/* Middle column - Timeline */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col h-[350px] lg:col-span-2">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4">Day-wise Timeline (Attempts)</h3>
          {stats.dailyChartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 font-bold">No activity recorded.</div>
          ) : (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(226, 232, 240, 0.3)' }} formatter={(value) => [`${value} calls`, 'Attempts']} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Objection details */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4">Objections Logged</h3>
          {stats.objectionChartData.length === 0 ? (
            <p className="text-sm text-gray-400 font-bold py-4">No objections recorded for this period.</p>
          ) : (
            <div className="space-y-3">
              {stats.objectionChartData.map((obj, i) => {
                const percent = Math.round((obj.value / stats.assignedCount) * 100);
                return (
                  <div key={i} className="flex flex-col">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1">
                      <span>{obj.name}</span>
                      <span>{obj.value} ({percent}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Connection efficiency metrics */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Call Sheet Performance Analysis</h3>
          <div className="divide-y divide-gray-100">
            {[
              { label: "Average attempts per contact", value: stats.callsPerAssign, desc: "Total attempts divided by total unique assigned contacts." },
              { label: "Successful Connections", value: stats.connectedContacts, desc: "Contacts that were successfully spoken to." },
              { label: "Pending (Not called)", value: stats.assignedCount - stats.connectedContacts - stats.notConnectedContacts, desc: "Contacts waiting for first call or callback." },
              { label: "Total Registrations", value: stats.registrations, desc: "Conversations that ended with successful registration." }
            ].map((m, i) => (
              <div key={i} className="py-3 flex justify-between items-start gap-4">
                <div>
                  <p className="text-xs font-black text-slate-700">{m.label}</p>
                  <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{m.desc}</p>
                </div>
                <span className="text-lg font-black text-slate-800 whitespace-nowrap">{m.value}</span>
              </div>
            ))}
          </div>
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
  const [filterGeneralStatus, setFilterGeneralStatus] = useState("All");
  const [filterAbhivyakti, setFilterAbhivyakti] = useState("All");
  const [filterKhoji, setFilterKhoji] = useState("All");
  const [filterDateType, setFilterDateType] = useState("All");
  const [filterDateRange, setFilterDateRange] = useState("All");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [customTimeFrom, setCustomTimeFrom] = useState("");
  const [customTimeTo, setCustomTimeTo] = useState("");
  const [activeView, setActiveView] = useState("sheet"); // "sheet" | "performance"
  const [sortBy, setSortBy] = useState("activityDesc"); // "activityDesc" | "nameAsc" | "createdDesc"
  const [selectedSheet, setSelectedSheet] = useState("");
  const selectedMonth = selectedSheet;
  const setSelectedMonth = setSelectedSheet;
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
    const currentSheetCount = monthFilteredLogs.length;
    if (currentSheetCount > 0) {
      if (!window.confirm(`You already have ${currentSheetCount} entries in this sheet.\nGet ${requestCount} more contacts?`)) return;
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
    // Incoming calls are added directly to the active sheet
    setEditingRow({
      _isNew: true,
      programId: selectedProgramId || null,
      programName: selectedProgramName || null,
      attenderId,
      attenderName,
      Name: "", 
      Phone: "", 
      Mobile: "",
      Email: "",
      City: "", 
      State: "", 
      Khoji: "", 
      Source: "", 
      Tags: "",
      "Called For": "",
      callType: "incoming", 
      status: "", 
      remark: "",
      "Sub Program": selectedSheet && selectedSheet !== "No Tag" ? selectedSheet : "",
      subProgram: selectedSheet && selectedSheet !== "No Tag" ? selectedSheet : "",
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

const cleanExportRow = (log) => {
  const INTERNAL_KEYS = [
    "id", "programId", "programName", "contactId", "attenderId", "createdAt", "updatedAt",
    "history", "_callbackDue", "_deleted", "isCallbackDue", "isHotLead", "callCount",
    "callbackStatus", "lastCalledAt", "firstCalledAt", "registeredAt", "conversionSource",
    "convertedBy", "subProgram", "objectionReason"
  ];

  const row = {};
  
  // Find standard field mappings
  const findValue = (obj, keysList) => {
    const foundKey = Object.keys(obj).find(k => keysList.includes(k.toLowerCase()));
    return foundKey ? obj[foundKey] : "";
  };

  const nameVal = findValue(log, ["name", "caller", "caller name", "lead name", "lead", "name of caller"]);
  const phoneVal = findValue(log, ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number"]);
  const emailVal = findValue(log, ["email", "mail", "e-mail", "email id", "emailaddress"]);
  const cityVal = findValue(log, ["city", "location", "khoji city", "place", "city name"]);
  const stateVal = findValue(log, ["state", "state name", "province", "region"]);
  const khojiVal = findValue(log, ["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani"]);
  const countryVal = findValue(log, ["country", "nation"]);
  const tagsVal = findValue(log, ["tags", "tag"]);
  const statusVal = log.status || "Pending";
  const remarkVal = log.remark || "";
  const subProgramVal = log["Sub Program"] || log.subProgram || "";
  const sourceVal = findValue(log, ["source", "sourse"]);
  const calledForVal = findValue(log, ["called for", "called_for", "calledfor"]);
  const callTypeVal = log.callType || "";
  const callbackStatusVal = log.callbackStatus || "";
  const objectionReasonVal = log.objectionReason || "";

  let callbackDateStr = "";
  if (log.callbackDate) {
    const d = log.callbackDate.toDate ? log.callbackDate.toDate() : new Date(log.callbackDate);
    if (d && !isNaN(d)) {
      callbackDateStr = d.toLocaleDateString("en-IN");
    }
  }

  row["Name"] = nameVal;
  row["Phone"] = phoneVal;
  row["Email"] = emailVal;
  row["City"] = cityVal;
  row["State"] = stateVal;
  row["Khoji"] = khojiVal;
  row["Country"] = countryVal;
  row["Tags"] = tagsVal;
  row["Sub Program"] = subProgramVal;
  row["Source"] = sourceVal;
  row["Called For"] = calledForVal;
  row["Call Type"] = callTypeVal;
  row["Status"] = statusVal;
  row["Remark"] = remarkVal;
  row["Callback Date"] = callbackDateStr;
  row["Callback Status"] = callbackStatusVal;
  row["Objection Reason"] = objectionReasonVal;

  // Add all other dynamic/custom keys ONLY if they are explicitly present in the _mappedFields array metadata of the contact.
  if (log._mappedFields && Array.isArray(log._mappedFields)) {
    log._mappedFields.forEach(key => {
      if (INTERNAL_KEYS.includes(key) || key.startsWith("_")) return;
      
      const isStandard = [
        "name", "caller", "caller name", "lead name", "lead", "name of caller",
        "phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number",
        "email", "mail", "e-mail", "email id", "emailaddress",
        "city", "location", "khoji city", "place", "city name",
        "state", "state name", "province", "region",
        "khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani",
        "country", "nation", "tags", "tag", "status", "remark", "callbackdate", "sub program",
        "source", "sourse", "called for", "called_for", "calledfor", "call type", "calltype", "callback status", "callbackstatus", "objection reason", "objectionreason"
      ].includes(key.toLowerCase());
      
      if (!isStandard) {
        row[key] = log[key];
      }
    });
  }

  if (log.attenderName) {
    row["Attended By"] = log.attenderName;
  }

  let historyStr = "";
  if (log.history && Array.isArray(log.history)) {
    historyStr = log.history.map(h => `[${new Date(h.timestamp).toLocaleDateString("en-IN")}] ${h.attenderName}: ${h.status} - ${h.remark}`).join(" | ");
  }
  row["Call History Timeline"] = historyStr;

  return row;
};

  const handleExport = () => {
    if (sortedLogs.length === 0) { toast.error("Nothing to export."); return; }
    const rows = sortedLogs.map(cleanExportRow);
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

  // ── Available sheets (derived from data) ──
  const availableSheets = useMemo(() => {
    const sheets = new Set();
    callLogs.forEach(l => {
      if (l._deleted) return;
      const sh = l["Sub Program"] || l.subProgram || "No Tag";
      sheets.add(sh);
    });
    return Array.from(sheets).sort();
  }, [callLogs]);

  // Alias availableMonths for compatibility
  const availableMonths = availableSheets;

  // L4 fix: removed `selectedSheet` from deps — being in deps caused effect to re-run and override the user's manual selection
  // "" is the "All Sheets" sentinel — don't auto-override it
  useEffect(() => {
    if (availableSheets.length > 0) {
      // selectedSheet === "" means "All Sheets" — keep it
      if (selectedSheet !== "" && !availableSheets.includes(selectedSheet)) {
        setSelectedSheet(availableSheets[0]);
      }
    } else {
      setSelectedSheet("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSheets]);

  // Sync program details with currently selected sheet for "Get Numbers"
  useEffect(() => {
    if (!selectedSheet) return;
    const match = callLogs.find(l => {
      if (l._deleted) return false;
      const sh = l["Sub Program"] || l.subProgram || "No Tag";
      return sh === selectedSheet;
    });
    if (match && match.programId) {
      setSelectedProgramId(match.programId);
      setSelectedProgramName(match.programName || "");
      setSelectedSubProgram(selectedSheet === "No Tag" ? "" : selectedSheet);
    }
  }, [selectedSheet, callLogs]);

  // ── Sheet filtered logs ──
  const monthFilteredLogs = useMemo(() => {
    if (!selectedSheet) return callLogs.filter(l => !l._deleted);
    return callLogs.filter(l => {
      if (l._deleted) return false;
      const sh = l["Sub Program"] || l.subProgram || "No Tag";
      return sh === selectedSheet;
    });
  }, [callLogs, selectedSheet]);

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
    const set = new Set(SOURCE_OPTIONS);
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
    const set = new Set(CALLED_FOR_OPTIONS);
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
    if (filterGeneralStatus !== "All") count++;
    if (filterAbhivyakti !== "All") count++;
    if (filterKhoji !== "All") count++;
    if (filterDateType !== "All" && filterDateRange !== "All") count++;
    if (customTimeFrom) count++;
    if (customTimeTo) count++;
    return count;
  }, [
    searchQuery, filterStatus, filterSource, filterCity, filterCalledFor,
    filterCallType, filterSubProgram, filterObjectionReason,
    filterCallbackStatus, filterCallCount, filterGeneralStatus, filterAbhivyakti,
    filterKhoji,
    filterDateType, filterDateRange, customTimeFrom, customTimeTo
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
    setFilterGeneralStatus("All");
    setFilterAbhivyakti("All");
    setFilterKhoji("All");
    setFilterDateType("All");
    setFilterDateRange("All");
    setCustomDateFrom("");
    setCustomDateTo("");
    setCustomTimeFrom("");
    setCustomTimeTo("");
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

      // 10b. General Result Status Filter
      // L6 fix: if filterStatus AND filterGeneralStatus are both set to specific (conflicting) statuses, only use filterGeneralStatus (it's more specific)
      if (filterGeneralStatus !== "All") {
        // Don't double-filter if filterStatus already captures this status specifically
        const quickIsSpecific = filterStatus !== "All" && filterStatus !== "Hot Leads" && filterStatus !== "Callback" && filterStatus !== "Follow up";
        if (!quickIsSpecific && log.status !== filterGeneralStatus) return false;
        if (quickIsSpecific && log.status !== filterGeneralStatus) return false;
      }

      // 10c. Abhivyakti Filter
      if (filterAbhivyakti === "Yes" && log.status !== "Reg.Done") return false;
      if (filterAbhivyakti === "No" && log.status === "Reg.Done") return false;

      // 10d. Khoji Filter
      if (filterKhoji !== "All") {
        const val = getKhojiValue(log);
        const affirmative = isKhojiAffirmative(val);
        if (filterKhoji === "Yes" && !affirmative) return false;
        if (filterKhoji === "No" && affirmative) return false;
      }

      // 11. Date & Time / Activity Range Filter
      if (filterDateType !== "All") {
        let logDate = null;
        if (filterDateType === "lastCalledAt") {
          logDate = log.lastCalledAt ? new Date(log.lastCalledAt) : null;
        } else if (filterDateType === "createdAt") {
          logDate = log.createdAt?.toDate ? log.createdAt.toDate() : log.createdAt ? new Date(log.createdAt) : null;
        }

        if (!logDate || isNaN(logDate)) return false;

        // Date Range Filtering
        if (filterDateRange !== "All") {
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

        // Time of Day Filtering
        if (customTimeFrom || customTimeTo) {
          const logHours = logDate.getHours();
          const logMinutes = logDate.getMinutes();
          const logMinutesSinceMidnight = logHours * 60 + logMinutes;

          if (customTimeFrom) {
            const [h, m] = customTimeFrom.split(":").map(Number);
            const fromMinutes = h * 60 + m;
            if (logMinutesSinceMidnight < fromMinutes) return false;
          }
          if (customTimeTo) {
            const [h, m] = customTimeTo.split(":").map(Number);
            const toMinutes = h * 60 + m;
            if (logMinutesSinceMidnight > toMinutes) return false;
          }
        }
      }

      return true;
    });
  }, [
    monthFilteredLogs, searchQuery, filterStatus, filterSource, filterCalledFor,
    filterCity, filterCallType, filterSubProgram, filterObjectionReason,
    filterCallbackStatus, filterCallCount, filterGeneralStatus, filterAbhivyakti,
    filterKhoji,
    filterDateType, filterDateRange, customDateFrom, customDateTo, customTimeFrom, customTimeTo
  ]);

  // ── Dynamic columns from data ──
  // All internal/system keys — used to filter them from dynamic columns
  // We store them lowercase and compare with toLowerCase() to prevent duplicates
  const INTERNAL_KEYS_LOWER = useMemo(() => new Set([
    "id", "contactid", "attenderid", "attendername", "programid", "programname",
    "status", "remark", "callbackdate", "calltype", "createdat", "updatedat",
    "_callbackdue", "_deleted", "iscallbackdue", "ishotlead", "registeredat",
    "type", "callback", "call type", "call_type", "followup", "followup date",
    "history", "lastcalledat", "firstcalledat", "sub program", "subprogram",
    "ghl_id", "_contactrefid", "objectionreason",
    // Fields written by db.js that should never appear as columns
    "normalizedphone", "contactrefid", "conversionSource", "conversionsource",
    "convertedat", "convertedby", "isassigned"
  ]), []);

  const dynamicCols = useMemo(() => {
    const standardOrder = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Country", "Tags", "Source", "Called For"];
    
    // Find all keys present across any of the monthFilteredLogs
    const allKeysSet = new Set();
    monthFilteredLogs.forEach(log => {
      Object.keys(log).forEach(key => {
        const kLower = key.toLowerCase();
        if (!INTERNAL_KEYS_LOWER.has(kLower) && !key.startsWith("_")) {
          const isStandard = standardOrder.some(col => col.toLowerCase() === kLower);
          if (isStandard) {
            // Always show standard fields
            allKeysSet.add(key);
          } else if (log._mappedFields && Array.isArray(log._mappedFields)) {
            // Log has mapping metadata — only show explicitly mapped custom fields.
            // This prevents survey/unmapped fields from leaking in for new data.
            if (log._mappedFields.includes(key)) {
              allKeysSet.add(key);
            }
          } else {
            // Log is OLD (pre-mapping feature) — no _mappedFields present.
            // Fall back to isIgnoredField to filter known garbage fields.
            if (!isIgnoredField(key)) {
              allKeysSet.add(key);
            }
          }
        }
      });
    });

    // Make sure standard order fields are present
    standardOrder.forEach(col => {
      const found = Array.from(allKeysSet).find(k => k.toLowerCase() === col.toLowerCase());
      if (found) {
        allKeysSet.delete(found);
      }
    });

    // Sort: standardOrder first, then the rest alphabetically
    const sorted = [...standardOrder, ...Array.from(allKeysSet).sort()];
    console.log("[DEBUG] dynamicCols:", sorted);
    return sorted;
  }, [monthFilteredLogs, INTERNAL_KEYS_LOWER]);

  const duplicatePhoneMap = useMemo(() => {
    const map = {};
    callLogs.forEach(log => {
      if (log._deleted) return;
      const progId = log.programId || "incoming";
      const keys = Object.keys(log);
      const phoneKey = keys.find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
        || keys.find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
      const rawPhone = phoneKey ? String(log[phoneKey] || "").replace(/[\s\-\.\(\)\+]/g, "").trim() : "";
      // Normalize to last 10 digits to catch +91XXXXXXXXXX vs XXXXXXXXXX variants
      const phone = rawPhone.length >= 10 ? rawPhone.slice(-10) : rawPhone;
      if (!phone || phone.length < 5) return;
      if (!map[progId]) map[progId] = {};
      map[progId][phone] = (map[progId][phone] || 0) + 1;
    });
    return map;
  }, [callLogs]);

  const sortedLogs = useMemo(() => {
    const list = [...filteredLogs];
    list.sort((a, b) => {
      // 1. Keep overdue callbacks at the top
      const aDue = a._callbackDue ? 1 : 0;
      const bDue = b._callbackDue ? 1 : 0;
      if (aDue !== bDue) return bDue - aDue;

      // 2. Sort by selected method
      if (sortBy === "nameAsc") {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        const aNameKey = aKeys.find(k => k.toLowerCase() === "name" || k.toLowerCase().includes("caller") || k.toLowerCase().includes("khoji")) || "Name";
        const bNameKey = bKeys.find(k => k.toLowerCase() === "name" || k.toLowerCase().includes("caller") || k.toLowerCase().includes("khoji")) || "Name";
        const aName = String(a[aNameKey] || "").toLowerCase();
        const bName = String(b[bNameKey] || "").toLowerCase();
        return aName.localeCompare(bName);
      } else if (sortBy === "createdDesc") {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt ? new Date(a.createdAt) : new Date(0);
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt) : new Date(0);
        return bDate - aDate;
      } else {
        // Default: activityDesc
        const aDate = a.lastCalledAt ? new Date(a.lastCalledAt) : a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt ? new Date(a.createdAt) : new Date(0);
        const bDate = b.lastCalledAt ? new Date(b.lastCalledAt) : b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt) : new Date(0);
        return bDate - aDate;
      }
    });
    return list;
  }, [filteredLogs, sortBy]);

  const totalPages = Math.ceil(sortedLogs.length / rowsPerPage);
  const paginated = sortedLogs.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const performanceStats = useMemo(() => {
    let totalAttempts = 0;
    let connectedContacts = 0;
    let notConnectedContacts = 0;
    let registrations = 0;
    let infoGiven = 0;
    let interested = 0;
    
    const statusCounts = {};
    const objectionCounts = {};
    const dailyActivity = {}; // date string -> attempts count

    monthFilteredLogs.forEach(log => {
      const hist = log.history || [];
      const status = log.status;

      // Calculate total attempts from history
      const attemptsCount = hist.length || (status ? 1 : 0);
      totalAttempts += attemptsCount;

      // Group history items by day for timeline
      hist.forEach(h => {
        const dStr = new Date(h.timestamp).toLocaleDateString("en-IN");
        dailyActivity[dStr] = (dailyActivity[dStr] || 0) + 1;
      });
      // If no history but status is present, count as today
      if (hist.length === 0 && status && log.updatedAt) {
        const dStr = log.updatedAt.toDate ? log.updatedAt.toDate().toLocaleDateString("en-IN") : new Date(log.updatedAt).toLocaleDateString("en-IN");
        dailyActivity[dStr] = (dailyActivity[dStr] || 0) + 1;
      }

      if (status) {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        if (CONNECTED_STATUSES.includes(status)) {
          connectedContacts++;
          if (status === "Reg.Done") registrations++;
          else if (status === "Info given") infoGiven++;
          else if (status === "Interested") interested++;
        } else if (NOT_CONNECTED_STATUSES.includes(status)) {
          notConnectedContacts++;
        }
      }

      if (log.objectionReason) {
        objectionCounts[log.objectionReason] = (objectionCounts[log.objectionReason] || 0) + 1;
      }
    });

    const statusChartData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    const objectionChartData = Object.entries(objectionCounts).map(([name, value]) => ({ name, value }));
    const dailyChartData = Object.entries(dailyActivity)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => {
        const [da, ma, ya] = a.date.split("/").map(Number);
        const [db, mb, yb] = b.date.split("/").map(Number);
        return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
      })
      .slice(-15); // Show last 15 active days

    const assignedCount = monthFilteredLogs.length;

    return {
      totalAttempts,
      assignedCount,
      connectedContacts,
      notConnectedContacts,
      registrations,
      infoGiven,
      interested,
      statusChartData,
      objectionChartData,
      dailyChartData,
      connectionRate: assignedCount > 0 ? Math.round((connectedContacts / assignedCount) * 100) : 0,
      registrationRate: assignedCount > 0 ? Math.round((registrations / assignedCount) * 100) : 0,
      callsPerAssign: assignedCount > 0 ? (totalAttempts / assignedCount).toFixed(1) : "0.0"
    };
  }, [monthFilteredLogs]);

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
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-xl transition">
              <ArrowLeft size={18} className="text-gray-500" />
            </button>
            <div>
              <h1 className="font-black text-gray-900 text-lg leading-none">My Call Sheet</h1>
              <p className="text-xs text-gray-400 font-medium">{attenderName}</p>
            </div>
          </div>

          {/* View Toggle tabs */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200 shrink-0">
            <button
              onClick={() => setActiveView("sheet")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "sheet"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Call Sheet
            </button>
            <button
              onClick={() => setActiveView("performance")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "performance"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              My Performance
            </button>
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

      {/* Sheet Selector — always shown, this is the primary scope */}
      {availableSheets.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-3 shrink-0">
          <FileSpreadsheet size={14} className="text-indigo-500 shrink-0" />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0">Sheet</span>
          <select
            value={selectedSheet}
            onChange={e => {
              const val = e.target.value;
              setSelectedSheet(val);
              setPage(1);
              setFilterStatus("All");
              setFilterSource("All"); setFilterCity("All"); setFilterCalledFor("All");
              setFilterCallType("All"); setFilterSubProgram("All"); setFilterObjectionReason("All");
              setFilterCallbackStatus("All"); setFilterCallCount("All"); setFilterGeneralStatus("All");
              setFilterAbhivyakti("All"); setFilterDateType("All"); setFilterDateRange("All");
              setCustomDateFrom(""); setCustomDateTo(""); setSearchQuery("");
            }}
            className="px-4 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-black text-sm text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer min-w-[180px]"
          >
            <option value="">— All Sheets —</option>
            {availableSheets.map(sh => (
              <option key={sh} value={sh}>{sh}</option>
            ))}
          </select>
          <span className="text-xs font-bold text-gray-400 shrink-0">
            {monthFilteredLogs.length} contacts{selectedSheet === "" ? " · all sheets" : ""}
          </span>
        </div>
      )}



      {/* A8 fix: banner now correctly says "due today or overdue" */}
      {stats.callbacks > 0 && filterStatus !== "Callback" && (
        <div className="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-3 flex items-center justify-between shrink-0 shadow-lg shadow-red-600/10 cursor-pointer" onClick={() => { setFilterStatus("Callback"); setPage(1); }}>
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center animate-pulse">
              <AlertCircle size={22} />
            </div>
            <div>
              <p className="font-black text-sm leading-none">You have {stats.callbacks} callback{stats.callbacks > 1 ? "s" : ""} due today or overdue!</p>
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

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shrink-0">
            <SlidersHorizontal size={13} className="text-gray-400" />
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setPage(1); }}
              className="bg-transparent text-xs font-bold text-gray-600 focus:outline-none cursor-pointer"
            >
              <option value="activityDesc">Sort: Latest Activity</option>
              <option value="createdDesc">Sort: Date Assigned</option>
              <option value="nameAsc">Sort: Name (A-Z)</option>
            </select>
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

          {/* General Result Status Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <CheckCircle2 size={11} className="text-indigo-500" /> Gen. Status
            </label>
            <select
              value={filterGeneralStatus}
              onChange={e => { setFilterGeneralStatus(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.filter(opt => opt !== "Reg.Done").map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Abhivyakti Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <Flame size={11} className="text-emerald-500" /> Abhivyakti
            </label>
            <select
              value={filterAbhivyakti}
              onChange={e => { setFilterAbhivyakti(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All</option>
              <option value="Yes">Yes (Registered)</option>
              <option value="No">No (Not Registered)</option>
            </select>
          </div>

          {/* Khoji Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <CheckSquare size={11} className="text-pink-500" /> Khoji Status
            </label>
            <select
              value={filterKhoji}
              onChange={e => { setFilterKhoji(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">All Contacts</option>
              <option value="Yes">Yes (Khoji)</option>
              <option value="No">No (New)</option>
            </select>
          </div>

          {/* ── Date Filters ── */}
          {/* Step 1: choose which date field to filter on */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
              <CalendarDays size={11} className="text-teal-500" /> Filter By Date
            </label>
            <select
              value={filterDateType}
              onChange={e => {
                setFilterDateType(e.target.value);
                setPage(1);
                if (e.target.value === "All") {
                  setFilterDateRange("All");
                  setCustomDateFrom("");
                  setCustomDateTo("");
                  setCustomTimeFrom("");
                  setCustomTimeTo("");
                }
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition cursor-pointer font-sans"
            >
              <option value="All">No Date Filter</option>
              <option value="lastCalledAt">Last Called Date</option>
              <option value="createdAt">Assignment Date</option>
            </select>
          </div>

          {/* Step 2: quick preset range */}
          {filterDateType !== "All" && (
            <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                <Calendar size={11} className="text-teal-500" /> Quick Range
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

          {/* Step 3: After / Before date pickers — visible whenever a date type is selected */}
          {filterDateType !== "All" && (
            <div className="col-span-2 grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest leading-none flex items-center gap-1">
                  <Calendar size={10} /> After Date
                </label>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={e => {
                    setCustomDateFrom(e.target.value);
                    // Auto-switch to Custom mode when a date is typed directly
                    if (e.target.value) setFilterDateRange("Custom");
                    setPage(1);
                  }}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition font-sans ${
                    customDateFrom ? "bg-teal-50 border-teal-300" : "bg-gray-50 border-gray-200"
                  }`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest leading-none flex items-center gap-1">
                  <Calendar size={10} /> Before Date
                </label>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={e => {
                    setCustomDateTo(e.target.value);
                    if (e.target.value) setFilterDateRange("Custom");
                    setPage(1);
                  }}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition font-sans ${
                    customDateTo ? "bg-teal-50 border-teal-300" : "bg-gray-50 border-gray-200"
                  }`}
                />
              </div>
            </div>
          )}

          {/* Time of day range — shown when date type is active */}
          {filterDateType !== "All" && (
            <div className="col-span-2 grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                  <Clock size={10} /> After Time
                </label>
                <input
                  type="time"
                  value={customTimeFrom}
                  onChange={e => { setCustomTimeFrom(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition font-sans cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                  <Clock size={10} /> Before Time
                </label>
                <input
                  type="time"
                  value={customTimeTo}
                  onChange={e => { setCustomTimeTo(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition font-sans cursor-pointer"
                />
              </div>
            </div>
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
      ) : activeView === "performance" ? (
        <MyPerformanceDashboard stats={performanceStats} />
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
                      onClick={() => {
                        if (!didDrag.current) {
                          console.log("[DEBUG] Selected Row:", log);
                          setEditingRow(log);
                        }
                      }}
                    >
                      <td className="py-4 px-4 text-xs font-bold text-gray-400 text-center bg-[#f8f9fa] border-r border-gray-200 align-top">
                        {(page - 1) * rowsPerPage + idx + 1}
                      </td>
                      {dynamicCols.map((col, ci) => {
                        const getVal = (item, column) => {
                          if (item[column] !== undefined && item[column] !== null) return String(item[column]);
                          const keys = Object.keys(item);
                          const matchingKey = keys.find(k => k.toLowerCase() === column.toLowerCase());
                          return matchingKey ? String(item[matchingKey]) : "";
                        };
                        const val = getVal(log, col);
                        const isName = col.toLowerCase().includes("name") || col.toLowerCase().includes("lead");

                        // Check duplicate phone number in program queue
                        const logKeys = Object.keys(log);
                        const phoneKey = logKeys.find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
                          || logKeys.find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
                        const phone = phoneKey ? normalizePhone(log[phoneKey]) : "";
                        const isDupInProg = isName && phone && duplicatePhoneMap[log.programId || "incoming"]?.[phone] > 1;

                        return (
                          <td key={col} className={`py-4 px-4 border-r border-gray-100 text-sm ${isName ? "font-bold text-gray-900" : "text-gray-700"} min-w-[140px] whitespace-normal align-top`}>
                            {ci === 0 && log.isHotLead && <Flame size={15} className="text-orange-500 shrink-0 inline mr-1" fill="currentColor" />}
                            {val || "\u2014"}
                            {isDupInProg && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                                Same Person
                              </span>
                            )}
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
