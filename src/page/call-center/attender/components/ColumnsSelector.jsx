import React from "react";
import { X, Search, FileSpreadsheet } from "lucide-react";

export function ColumnsSelector({
  isOpen,
  onClose,
  hiddenColumns,
  setHiddenColumns,
  allPossibleCols,
  colSearchQuery,
  setColSearchQuery
}) {
  const standardFields = [
    "Name",
    "Phone",
    "Mobile",
    "Email",
    "City",
    "State",
    "Khoji",
    "Tags",
    "Source",
    "Called For"
  ];
  const otherFields = allPossibleCols.filter(c => !standardFields.includes(c));

  const filterBySearch = (list) => {
    if (!colSearchQuery) return list;
    return list.filter(item => item.toLowerCase().includes(colSearchQuery.toLowerCase()));
  };

  const filteredStandards = filterBySearch(standardFields);
  const filteredOthers = filterBySearch(otherFields);

  const renderColumnCheckbox = (col) => {
    const isChecked = !hiddenColumns.includes(col);
    return (
      <label
        key={col}
        className={`flex items-center gap-3 px-4 py-3 bg-white border rounded-2xl cursor-pointer hover:border-teal-200 hover:shadow-sm transition-all duration-150 active:scale-[0.98] ${
          isChecked ? "border-slate-200 font-bold" : "border-slate-100 opacity-60 font-semibold"
        }`}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => {
            if (isChecked) {
              setHiddenColumns(prev => [...prev, col]);
            } else {
              setHiddenColumns(prev => prev.filter(c => c !== col));
            }
          }}
          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer transition-all duration-150"
        />
        <span className="text-xs text-slate-700 select-none truncate">{col}</span>
      </label>
    );
  };

  return (
    <div className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300 ease-out ${
      isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
    }`}>
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] z-10 transition-all duration-300 ease-out transform ${
        isOpen ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-95"
      }`}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-sm">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Configure Sheet Columns</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Choose which fields are visible in the spreadsheet view.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search and Quick Actions */}
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-white">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search fields/columns..."
              value={colSearchQuery}
              onChange={e => setColSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-teal-500 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHiddenColumns([])}
              className="px-3 py-1.5 hover:bg-teal-50 text-teal-600 rounded-lg text-xs font-bold transition border border-transparent hover:border-teal-100"
            >
              Show All
            </button>
            <button
              onClick={() => setHiddenColumns(allPossibleCols)}
              className="px-3 py-1.5 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold transition border border-transparent hover:border-rose-100"
            >
              Hide All
            </button>
          </div>
        </div>

        {/* Columns List (Scrollable) */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
          {filteredStandards.length === 0 && filteredOthers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm font-medium">No columns match "{colSearchQuery}"</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredStandards.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                    Standard Fields
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredStandards.map(renderColumnCheckbox)}
                  </div>
                </div>
              )}

              {filteredOthers.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                    Custom & System Fields
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredOthers.map(renderColumnCheckbox)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-slate-50">
          <span className="text-xs text-slate-500 font-bold">
            {allPossibleCols.length - hiddenColumns.length} of {allPossibleCols.length} columns visible
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-xs hover:bg-teal-700 shadow-md shadow-teal-600/15 transition cursor-pointer"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
