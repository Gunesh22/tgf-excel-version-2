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
    <div className="space-y-4 p-4 text-xs bg-white rounded-lg">
      {/* Call Type and Options */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
          Call Type
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CALL_TYPE_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => handleCallTypeChange(opt)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                edited.callType === opt
                  ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {opt === "outgoing f" ? "Outgoing (F)" : opt === "incoming f" ? "Incoming (F)" : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Called For and Source Dropdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Searchable Dropdown: Called For */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
            <Phone size={12} className="text-slate-400" /> Called For <span className="text-rose-500 font-bold ml-0.5">*</span>
          </label>
          <SearchableDropdown
            options={CALLED_FOR_OPTIONS}
            selected={String(edited[calledForField] || "")}
            onChange={val => handleChange(calledForField, val)}
            placeholder="Search & select multiple..."
            isMulti={true}
            colorClass="indigo"
            disabled={!getEditable(calledForField)}
          />
          {getOtherValuesForField(calledForField).map((item, idx) => (
            <div key={idx} className="text-[11px] text-slate-600 font-medium mt-0.5 flex items-center gap-1">
              <span className="opacity-75">👤 {item.name}:</span>
              <span className="bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 font-medium">
                {Array.isArray(item.val) ? item.val.join(", ") : String(item.val)}
              </span>
            </div>
          ))}
        </div>

        {/* Searchable Dropdown: Source */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
            <Tag size={12} className="text-slate-400" /> Source <span className="text-rose-500 font-bold ml-0.5">*</span>
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
            <div key={idx} className="text-[11px] text-slate-600 font-medium mt-0.5 flex items-center gap-1">
              <span className="opacity-75">👤 {item.name}:</span>
              <span className="bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 font-medium">{item.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Call Result Status & Objection Tracker */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-slate-400" /> General Result Status <span className="text-rose-500 font-bold ml-0.5">*</span>
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
              setEdited(prev => {
                const next = {
                  ...prev,
                  status: val,
                  queryStatus: val === "Query" ? (prev.queryStatus || "Pending") : prev.queryStatus,
                };
                if (val === "Reg.Done") {
                  next.callbackDate = null;
                  next.callbackStatus = null;
                }
                return next;
              });
            }}
            placeholder="Search & select status..."
            colorClass="indigo"
          />
          {getOtherValuesForField("status").map((item, idx) => (
            <div key={idx} className="text-[11px] text-slate-600 font-medium mt-0.5 flex items-center gap-1">
              <span className="opacity-75">👤 {item.name}:</span>
              <span className="bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 font-medium">{item.val}</span>
            </div>
          ))}

          {/* Query Sub-status Toggle */}
          {edited.status === "Query" && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-medium text-slate-600 uppercase tracking-wider shrink-0">Query:</span>
              <div className="flex gap-1.5">
                {["Pending", "Solved"].map(qs => (
                  <button
                    key={qs}
                    type="button"
                    onClick={() => handleChange("queryStatus", qs)}
                    className={`px-2.5 py-0.5 rounded text-xs font-medium border transition-all cursor-pointer ${
                      (edited.queryStatus || "Pending") === qs
                        ? qs === "Pending"
                          ? "bg-amber-500 text-white border-amber-500 shadow-2xs"
                          : "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {qs === "Pending" ? "⏳ Pending" : "✓ Solved"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Objection Tracker */}
        {(edited.status === "Not interested" || edited.status === "Not possible") && (
          <div className="space-y-1.5 p-3 bg-rose-50/60 border border-rose-200 rounded-lg animate-slide-up">
            <label className="text-xs font-semibold text-rose-700 flex items-center gap-1">
              <AlertCircle size={12} /> Reason for {edited.status.toLowerCase()}:
            </label>
            <div className="flex flex-wrap gap-1">
              {OBJECTION_REASONS.map(reason => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => handleChange("objectionReason", edited.objectionReason === reason ? "" : reason)}
                  className={`px-2 py-0.5 rounded text-xs font-medium border transition-all cursor-pointer ${edited.objectionReason === reason
                      ? "bg-rose-600 text-white border-rose-600 shadow-2xs"
                      : "bg-white text-rose-700 border-rose-200 hover:bg-rose-100/50"
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
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
            <MessageSquare size={12} className="text-slate-400" /> Call Notes
            {mergedHistory && mergedHistory.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[10px] font-semibold">{mergedHistory.length} past</span>
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
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-normal resize-none overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition leading-relaxed text-slate-800"
              placeholder="✏️ Add note for today's call..."
            />
          </div>
        </div>

        {/* Follow-up / Callback scheduling */}
        <div className="space-y-1">
          <label className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1 ${edited.callbackDate ? "text-amber-700" : "text-slate-700"}`}>
            <CalendarDays size={12} /> {edited.callbackDate ? "Follow-up Scheduled" : "Schedule Follow-up"}
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={getCallbackDateStr()}
              onChange={e => {
                handleChange("callbackDate", e.target.value);
                if (e.target.value && !edited.callbackStatus) handleChange("callbackStatus", "pending");
              }}
              className={`flex-1 px-3 py-1.5 border rounded-lg text-xs font-medium focus:outline-none transition ${edited.callbackDate ? "bg-amber-50/80 border-amber-300 text-amber-900 ring-2 ring-amber-500/10" : "bg-slate-50 border-slate-200 text-slate-800"}`}
            />
            {edited.callbackDate && (
              <button type="button" onClick={() => { handleChange("callbackDate", null); handleChange("callbackStatus", null); }} className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 font-medium rounded-lg text-xs hover:bg-rose-100 transition cursor-pointer">Remove</button>
            )}
          </div>

          {edited.callbackDate && (
            <div className="flex gap-1 flex-wrap pt-0.5">
              {[
                { value: "pending", label: "⏳ Pending", activeClass: "bg-amber-500 text-white border-amber-500 shadow-2xs", inactiveClass: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
                { value: "done", label: "✓ Done", activeClass: "bg-emerald-600 text-white border-emerald-600 shadow-2xs", inactiveClass: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
                { value: "rescheduled", label: "↺ Rescheduled", activeClass: "bg-sky-600 text-white border-sky-600 shadow-2xs", inactiveClass: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100" },
                { value: "cancelled", label: "✕ Cancelled", activeClass: "bg-rose-600 text-white border-rose-600 shadow-2xs", inactiveClass: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChange("callbackStatus", opt.value)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-all cursor-pointer ${(edited.callbackStatus || "pending") === opt.value
                    ? opt.activeClass
                    : opt.inactiveClass
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fast Registration */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
            <Flame size={14} className="text-amber-500" fill="currentColor" /> Abhivyakti Registration
          </div>
          {edited.status === "Reg.Done" ? (
            <div className="flex gap-1.5">
              <span className="px-2.5 py-1 rounded-lg font-medium bg-emerald-600 text-white flex items-center gap-1 text-xs">
                <CheckCircle2 size={13} /> Registered
              </span>
              <button
                type="button"
                onClick={() => setShowUndoStatusPrompt(true)}
                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-medium rounded-lg text-xs transition cursor-pointer"
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
              className="px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs shadow-2xs cursor-pointer"
            >
              <CheckCircle2 size={13} />
              Mark Registered
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallEntryTab;
