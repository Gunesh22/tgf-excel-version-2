import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  UserPlus, Trash2, Edit, ClipboardList, RefreshCw, SlidersHorizontal, Download, ArrowRightLeft
} from "lucide-react";
import {
  createAttender, updateAttender, deleteAttender,
  reassignContactsToPool, reassignContactsBetweenAttenders,
  subscribeToCallLogs
} from "../../../../lib/db";
import { cleanExportRow } from "../utils.jsx";

export default function AttendersTab({ programs, attenders, onReloadAttenders }) {
  const [newAttenderName, setNewAttenderName] = useState("");
  const [editingAttender, setEditingAttender] = useState(null);
  const [editName, setEditName] = useState("");
  const [creating, setCreating] = useState(false);

  // Sheet View Modal
  const [viewingAttender, setViewingAttender] = useState(null);
  const [viewingProgramId, setViewingProgramId] = useState("");
  const [viewLogs, setViewLogs] = useState([]);
  const [viewStatus, setViewStatus] = useState("");
  const [viewSearch, setViewSearch] = useState("");
  const [showSheetModal, setShowSheetModal] = useState(false);

  // Reassignment Modal States
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignFromId, setReassignFromId] = useState("");
  const [reassignToId, setReassignToId] = useState(""); // "" = general pool
  const [reassignProgId, setReassignProgId] = useState("");
  const [reassignCount, setReassignCount] = useState(10);
  const [reassignStatus, setReassignStatus] = useState("Pending"); // "Pending", "All", "Callbacks"
  const [reassigning, setReassigning] = useState(false);

  const unsubRef = React.useRef(null);

  useEffect(() => {
    if (unsubRef.current) unsubRef.current();
    if (!viewingAttender || !viewingProgramId) {
      setViewLogs([]);
      return;
    }
    unsubRef.current = subscribeToCallLogs(viewingProgramId, viewingAttender.id, setViewLogs);
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [viewingAttender, viewingProgramId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newAttenderName.trim()) return;
    setCreating(true);
    try {
      await createAttender(newAttenderName.trim());
      setNewAttenderName("");
      toast.success("Attender created successfully!");
      onReloadAttenders();
    } catch (err) {
      toast.error("Failed to create attender: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editName.trim() || !editingAttender) return;
    try {
      await updateAttender(editingAttender.id, editName.trim());
      setEditingAttender(null);
      setEditName("");
      toast.success("Attender updated!");
      onReloadAttenders();
    } catch (err) {
      toast.error("Update failed: " + err.message);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Are you sure you want to delete "${name}"? Contacts assigned to them will be returned to the general pool.`)) return;
    try {
      await deleteAttender(id);
      toast.success("Attender deleted successfully.");
      onReloadAttenders();
    } catch (err) {
      toast.error("Failed to delete attender: " + err.message);
    }
  };

  // Reassignment Action
  const handleReassign = async () => {
    if (!reassignProgId) {
      toast.error("Please select a program.");
      return;
    }
    if (!reassignFromId) {
      toast.error("Please select a source attender.");
      return;
    }
    if (reassignFromId === reassignToId) {
      toast.error("Source and target attenders cannot be the same!");
      return;
    }

    setReassigning(true);
    try {
      if (reassignToId === "") {
        // Reassign back to general pool
        const count = await reassignContactsToPool(reassignProgId, reassignFromId, reassignCount, reassignStatus);
        toast.success(`Reassigned ${count} contacts back to the general pool!`);
      } else {
        // Reassign between two attenders
        const count = await reassignContactsBetweenAttenders(reassignProgId, reassignFromId, reassignToId, reassignCount, reassignStatus);
        toast.success(`Transferred ${count} contacts directly to target attender!`);
      }
      setShowReassignModal(false);
      
      // Reload stats/logs if open
      if (viewingAttender && viewingAttender.id === reassignFromId && viewingProgramId === reassignProgId) {
        // subscribeToCallLogs handles realtime update
      }
    } catch (err) {
      toast.error("Reassignment failed: " + err.message);
    } finally {
      setReassigning(false);
    }
  };

  const sortedViewLogs = React.useMemo(() => {
    return viewLogs.filter(log => {
      if (log._deleted) return false;
      if (viewStatus && log.status !== viewStatus) return false;
      if (viewSearch) {
        const query = viewSearch.toLowerCase();
        const contactName = Object.keys(log).find(k => k.toLowerCase().includes("name") || k.toLowerCase().includes("lead"));
        const nameVal = contactName ? String(log[contactName]).toLowerCase() : "";
        const phoneVal = String(log.Phone || log.Mobile || "").toLowerCase();
        const cityVal = String(log.City || "").toLowerCase();
        const remarkVal = String(log.remark || "").toLowerCase();
        return nameVal.includes(query) || phoneVal.includes(query) || cityVal.includes(query) || remarkVal.includes(query);
      }
      return true;
    }).sort((a, b) => {
      // Sort by lastCalledAt / updatedAt first, else pending
      const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate() : a.updatedAt ? new Date(a.updatedAt) : 0;
      const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate() : b.updatedAt ? new Date(b.updatedAt) : 0;
      return bTime - aTime;
    });
  }, [viewLogs, viewStatus, viewSearch]);

  const handleExportSheet = () => {
    if (!sortedViewLogs.length) return;
    const rows = sortedViewLogs.map(cleanExportRow);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet");
    XLSX.writeFile(wb, `${viewingAttender.name}_sheet_${new Date().toLocaleDateString("en-CA")}.xlsx`);
    toast.success("Exported!");
  };

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800">Attenders Management</h2>
          <p className="text-slate-500 mt-1">Manage calling team staff, view their assigned worksheets, and transfer workloads.</p>
        </div>
        <button onClick={() => setShowReassignModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-sm text-sm transition">
          <ArrowRightLeft size={16} /> Workload Reassignment Panel
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left Form Column */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-base">
              <UserPlus size={18} className="text-indigo-600" />
              {editingAttender ? "Edit Attender Profile" : "Add New Attender"}
            </h3>

            {editingAttender ? (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">Full Name</label>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition shadow-sm">Update</button>
                  <button type="button" onClick={() => setEditingAttender(null)} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-600 font-bold rounded-xl text-sm transition">Cancel</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">Full Name</label>
                  <input type="text" placeholder="Enter full name..." value={newAttenderName} onChange={e => setNewAttenderName(e.target.value)} required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <button type="submit" disabled={creating}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition shadow-sm">
                  Add Attender
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right List Column */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">Attenders List</h3>
            <div className="divide-y divide-gray-50 border border-gray-50 rounded-2xl overflow-hidden">
              {attenders.map(a => (
                <div key={a.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center font-black text-indigo-700 uppercase">
                      {a.name[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{a.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">ID: {a.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setViewingAttender(a); setViewingProgramId(""); setShowSheetModal(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition">
                      <ClipboardList size={14} /> View Worksheets
                    </button>
                    <button onClick={() => { setEditingAttender(a); setEditName(a.name); }}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => handleDelete(a.id, a.name)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {attenders.length === 0 && (
                <div className="py-12 text-center text-gray-400 font-medium">No attenders registered.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sheet Modal */}
      {showSheetModal && viewingAttender && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-6xl rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg">{viewingAttender.name}'s Assigned Worksheets</h3>
                <p className="text-xs text-indigo-100 mt-0.5">Filter sheets by Program, search logs, and export to spreadsheet</p>
              </div>
              <button onClick={() => { setShowSheetModal(false); setViewingAttender(null); }} className="text-white hover:text-indigo-200 font-bold text-sm">Close</button>
            </div>
            
            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-wrap gap-3 items-center">
              <select value={viewingProgramId} onChange={e => setViewingProgramId(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">-- Select Program Sheet --</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              {viewingProgramId && (
                <>
                  <input type="text" placeholder="Search by name, phone, city..." value={viewSearch} onChange={e => setViewSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  
                  <select value={viewStatus} onChange={e => setViewStatus(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">All Call Statuses</option>
                    <option value="Pending">Pending / Uncalled</option>
                    <option value="Info given">Info given</option>
                    <option value="Interested">Interested</option>
                    <option value="Reg.Done">Reg.Done</option>
                    <option value="Busy">Busy</option>
                    <option value="Call Cut">Call Cut</option>
                    <option value="switched off">switched off</option>
                    <option value="no answer">no answer</option>
                  </select>

                  <button onClick={handleExportSheet} disabled={!sortedViewLogs.length}
                    className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50">
                    <Download size={14} /> Export Sheet
                  </button>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {!viewingProgramId ? (
                <div className="h-full flex items-center justify-center text-gray-400 font-medium py-20">Select a program sheet to load worksheet logs.</div>
              ) : sortedViewLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 font-medium py-20">No matching contacts in this sheet.</div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3">Lead Details</th>
                      <th className="px-6 py-3">Location</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Remarks & Timeline</th>
                      <th className="px-6 py-3">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedViewLogs.map(log => {
                      const logName = Object.keys(log).find(k => k.toLowerCase().includes("name") || k.toLowerCase().includes("lead"));
                      const contactName = logName ? log[logName] : "Unknown";
                      return (
                        <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm text-gray-800">{contactName}</p>
                            <p className="text-gray-400 mt-0.5">{log.Phone || log.Mobile || "No Phone"}</p>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            <p>{log.City || "—"}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{log.State || "—"}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-lg font-black uppercase text-[10px] ${log.status === "Reg.Done" ? "bg-emerald-100 text-emerald-700" :
                              log.status === "Interested" ? "bg-blue-100 text-blue-700" :
                                log.status === "Info given" ? "bg-purple-100 text-purple-700" :
                                  !log.status || log.status === "Pending" ? "bg-amber-100 text-amber-700" :
                                    "bg-gray-100 text-gray-600"
                              }`}>{log.status || "Pending"}</span>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <p className="font-bold text-gray-700 truncate">{log.remark || "—"}</p>
                            {log.history && log.history.length > 0 && (
                              <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                                History: {log.history.map(h => `${h.status}(${h.remark || ""})`).join(" → ")}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-400">
                            {log.updatedAt?.toDate ? log.updatedAt.toDate().toLocaleString("en-IN") : log.updatedAt ? new Date(log.updatedAt).toLocaleString("en-IN") : "Never"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Workload Reassignment Panel Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden">
            <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg">Workload Reassignment Panel</h3>
                <p className="text-xs text-indigo-100 mt-0.5">Transfer contacts from one attender to another or to the pool</p>
              </div>
              <button onClick={() => setShowReassignModal(false)} className="text-white hover:text-indigo-200 font-bold text-sm">Cancel</button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">1. Select Program</label>
                <select value={reassignProgId} onChange={e => setReassignProgId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- Select Program --</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">2. From Attender</label>
                  <select value={reassignFromId} onChange={e => setReassignFromId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- Source --</option>
                    {attenders.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">3. Target Attender</label>
                  <select value={reassignToId} onChange={e => setReassignToId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">🌟 GENERAL POOL (Unassigned)</option>
                    {attenders.filter(a => a.id !== reassignFromId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">4. Reassign Mode</label>
                  <select value={reassignStatus} onChange={e => setReassignStatus(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="Pending">Only Pending / Uncalled</option>
                    <option value="Callbacks">Only Callbacks / Due</option>
                    <option value="All">All Active Contacts</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">5. Number of Contacts</label>
                  <input type="number" min={1} max={500} value={reassignCount} onChange={e => setReassignCount(parseInt(e.target.value) || 10)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowReassignModal(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700 font-bold text-sm rounded-xl">Cancel</button>
              <button onClick={handleReassign} disabled={reassigning}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition disabled:opacity-50">
                {reassigning ? "Processing..." : "Confirm Reassignment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
