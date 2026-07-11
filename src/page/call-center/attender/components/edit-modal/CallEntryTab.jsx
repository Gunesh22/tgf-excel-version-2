import React, { useRef } from "react";
import {
  Phone, Tag, CheckCircle2, AlertCircle, MessageSquare,
  CalendarDays, Flame
} from "lucide-react";
import SearchableDropdown from "./SearchableDropdown";
import HistoryTimeline from "./HistoryTimeline";
import {
  CALL_TYPE_OPTIONS,
  CALLED_FOR_OPTIONS,
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
  OBJECTION_REASONS
} from "../../utils";

export const CallEntryTab = ({
  edited,
  row,
  callTheme,
  calledForField,
  sourceField,
  getEditable,
  handleChange,
  handleCallTypeChange,
  getOtherValuesForField,
  mergedHistory,
  setShowCalledForPrompt,
  setPromptSelection,
  setPendingSave,
  setShowUndoStatusPrompt,
  setEdited,
  getCallbackDateStr
}) => {
  const newNoteRef = useRef(null);

  return (
    <div className={`space-y-6 p-6 rounded-3xl border transition-all ${callTheme.panelClass}`}>
      {/* Call Type and Options */}
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          Call Type
        </label>
        <div className="flex flex-wrap gap-2">
          {CALL_TYPE_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => handleCallTypeChange(opt)}
              className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${
                edited.callType === opt
                  ? callTheme.callTypeBtnSelected
                  : callTheme.callTypeBtnUnselected
              }`}
            >
              {opt === "outgoing f" ? "Outgoing (F)" : opt === "incoming f" ? "Incoming (F)" : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Called For and Source Dropdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Searchable Dropdown: Called For */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Phone size={13} className="text-blue-500" /> Called For <span className="text-red-500 font-bold ml-0.5">*</span>
          </label>
          <SearchableDropdown
            options={CALLED_FOR_OPTIONS}
            selected={String(edited[calledForField] || "")}
            onChange={val => handleChange(calledForField, val)}
            placeholder="Search & select multiple..."
            isMulti={true}
            colorClass="blue"
            disabled={!getEditable(calledForField)}
          />
          {getOtherValuesForField(calledForField).map((item, idx) => (
            <div key={idx} className="text-[10px] text-blue-600 font-bold mt-1 flex items-center gap-1">
              <span className="opacity-70">👤 {item.name}:</span>
              <span className="bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-medium">
                {Array.isArray(item.val) ? item.val.join(", ") : String(item.val)}
              </span>
            </div>
          ))}
        </div>

        {/* Searchable Dropdown: Source */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Tag size={13} className="text-amber-500" /> Source
          </label>
          <SearchableDropdown
            options={SOURCE_OPTIONS}
            selected={String(edited[sourceField] || "")}
            onChange={val => handleChange(sourceField, val)}
            placeholder="Search & select source..."
            colorClass="amber"
            disabled={!getEditable(sourceField)}
          />
          {getOtherValuesForField(sourceField).map((item, idx) => (
            <div key={idx} className="text-[10px] text-amber-600 font-bold mt-1 flex items-center gap-1">
              <span className="opacity-70">👤 {item.name}:</span>
              <span className="bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-medium">{item.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Call Result Status & Objection Tracker */}
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 size={13} className="text-indigo-500" /> General Result Status <span className="text-red-500 font-bold ml-0.5">*</span>
          </label>
          <SearchableDropdown
            options={STATUS_OPTIONS}
            selected={edited.status || ""}
            onChange={val => {
              if (val === "Reg.Done") {
                const calledForVal = edited[calledForField] || "";
                const selectedArr = calledForVal.split(",").map(x => x.trim()).filter(Boolean);
                if (selectedArr.length !== 1 && CALLED_FOR_OPTIONS.length > 1) {
                  setPromptSelection("");
                  setPendingSave(false);
                  setShowCalledForPrompt(true);
                  return;
                }
              }
              setEdited(prev => ({
                ...prev,
                status: val,
                queryStatus: val === "Query" ? (prev.queryStatus || "Pending") : prev.queryStatus,
              }));
            }}
            placeholder="Search & select status..."
            colorClass="indigo"
          />
          {getOtherValuesForField("status").map((item, idx) => (
            <div key={idx} className="text-[10px] text-indigo-600 font-bold mt-1 flex items-center gap-1">
              <span className="opacity-70">👤 {item.name}:</span>
              <span className="bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 font-medium">{item.val}</span>
            </div>
          ))}

          {/* Query Sub-status Toggle */}
          {edited.status === "Query" && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Query:</span>
              <div className="flex gap-1.5">
                {["Pending", "Solved"].map(qs => (
                  <button
                    key={qs}
                    type="button"
                    onClick={() => handleChange("queryStatus", qs)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${
                      (edited.queryStatus || "Pending") === qs
                        ? qs === "Pending"
                          ? "bg-amber-500 text-white border-amber-500 shadow shadow-amber-500/20 scale-105"
                          : "bg-emerald-500 text-white border-emerald-500 shadow shadow-emerald-500/20 scale-105"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {qs === "Pending" ? "⏳ Pending" : "✅ Solved"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Objection Tracker */}
        {(edited.status === "Not interested" || edited.status === "Not possible") && (
          <div className="space-y-3 p-4 bg-red-50/50 border border-red-100 rounded-2xl animate-slide-up">
            <label className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle size={13} /> Why are they {edited.status.toLowerCase()}?
            </label>
            <div className="flex flex-wrap gap-2">
              {OBJECTION_REASONS.map(reason => (
                <button
                  key={reason}
                  type="button"
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

      {/* Call Notes & History */}
      <div className="space-y-6">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <MessageSquare size={13} className="text-indigo-500" /> Call Notes
            {mergedHistory && mergedHistory.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-black">{mergedHistory.length} past</span>
            )}
          </label>

          {/* Past history entries */}
          <HistoryTimeline
            mergedHistory={mergedHistory}
            historyList={edited.history}
            onChangeHistory={updated => handleChange("history", updated)}
          />

          {/* New note text area */}
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
                newNoteRef.current = el;
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

        {/* Follow-up / Callback scheduling */}
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
              <button type="button" onClick={() => { handleChange("callbackDate", null); handleChange("callbackStatus", null); }} className="px-4 py-2 bg-red-50 text-red-500 font-bold rounded-xl text-xs hover:bg-red-100 transition">Remove</button>
            )}
          </div>

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
                  type="button"
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

        {/* Fast Registration */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm uppercase tracking-wider">
            <Flame size={16} /> Fast Registration
          </div>
          {edited.status === "Reg.Done" ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={true}
                className="flex-1 py-3 rounded-xl font-bold bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                Added to Abhivyakti
              </button>
              <button
                type="button"
                onClick={() => setShowUndoStatusPrompt(true)}
                className="px-4 py-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 active:scale-95 hover:scale-105"
              >
                Undo
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                const calledForVal = edited[calledForField] || "";
                const selectedArr = calledForVal.split(",").map(x => x.trim()).filter(Boolean);
                if (selectedArr.length !== 1 && CALLED_FOR_OPTIONS.length > 1) {
                  setPromptSelection("");
                  setPendingSave(true);
                  setShowCalledForPrompt(true);
                } else {
                  const targetProg = selectedArr.length === 1 ? selectedArr[0] : (CALLED_FOR_OPTIONS[0] || "");
                  handleChange(calledForField, targetProg);
                  handleChange("status", "Reg.Done");
                }
              }}
              className="w-full py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 bg-white text-emerald-700 border-2 border-emerald-500 hover:bg-emerald-50 active:scale-95"
            >
              <CheckCircle2 size={18} />
              Add to Abhivyakti Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallEntryTab;
