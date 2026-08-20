import React from "react";
import {
  ArrowLeft, Search, Plus, MapPin, PhoneOutgoing, Flame, Clock, CheckCircle2, AlertCircle,
  Bell, Sparkles, UserCheck, Download
} from "lucide-react";
import { formatContactName } from "../utils";
import { AttenderFilters } from "../components/AttenderFilters";

export default function MobileAttenderView({
  optionsVersion,
  attenderId,
  attenderName,
  filteredLogs = [],
  allLogsCount = 0,
  filterStatus,
  setFilterStatus,
  onExit,
  openCallEntryDialog,
  setEditingRow,
  setGlobalSearchOpen,
  showAdvancedFilters,
  setShowAdvancedFilters,
  resetOtherFilters,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  setPage,
  hiddenColumns = [],
  allPossibleCols = [],
  setIsColumnModalOpen,
  availableTags = [],
  selectedTags = [],
  setSelectedTags,
  tagDropdownOpen,
  setTagDropdownOpen,
  tagSearchQuery,
  setTagSearchQuery,
  tagFilteredLogsLength = 0,
  activeFiltersCount = 0,
  handleClearAllFilters,
  filterSource, setFilterSource,
  filterCity, setFilterCity,
  filterCalledFor, setFilterCalledFor,
  filterCallType, setFilterCallType,
  filterSubProgram, setFilterSubProgram,
  filterObjectionReason, setFilterObjectionReason,
  filterCallbackStatus, setFilterCallbackStatus,
  filterCallCount, setFilterCallCount,
  filterGeneralStatus, setFilterGeneralStatus,
  filterQueryStatus, setFilterQueryStatus,
  filterAbhivyakti, setFilterAbhivyakti,
  filterKhoji, setFilterKhoji,
  filterDateType, setFilterDateType,
  filterDateRange, setFilterDateRange,
  customDateFrom, setCustomDateFrom,
  customDateTo, setCustomDateTo,
  customTimeFrom, setCustomTimeFrom,
  customTimeTo, setCustomTimeTo,
  uniqueSources,
  uniqueCities,
  uniqueCalledFor,
  uniqueSubPrograms,
  uniqueObjectionReasons,
  stats,
  programs,
  selectedProgramId,
  setSelectedProgramId,
  assistedNotifications = [],
  unreadNotifCount = 0,
  showNotifPopover = false,
  setShowNotifPopover = () => {},
  markAllNotificationsRead = () => {},
  readNotifIds = []
}) {
  const [displayCount, setDisplayCount] = React.useState(30);
  const mobileNotifRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (mobileNotifRef.current && !mobileNotifRef.current.contains(e.target)) {
        setShowNotifPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [setShowNotifPopover]);

  React.useEffect(() => {
    setDisplayCount(30);
  }, [filteredLogs.length, searchQuery, filterStatus]);

  const visibleLogs = React.useMemo(() => {
    return filteredLogs.slice(0, displayCount);
  }, [filteredLogs, displayCount]);

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans">
      {/* 1. Header Bar */}
      <div className="bg-[#00684a] text-white px-4 py-3.5 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition"
            title="Exit"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-extrabold text-base leading-none">My Call Sheet</h1>
            <p className="text-[10px] text-emerald-100 font-medium mt-0.5">
              Showing {filteredLogs.length} of {allLogsCount} leads
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Notification Bell Icon */}
          <div className="relative" ref={mobileNotifRef}>
            <button
              type="button"
              onClick={() => {
                setShowNotifPopover(prev => !prev);
                if (unreadNotifCount > 0) markAllNotificationsRead();
              }}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition relative"
              title="Team Assisted Registrations"
            >
              <Bell size={18} />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-emerald-900 shadow-xs">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {/* Mobile Notification Dropdown Popover */}
            {showNotifPopover && (
              <div className="absolute right-0 mt-2 w-72 bg-white text-slate-800 border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden text-left">
                <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-400" />
                    <div>
                      <h3 className="font-extrabold text-xs">Team Assists</h3>
                    </div>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {assistedNotifications.length === 0 ? (
                    <div className="p-4 text-center text-slate-400">
                      <UserCheck size={24} className="mx-auto mb-1 text-slate-300" />
                      <p className="text-xs font-semibold">No team assists yet</p>
                    </div>
                  ) : (
                    assistedNotifications.map(notif => {
                      const isRead = readNotifIds.includes(notif.id);
                      return (
                        <div
                          key={notif.id}
                          onClick={() => {
                            setEditingRow(notif.log);
                            setShowNotifPopover(false);
                          }}
                          className={`p-3 hover:bg-slate-50 cursor-pointer transition ${!isRead ? "bg-amber-50/50" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-slate-900 truncate">{notif.leadName}</span>
                            <span className="text-[8px] font-extrabold text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded shrink-0">
                              +1 Credit
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Registered by <span className="font-bold text-blue-600">{notif.convertedBy}</span>
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => exportTelemetryJSON(attenderName || "Attender")}
            className="w-9 h-9 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-emerald-400 hover:bg-slate-800 transition active:scale-95 shadow-sm"
            title="Download Today's EOD Telemetry Log"
          >
            <Download size={16} />
          </button>

          <button
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition"
            title="Search"
          >
            <Search size={18} />
          </button>

          <button
            type="button"
            onClick={() => openCallEntryDialog()}
            className="px-3.5 py-1.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold text-xs rounded-full flex items-center gap-1.5 shadow-md active:scale-95 transition"
          >
            <Plus size={16} /> Add Call
          </button>
        </div>
      </div>

      {/* 2. Embedded Filters Section */}
      <div className="px-3 py-2 bg-white border-b border-slate-200 shrink-0">
        <AttenderFilters
          optionsVersion={optionsVersion}
          showAdvancedFilters={showAdvancedFilters}
          setShowAdvancedFilters={setShowAdvancedFilters}
          resetOtherFilters={resetOtherFilters}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          setPage={setPage}
          hiddenColumns={hiddenColumns}
          allPossibleCols={allPossibleCols}
          setIsColumnModalOpen={setIsColumnModalOpen}
          availableTags={availableTags}
          selectedTags={selectedTags}
          setSelectedTags={setSelectedTags}
          tagDropdownOpen={tagDropdownOpen}
          setTagDropdownOpen={setTagDropdownOpen}
          tagSearchQuery={tagSearchQuery}
          setTagSearchQuery={setTagSearchQuery}
          tagFilteredLogsLength={tagFilteredLogsLength}
          allLogsCount={allLogsCount}
          activeFiltersCount={activeFiltersCount}
          handleClearAllFilters={handleClearAllFilters}
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterSource={filterSource} setFilterSource={setFilterSource}
          filterCity={filterCity} setFilterCity={setFilterCity}
          filterCalledFor={filterCalledFor} setFilterCalledFor={setFilterCalledFor}
          filterCallType={filterCallType} setFilterCallType={setFilterCallType}
          filterSubProgram={filterSubProgram} setFilterSubProgram={setFilterSubProgram}
          filterObjectionReason={filterObjectionReason} setFilterObjectionReason={setFilterObjectionReason}
          filterCallbackStatus={filterCallbackStatus} setFilterCallbackStatus={setFilterCallbackStatus}
          filterCallCount={filterCallCount} setFilterCallCount={setFilterCallCount}
          filterGeneralStatus={filterGeneralStatus} setFilterGeneralStatus={setFilterGeneralStatus}
          filterQueryStatus={filterQueryStatus} setFilterQueryStatus={setFilterQueryStatus}
          filterAbhivyakti={filterAbhivyakti} setFilterAbhivyakti={setFilterAbhivyakti}
          filterKhoji={filterKhoji} setFilterKhoji={setFilterKhoji}
          filterDateType={filterDateType} setFilterDateType={setFilterDateType}
          filterDateRange={filterDateRange} setFilterDateRange={setFilterDateRange}
          customDateFrom={customDateFrom} setCustomDateFrom={setCustomDateFrom}
          customDateTo={customDateTo} setCustomDateTo={setCustomDateTo}
          customTimeFrom={customTimeFrom} setCustomTimeFrom={setCustomTimeFrom}
          customTimeTo={customTimeTo} setCustomTimeTo={setCustomTimeTo}
          uniqueSources={uniqueSources}
          uniqueCities={uniqueCities}
          uniqueCalledFor={uniqueCalledFor}
          uniqueSubPrograms={uniqueSubPrograms}
          uniqueObjectionReasons={uniqueObjectionReasons}
          stats={stats}
          programs={programs}
          selectedProgramId={selectedProgramId}
          setSelectedProgramId={setSelectedProgramId}
          hideTagFilter={true}
          hideSort={true}
        />
      </div>

      {/* 3. Mobile Contact Cards List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-8">
        {filteredLogs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-slate-400">No contacts found matching active filters</p>
          </div>
        ) : (
          visibleLogs.map((row, index) => {
            const name = formatContactName(row.Name || row.name || "");
            const phone = row.Phone || row.phone || row.Mobile || row.mobile || "No Phone";
            const city = row.City || row.city || "";
            const state = row.State || row.state || "";
            const locationText = [city, state].filter(Boolean).join(", ") || "Unknown Location";
            const status = row.status || "";

            // Dynamic Color Coding based on lead status & PC table logic
            let cardBg = "bg-white border-slate-200";
            let statusBadge = null;

            if (row._callbackDue) {
              cardBg = "bg-red-50/90 border-red-200 text-red-900";
              statusBadge = (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-600 text-white flex items-center gap-1 shrink-0 animate-pulse">
                  <Clock size={10} /> Overdue Callback
                </span>
              );
            } else if (row.isHotLead) {
              cardBg = "bg-amber-50/90 border-amber-300 text-amber-950";
              statusBadge = (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-500 text-white flex items-center gap-1 shrink-0">
                  <Flame size={10} /> HOT LEAD
                </span>
              );
            } else if (status === "Reg.Done") {
              cardBg = "bg-emerald-50/90 border-emerald-200 text-emerald-950";
              statusBadge = (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white flex items-center gap-1 shrink-0">
                  <CheckCircle2 size={10} /> Reg.Done
                </span>
              );
            } else if (status === "Interested" || status === "Info given") {
              cardBg = "bg-blue-50/90 border-blue-200 text-blue-950";
              statusBadge = (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-600 text-white shrink-0">
                  {status}
                </span>
              );
            } else if (["NA", "Busy", "Call Cut", "switched off", "Not interested", "Invalid No"].includes(status)) {
              cardBg = "bg-rose-50/80 border-rose-200 text-rose-950";
              statusBadge = (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500 text-white shrink-0">
                  {status}
                </span>
              );
            } else {
              // Soft alternating background for normal pending leads
              const isYellow = index % 2 === 0;
              cardBg = isYellow ? "bg-[#fffde7] border-[#faeed1]" : "bg-[#f2faf5] border-[#e1f5eb]";
              if (status) {
                statusBadge = (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 shrink-0">
                    {status}
                  </span>
                );
              }
            }

            return (
              <div
                key={row.id || index}
                onClick={() => setEditingRow(row)}
                className={`rounded-2xl border ${cardBg} p-4 shadow-xs active:scale-[0.99] transition-all cursor-pointer relative overflow-hidden`}
              >
                {/* Name, Status & Tag */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className={`font-extrabold text-base text-slate-900 truncate ${!name ? "italic text-slate-500" : ""}`}>
                      {name || "Unknown Name"}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {statusBadge}
                  </div>
                </div>

                {/* Location */}
                <div className="flex items-center gap-1 text-slate-500 text-xs font-medium mb-3">
                  <MapPin size={12} className="text-slate-400 shrink-0" />
                  <span className="truncate">{locationText}</span>
                </div>

                <div className="border-b border-slate-900/5 mb-3" />

                {/* Phone & Direct Dialing */}
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 text-sm tracking-wider">
                    {phone}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (phone && phone !== "No Phone") {
                        window.open(`tel:${phone}`, "_self");
                      } else {
                        setEditingRow(row);
                      }
                    }}
                    className="w-10 h-10 bg-[#00684a] active:bg-[#00523a] text-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition"
                    title="Call Contact"
                  >
                    <PhoneOutgoing size={17} className="stroke-[2.5]" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        {filteredLogs.length > displayCount && (
          <div className="pt-3 pb-8 text-center">
            <button
              type="button"
              onClick={() => setDisplayCount(prev => prev + 30)}
              className="px-6 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 active:scale-95 rounded-full font-bold text-xs text-slate-700 shadow-sm transition"
            >
              Load More Contacts ({displayCount} of {filteredLogs.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
