import React from "react";

export const HistoryTimeline = ({
  mergedHistory,
  historyList,
  onChangeHistory
}) => {
  if (!mergedHistory || mergedHistory.length === 0) return null;

  return (
    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 border border-slate-200 rounded-lg p-2.5 bg-slate-50/50 text-xs">
      {[...mergedHistory].reverse().map((h, revIdx) => {
        const origIdx = h.originalIndex;
        const calledForStr = h.calledFor || h.called_for || h["Called For"] || "";
        const sourceStr = h.source || h.sourse || h.Source || "";
        const callTypeStr = h.callType || "";

        return (
          <div key={revIdx} className="bg-white rounded-md p-2 border border-slate-200 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-500 font-medium">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-700">
                  {(() => {
                    const timestamp = h.timestamp;
                    const d = timestamp ? (timestamp.toDate ? timestamp.toDate() : (timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp))) : null;
                    return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
                  })()}
                </span>
                {h.status && (
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                    h.status === "Interested" ? "bg-indigo-50 text-indigo-700 border border-indigo-200" :
                    h.status === "Reg.Done" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                    "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}>{h.status}</span>
                )}
                {calledForStr && (
                  <span className="text-slate-500 text-[10px] truncate max-w-[120px]">
                    • {calledForStr}
                  </span>
                )}
                {callTypeStr && (
                  <span className="text-[10px] font-medium uppercase text-slate-400">
                    ({callTypeStr})
                  </span>
                )}
              </div>
              <span className="text-slate-500 text-[10px] font-medium ml-auto">
                {h.attenderName || "Attender"}
              </span>
            </div>
            <textarea
              value={h.remark || ""}
              readOnly={!h.isCurrentDoc || origIdx === -1 || !onChangeHistory}
              onChange={e => {
                if (!h.isCurrentDoc || origIdx === -1 || !onChangeHistory) return;
                const updatedHistory = [...(historyList || [])];
                updatedHistory[origIdx] = { ...updatedHistory[origIdx], remark: e.target.value };
                onChangeHistory(updatedHistory);
              }}
              rows={1}
              className={`w-full bg-transparent text-xs text-slate-800 resize-none focus:outline-none leading-tight ${
                h.isCurrentDoc && origIdx !== -1 && onChangeHistory ? "focus:bg-slate-50 rounded px-1" : "text-slate-600"
              }`}
              placeholder="No note logged..."
            />
          </div>
        );
      })}
    </div>
  );
};

export default HistoryTimeline;
