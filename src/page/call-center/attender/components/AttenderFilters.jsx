import React from "react";
import {
  Search, SlidersHorizontal, FileSpreadsheet, Flame, Clock, Tag,
  ChevronDown, X, AlertCircle, Phone, Calendar, CalendarDays,
  User, CheckCircle2, CheckSquare
} from "lucide-react";
import { STATUS_OPTIONS } from "../utils";

function MultiSelectDropdown({
  label,
  icon,
  options,
  selectedValues = [],
  onChange,
  placeholder = "Search...",
  colorClass = "text-indigo-500",
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filteredOptions = React.useMemo(() => {
    return options.filter(opt => {
      const displayLabel = typeof opt === "object" ? opt.label : opt;
      return String(displayLabel || "").toLowerCase().includes(search.toLowerCase());
    });
  }, [options, search]);

  const handleToggle = (opt) => {
    const value = typeof opt === "object" ? opt.value : opt;
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const isChecked = (opt) => {
    const value = typeof opt === "object" ? opt.value : opt;
    return selectedValues.includes(value);
  };

  const hasSelection = selectedValues && selectedValues.length > 0;

  return (
    <div ref={containerRef} className="relative space-y-1.5 transition-all">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1 select-none">
        {icon} {label}
      </label>
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full px-3 py-2 bg-gray-50 border rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100/50 active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          hasSelection 
            ? "border-indigo-300 bg-indigo-50/30 text-indigo-700 font-bold" 
            : "border-gray-200"
        }`}
      >
        <span className="truncate">
          {!hasSelection
            ? `All ${label}s`
            : `${selectedValues.length} Selected`}
        </span>
        <ChevronDown size={14} className={`transition-transform duration-300 shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <div className={`absolute left-0 mt-1.5 w-full min-w-[200px] max-w-[280px] bg-white border border-gray-200 rounded-2xl shadow-xl z-50 flex flex-col p-3 transition-all duration-200 transform origin-top ${
        isOpen
          ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
          : "opacity-0 -translate-y-2 scale-95 pointer-events-none"
      }`}>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-200 rounded-xl px-2.5 py-1.5 mb-2 shrink-0">
          <Search size={12} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs font-semibold text-gray-700 outline-none w-full placeholder:text-gray-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="p-0.5 hover:bg-gray-200 rounded-full transition text-gray-400 shrink-0 active:scale-90"
            >
              <X size={10} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] font-black text-indigo-600 uppercase tracking-wider px-1 mb-2 shrink-0 select-none">
          <button
            type="button"
            onClick={() => {
              const allVals = options.map(opt => typeof opt === "object" ? opt.value : opt);
              onChange(allVals);
            }}
            className="hover:underline hover:scale-[1.02] active:scale-[0.98] transition-transform duration-100"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => {
              onChange([]);
            }}
            className="hover:underline text-rose-600 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-100"
          >
            Clear
          </button>
        </div>

        <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1 flex-1">
          {filteredOptions.map((opt, idx) => {
            const checked = isChecked(opt);
            const val = typeof opt === "object" ? opt.value : opt;
            const displayLabel = typeof opt === "object" ? opt.label : opt;
            return (
              <label
                key={val + "-" + idx}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150 text-xs font-bold hover:scale-[1.01] active:scale-[0.99] ${
                  checked ? "bg-indigo-50/40 text-indigo-700 font-extrabold" : "text-gray-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggle(opt)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 transition-all duration-150"
                />
                <span className="truncate">{displayLabel}</span>
              </label>
            );
          })}
          {filteredOptions.length === 0 && (
            <div className="text-center py-4 text-xs font-semibold text-gray-400 select-none">
              No matches.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export function AttenderFilters({
  // Search & sorting
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  setPage,

  // Advanced toggle
  showAdvancedFilters,
  setShowAdvancedFilters,
  activeFiltersCount,

  // Columns toggle
  hiddenColumns,
  allPossibleCols,
  setIsColumnModalOpen,

  // Status quick filters
  filterStatus,
  setFilterStatus,

  // Tags filter
  availableTags,
  selectedTags,
  setSelectedTags,
  tagDropdownOpen,
  setTagDropdownOpen,
  tagSearchQuery,
  setTagSearchQuery,
  tagFilteredLogsLength,
  resetOtherFilters,

  // Stats for banner
  stats,

  // Advanced filters state
  filterSource,
  setFilterSource,
  filterCity,
  setFilterCity,
  filterCalledFor,
  setFilterCalledFor,
  filterCallType,
  setFilterCallType,
  filterSubProgram,
  setFilterSubProgram,
  filterObjectionReason,
  setFilterObjectionReason,
  filterCallbackStatus,
  setFilterCallbackStatus,
  filterCallCount,
  setFilterCallCount,
  filterGeneralStatus,
  setFilterGeneralStatus,
  filterQueryStatus,
  setFilterQueryStatus,
  filterAbhivyakti,
  setFilterAbhivyakti,
  filterKhoji,
  setFilterKhoji,
  filterDateType,
  setFilterDateType,
  filterDateRange,
  setFilterDateRange,
  customDateFrom,
  setCustomDateFrom,
  customDateTo,
  setCustomDateTo,
  customTimeFrom,
  setCustomTimeFrom,
  customTimeTo,
  setCustomTimeTo,

  // Dropdown options arrays
  uniqueSources,
  uniqueCities,
  uniqueCalledFor,
  uniqueSubPrograms,
  uniqueObjectionReasons,

  // Clear filters handler
  handleClearAllFilters
}) {
  const [filterSearchQuery, setFilterSearchQuery] = React.useState("");

  const shouldShowFilter = (label) => {
    if (!filterSearchQuery.trim()) return true;
    return label.toLowerCase().includes(filterSearchQuery.trim().toLowerCase());
  };

  const filterVisible = {
    source: shouldShowFilter("Source") || shouldShowFilter("Origin"),
    city: shouldShowFilter("City") || shouldShowFilter("Location"),
    calledFor: shouldShowFilter("Called For"),
    callType: shouldShowFilter("Call Type") || shouldShowFilter("Incoming Outgoing"),
    subProgram: shouldShowFilter("Sub Program") || shouldShowFilter("Sheet"),
    objection: shouldShowFilter("Objection Reason") || shouldShowFilter("Reject"),
    callbackStatus: shouldShowFilter("Callback Status") || shouldShowFilter("Pending Done"),
    callCount: shouldShowFilter("Call Count") || shouldShowFilter("Number of Calls"),
    genStatus: shouldShowFilter("Gen. Status") || shouldShowFilter("General Result"),
    queryStatus: shouldShowFilter("Query Status") || shouldShowFilter("Query Pending") || shouldShowFilter("Query Solved"),
    abhivyakti: shouldShowFilter("Abhivyakti") || shouldShowFilter("Registration"),
    khoji: shouldShowFilter("Khoji Status") || shouldShowFilter("Maha Asmani"),
    date: shouldShowFilter("Date") || shouldShowFilter("Time") || shouldShowFilter("Calendar") || shouldShowFilter("Called Date") || shouldShowFilter("Assignment Date")
  };

  const visibleCount = Object.values(filterVisible).filter(Boolean).length;

  React.useEffect(() => {
    if (!showAdvancedFilters) {
      setFilterSearchQuery("");
    }
  }, [showAdvancedFilters]);

  return (
    <>
      {/* Tag Selector */}
      {availableTags.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-6 py-2.5 flex items-center gap-3 shrink-0 relative">
          <Tag size={14} className="text-indigo-500 shrink-0" />
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0">Tag Filter</span>
          
          <div className="relative">
            <button
              onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
              className="flex items-center justify-between gap-2 px-4 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl font-black text-sm text-indigo-700 hover:bg-indigo-100 transition focus:outline-none min-w-[200px]"
            >
              <span>
                {selectedTags.length === 0
                  ? "— All Tags —"
                  : `${selectedTags.length} Tag${selectedTags.length > 1 ? "s" : ""} Selected`}
              </span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${tagDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {tagDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setTagDropdownOpen(false)} />
                <div className="absolute left-0 mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-30 flex flex-col p-3 animate-slide-down-scale origin-top">
                  {/* Tag Search Input */}
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-2 shrink-0">
                    <Search size={14} className="text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search tags..."
                      value={tagSearchQuery}
                      onChange={e => setTagSearchQuery(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-gray-700 outline-none w-full"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between text-[10px] font-black text-indigo-600 uppercase tracking-wider px-1 mb-2 shrink-0">
                    <button
                      onClick={() => {
                        setSelectedTags(availableTags);
                        setPage(1);
                        resetOtherFilters();
                      }}
                      className="hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTags([]);
                        setPage(1);
                        resetOtherFilters();
                      }}
                      className="hover:underline text-rose-600"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Scrollable list of tags */}
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 flex-1">
                    {availableTags
                      .filter(tag => tag.toLowerCase().includes(tagSearchQuery.toLowerCase()))
                      .map(tag => {
                        const isChecked = selectedTags.includes(tag);
                        return (
                          <label
                            key={tag}
                            className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition text-xs font-bold text-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                  if (isChecked) {
                                    setSelectedTags(prev => prev.filter(t => t !== tag));
                                  } else {
                                    setSelectedTags(prev => [...prev, tag]);
                                  }
                                  setPage(1);
                                  resetOtherFilters();
                                }}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                            />
                            <span className="truncate">#{tag}</span>
                          </label>
                        );
                      })}
                    {availableTags.filter(tag => tag.toLowerCase().includes(tagSearchQuery.toLowerCase())).length === 0 && (
                      <div className="text-center py-4 text-xs font-semibold text-gray-400">
                        No tags match your search.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Selected tag pills inline */}
          {selectedTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap max-w-md overflow-y-auto max-h-10">
              {selectedTags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  #{tag}
                  <button
                    onClick={() => {
                      setSelectedTags(prev => prev.filter(t => t !== tag));
                      setPage(1);
                      resetOtherFilters();
                    }}
                    className="p-0.5 hover:bg-indigo-100 rounded-full transition"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <span className="text-xs font-bold text-gray-400 shrink-0 ml-auto">
            {tagFilteredLogsLength} contact{tagFilteredLogsLength !== 1 ? "s" : ""}{selectedTags.length === 0 ? " · all tags" : ""}
          </span>
        </div>
      )}

      {/* Overdue Callbacks Banner */}
      {stats.callbacks > 0 && filterStatus !== "Callback" && (
        <div 
          className="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-3 flex items-center justify-between shrink-0 shadow-lg shadow-red-600/10 cursor-pointer" 
          onClick={() => { setFilterStatus("Callback"); setPage(1); }}
        >
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center animate-pulse">
              <AlertCircle size={22} />
            </div>
            <div>
              <p className="font-black text-sm leading-none">You have {stats.callbacks} callback{stats.callbacks > 1 ? "s" : ""} due today or overdue!</p>
              <p className="text-white/70 text-xs font-medium mt-0.5">Click here to view them. These people are waiting for your call.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl text-white font-black text-xs">
            <Phone size={14} /> Call Now
          </div>
        </div>
      )}

      {/* Main Filter Action Bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3 overflow-x-auto flex-1">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shrink-0">
            <Search size={14} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="bg-transparent text-sm outline-none w-36"
            />
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shrink-0">
            <SlidersHorizontal size={13} className="text-gray-400" />
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setPage(1); }}
              className="bg-transparent text-xs font-bold text-gray-600 focus:outline-none cursor-pointer"
            >
              <option value="activityDesc">Sort: Latest Activity</option>
              <option value="createdDesc">Sort: Date Assigned</option>
              <option value="nameAsc">Sort: Name (A-Z)</option>
            </select>
          </div>

          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border active:scale-[0.97] shrink-0 ${
              showAdvancedFilters || activeFiltersCount > 0
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal size={13} />
            Advanced Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </button>

          <button
            onClick={() => setIsColumnModalOpen(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border active:scale-[0.97] shrink-0 ${
              hiddenColumns.length > 0
                ? "bg-teal-50 border-teal-200 text-teal-700 shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <FileSpreadsheet size={13} />
            Columns {hiddenColumns.length > 0 && `(${allPossibleCols.length - hiddenColumns.length}/${allPossibleCols.length})`}
          </button>

          <div className="flex items-center gap-2">
            {["All", "Hot Leads", "Follow up", "Today Activity"].map(s => (
              <button
                key={s}
                onClick={() => { setFilterStatus(s); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-[0.97] ${
                  filterStatus === s
                    ? s === "Hot Leads" ? "bg-orange-500 text-white shadow" : s === "Follow up" ? "bg-blue-600 text-white shadow" : s === "Today Activity" ? "bg-teal-600 text-white shadow" : "bg-[#217346] text-white shadow"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s === "Hot Leads" && <Flame size={12} className={filterStatus === s ? "text-white" : "text-orange-500"} />}
                {s === "Follow up" && <Clock size={12} className={filterStatus === s ? "text-white" : "text-blue-500"} />}
                {s === "Today Activity" && <Calendar size={12} className={filterStatus === s ? "text-white" : "text-teal-500"} />}
                {s}
              </button>
            ))}
          </div>
        </div>

        {activeFiltersCount > 0 && (
          <button
            onClick={() => {
              handleClearAllFilters();
              setShowAdvancedFilters(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Advanced Filters Drawer Panel / Modal */}
      <div 
        onClick={e => { if (e.target === e.currentTarget) setShowAdvancedFilters(false); }}
        className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-all duration-300 ease-out ${
          showAdvancedFilters ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden border border-gray-100 max-h-[90vh] transition-all duration-300 ease-out transform ${
          showAdvancedFilters ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-95"
        }`}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <SlidersHorizontal size={18} className="text-indigo-600" />
                  Advanced Filters
                  {activeFiltersCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-wider">
                      {activeFiltersCount} Active
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500 font-semibold mt-0.5">Filter down contacts using multiple criteria</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="p-2 hover:bg-gray-100 active:scale-90 rounded-xl transition text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Search Inside Filters */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-200 rounded-2xl px-4 py-2.5 max-w-md">
                <Search size={15} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search inside filters (e.g. City, Source, Khoji...)"
                  value={filterSearchQuery}
                  onChange={e => setFilterSearchQuery(e.target.value)}
                  className="bg-transparent text-xs font-bold text-gray-700 outline-none w-full placeholder:text-gray-400"
                />
                {filterSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setFilterSearchQuery("")}
                    className="p-1 hover:bg-gray-200 rounded-full transition text-gray-400 hover:text-gray-600 active:scale-90"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* Source */}
                {filterVisible.source && (
                  <MultiSelectDropdown
                    label="Source"
                    icon={<User size={11} className="text-blue-500" />}
                    options={uniqueSources}
                    selectedValues={filterSource}
                    onChange={val => { setFilterSource(val); setPage(1); }}
                    placeholder="Search sources..."
                  />
                )}

                {/* City */}
                {filterVisible.city && (
                  <MultiSelectDropdown
                    label="City"
                    icon={<User size={11} className="text-emerald-500" />}
                    options={uniqueCities}
                    selectedValues={filterCity}
                    onChange={val => { setFilterCity(val); setPage(1); }}
                    placeholder="Search cities..."
                  />
                )}

                {/* Called For */}
                {filterVisible.calledFor && (
                  <MultiSelectDropdown
                    label="Called For"
                    icon={<Phone size={11} className="text-indigo-500" />}
                    options={uniqueCalledFor}
                    selectedValues={filterCalledFor}
                    onChange={val => { setFilterCalledFor(val); setPage(1); }}
                    placeholder="Search purpose..."
                  />
                )}

                {/* Call Type */}
                {filterVisible.callType && (
                  <MultiSelectDropdown
                    label="Call Type"
                    icon={<Phone size={11} className="text-orange-500" />}
                    options={[
                      { value: "incoming", label: "Incoming" },
                      { value: "outgoing", label: "Outgoing" },
                      { value: "incoming f", label: "Incoming Forward" },
                      { value: "outgoing f", label: "Outgoing Forward" }
                    ]}
                    selectedValues={filterCallType}
                    onChange={val => { setFilterCallType(val); setPage(1); }}
                    placeholder="Search call types..."
                  />
                )}

                {/* Sub Program */}
                {filterVisible.subProgram && (
                  <MultiSelectDropdown
                    label="Sub Program"
                    icon={<Tag size={11} className="text-teal-500" />}
                    options={uniqueSubPrograms}
                    selectedValues={filterSubProgram}
                    onChange={val => { setFilterSubProgram(val); setPage(1); }}
                    placeholder="Search sub programs..."
                  />
                )}

                {/* Objection Reason */}
                {filterVisible.objection && (
                  <MultiSelectDropdown
                    label="Objection Reason"
                    icon={<SlidersHorizontal size={11} className="text-pink-500" />}
                    options={uniqueObjectionReasons}
                    selectedValues={filterObjectionReason}
                    onChange={val => { setFilterObjectionReason(val); setPage(1); }}
                    placeholder="Search reasons..."
                  />
                )}

                {/* Callback Status */}
                {filterVisible.callbackStatus && (
                  <MultiSelectDropdown
                    label="Callback Status"
                    icon={<Clock size={11} className="text-purple-500" />}
                    options={[
                      { value: "pending", label: "⏳ Pending" },
                      { value: "done", label: "✅ Done" },
                      { value: "rescheduled", label: "🔄 Rescheduled" },
                      { value: "cancelled", label: "❌ Cancelled" }
                    ]}
                    selectedValues={filterCallbackStatus}
                    onChange={val => { setFilterCallbackStatus(val); setPage(1); }}
                    placeholder="Search callback status..."
                  />
                )}

                {/* Call Count */}
                {filterVisible.callCount && (
                  <MultiSelectDropdown
                    label="Call Count"
                    icon={<User size={11} className="text-gray-500" />}
                    options={[
                      { value: "0", label: "0 Calls (Never Called)" },
                      { value: "1", label: "1 Call" },
                      { value: "2+", label: "2+ Calls" }
                    ]}
                    selectedValues={filterCallCount}
                    onChange={val => { setFilterCallCount(val); setPage(1); }}
                    placeholder="Search counts..."
                  />
                )}

                {/* Gen. Status */}
                {filterVisible.genStatus && (
                  <div className="space-y-2">
                    <MultiSelectDropdown
                      label="Gen. Status"
                      icon={<CheckCircle2 size={11} className="text-indigo-500" />}
                      options={[
                        ...STATUS_OPTIONS.filter(opt => opt !== "Reg.Done"),
                        "Query Pending",
                        "Query Solved"
                      ]}
                      selectedValues={filterGeneralStatus}
                      onChange={val => {
                        setFilterGeneralStatus(val);
                        setPage(1);
                      }}
                      placeholder="Search status..."
                    />
                  </div>
                )}

                {/* Query Status — standalone, always accessible */}
                {filterVisible.queryStatus && false && (
                  <div className="space-y-1.5">
                  </div>
                )}

                {/* Abhivyakti */}
                {filterVisible.abhivyakti && (
                  <MultiSelectDropdown
                    label="Abhivyakti"
                    icon={<Flame size={11} className="text-emerald-500" />}
                    options={[
                      { value: "Yes", label: "Yes (Registered)" },
                      { value: "No", label: "No (Not Registered)" }
                    ]}
                    selectedValues={filterAbhivyakti}
                    onChange={val => { setFilterAbhivyakti(val); setPage(1); }}
                    placeholder="Search registration..."
                  />
                )}

                {/* Khoji Status */}
                {filterVisible.khoji && (
                  <MultiSelectDropdown
                    label="Khoji Status"
                    icon={<CheckSquare size={11} className="text-pink-500" />}
                    options={[
                      { value: "Yes", label: "Yes (Khoji)" },
                      { value: "No", label: "No (New)" }
                    ]}
                    selectedValues={filterKhoji}
                    onChange={val => { setFilterKhoji(val); setPage(1); }}
                    placeholder="Search khoji status..."
                  />
                )}

                {/* No filters match fallback */}
                {visibleCount === 0 && (
                  <div className="col-span-full py-12 text-center space-y-2">
                    <div className="text-gray-400 font-bold text-sm">No filters match "{filterSearchQuery}"</div>
                    <button 
                      type="button"
                      onClick={() => setFilterSearchQuery("")} 
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-black uppercase tracking-wider"
                    >
                      Clear Search
                    </button>
                  </div>
                )}
              </div>

              {/* Easier Date Filter Section */}
              {filterVisible.date && (
                <div className="p-5 bg-slate-50 border border-slate-100 rounded-3xl space-y-4 transition-all animate-slide-up">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={16} className="text-teal-600" />
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Date Parameters</span>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      {[
                        { label: "No Date Filter", value: "All" },
                        { label: "Last Called Date", value: "lastCalledAt" },
                        { label: "Assignment Date", value: "createdAt" }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setFilterDateType(opt.value);
                            setPage(1);
                            if (opt.value === "All") {
                              setFilterDateRange("All");
                              setCustomDateFrom("");
                              setCustomDateTo("");
                              setCustomTimeFrom("");
                              setCustomTimeTo("");
                            } else if (filterDateRange === "All") {
                              setFilterDateRange("Today");
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border active:scale-[0.97] hover:scale-[1.01] ${
                            filterDateType === opt.value
                              ? "bg-teal-50 border-teal-200 text-teal-700 font-extrabold shadow-sm"
                              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filterDateType !== "All" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
                      {/* Quick Range Selector */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                          <Calendar size={11} className="text-teal-500" /> Quick Range
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: "Today", value: "Today" },
                            { label: "Yesterday", value: "Yesterday" },
                            { label: "Last 7 Days", value: "This Week" },
                            { label: "Custom Range", value: "Custom" }
                          ].map(range => (
                            <button
                              key={range.value}
                              type="button"
                              onClick={() => {
                                setFilterDateRange(range.value);
                                setPage(1);
                                if (range.value !== "Custom") {
                                  setCustomDateFrom("");
                                  setCustomDateTo("");
                                }
                              }}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border active:scale-[0.97] hover:scale-[1.01] ${
                                filterDateRange === range.value
                                  ? "bg-teal-600 border-teal-600 text-white shadow-md shadow-teal-600/10 scale-[1.03]"
                                  : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                              }`}
                            >
                              {range.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Date Range */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest leading-none flex items-center gap-1">
                          <Calendar size={10} /> Date Range
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={customDateFrom}
                            onChange={e => {
                              setCustomDateFrom(e.target.value);
                              setFilterDateRange("Custom");
                              setPage(1);
                            }}
                            className={`w-full px-3 py-1.5 border rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition font-sans ${
                              customDateFrom ? "bg-teal-50/50 border-teal-300" : "bg-white border-gray-200"
                            }`}
                          />
                          <input
                            type="date"
                            value={customDateTo}
                            onChange={e => {
                              setCustomDateTo(e.target.value);
                              setFilterDateRange("Custom");
                              setPage(1);
                            }}
                            className={`w-full px-3 py-1.5 border rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition font-sans ${
                              customDateTo ? "bg-teal-50/50 border-teal-300" : "bg-white border-gray-200"
                            }`}
                          />
                        </div>
                      </div>

                      {/* Custom Time Range */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none flex items-center gap-1">
                          <Clock size={10} /> Time Range
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="time"
                            value={customTimeFrom}
                            onChange={e => { setCustomTimeFrom(e.target.value); setPage(1); }}
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-sans cursor-pointer"
                          />
                          <input
                            type="time"
                            value={customTimeTo}
                            onChange={e => { setCustomTimeTo(e.target.value); setPage(1); }}
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-sans cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  handleClearAllFilters();
                  setShowAdvancedFilters(false);
                }}
                className="px-4 py-2 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 active:scale-[0.97] rounded-xl transition-all duration-150 flex items-center gap-1.5"
              >
                Clear All Filters
              </button>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.97] rounded-xl shadow-md shadow-indigo-600/10 transition-all duration-150"
              >
                Apply & Close
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }
