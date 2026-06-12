import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  FolderOpen, Plus, Trash2, Loader2, UploadCloud, Sparkles, Download, AlertTriangle
} from "lucide-react";
import {
  getProgramContactStats, createProgram, deleteProgram,
  importContacts, getProgramChunkContacts, remapProgramContacts,
  getProgramCallLogs
} from "../../../../lib/db";
import { getDefaultExcelMapping, STANDARD_TARGETS, cleanExportRow } from "../utils.jsx";

export default function ProgramsTab({ programs, attenders, onReloadPrograms }) {
  const [newProgramName, setNewProgramName] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedProgStats, setSelectedProgStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsProgId, setStatsProgId] = useState("");

  // Excel Upload States
  const [uploadTargetProgId, setUploadTargetProgId] = useState("");
  const [excelFile, setExcelFile] = useState(null);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelDataPreview, setExcelDataPreview] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [showMapModal, setShowMapModal] = useState(false);
  const [importing, setImporting] = useState(false);

  // Folder Select States
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderStatus, setFolderStatus] = useState("");

  // Remap States
  const [remapProgram, setRemapProgram] = useState(null);
  const [remapHeaders, setRemapHeaders] = useState([]);
  const [remapMapping, setRemapMapping] = useState({});
  const [remapping, setRemapping] = useState(false);

  useEffect(() => {
    if (statsProgId) {
      loadStats(statsProgId);
    } else {
      setSelectedProgStats(null);
    }
  }, [statsProgId]);

  const loadStats = async (pid) => {
    setStatsLoading(true);
    try {
      const stats = await getProgramContactStats(pid);
      setSelectedProgStats(stats);
    } catch (err) {
      toast.error("Failed to load program stats.");
    } finally {
      setStatsLoading(false);
    }
  };

  const handleCreateProgram = async (e) => {
    e.preventDefault();
    if (!newProgramName.trim()) return;
    setCreating(true);
    try {
      await createProgram(newProgramName.trim());
      setNewProgramName("");
      toast.success("Program created successfully!");
      onReloadPrograms();
    } catch (err) {
      toast.error("Failed to create program: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProgram = async (id, name) => {
    if (!confirm(`Are you absolutely sure you want to delete "${name}"? This will delete all contacts in it. This cannot be undone!`)) return;
    try {
      await deleteProgram(id);
      toast.success("Program deleted!");
      if (statsProgId === id) setStatsProgId("");
      onReloadPrograms();
    } catch (err) {
      toast.error("Error deleting program: " + err.message);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setExcelFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!json.length) {
          toast.error("Excel sheet is empty.");
          return;
        }

        // Get headers
        const headers = Object.keys(json[0]);
        setExcelHeaders(headers);
        setExcelDataPreview(json);

        // Auto mapping
        const initMap = {};
        headers.forEach(h => {
          initMap[h] = getDefaultExcelMapping(h);
        });
        setFieldMapping(initMap);
        setShowMapModal(true);
      } catch (err) {
        toast.error("Error reading file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFolderSelect = async (e) => {
    const files = Array.from(e.target.files);
    const excelFiles = files.filter(f => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
    
    if (excelFiles.length === 0) {
      toast.error("No Excel files found in selected folder.");
      return;
    }
    setFolderFiles(excelFiles);
    setFolderStatus(`Found ${excelFiles.length} Excel file(s). Ready to process.`);
  };

  const handleProcessFolder = async () => {
    if (!uploadTargetProgId) {
      toast.error("Select target program first.");
      return;
    }
    if (folderFiles.length === 0) return;
    
    setImporting(true);
    let totalImported = 0;
    try {
      for (let i = 0; i < folderFiles.length; i++) {
        const file = folderFiles[i];
        setFolderStatus(`Processing (${i + 1}/${folderFiles.length}): ${file.name}...`);
        
        const fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const data = new Uint8Array(evt.target.result);
              const wb = XLSX.read(data, { type: "array" });
              const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
              resolve(json);
            } catch (err) { reject(err); }
          };
          reader.readAsArrayBuffer(file);
        });

        if (fileData.length === 0) continue;
        
        // Auto map this file
        const headers = Object.keys(fileData[0]);
        const map = {};
        headers.forEach(h => { map[h] = getDefaultExcelMapping(h); });

        const mappedRows = fileData.map(row => {
          const contact = {};
          Object.entries(map).forEach(([exHeader, targetField]) => {
            if (targetField !== "Ignore") {
              contact[targetField] = row[exHeader];
            }
          });
          // Also store all original properties to prevent data loss
          Object.keys(row).forEach(k => {
            if (!contact[k] && map[k] === "Ignore") {
              contact[k] = row[k];
            }
          });
          contact.status = "Pending";
          return contact;
        }).filter(c => c.Phone || c.Mobile);

        if (mappedRows.length > 0) {
          await importContacts(uploadTargetProgId, mappedRows);
          totalImported += mappedRows.length;
        }
      }

      toast.success(`Successfully imported ${totalImported} contacts from folder!`);
      setFolderFiles([]);
      setFolderStatus("");
      if (statsProgId === uploadTargetProgId) loadStats(uploadTargetProgId);
    } catch (err) {
      toast.error("Error processing folder: " + err.message);
      setFolderStatus("Error: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleStartRemap = async (prog) => {
    setRemapProgram(prog);
    try {
      // Fetch a small sample (first chunk) to extract headers
      const sample = await getProgramChunkContacts(prog.id, 10);
      if (sample.length === 0) {
        toast.error("No contacts found in program to remap.");
        setRemapProgram(null);
        return;
      }
      
      const INTERNAL_KEYS = ["id", "programId", "programName", "attenderId", "createdAt", "updatedAt", "history", "_callbackDue", "_deleted", "isCallbackDue", "isHotLead", "callCount"];
      const allKeys = new Set();
      sample.forEach(c => {
        Object.keys(c).forEach(k => {
          if (!INTERNAL_KEYS.includes(k) && !k.startsWith("_")) {
            allKeys.add(k);
          }
        });
      });

      const headers = Array.from(allKeys);
      setRemapHeaders(headers);
      
      const initMap = {};
      headers.forEach(h => {
        initMap[h] = getDefaultExcelMapping(h);
      });
      setRemapMapping(initMap);
    } catch (err) {
      toast.error("Failed to load schema for remap: " + err.message);
      setRemapProgram(null);
    }
  };

  const handleExecuteRemap = async () => {
    if (!remapProgram) return;
    setRemapping(true);
    try {
      await remapProgramContacts(remapProgram.id, remapMapping);
      toast.success("Program fields remapped successfully!");
      setRemapProgram(null);
      if (statsProgId === remapProgram.id) loadStats(remapProgram.id);
    } catch (err) {
      toast.error("Remapping failed: " + err.message);
    } finally {
      setRemapping(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!uploadTargetProgId) {
      toast.error("Please select a target program first.");
      return;
    }
    
    // Check if phone or mobile is mapped
    const mappings = Object.values(fieldMapping);
    if (!mappings.includes("Phone") && !mappings.includes("Mobile")) {
      toast.error("You MUST map at least one column to 'Phone' or 'Mobile'!");
      return;
    }

    setImporting(true);
    try {
      const dataToSave = excelDataPreview.map(row => {
        const contact = {};
        Object.entries(fieldMapping).forEach(([exHeader, targetField]) => {
          if (targetField !== "Ignore") {
            contact[targetField] = row[exHeader];
          }
        });
        
        // Retain original unmapped properties as dynamic keys
        Object.keys(row).forEach(k => {
          if (!contact[k] && fieldMapping[k] === "Ignore") {
            contact[k] = row[k];
          }
        });

        contact.status = "Pending";
        return contact;
      }).filter(c => c.Phone || c.Mobile); // Filter out records with no phone number

      if (dataToSave.length === 0) {
        toast.error("No valid contacts found (missing Phone/Mobile).");
        setImporting(false);
        return;
      }

      await importContacts(uploadTargetProgId, dataToSave);
      toast.success(`Successfully imported ${dataToSave.length} contacts!`);
      setShowMapModal(false);
      setExcelFile(null);
      setExcelHeaders([]);
      setExcelDataPreview([]);
      
      if (statsProgId === uploadTargetProgId) {
        loadStats(uploadTargetProgId);
      }
    } catch (err) {
      toast.error("Import failed: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadAllCallsExcel = async (prog) => {
    toast.loading("Fetching all logs... please wait.", { id: "log-fetch" });
    try {
      const logs = await getProgramCallLogs(prog.id);
      toast.dismiss("log-fetch");
      if (logs.length === 0) {
        toast.error("No call logs found in this program.");
        return;
      }
      const cleaned = logs.map(cleanExportRow);
      const ws = XLSX.utils.json_to_sheet(cleaned);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Logs");
      XLSX.writeFile(wb, `${prog.name}_call_logs_${new Date().toLocaleDateString("en-CA")}.xlsx`);
      toast.success("Excel exported successfully!");
    } catch (err) {
      toast.dismiss("log-fetch");
      toast.error("Failed to export: " + err.message);
    }
  };

  return (
    <div className="p-8 space-y-8">
      {/* Top Bar */}
      <div>
        <h2 className="text-3xl font-black text-slate-800">Programs & Mappings Manager</h2>
        <p className="text-slate-500 mt-1">Create programs, import Excel contacts, and configure custom field mappings.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left Column: List Programs & Create */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-base">
              <FolderOpen size={18} className="text-indigo-600" /> Active Programs ({programs.length})
            </h3>
            
            <form onSubmit={handleCreateProgram} className="flex gap-2 mb-6">
              <input type="text" placeholder="Enter new program name..." value={newProgramName} onChange={e => setNewProgramName(e.target.value)} required
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold" />
              <button type="submit" disabled={creating}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm shadow-sm transition-all disabled:opacity-50">
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create
              </button>
            </form>

            <div className="divide-y divide-gray-50 border border-gray-50 rounded-2xl overflow-hidden">
              {programs.map(p => (
                <div key={p.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div>
                    <h4 className="font-bold text-slate-800">{p.name}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">ID: {p.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setStatsProgId(p.id)}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition">
                      View Stats
                    </button>
                    <button onClick={() => handleDownloadAllCallsExcel(p)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 font-bold rounded-xl text-xs transition">
                      <Download size={12} /> Call Logs
                    </button>
                    <button onClick={() => handleStartRemap(p)}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-xl text-xs transition">
                      Remap Schema
                    </button>
                    <button onClick={() => handleDeleteProgram(p.id, p.name)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {programs.length === 0 && (
                <div className="py-12 text-center text-gray-400 font-medium">No programs created yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Schema/Stats View & Upload Contacts */}
        <div className="space-y-6">
          {/* Stats View */}
          {selectedProgStats && (
            <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 text-white p-6 rounded-3xl shadow-lg border border-indigo-950">
              <h3 className="font-bold text-base mb-3 flex items-center justify-between">
                <span>{selectedProgStats.programName} Stats</span>
                <span className="text-xs px-2 py-0.5 bg-indigo-800/80 rounded-lg">Realtime</span>
              </h3>
              {statsLoading ? (
                <div className="py-6 text-center text-indigo-200">Loading metrics...</div>
              ) : (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-white/5 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Total Contacts</p>
                    <p className="text-2xl font-black mt-1">{selectedProgStats.total}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Total Called</p>
                    <p className="text-2xl font-black mt-1 text-emerald-300">{selectedProgStats.called}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Conversions</p>
                    <p className="text-2xl font-black mt-1 text-yellow-300">{selectedProgStats.converted}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Pending Contacts</p>
                    <p className="text-2xl font-black mt-1 text-orange-300">{selectedProgStats.pending}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload Box */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-base">
              <UploadCloud size={18} className="text-green-600" /> Import Contacts from Excel
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">Select Target Program</label>
                <select value={uploadTargetProgId} onChange={e => setUploadTargetProgId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- Choose Program --</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">Import Mode</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <label className="flex items-center gap-2 p-3 border border-gray-100 rounded-2xl cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="import-mode" defaultChecked onChange={() => { setFolderFiles([]); setFolderStatus(""); }} />
                    <span className="text-xs font-bold text-gray-700">Single File</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-gray-100 rounded-2xl cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="import-mode" onChange={() => { setExcelFile(null); setExcelHeaders([]); }} />
                    <span className="text-xs font-bold text-gray-700">Folder Upload</span>
                  </label>
                </div>
              </div>

              {folderFiles.length === 0 ? (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">Upload Excel File</label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl p-6 cursor-pointer hover:bg-gray-50/50 transition">
                    <UploadCloud size={24} className="text-gray-400 mb-1" />
                    <span className="text-xs font-bold text-gray-500">Click to select files</span>
                    <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
                  </label>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-800">{folderStatus}</p>
                  <button onClick={handleProcessFolder} disabled={importing}
                    className="w-full mt-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1">
                    {importing ? <Loader2 size={14} className="animate-spin" /> : null} Process Folder Contacts
                  </button>
                </div>
              )}

              {/* Folder Input */}
              {folderFiles.length === 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">Select Folder containing Excel sheets</label>
                  <input type="file" webkitdirectory="" directory="" onChange={handleFolderSelect}
                    className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
                  {folderStatus && <p className="text-xs font-bold text-gray-500 mt-2">{folderStatus}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Field Mapping Dialog Modal */}
      {showMapModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg">Excel Columns Field Mapper</h3>
                <p className="text-xs text-indigo-100 mt-0.5">Map Excel columns to database fields to prevent duplicate entries</p>
              </div>
              <button onClick={() => setShowMapModal(false)} className="text-white hover:text-indigo-200 font-bold text-sm">Cancel</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center gap-2 p-3.5 bg-amber-50 text-amber-800 text-xs font-semibold rounded-2xl">
                <AlertTriangle size={16} className="shrink-0" />
                <span>Columns mapped to <b>Phone</b> or <b>Mobile</b> are verified against duplicates on import.</span>
              </div>

              <div className="grid grid-cols-2 gap-4 font-bold text-xs text-gray-400 border-b border-gray-100 pb-2">
                <span>EXCEL COLUMN HEADER</span>
                <span>TARGET DATABASE FIELD</span>
              </div>

              <div className="space-y-3">
                {excelHeaders.map(hdr => (
                  <div key={hdr} className="grid grid-cols-2 items-center gap-4 border-b border-gray-50 pb-2">
                    <span className="font-bold text-sm text-gray-700 truncate">{hdr}</span>
                    <select value={fieldMapping[hdr]} onChange={e => setFieldMapping({ ...fieldMapping, [hdr]: e.target.value })}
                      className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      {STANDARD_TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowMapModal(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700 font-bold text-sm rounded-xl">Cancel</button>
              <button onClick={handleConfirmImport} disabled={importing}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition disabled:opacity-50">
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Start Importing Contacts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schema Remap Modal */}
      {remapProgram && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg">Remap Existing Program Fields</h3>
                <p className="text-xs text-amber-100 mt-0.5">Change standard mapping fields for existing contact documents in {remapProgram.name}</p>
              </div>
              <button onClick={() => setRemapProgram(null)} className="text-white hover:text-amber-200 font-bold text-sm">Cancel</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4 font-bold text-xs text-gray-400 border-b border-gray-100 pb-2">
                <span>EXISTING PROPERTY KEY</span>
                <span>TARGET DATABASE FIELD</span>
              </div>

              <div className="space-y-3">
                {remapHeaders.map(hdr => (
                  <div key={hdr} className="grid grid-cols-2 items-center gap-4 border-b border-gray-50 pb-2">
                    <span className="font-bold text-sm text-gray-700 truncate">{hdr}</span>
                    <select value={remapMapping[hdr]} onChange={e => setRemapMapping({ ...remapMapping, [hdr]: e.target.value })}
                      className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500">
                      {STANDARD_TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setRemapProgram(null)} className="px-4 py-2 text-gray-500 hover:text-gray-700 font-bold text-sm rounded-xl">Cancel</button>
              <button onClick={handleExecuteRemap} disabled={remapping}
                className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl shadow-sm transition disabled:opacity-50">
                {remapping ? <Loader2 size={16} className="animate-spin" /> : null} Execute Remap Operation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
