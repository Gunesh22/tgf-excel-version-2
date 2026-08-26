import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, Search, X, Check, Plus } from "lucide-react";

const SearchableDropdown = ({
  options,
  selected,
  onChange,
  placeholder = "Select option...",
  isMulti = false,
  colorClass = "indigo",
  disabled = false,
  allowCreate = false,
  onCreate = null
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isSelected = (opt) => {
    if (!selected) return false;
    if (isMulti) {
      return selected.split(",").map(x => x.trim()).filter(Boolean).includes(opt);
    }
    return selected === opt;
  };

  const handleSelect = (opt) => {
    if (isMulti) {
      const selectedArr = selected.split(",").map(x => x.trim()).filter(Boolean);
      let updated;
      if (selectedArr.includes(opt)) {
        updated = selectedArr.filter(x => x !== opt);
      } else {
        updated = [...selectedArr, opt];
      }
      onChange(updated.join(", "));
    } else {
      onChange(opt);
      setIsOpen(false);
    }
  };

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const query = search.trim().toLowerCase();
    return options.filter(opt =>
      String(opt || "").toLowerCase().includes(query)
    );
  }, [options, search]);

  const getButtonText = () => {
    if (!selected) return placeholder;
    if (isMulti) {
      const selectedArr = selected.split(",").map(x => x.trim()).filter(Boolean);
      if (selectedArr.length === 0) return placeholder;
      return selectedArr.join(", ");
    }
    return selected;
  };

  const hasExactMatch = useMemo(() => {
    if (!search.trim()) return true;
    return options.some(opt =>
      String(opt || "").toLowerCase() === search.trim().toLowerCase()
    );
  }, [options, search]);

  const handleCreate = () => {
    if (disabled || !search.trim() || !onCreate) return;
    onCreate(search.trim());
    setIsOpen(false);
    setSearch("");
  };

  const hasValue = useMemo(() => {
    if (!selected) return false;
    if (isMulti) {
      return selected.split(",").map(x => x.trim()).filter(Boolean).length > 0;
    }
    return true;
  }, [selected, isMulti]);

  const ringClass = colorClass === "amber" ? "focus:ring-amber-500/10 focus:border-amber-500" :
                    colorClass === "blue" ? "focus:ring-blue-500/10 focus:border-blue-500" :
                    "focus:ring-indigo-500/10 focus:border-indigo-500";

  const buttonStyle = disabled
    ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
    : hasValue
      ? "bg-indigo-50/50 border-indigo-200 text-indigo-950 font-semibold"
      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 font-normal";

  const iconColor = hasValue ? "text-indigo-600" : "text-slate-400";

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 border rounded-lg text-xs text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 flex justify-between items-center transition cursor-pointer ${buttonStyle}`}
      >
        <span className="truncate">{getButtonText()}</span>
        <ChevronDown size={14} className={`${iconColor} shrink-0 ml-2`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-hidden flex flex-col animate-fade-in">
          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Search size={13} className="text-slate-400 shrink-0 ml-1" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search options..."
              className="w-full bg-transparent px-1 py-0.5 text-xs text-slate-800 focus:outline-none placeholder:text-slate-400"
              autoFocus={typeof window !== 'undefined' && !('ontouchstart' in window || navigator.maxTouchPoints > 0)}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 py-1 divide-y divide-slate-50 max-h-52">
            {filteredOptions.length === 0 && (!allowCreate || !search.trim()) ? (
              <div className="px-3 py-2 text-xs text-slate-400 italic text-center">No options found</div>
            ) : (
              <>
                {filteredOptions.map(opt => {
                  const active = isSelected(opt);
                  const itemStyle = active
                    ? "bg-indigo-50 text-indigo-900 font-semibold"
                    : "text-slate-700 hover:bg-slate-50 font-normal";
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSelect(opt)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition cursor-pointer ${itemStyle}`}
                    >
                      <span className="truncate">{opt}</span>
                      {active && (
                        <Check size={13} className="text-indigo-600 shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
                {allowCreate && search.trim() && !hasExactMatch && (
                  <button
                    type="button"
                    onClick={handleCreate}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border-t border-slate-100 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus size={13} className="shrink-0 text-indigo-600" />
                    <span>Create "{search.trim()}"</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;

