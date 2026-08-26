import React, { useState, useEffect, useRef } from "react";
import { Search, Phone, PhoneIncoming, RefreshCw, User, X, Sparkles, Command, PhoneOutgoing } from "lucide-react";

export const CommandPalette = ({
  isOpen,
  onClose,
  contacts = [],
  onSelectContact,
  onOpenCallEntry,
  onRebuildCache,
  onGetNumbers
}) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else if (onClose) onClose(false); // toggle handled by parent
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredContacts = query.trim()
    ? contacts.filter(c => {
        const q = query.toLowerCase();
        const name = (c.Name || c.name || c.caller || "").toLowerCase();
        const phone = (c.Phone || c.phone || c.Mobile || "").toLowerCase();
        const email = (c.Email || c.email || "").toLowerCase();
        return name.includes(q) || phone.includes(q) || email.includes(q);
      }).slice(0, 5)
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-start justify-center pt-20 px-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl flex flex-col overflow-hidden animate-slide-down"
        onClick={e => e.stopPropagation()}
      >
        {/* Command Search Bar */}
        <div className="p-3 border-b border-slate-200 flex items-center gap-2.5 bg-slate-50">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search contacts, phone numbers, or type a command... (Esc to close)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full text-xs font-medium bg-transparent text-slate-800 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-slate-100">
          {/* Quick Commands Group */}
          {!query && (
            <div className="py-1">
              <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Quick Actions</div>
              <button
                onClick={() => { onClose(); onOpenCallEntry?.(); }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <PhoneIncoming size={14} className="text-indigo-600" /> Add Call Entry
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Alt + A</span>
              </button>
              <button
                onClick={() => { onClose(); onGetNumbers?.(); }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <PhoneOutgoing size={14} className="text-slate-600" /> Get Numbers
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Alt + G</span>
              </button>
              <button
                onClick={() => { onClose(); onRebuildCache?.(); }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <RefreshCw size={14} className="text-slate-500" /> Rebuild Database Cache
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Alt + R</span>
              </button>
            </div>
          )}

          {/* Contact Search Results */}
          {query && filteredContacts.length > 0 && (
            <div className="py-1">
              <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Matching Contacts</div>
              {filteredContacts.map(c => (
                <div
                  key={c.id || c.Phone || c.name}
                  onClick={() => { onClose(); onSelectContact?.(c); }}
                  className="px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center">
                      {(c.Name || c.name || "C").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{c.Name || c.name || "Unknown"}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{c.Phone || c.phone || c.Mobile || "No phone"}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Select →</span>
                </div>
              ))}
            </div>
          )}

          {query && filteredContacts.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-400">
              No contacts or commands matching "{query}"
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1"><Command size={11} /> TGF CRM Command Palette</span>
          <span>Use <kbd className="font-mono bg-white border px-1 rounded">↑↓</kbd> to navigate</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
