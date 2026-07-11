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
    ? "bg-gray-100/60 border-gray-150 text-gray-400 cursor-not-allowed"
    : hasValue
      ? colorClass === "amber" ? "bg-amber-50/40 border-amber-300 text-amber-900 font-bold" :
        colorClass === "blue" ? "bg-blue-50/40 border-blue-300 text-blue-900 font-bold" :
        "bg-indigo-50/40 border-indigo-300 text-indigo-900 font-bold"
      : "bg-gray-50 border-gray-150 text-gray-400 hover:bg-gray-100/50 font-medium";

  const iconColor = hasValue
    ? colorClass === "amber" ? "text-amber-500" :
      colorClass === "blue" ? "text-blue-500" :
      "text-indigo-500"
    : "text-gray-400";

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-2 border rounded-xl text-sm text-left focus:outline-none focus:ring-4 ${ringClass} flex justify-between items-center transition ${buttonStyle}`}
      >
        <span className="truncate">{getButtonText()}</span>
        <ChevronDown size={14} className={`${iconColor} shrink-0 ml-2`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-72 overflow-hidden flex flex-col animate-slide-up animate-duration-150">
          <div className="p-2 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
            <Search size={14} className="text-gray-400 shrink-0 ml-1" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search options..."
              className="w-full bg-transparent px-1 py-1 text-xs text-gray-800 focus:outline-none placeholder:text-gray-400"
              autoFocus
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 p-0.5">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 py-1 divide-y divide-gray-50 max-h-56">
            {filteredOptions.length === 0 && (!allowCreate || !search.trim()) ? (
              <div className="px-4 py-3 text-xs text-gray-400 italic text-center">No options found</div>
            ) : (
              <>
                {filteredOptions.map(opt => {
                  const active = isSelected(opt);
                  const itemStyle = active
                    ? colorClass === "amber" ? "bg-amber-50 text-amber-800 font-bold" :
                      colorClass === "blue" ? "bg-blue-50 text-blue-800 font-bold" :
                      "bg-indigo-50 text-indigo-800 font-bold"
                    : "text-gray-700 hover:bg-gray-50/80";
                  const activeCheckColor = colorClass === "amber" ? "text-amber-600" :
                                           colorClass === "blue" ? "text-blue-600" :
                                           "text-indigo-600";
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSelect(opt)}
                      className={`w-full px-4 py-2.5 text-left text-xs font-semibold flex items-center justify-between transition ${itemStyle}`}
                    >
                      <span className="truncate">{opt}</span>
                      {active && (
                        <Check size={14} className={`${activeCheckColor} shrink-0 ml-2`} />
                      )}
                    </button>
                  );
                })}
                {allowCreate && search.trim() && !hasExactMatch && (
                  <button
                    type="button"
                    onClick={handleCreate}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-indigo-600 hover:bg-indigo-50 border-t border-gray-100 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus size={14} className="shrink-0 text-indigo-600" />
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

