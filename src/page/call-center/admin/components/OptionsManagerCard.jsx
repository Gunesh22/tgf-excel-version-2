import React, { useState } from "react";
import { Search, X, Trash2, Plus } from "lucide-react";

export function OptionsManagerCard({ title, icon: Icon, options, onAdd, onDelete }) {
  const [search, setSearch] = useState("");

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatchExists = options.some(opt =>
    opt.toLowerCase() === search.trim().toLowerCase()
  );

  return (
    <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm p-6 flex flex-col h-[500px]">
      <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-gray-100">
        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
          <Icon size={16} />
        </div>
        <h3 className="font-black text-gray-900 text-sm tracking-wide uppercase">{title}</h3>
      </div>

      {/* Main search-select container matching the provided image's design */}
      <div className="flex-1 flex flex-col border border-gray-200/80 rounded-2xl overflow-hidden bg-white shadow-sm">
        {/* Search input header */}
        <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search or add options...`}
            className="w-full bg-transparent text-xs text-gray-800 focus:outline-none placeholder:text-gray-400 font-semibold"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 py-1">
          {filteredOptions.map((opt) => (
            <div
              key={opt}
              className="flex items-center justify-between px-4 py-3 text-xs text-gray-700 font-semibold hover:bg-slate-50 transition group"
            >
              <span className="truncate">{opt}</span>
              <button
                type="button"
                onClick={() => onDelete(opt)}
                className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded-lg transition"
                title={`Delete ${opt}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {filteredOptions.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-gray-400 font-medium">
              No matching options found
            </div>
          )}
        </div>

        {/* Bottom add bar if input has value and is unique */}
        {search.trim() && !exactMatchExists && (
          <button
            type="button"
            onClick={() => {
              onAdd(search.trim());
              setSearch("");
            }}
            className="p-3.5 border-t border-gray-100 bg-white text-indigo-600 hover:bg-indigo-50/50 font-bold text-xs text-left transition flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Plus size={14} className="text-indigo-600" />
            Create "{search.trim()}"
          </button>
        )}
      </div>
    </div>
  );
}
