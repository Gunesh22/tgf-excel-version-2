import React, { useState } from "react";
import { Search, X, Trash2, Plus, Edit2, Check, AlertTriangle } from "lucide-react";

export function OptionsManagerCard({ title, icon: Icon, options, onAdd, onDelete, onRename }) {
  const [search, setSearch] = useState("");
  const [editingOpt, setEditingOpt] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirmOpt, setDeleteConfirmOpt] = useState(null);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatchExists = options.some(opt =>
    opt.toLowerCase() === search.trim().toLowerCase()
  );

  const startEditing = (opt) => {
    setEditingOpt(opt);
    setEditValue(opt);
  };

  const cancelEditing = () => {
    setEditingOpt(null);
    setEditValue("");
  };

  const saveEditing = (opt) => {
    if (!editValue || !editValue.trim()) {
      return;
    }
    const trimmed = editValue.trim();
    if (trimmed !== opt && onRename) {
      onRename(opt, trimmed);
    }
    setEditingOpt(null);
    setEditValue("");
  };

  const confirmDelete = () => {
    if (deleteConfirmOpt && onDelete) {
      onDelete(deleteConfirmOpt);
    }
    setDeleteConfirmOpt(null);
  };

  return (
    <>
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
                className="flex items-center justify-between px-4 py-2 text-xs text-gray-700 font-semibold hover:bg-slate-50 transition group min-h-[40px]"
              >
                {editingOpt === opt ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveEditing(opt);
                        if (e.key === "Escape") cancelEditing();
                      }}
                      autoFocus
                      className="flex-1 bg-indigo-50/50 border border-indigo-200 px-2 py-1 rounded-lg text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => saveEditing(opt)}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition shrink-0"
                      title="Save name"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg transition shrink-0"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="truncate flex-1 pr-2">{opt}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={() => startEditing(opt)}
                        className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        title={`Rename ${opt}`}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmOpt(opt)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition"
                        title={`Delete ${opt}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                )}
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Delete Option?</h3>
                <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed font-medium bg-gray-50 p-3 rounded-2xl border border-gray-100">
              Are you sure you want to delete <span className="font-bold text-gray-900">"{deleteConfirmOpt}"</span> from <span className="font-bold text-indigo-600">{title}</span>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpt(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                Delete Option
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

