import React from "react";
import { Flame, Clock } from "lucide-react";
import { normalizePhone } from "../../../../lib/db";
import { getFieldWithFallback } from "../utils";

function CollapsedTags({ tags }) {
  const [expanded, setExpanded] = React.useState(false);

  if (tags.length === 0) {
    return <span className="text-gray-400">—</span>;
  }

  // If there are 2 or fewer tags, just render them
  if (tags.length <= 2) {
    return (
      <div className="flex flex-col gap-1 items-start">
        {tags.map((t, idx) => (
          <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
            #{t}
          </span>
        ))}
      </div>
    );
  }

  // If expanded, show all with a "show less" toggle
  if (expanded) {
    return (
      <div 
        className="flex flex-col gap-1 items-start" 
        onClick={(e) => {
          e.stopPropagation(); // Prevent opening EditModal
          setExpanded(false);
        }}
      >
        {tags.map((t, idx) => (
          <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
            #{t}
          </span>
        ))}
        <button className="text-[10px] text-indigo-600 hover:text-indigo-800 font-extrabold underline mt-0.5 transition-colors">
          Show Less
        </button>
      </div>
    );
  }

  // Otherwise, show first 2 and a "+X more" trigger
  const visibleTags = tags.slice(0, 2);
  const remaining = tags.length - 2;

  return (
    <div className="flex flex-col gap-1 items-start">
      {visibleTags.map((t, idx) => (
        <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
          #{t}
        </span>
      ))}
      <button
        onClick={(e) => {
          e.stopPropagation(); // Prevent opening EditModal
          setExpanded(true);
        }}
        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 transition-colors whitespace-nowrap"
      >
        +{remaining} more
      </button>
    </div>
  );
}

function parseTimestamp(t) {
  if (!t) return null;
  if (t instanceof Date) return t;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t === "object" && t.seconds !== undefined) {
    return new Date(t.seconds * 1000 + Math.round((t.nanoseconds || 0) / 1000000));
  }
  return new Date(t);
}

export function ContactTable({
  scrollRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  dynamicCols,
  hiddenColumns,
  paginated,
  page,
  rowsPerPage,
  duplicatePhoneMap,
  didDrag,
  setEditingRow,
  callLogs
}) {
  const getStatusBadge = (log) => {
    const status = log.status || log.Status;
    if (status) {
      if (status === "Reg.Done") return { bg: "bg-emerald-100", text: "text-emerald-700", label: status };
      if (status === "Interested") return { bg: "bg-blue-100", text: "text-blue-700", label: status };
      if (status === "Info given") return { bg: "bg-purple-100", text: "text-purple-700", label: status };
      if (["NA", "Busy", "Call Cut", "switched off", "Not interested", "Invalid No"].includes(status)) {
        return { bg: "bg-red-100", text: "text-red-600", label: status };
      }
      return { bg: "bg-indigo-100", text: "text-indigo-700", label: status };
    }
    const hasAttempt = log.callbackDate || log.remark || log.Remark || log.remarks;
    if (hasAttempt) {
      return { bg: "bg-blue-50 border border-blue-200/60", text: "text-blue-700", label: "Attempted" };
    }
    return { bg: "bg-gray-100", text: "text-gray-400", label: "Pending" };
  };

  const getCallbackStr = (log) => {
    if (!log.callbackDate) return "";
    const d = parseTimestamp(log.callbackDate);
    return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "";
  };

  const visibleCount = 1 + dynamicCols.filter(col => !hiddenColumns.includes(col)).length
    + (!hiddenColumns.includes("Type") ? 1 : 0)
    + (!hiddenColumns.includes("Status") ? 1 : 0)
    + (!hiddenColumns.includes("Remark") ? 1 : 0)
    + (!hiddenColumns.includes("Callback") ? 1 : 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        className="flex-1 overflow-auto cursor-grab"
        style={{ userSelect: "none" }}
      >
        <table className="table-auto w-full text-left border-collapse text-sm">
          <thead className="bg-[#f8f9fa] border-b border-gray-300 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="py-3 px-4 text-xs font-black text-gray-600 uppercase w-12 border-r border-gray-200 bg-[#e9ecef]">#</th>
              {dynamicCols.map(col => {
                if (hiddenColumns.includes(col)) return null;
                return (
                  <th key={col} className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px] whitespace-nowrap">
                    {col}
                  </th>
                );
              })}
              {!hiddenColumns.includes("Type") && (
                <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[100px]">Type</th>
              )}
              {!hiddenColumns.includes("Status") && (
                <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[140px]">Status</th>
              )}
              {!hiddenColumns.includes("Remark") && (
                <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase border-r border-gray-200 min-w-[300px]">Remark</th>
              )}
              {!hiddenColumns.includes("Callback") && (
                <th className="py-3 px-4 text-xs font-bold text-gray-600 uppercase min-w-[120px]">Callback</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map((log, idx) => {
              const isDue = log._callbackDue;
              const isHot = log.isHotLead;
              const hasFollowup = log.callbackDate || log.status === "reminder" || log.status === "Next time";
              const isCalled = !!(log.status || log.callbackDate || log.remark || log.Remark || log.remarks);

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
                  <td className="py-2 px-4 text-xs font-bold text-gray-400 text-center bg-[#f8f9fa] border-r border-gray-200 align-top">
                    {(page - 1) * rowsPerPage + idx + 1}
                  </td>
                  {dynamicCols.map((col, ci) => {
                    if (hiddenColumns.includes(col)) return null;

                    const getVal = (item, column) => {
                      const standardOrder = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Tags", "Source", "Called For"];
                      if (standardOrder.includes(column)) {
                        return getFieldWithFallback(item, column);
                      }
                      if (item[column] !== undefined && item[column] !== null) return String(item[column]);
                      const keys = Object.keys(item);
                      const matchingKey = keys.find(k => k.toLowerCase() === column.toLowerCase());
                      return matchingKey ? String(item[matchingKey]) : "";
                    };
                    const val = getVal(log, col);
                    const isName = col.toLowerCase().includes("name") || col.toLowerCase().includes("lead");

                    const logKeys = Object.keys(log);
                    const phoneKey = logKeys.find(k => ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno"].includes(k.toLowerCase()))
                      || logKeys.find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("mobile") || k.toLowerCase().includes("whatsapp"));
                    const phone = phoneKey ? normalizePhone(log[phoneKey]) : "";
                    const isDupInProg = isName && phone && duplicatePhoneMap[log.programId || "incoming"]?.[phone] > 1;

                    if (col === "Tags") {
                      let rawTags = [];
                      if (Array.isArray(log.tags)) {
                        rawTags = log.tags;
                      } else if (log.Tags) {
                        rawTags = [log.Tags];
                      } else if (log.tag) {
                        rawTags = [log.tag];
                      } else {
                        const fallbackVal = getFieldWithFallback(log, "Tags");
                        if (fallbackVal) {
                          rawTags = [fallbackVal];
                        }
                      }

                      const seen = new Set();
                      rawTags.forEach(t => {
                        if (typeof t === "string") {
                          t.split(",").map(x => x.trim()).filter(Boolean).forEach(x => seen.add(x));
                        } else if (t) {
                          seen.add(String(t).trim());
                        }
                      });
                      const tagsArr = Array.from(seen).sort();

                      if (tagsArr.length === 0) {
                        return <td key={col} className="py-4 px-4 border-r border-gray-100 text-sm text-gray-400 align-top">—</td>;
                      }

                      return (
                        <td key={col} className="py-2 px-4 border-r border-gray-100 text-sm text-gray-700 min-w-[140px] align-top">
                          <CollapsedTags tags={tagsArr} />
                        </td>
                      );
                    }

                    return (
                      <td key={col} className={`py-2 px-4 border-r border-gray-100 text-sm ${isName ? "font-bold text-gray-900" : "text-gray-700"} min-w-[140px] whitespace-normal align-top`}>
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
                  {!hiddenColumns.includes("Type") && (
                    <td className="py-2 px-4 border-r border-gray-100 align-top">
                      <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-xl ${log.callType === "incoming" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                        {log.callType || "outgoing"}
                      </span>
                    </td>
                  )}
                  {!hiddenColumns.includes("Status") && (
                    <td className="py-2 px-4 border-r border-gray-100 align-top">
                      {(() => {
                        const badge = getStatusBadge(log);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${badge.bg} ${badge.text}`}>
                            {log.isHotLead && <Flame size={10} className="inline" fill="currentColor" />}
                            {badge.label}
                          </span>
                        );
                      })()}
                    </td>
                  )}
                  {!hiddenColumns.includes("Remark") && (
                    <td className="py-2 px-4 border-r border-gray-100 text-gray-700 text-sm leading-relaxed min-w-[300px] whitespace-normal align-top">
                      {(() => {
                        const directRemark = log.remark || log.Remark || "";
                        if (directRemark) return directRemark;
                        if (Array.isArray(log.history) && log.history.length > 0) {
                          const lastRemark = [...log.history].reverse().find(h => h.remark)?.remark;
                          if (lastRemark) {
                            return (
                              <span className="text-gray-500 italic text-xs">
                                {lastRemark}
                              </span>
                            );
                          }
                        }
                        return <span className="text-gray-200 font-medium">—</span>;
                      })()}
                    </td>
                  )}
                  {!hiddenColumns.includes("Callback") && (
                    <td className="py-2 px-4 align-top whitespace-nowrap">
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
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded w-fit ${
                              log.callbackStatus === "done" ? "bg-emerald-100 text-emerald-700" :
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
                  )}
                </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={visibleCount}>
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
    </div>
  );
}
