import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  totalPages,
  setPage,
  filteredLogsLength,
  stats
}) {
  const pendingCount = stats.total - stats.called;

  return (
    <div className="bg-white border-t border-slate-200 px-6 py-2 flex items-center justify-between shrink-0 text-xs text-slate-500 select-none shadow-sm">
      {/* Left side stats badges */}
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-slate-400">Total:</span>
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-md">
            {filteredLogsLength}
          </span>
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-slate-400">Called:</span>
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100/40 font-bold rounded-md">
            {stats.called}
          </span>
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
        <span className="inline-flex items-center gap-1.5">
          <span className="font-semibold text-slate-400">Pending:</span>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100/40 font-bold rounded-md">
            {pendingCount < 0 ? 0 : pendingCount}
          </span>
        </span>
      </div>

      {/* Right side page selectors */}
      <div className="flex items-center gap-3">
        <button
          disabled={page === 1}
          onClick={() => setPage(p => p - 1)}
          className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 disabled:hover:bg-white transition shadow-sm cursor-pointer"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="font-bold text-slate-700 text-xs">
          Page {page} <span className="font-medium text-slate-400">of</span> {totalPages || 1}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(p => p + 1)}
          className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 disabled:hover:bg-white transition shadow-sm cursor-pointer"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
