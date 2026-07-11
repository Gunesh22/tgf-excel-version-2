import React, { useEffect } from "react";

export const HistoryTimeline = ({
  mergedHistory,
  historyList,
  onChangeHistory
}) => {
  if (!mergedHistory || mergedHistory.length === 0) return null;

  return (
    <div className="space-y-2 border border-gray-100 rounded-2xl p-3 bg-gray-50/50">
      {[...mergedHistory].reverse().map((h, revIdx) => {
        const origIdx = h.originalIndex;
        return (
          <div key={revIdx} className="flex gap-2.5">
            <div className="shrink-0 flex flex-col items-center pt-2">
              <div className={`w-2 h-2 rounded-full ${h.isCurrentDoc ? "bg-indigo-300" : "bg-amber-400 animate-pulse"} shrink-0`} />
              {revIdx < mergedHistory.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
            </div>
            <div className="flex-1 bg-white rounded-xl p-3 border border-gray-100 shadow-sm mb-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide">
                  📅 {(() => {
                    const timestamp = h.timestamp;
                    const d = timestamp ? (timestamp.toDate ? timestamp.toDate() : (timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp))) : null;
                    return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Unknown Date";
                  })()}
                </span>
                {h.status && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                    h.status === "Interested" ? "bg-blue-100 text-blue-700" :
                    h.status === "Reg.Done" ? "bg-emerald-100 text-emerald-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{h.status}</span>
                )}
                {!h.isCurrentDoc && (
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-bold border border-amber-200 uppercase tracking-wider">
                    {h.sourceProgram}
                  </span>
                )}
                <span className="text-[9px] text-gray-300 font-bold ml-auto truncate max-w-[80px]">{h.attenderName}</span>
              </div>
              <textarea
                value={h.remark || ""}
                readOnly={!h.isCurrentDoc || origIdx === -1}
                onChange={e => {
                  if (!h.isCurrentDoc || origIdx === -1) return;
                  const updatedHistory = [...(historyList || [])];
                  updatedHistory[origIdx] = { ...updatedHistory[origIdx], remark: e.target.value };
                  onChangeHistory(updatedHistory);
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
                className={`w-full bg-transparent text-sm text-gray-700 resize-none overflow-hidden focus:outline-none rounded-lg px-1 py-0.5 transition leading-relaxed placeholder:text-gray-300 ${
                  h.isCurrentDoc && origIdx !== -1 ? "focus:bg-slate-50 focus:ring-2 focus:ring-indigo-100" : "text-gray-500 italic"
                }`}
                placeholder="No note for this call..."
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HistoryTimeline;
