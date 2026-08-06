import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { 
  ShieldCheck, Tag, HelpCircle, Loader, RefreshCw, CheckCircle2, 
  AlertTriangle, Activity, Archive, Sliders, PhoneCall, PhoneOff, 
  GripVertical, Search, X
} from "lucide-react";
import { OptionsManagerCard } from "./OptionsManagerCard";
import { WhatsAppTemplatesCard } from "./WhatsAppTemplatesCard";
import { 
  getSettingsOptions, 
  updateCallCenterOptions, 
  rebuildCallCenterCache, 
  verifyCallCenterCache,
  getActiveCacheMonths,
  getLockedMonthlyReports,
  DEFAULT_CONNECTED_STATUSES,
  DEFAULT_NOT_CONNECTED_STATUSES,
  DEFAULT_WHATSAPP_TEMPLATES
} from "../../../../lib/db";

export default function SettingsTab() {
  const [options, setOptions] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [activeMonths, setActiveMonths] = useState([]);
  const [lockedMonths, setLockedMonths] = useState([]);
  const [isLoadingMonths, setIsLoadingMonths] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null); // { status, fromCategory }
  const [dragOverCategory, setDragOverCategory] = useState(null);
  const [addStatusModal, setAddStatusModal] = useState(null); // string: new status name
  const [classificationSearch, setClassificationSearch] = useState("");

  useEffect(() => {
    loadOptions();
    loadMonths();
  }, []);

  const loadOptions = async () => {
    setIsLoading(true);
    try {
      const data = await getSettingsOptions();
      setOptions(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load settings: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMonths = async () => {
    setIsLoadingMonths(true);
    try {
      const active = await getActiveCacheMonths();
      const locked = await getLockedMonthlyReports();
      setActiveMonths(active);
      setLockedMonths(locked);
    } catch (err) {
      console.error("Failed to load months:", err);
    } finally {
      setIsLoadingMonths(false);
    }
  };

  const handleOptionChange = async (type, action, val, newVal) => {
    const key = type === "status" ? "statusOptions" : type === "source" ? "sourceOptions" : "calledForOptions";
    const current = options[key] || [];
    
    let updated;
    if (action === "delete") {
      if (type === "status" && ["Reg.Done", "NA"].includes(val)) {
        toast.error(`Cannot delete required status: ${val}`);
        return;
      }
      updated = current.filter(x => x !== val);
    } else if (action === "rename") {
      if (!newVal || !newVal.trim()) {
        toast.error("Option name cannot be empty!");
        return;
      }
      const trimmedNew = newVal.trim();
      if (val === trimmedNew) return;
      if (current.includes(trimmedNew)) {
        toast.error("Option name already exists!");
        return;
      }
      if (type === "status" && ["Reg.Done", "NA"].includes(val)) {
        toast.error(`Cannot rename required status: ${val}`);
        return;
      }
      updated = current.map(x => (x === val ? trimmedNew : x));
    } else {
      if (!val || !val.trim()) return;
      const trimmedVal = val.trim();
      if (current.includes(trimmedVal)) {
        toast.error("Option already exists!");
        return;
      }
      if (type === "status") {
        setAddStatusModal(trimmedVal);
        return;
      }
      updated = [...current, trimmedVal];
    }

    let updatePayload = { [key]: updated };

    if (type === "status") {
      const currentConn = options?.connectedStatuses || DEFAULT_CONNECTED_STATUSES;
      const currentNotConn = options?.notConnectedStatuses || DEFAULT_NOT_CONNECTED_STATUSES;

      if (action === "delete") {
        updatePayload.connectedStatuses = currentConn.filter(s => s !== val);
        updatePayload.notConnectedStatuses = currentNotConn.filter(s => s !== val);
      } else if (action === "rename") {
        const trimmedNew = newVal.trim();
        updatePayload.connectedStatuses = currentConn.map(s => (s === val ? trimmedNew : s));
        updatePayload.notConnectedStatuses = currentNotConn.map(s => (s === val ? trimmedNew : s));
      }
    }

    try {
      await updateCallCenterOptions(updatePayload);
      setOptions(prev => ({
        ...prev,
        ...updatePayload
      }));
      toast.success(
        action === "rename"
          ? "Option renamed successfully!"
          : action === "delete"
          ? "Option deleted successfully!"
          : "Option added successfully!"
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to update option: " + err.message);
    }
  };

  const confirmAddStatus = async (category) => {
    if (!addStatusModal) return;
    const newStatusName = addStatusModal;
    setAddStatusModal(null);

    const currentStatusOptions = options?.statusOptions || [];
    const updatedStatusOptions = [...currentStatusOptions, newStatusName];

    let updatePayload = {
      statusOptions: updatedStatusOptions
    };

    let categoryMsg = "added as Not Assigned.";
    if (category === "connected") {
      const currentConn = options?.connectedStatuses || DEFAULT_CONNECTED_STATUSES;
      updatePayload.connectedStatuses = Array.from(new Set([...currentConn, newStatusName]));
      categoryMsg = "added & categorized as Connected.";
    } else if (category === "notConnected") {
      const currentNotConn = options?.notConnectedStatuses || DEFAULT_NOT_CONNECTED_STATUSES;
      updatePayload.notConnectedStatuses = Array.from(new Set([...currentNotConn, newStatusName]));
      categoryMsg = "added & categorized as Not Connected.";
    }

    try {
      await updateCallCenterOptions(updatePayload);
      setOptions(prev => ({
        ...prev,
        ...updatePayload
      }));
      toast.success(`Status "${newStatusName}" ${categoryMsg}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add status option: " + err.message);
    }
  };

  const handleMoveStatus = async (status, fromCategory, toCategory) => {
    if (fromCategory === toCategory) return;

    const currentConn = options?.connectedStatuses || DEFAULT_CONNECTED_STATUSES;
    const currentNotConn = options?.notConnectedStatuses || DEFAULT_NOT_CONNECTED_STATUSES;

    let newConn = currentConn.filter(s => s !== status);
    let newNotConn = currentNotConn.filter(s => s !== status);

    if (toCategory === "connected") {
      newConn.push(status);
    } else if (toCategory === "notConnected") {
      newNotConn.push(status);
    }

    try {
      await updateCallCenterOptions({
        connectedStatuses: newConn,
        notConnectedStatuses: newNotConn
      });
      setOptions(prev => ({
        ...prev,
        connectedStatuses: newConn,
        notConnectedStatuses: newNotConn
      }));
      const label = toCategory === "connected" ? "Connected Calls" : toCategory === "notConnected" ? "Not Connected Calls" : "Not Assigned";
      toast.success(`Moved "${status}" to ${label}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status categorization: " + err.message);
    }
  };

  const handleVerifyCache = async () => {
    setIsVerifying(true);
    setVerificationResult(null);
    try {
      const res = await verifyCallCenterCache();
      setVerificationResult(res);
      if (res.status === "healthy") {
        toast.success("Cache is fully verified and matching perfectly!");
      } else if (res.status === "mismatch") {
        toast.error("Cache discrepancies found. Recommend rebuilding!");
      } else {
        toast("Cache verification complete: " + res.message);
      }
    } catch (err) {
      console.error(err);
      toast.error("Cache verification failed: " + err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRebuildCache = async () => {
    if (!window.confirm("Are you sure you want to force-rebuild the cache document? This will fetch all active contacts and reset the cache.")) {
      return;
    }
    setIsRebuilding(true);
    try {
      await rebuildCallCenterCache();
      toast.success("Cache document rebuilt successfully!");
      setVerificationResult(null);
    } catch (err) {
      console.error(err);
      toast.error("Cache rebuild failed: " + err.message);
    } finally {
      setIsRebuilding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader size={32} className="text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Derive categorized arrays ensuring deleted statuses are not shown
  const statusOptionsSet = new Set(options?.statusOptions || []);
  const rawConn = options?.connectedStatuses || DEFAULT_CONNECTED_STATUSES;
  const rawNotConn = options?.notConnectedStatuses || DEFAULT_NOT_CONNECTED_STATUSES;

  const connectedList = rawConn.filter(s => statusOptionsSet.has(s));
  const notConnectedList = rawNotConn.filter(s => statusOptionsSet.has(s));

  const connectedSet = new Set(connectedList);
  const notConnectedSet = new Set(notConnectedList);

  const unassignedList = (options?.statusOptions || []).filter(
    s => !connectedSet.has(s) && !notConnectedSet.has(s)
  );

  // Filter by classification search query
  const searchLower = classificationSearch.trim().toLowerCase();
  const displayConnectedList = connectedList.filter(s => s.toLowerCase().includes(searchLower));
  const displayNotConnectedList = notConnectedList.filter(s => s.toLowerCase().includes(searchLower));
  const displayUnassignedList = unassignedList.filter(s => s.toLowerCase().includes(searchLower));

  const handleSaveWhatsappTemplates = async (updatedTemplates) => {
    try {
      await updateCallCenterOptions({ whatsappTemplates: updatedTemplates });
      setOptions((prev) => ({
        ...prev,
        whatsappTemplates: updatedTemplates
      }));
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-xl font-black text-gray-900">Call Center Options</h2>
        <p className="text-xs text-gray-400 font-medium mt-0.5">Configure dropdown values for Attenders globally.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <OptionsManagerCard
          title="Status Options"
          icon={ShieldCheck}
          options={options?.statusOptions || []}
          onAdd={(val) => handleOptionChange("status", "add", val)}
          onDelete={(val) => handleOptionChange("status", "delete", val)}
          onRename={(oldVal, newVal) => handleOptionChange("status", "rename", oldVal, newVal)}
        />
        <OptionsManagerCard
          title="Source Options"
          icon={Tag}
          options={options?.sourceOptions || []}
          onAdd={(val) => handleOptionChange("source", "add", val)}
          onDelete={(val) => handleOptionChange("source", "delete", val)}
          onRename={(oldVal, newVal) => handleOptionChange("source", "rename", oldVal, newVal)}
        />
        <OptionsManagerCard
          title="Called For Options"
          icon={HelpCircle}
          options={options?.calledForOptions || []}
          onAdd={(val) => handleOptionChange("calledFor", "add", val)}
          onDelete={(val) => handleOptionChange("calledFor", "delete", val)}
          onRename={(oldVal, newVal) => handleOptionChange("calledFor", "rename", oldVal, newVal)}
        />
      </div>

      {/* WhatsApp Message Templates Manager */}
      <WhatsAppTemplatesCard
        templates={options?.whatsappTemplates || DEFAULT_WHATSAPP_TEMPLATES}
        onSaveTemplates={handleSaveWhatsappTemplates}
      />

      {/* Drag & Drop Status Classification Tables */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sliders size={20} className="text-indigo-600" />
              <h3 className="font-bold text-gray-900 text-base">Status Call Classification (Drag & Drop)</h3>
            </div>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Drag & drop status items across the 3 columns below to control which call statuses count as Connected, Not Connected, or Not Assigned.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative min-w-[240px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={classificationSearch}
              onChange={e => setClassificationSearch(e.target.value)}
              placeholder="Search status options..."
              className="w-full pl-9 pr-8 py-2 text-xs font-semibold bg-gray-50/80 border border-gray-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-gray-400"
            />
            {classificationSearch && (
              <button
                onClick={() => setClassificationSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Table 1: Connected Calls */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverCategory("connected"); }}
            onDragLeave={() => setDragOverCategory(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCategory(null);
              if (draggedItem) {
                handleMoveStatus(draggedItem.status, draggedItem.fromCategory, "connected");
                setDraggedItem(null);
              }
            }}
            className={`rounded-2xl border transition-all duration-200 p-4 space-y-3 ${
              dragOverCategory === "connected"
                ? "bg-emerald-50/80 border-emerald-400 shadow-md ring-2 ring-emerald-400/20"
                : "bg-emerald-50/20 border-emerald-100"
            }`}
          >
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <PhoneCall size={15} />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-950 text-sm">Connected Calls</h4>
                  <p className="text-[10px] text-emerald-700 font-medium">Answered / Actionable</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-extrabold">
                {displayConnectedList.length} / {connectedList.length}
              </span>
            </div>

            <div className="space-y-2 min-h-[220px] max-h-[420px] overflow-y-auto pr-1">
              {displayConnectedList.map((st) => (
                <div
                  key={st}
                  draggable
                  onDragStart={(e) => {
                    setDraggedItem({ status: st, fromCategory: "connected" });
                    e.dataTransfer.setData("text/plain", JSON.stringify({ status: st, fromCategory: "connected" }));
                  }}
                  className="bg-white p-3 rounded-xl border border-emerald-100/80 shadow-xs flex items-center justify-between group hover:border-emerald-300 transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
                    <span className="text-xs font-bold text-gray-800">{st}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleMoveStatus(st, "connected", "notConnected")}
                      title="Move to Not Connected"
                      className="px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-md transition-colors cursor-pointer"
                    >
                      → Not Connected
                    </button>
                    <button
                      onClick={() => handleMoveStatus(st, "connected", "unassigned")}
                      title="Unassign"
                      className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-md transition-colors cursor-pointer"
                    >
                      Unassign
                    </button>
                  </div>
                </div>
              ))}

              {displayConnectedList.length === 0 && (
                <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-emerald-200/60 rounded-xl text-center p-4">
                  <p className="text-xs font-bold text-emerald-800">
                    {classificationSearch ? "No matching statuses" : "No Connected Statuses"}
                  </p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">
                    {classificationSearch ? "Try a different search query" : "Drag status here"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Table 2: Not Connected Calls */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverCategory("notConnected"); }}
            onDragLeave={() => setDragOverCategory(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCategory(null);
              if (draggedItem) {
                handleMoveStatus(draggedItem.status, draggedItem.fromCategory, "notConnected");
                setDraggedItem(null);
              }
            }}
            className={`rounded-2xl border transition-all duration-200 p-4 space-y-3 ${
              dragOverCategory === "notConnected"
                ? "bg-rose-50/80 border-rose-400 shadow-md ring-2 ring-rose-400/20"
                : "bg-rose-50/20 border-rose-100"
            }`}
          >
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700">
                  <PhoneOff size={15} />
                </div>
                <div>
                  <h4 className="font-bold text-rose-950 text-sm">Not Connected Calls</h4>
                  <p className="text-[10px] text-rose-700 font-medium">Unanswered / Missed</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 rounded-full text-xs font-extrabold">
                {displayNotConnectedList.length} / {notConnectedList.length}
              </span>
            </div>

            <div className="space-y-2 min-h-[220px] max-h-[420px] overflow-y-auto pr-1">
              {displayNotConnectedList.map((st) => (
                <div
                  key={st}
                  draggable
                  onDragStart={(e) => {
                    setDraggedItem({ status: st, fromCategory: "notConnected" });
                    e.dataTransfer.setData("text/plain", JSON.stringify({ status: st, fromCategory: "notConnected" }));
                  }}
                  className="bg-white p-3 rounded-xl border border-rose-100/80 shadow-xs flex items-center justify-between group hover:border-rose-300 transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-gray-300 group-hover:text-rose-500 transition-colors" />
                    <span className="text-xs font-bold text-gray-800">{st}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleMoveStatus(st, "notConnected", "connected")}
                      title="Move to Connected"
                      className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                    >
                      → Connected
                    </button>
                    <button
                      onClick={() => handleMoveStatus(st, "notConnected", "unassigned")}
                      title="Unassign"
                      className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-md transition-colors cursor-pointer"
                    >
                      Unassign
                    </button>
                  </div>
                </div>
              ))}

              {displayNotConnectedList.length === 0 && (
                <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-rose-200/60 rounded-xl text-center p-4">
                  <p className="text-xs font-bold text-rose-800">
                    {classificationSearch ? "No matching statuses" : "No Not-Connected Statuses"}
                  </p>
                  <p className="text-[10px] text-rose-600 mt-0.5">
                    {classificationSearch ? "Try a different search query" : "Drag status here"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Table 3: Not Assigned */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverCategory("unassigned"); }}
            onDragLeave={() => setDragOverCategory(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCategory(null);
              if (draggedItem) {
                handleMoveStatus(draggedItem.status, draggedItem.fromCategory, "unassigned");
                setDraggedItem(null);
              }
            }}
            className={`rounded-2xl border transition-all duration-200 p-4 space-y-3 ${
              dragOverCategory === "unassigned"
                ? "bg-slate-100 border-slate-400 shadow-md ring-2 ring-slate-400/20"
                : "bg-gray-50/50 border-gray-100"
            }`}
          >
            <div className="flex items-center justify-between border-b border-gray-200/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gray-200 flex items-center justify-center text-gray-700">
                  <HelpCircle size={15} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Not Assigned</h4>
                  <p className="text-[10px] text-gray-400 font-medium">Uncategorized / Other</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-gray-200 text-gray-800 rounded-full text-xs font-extrabold">
                {displayUnassignedList.length} / {unassignedList.length}
              </span>
            </div>

            <div className="space-y-2 min-h-[220px] max-h-[420px] overflow-y-auto pr-1">
              {displayUnassignedList.map((st) => (
                <div
                  key={st}
                  draggable
                  onDragStart={(e) => {
                    setDraggedItem({ status: st, fromCategory: "unassigned" });
                    e.dataTransfer.setData("text/plain", JSON.stringify({ status: st, fromCategory: "unassigned" }));
                  }}
                  className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs flex items-center justify-between group hover:border-gray-400 transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-gray-300 group-hover:text-gray-600 transition-colors" />
                    <span className="text-xs font-bold text-gray-800">{st}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleMoveStatus(st, "unassigned", "connected")}
                      title="Move to Connected"
                      className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                    >
                      → Connected
                    </button>
                    <button
                      onClick={() => handleMoveStatus(st, "unassigned", "notConnected")}
                      title="Move to Not Connected"
                      className="px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-md transition-colors cursor-pointer"
                    >
                      → Not Connected
                    </button>
                  </div>
                </div>
              ))}

              {displayUnassignedList.length === 0 && (
                <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl text-center p-4">
                  <p className="text-xs font-bold text-gray-400">
                    {classificationSearch ? "No matching statuses" : "All Statuses Assigned"}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {classificationSearch ? "Try a different search query" : "Every status is categorized!"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity size={20} className="text-indigo-600 animate-pulse" />
              <h3 className="font-bold text-gray-900 text-base">Database Cache & Performance Health</h3>
            </div>
            <p className="text-xs text-gray-400 font-medium">
              Validate or force-rebuild the single-document cloud cache used to load the Admin Dashboard and reports in exactly 1 read.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleVerifyCache}
              disabled={isVerifying || isRebuilding}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isVerifying ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Verify Cache Health
            </button>
            <button
              onClick={handleRebuildCache}
              disabled={isVerifying || isRebuilding}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isRebuilding ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Force Rebuild Cache
            </button>
          </div>
        </div>

        {verificationResult && (
          <div className={`p-4 rounded-xl border flex gap-3 text-xs leading-relaxed transition-all ${
            verificationResult.status === "healthy" 
              ? "bg-emerald-50/50 border-emerald-100 text-emerald-800" 
              : verificationResult.status === "mismatch"
              ? "bg-rose-50/50 border-rose-100 text-rose-800"
              : "bg-amber-50/50 border-amber-100 text-amber-800"
          }`}>
            <div className="mt-0.5">
              {verificationResult.status === "healthy" ? (
                <CheckCircle2 size={18} className="text-emerald-600" />
              ) : (
                <AlertTriangle size={18} className="text-rose-600" />
              )}
            </div>
            <div className="space-y-2 flex-1">
              <div className="font-bold flex items-center gap-2">
                Cache Status: {verificationResult.status.toUpperCase()}
              </div>
              <p className="font-medium opacity-90">{verificationResult.message}</p>
              
              {verificationResult.liveCount !== undefined && (
                <div className="text-[10px] font-bold tracking-wider uppercase opacity-75">
                  Verified {verificationResult.liveCount} contacts in database.
                </div>
              )}

              {verificationResult.mismatches && verificationResult.mismatches.length > 0 && (
                <div className="mt-3 space-y-1 bg-white p-3 rounded-lg border border-rose-100 max-h-48 overflow-y-auto">
                  <div className="font-bold text-rose-900 mb-1">Details (First 10):</div>
                  {verificationResult.mismatches.map((m, idx) => (
                    <div key={idx} className="font-mono text-[10px] text-rose-700">• {m}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Archive size={20} className="text-indigo-600" />
            <h3 className="font-bold text-gray-900 text-base">Archive & Purge Historical Call Logs</h3>
          </div>
          <p className="text-xs text-gray-400 font-medium">
            Historical call logs are automatically locked at the end of each month into static snapshots, and raw entries are purged from the database to optimize space.
          </p>
        </div>

        {isLoadingMonths ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
            <Loader size={16} className="animate-spin text-indigo-500" />
            Loading historical months...
          </div>
        ) : (
          <div className="overflow-hidden border border-gray-100 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-600 font-semibold">
                  <th className="p-3">Month</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeMonths.map(month => (
                  <tr key={month} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-3 font-bold text-gray-900">{month}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                        Active Month
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 font-medium">Live logs. Will be archived automatically at the end of the month.</td>
                  </tr>
                ))}

                {lockedMonths.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/50 bg-gray-50/20 transition-colors">
                    <td className="p-3 font-bold text-gray-900">{item.month}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Archived & Locked
                      </span>
                    </td>
                    <td className="p-3 text-gray-500">
                      Locked automatically by {item.lockedBy || "System"} on {item.lockedAt ? new Date(item.lockedAt).toLocaleDateString() : "month end"}. Contains {item.contactCount} contacts in {item.parts || 1} part(s). Raw logs purged.
                    </td>
                  </tr>
                ))}

                {activeMonths.length === 0 && lockedMonths.length === 0 && (
                  <tr>
                    <td colSpan="3" className="p-6 text-center text-gray-400 font-medium">
                      No historical months found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Status Categorization Modal */}
      {addStatusModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-100 p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                <Sliders size={22} />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-lg">Categorize New Status</h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">Select how this status should be classified in analytics.</p>
              </div>
            </div>

            <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center gap-3">
              <ShieldCheck size={20} className="text-indigo-600 shrink-0" />
              <div>
                <span className="text-xs text-indigo-700 font-semibold block">New Status Name:</span>
                <span className="text-sm font-black text-indigo-950">{addStatusModal}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => confirmAddStatus("connected")}
                className="w-full p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/80 text-left transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                    <PhoneCall size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-950 text-sm group-hover:text-emerald-900">Connected Calls</h4>
                    <p className="text-xs text-emerald-700 font-medium">Classify as answered / successful contact</p>
                  </div>
                </div>
                <CheckCircle2 size={18} className="text-emerald-600 opacity-0 group-hover:opacity-100 transition shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => confirmAddStatus("notConnected")}
                className="w-full p-4 rounded-2xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100/80 text-left transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-sm">
                    <PhoneOff size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-rose-950 text-sm group-hover:text-rose-900">Not Connected Calls</h4>
                    <p className="text-xs text-rose-700 font-medium">Classify as unanswered / failed attempt</p>
                  </div>
                </div>
                <CheckCircle2 size={18} className="text-rose-600 opacity-0 group-hover:opacity-100 transition shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => confirmAddStatus("skip")}
                className="w-full p-3.5 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-left transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-200 text-gray-700 flex items-center justify-center">
                    <Archive size={16} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-xs">Skip (Not Assigned)</h4>
                    <p className="text-[11px] text-gray-500 font-medium">Leave unassigned for now (can drag & drop later)</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

