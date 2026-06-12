import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import {
  Phone, Plus, X, Save, Tag, User, MapPin, MessageSquare,
  Hash, Clock, CheckCircle2, AlertCircle, Trash2,
  PhoneIncoming, PhoneOutgoing, CalendarDays, Loader, Flame
} from "lucide-react";
import {
  addIncomingCallLog, updateCallLog
} from "../../../../lib/db";
import {
  STATUS_OPTIONS,
  OBJECTION_REASONS,
  SOURCE_OPTIONS,
  CALLED_FOR_OPTIONS,
  CALL_TYPE_OPTIONS,
  isIgnoredField,
  getFieldWithFallback
} from "../utils";

export const EditModal = ({ row, attenderName = "Unknown", onSave, onDelete, onClose }) => {
  const [edited, setEdited] = useState(() => {
    const normalized = { ...row };
    
    // Whitelist fields to normalize
    const standardFields = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Country", "Tags", "Source", "Called For"];
    
    // 1. Get fallback values for all standard fields
    const standardVals = {};
    standardFields.forEach(col => {
      standardVals[col] = getFieldWithFallback(row, col);
    });

    // 2. Delete all aliases of standard fields from the normalized object to avoid duplicate keys
    const keysToDelete = new Set();
    const keys = Object.keys(row);
    
    keys.forEach(k => {
      const kLower = k.toLowerCase();
      // Name aliases
      if (["name", "caller", "caller name", "lead name", "lead", "name of caller"].includes(kLower)) keysToDelete.add(k);
      // Phone aliases
      if (["phone", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "contact no", "contact_no"].includes(kLower)) keysToDelete.add(k);
      // Mobile aliases
      if (["mobile", "mobile no", "mobile number"].includes(kLower)) keysToDelete.add(k);
      // Email aliases
      if (["email", "mail", "e-mail", "email id", "emailaddress"].includes(kLower)) keysToDelete.add(k);
      // City aliases
      if (["city", "location", "khoji city", "place", "city name"].includes(kLower)) keysToDelete.add(k);
      // State aliases
      if (["state", "state name", "province", "region"].includes(kLower)) keysToDelete.add(k);
      // Khoji aliases
      if (["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani"].includes(kLower) || kLower.includes("asmani") || kLower.includes("aasmani") || kLower.includes("आसमानी")) keysToDelete.add(k);
      // Source aliases
      if (["source", "sourse", "source of informiton", "source of information"].includes(kLower)) keysToDelete.add(k);
      // Tags aliases
      if (["tags", "tag"].includes(kLower)) keysToDelete.add(k);
      // Called For aliases
      if (["called for", "called_for", "calledfor"].includes(kLower)) keysToDelete.add(k);
    });

    // Delete keys
    keysToDelete.forEach(k => {
      delete normalized[k];
    });

    // 3. Set standard fields with normalized values
    standardFields.forEach(col => {
      normalized[col] = standardVals[col];
    });
    return {
      ...normalized,
      remark: (row.history && row.history.length > 0) ? "" : (row.remark || ""),
    };
  });
  const [saving, setSaving] = useState(false);
  const [globalDup, setGlobalDup] = useState(null);
  const handleDismissRef = useRef(null);
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
      import("../../../../lib/db").then(({ checkGlobalDuplicate }) => {
        checkGlobalDuplicate(phoneVal, edited.contactId || row.id).then(setGlobalDup);
      });
    }, 1000);
    return () => { if (dupTimerRef.current) clearTimeout(dupTimerRef.current); };
  }, [edited]);

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

    if (onSave) onSave(edited, true);

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

      console.log("Attempting to save updates: ", updates);

      // If this is a NEW incoming entry, create it in Firebase
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

      if (onClose) onClose();
    } catch (err) {
      console.error("❌ CRTICAL SAVE ERROR:", err.message || err);
      alert("FIREBASE REFUSED TO SAVE: " + (err.message || "Unknown Error"));
      toast.error("Save failed - Check network & rules.", { duration: 6000, position: 'top-center' });
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    if (saving) return;
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
          {/* Smart Field Groups */}
          {(() => {
            const isQuestion = (f) => f.length > 40 || /^(what|how|why|describe|tell)[\s_]/i.test(f);
            const isCampaign = (f) => { const k = f.toLowerCase().replace(/[_\s]/g, ""); return k.includes("adid") || k.includes("adname") || k.includes("adsetid") || k.includes("adsetname") || k.includes("campaignid") || k.includes("campaignname") || k.includes("formid") || k.includes("formname") || k.includes("isorganic") || k.includes("createdtime"); };
            const iconFor = (f) => { const k = f.toLowerCase(); return k.includes("name") || k.includes("lead") || k.includes("khoji") || k.includes("caller") ? <User size={11} className="text-emerald-500" /> : k.includes("phone") || k.includes("mobile") ? <Phone size={11} className="text-blue-500" /> : k.includes("city") || k.includes("location") ? <MapPin size={11} className="text-red-500" /> : k.includes("email") ? <Hash size={11} className="text-purple-500" /> : k.includes("when") || k.includes("suitable") ? <Clock size={11} className="text-amber-500" /> : k.includes("asmani") || k.includes("aasmani") || k.includes("आसमानी") ? <CheckCircle2 size={11} className="text-pink-500" /> : <Tag size={11} className="text-indigo-500" />; };
            const labelFor = (f) => f.replace(/_/g, " ").replace(/\?/g, "").trim();
            const basicFields = dynamicFields.filter(f => !isQuestion(f) && !isCampaign(f));
            const questionFields = dynamicFields.filter(f => isQuestion(f));
            const campaignFields = dynamicFields.filter(f => isCampaign(f));

            const isIncoming = edited._isNew || edited.callType === "incoming" || edited.callType === "incoming f";
            
            // Allow attender to edit Khoji field
            const getEditable = (field) => {
              if (isIncoming) return true;
              if (addedFields.includes(field)) return true;
              const fLower = field.toLowerCase();
              return ["source", "called for", "khoji"].includes(fLower) || 
                fLower.includes("asmani") || 
                fLower.includes("aasmani") || 
                fLower.includes("आसमानी") || 
                fLower.includes("shivir done");
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

          {/* Quick Select: Source */}
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

          {/* Quick Select: Called For */}
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

          {/* Quick Select: Call Type */}
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

              {/* Objection Tracker (Conditional) */}
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

              {/* Call Notes Timeline */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare size={13} className="text-indigo-500" /> Call Notes
                  {edited.history && edited.history.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-black">{edited.history.length} past</span>
                  )}
                </label>

                {/* Past history entries */}
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

              {/* Follow-up / Callback */}
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
