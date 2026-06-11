import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "react-hot-toast";
import { 
  Database, RefreshCw, Check, AlertCircle, Search, Sparkles, 
  Phone, Mail, MapPin, Tag, ArrowRight, ShieldCheck, HelpCircle, X
} from "lucide-react";
import { createProgram, importContacts } from "../../lib/db";
import { testConnection, fetchContactsGroupedByTag, searchContacts, fetchLocationTags } from "../../lib/ghl";

export default function ImportContacts({ programs, onImportComplete }) {
  // CRM Connection status
  const [crmStatus, setCrmStatus] = useState("checking"); // "checking" | "connected" | "failed"
  const [crmTotalCount, setCrmTotalCount] = useState(0);
  const [crmError, setCrmError] = useState("");

  // Search input & suggestions
  const [crmQuery, setCrmQuery] = useState("");
  const [recentTags, setRecentTags] = useState(() => {
    try {
      const stored = localStorage.getItem("recent_crm_tags");
      return stored ? JSON.parse(stored) : [
        "30may_2026_b4_ultimate_intro_session",
        "30may_2026_b4_ultimate",
        "30may_2026_b3_intro_session",
        "crm_lead_sync"
      ];
    } catch {
      return ["30may_2026_b4_ultimate_intro_session", "30may_2026_b4_ultimate"];
    }
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);

  // Active fetching & downloading states
  const [isCrmFetching, setIsCrmFetching] = useState(false);
  const [crmFetchedGroups, setCrmFetchedGroups] = useState(null);
  const [crmFetchProgress, setCrmFetchProgress] = useState("");
  const abortControllerRef = useRef(null);



  // Discovered tags from CRM scanning
  const [discoveredTags, setDiscoveredTags] = useState([]);
  const [isScanningTags, setIsScanningTags] = useState(false);
  const [showDiagnosticTip, setShowDiagnosticTip] = useState(false);

  // Sync / Allocation states
  const [selectedCrmTags, setSelectedCrmTags] = useState({});
  const [isCrmImporting, setIsCrmImporting] = useState(false);
  const [crmImportProgress, setCrmImportProgress] = useState("");

  // Mapping Dialog states
  const [isMappingOpen, setIsMappingOpen] = useState(false);
  const [columnMappings, setColumnMappings] = useState({});
  const [skipEmptySettings, setSkipEmptySettings] = useState({});
  const [mappingFields, setMappingFields] = useState([]);

  useEffect(() => {
    checkCRMConnection();
  }, []);

  // Automatically scan CRM for tags once connected
  useEffect(() => {
    if (crmStatus === "connected") {
      handleDiscoverTags(true, true);
    }
  }, [crmStatus]);

  const checkCRMConnection = async () => {
    setCrmStatus("checking");
    try {
      const res = await testConnection();
      if (res.success) {
        setCrmStatus("connected");
        setCrmTotalCount(res.total);
        setCrmError("");
      } else {
        setCrmStatus("failed");
        setCrmError(res.error || "Could not authorize API connection");
      }
    } catch (err) {
      setCrmStatus("failed");
      setCrmError(err.message || "Network error checking connection");
    }
  };

  const handleFetchCrmLeads = async () => {
    if (!crmQuery.trim()) {
      toast.error("Please enter a tag or search query first.");
      return;
    }

    setIsCrmFetching(true);
    setCrmFetchProgress("Initializing GHL connection...");
    setCrmFetchedGroups(null);
    setShowDiagnosticTip(false);

    // Save/persist searched tag in suggestions
    addToRecentTags(crmQuery.trim());

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const groups = await fetchContactsGroupedByTag(crmQuery.trim(), (fetched, total) => {
        setCrmFetchProgress(`Downloaded ${fetched} contacts...`);
      }, controller.signal);

      const groupKeys = Object.keys(groups);
      if (groupKeys.length === 0) {
        setShowDiagnosticTip(true);
        toast.error("No contacts found. Note: GHL searches by Name/Email/Phone. Use 'Scan CRM' to discover active tag names!");
      } else {
        setCrmFetchedGroups(groups);
        
        // Auto-select only tags matching the user's search query by default
        const initialSelected = {};
        const queryClean = crmQuery.trim().toLowerCase();
        const matchingKeys = groupKeys.filter(k => k.toLowerCase().includes(queryClean));

        if (matchingKeys.length > 0) {
          groupKeys.forEach(k => {
            initialSelected[k] = matchingKeys.includes(k);
          });
        } else {
          // Fallback if no tag matches query explicitly
          groupKeys.forEach(k => {
            initialSelected[k] = true;
          });
        }
        setSelectedCrmTags(initialSelected);
        toast.success(`Fetched ${Object.values(groups).flat().length} leads from GHL across ${groupKeys.length} tag groups!`);
      }
    } catch (err) {
      if (err.name === "AbortError" || err.message === "Aborted") {
        toast.error("Fetching cancelled by user.");
      } else {
        console.error(err);
        toast.error("Fetch failed: " + err.message);
      }
    } finally {
      setIsCrmFetching(false);
      setCrmFetchProgress("");
      abortControllerRef.current = null;
    }
  };

  const handleStopFetching = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsCrmFetching(false);
      setCrmFetchProgress("");
      toast.success("Sync download stopped.");
    }
  };

  const handleDiscoverTags = async (silent = false, bypassStatusCheck = false) => {
    if (!bypassStatusCheck && crmStatus !== "connected") {
      if (!silent) toast.error("CRM is not connected. Please check connection.");
      return;
    }
    setIsScanningTags(true);
    try {
      const tagsList = await fetchLocationTags();
      const uniqueTags = tagsList.map(t => t.name).filter(Boolean);
      
      if (uniqueTags.length === 0) {
        if (!silent) toast.error("No active tags discovered on the CRM account.");
      } else {
        // Sort tags alphabetically for clean UI
        uniqueTags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        setDiscoveredTags(uniqueTags);
        if (!silent) toast.success(`Discovered ${uniqueTags.length} active CRM tags!`);
      }
    } catch (err) {
      console.error(err);
      if (!silent) toast.error("Tag discovery failed: " + err.message);
    } finally {
      setIsScanningTags(false);
    }
  };

  const addToRecentTags = (tag) => {
    if (!tag) return;
    setRecentTags(prev => {
      const next = [tag, ...prev.filter(t => t !== tag)].slice(0, 10);
      localStorage.setItem("recent_crm_tags", JSON.stringify(next));
      return next;
    });
  };

  const toggleTagSelection = (tag) => {
    setSelectedCrmTags(prev => ({
      ...prev,
      [tag]: !prev[tag]
    }));
  };

  // Combined list of existing programs, discovered tags, and recent search queries
  const allSuggestions = useMemo(() => {
    const programNames = (programs || []).map(p => p.name).filter(Boolean);
    const combined = Array.from(new Set([...programNames, ...discoveredTags, ...recentTags]));
    return combined;
  }, [programs, discoveredTags, recentTags]);

  // Filtered Autocomplete Suggestions
  const suggestions = useMemo(() => {
    const query = crmQuery.trim().toLowerCase();
    if (!query) {
      // If the query is empty but the input is focused, show all suggestions (up to 15) so they can choose from existing programs instantly!
      return allSuggestions.slice(0, 15);
    }
    // Filter and show up to 15 matches
    return allSuggestions.filter(tag => 
      tag.toLowerCase().includes(query) &&
      tag.toLowerCase() !== query
    ).slice(0, 15);
  }, [crmQuery, allSuggestions]);

  const filteredGroups = crmFetchedGroups;

  const allMatchingLeads = useMemo(() => {
    if (!filteredGroups) return [];
    return Object.entries(filteredGroups)
      .filter(([tag]) => !!selectedCrmTags[tag])
      .flatMap(([_, contacts]) => contacts);
  }, [filteredGroups, selectedCrmTags]);

  const getDefaultMapping = (colName) => {
    const c = colName.toLowerCase().trim();

    if (["name", "caller", "caller name", "lead name", "lead", "name of caller", "first name", "last name", "contact name"].includes(c)) {
      return "Name";
    }
    if (["mobile", "mobile no", "mobile number"].includes(c)) {
      return "Mobile";
    }
    if (["phone", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "contact no", "contact_no"].includes(c)) {
      return "Phone";
    }
    if (["email", "mail", "e-mail", "email id", "emailaddress"].includes(c)) {
      return "Email";
    }
    if (["city", "location", "khoji city", "place", "city name"].includes(c)) {
      return "City";
    }
    if (["state", "state name", "province", "region"].includes(c)) {
      return "State";
    }
    if (["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani"].includes(c) || c.includes("asmani") || c.includes("aasmani") || c.includes("आसमानी")) {
      return "Khoji";
    }
    if (["tags", "tag"].includes(c)) {
      return "Tags";
    }
    if (["source of informiton", "source of information"].includes(c)) {
      return "Source";
    }
    if (["source", "sourse", "origin"].includes(c)) {
      return "Ignore";
    }
    return "Ignore";
  };

  const handleOpenMappingDialog = () => {
    const tagsToSync = Object.keys(selectedCrmTags).filter(tag => selectedCrmTags[tag] && filteredGroups[tag]);
    if (tagsToSync.length === 0) {
      toast.error("Please select at least one active tag containing matching leads.");
      return;
    }

    // Scan all matching leads to find all unique fields that have at least one non-empty value
    const fields = new Set();
    allMatchingLeads.forEach(lead => {
      Object.entries(lead).forEach(([k, val]) => {
        if (k !== "GHL_ID" && !k.startsWith("_") && k !== "Sub Program") {
          const strVal = val === null || val === undefined ? "" : String(val).trim();
          const lowerVal = strVal.toLowerCase();
          const isEmptyOrDummy = ["", "none", "n/a", "null", "undefined", "false"].includes(lowerVal);
          if (!isEmptyOrDummy) {
            fields.add(k);
          }
        }
      });
    });

    const initialMappings = {};
    const initialSkipEmpty = {};
    Array.from(fields).forEach(field => {
      initialMappings[field] = getDefaultMapping(field);
      initialSkipEmpty[field] = true;
    });

    const sortedFields = Array.from(fields).sort((a, b) => {
      const mapA = initialMappings[a];
      const mapB = initialMappings[b];
      const isMappedA = mapA !== "Ignore";
      const isMappedB = mapB !== "Ignore";
      
      if (isMappedA && !isMappedB) return -1;
      if (!isMappedA && isMappedB) return 1;
      return a.localeCompare(b);
    });

    setColumnMappings(initialMappings);
    setSkipEmptySettings(initialSkipEmpty);
    setMappingFields(sortedFields);
    setIsMappingOpen(true);
  };

  const getSampleValues = (field) => {
    const samples = [];
    for (const lead of allMatchingLeads) {
      const val = lead[field];
      if (val !== undefined && val !== null) {
        const strVal = String(val).trim();
        const lowerVal = strVal.toLowerCase();
        const isEmptyOrDummy = ["", "none", "n/a", "null", "undefined", "false"].includes(lowerVal);
        if (!isEmptyOrDummy) {
          samples.push(strVal);
          if (samples.length >= 4) break;
        }
      }
    }
    return samples;
  };

  const handleConfirmImportLeads = async () => {
    setIsCrmImporting(true);
    setCrmImportProgress("Applying field mapping and syncing leads...");
    
    try {
      const tagsToSync = Object.keys(selectedCrmTags).filter(tag => selectedCrmTags[tag] && filteredGroups[tag]);
      let totalSynced = 0;
      let programsCreated = 0;

      const mappedFieldsList = [];
      Object.entries(columnMappings).forEach(([col, target]) => {
        if (col === "Sub Program" || target === "Ignore") return;
        mappedFieldsList.push(target);
      });
      const uniqueMappedFields = Array.from(new Set(mappedFieldsList));

      for (const tag of tagsToSync) {
        const tagContacts = filteredGroups[tag];
        
        // Transform contacts based on current mappings
        const transformedContacts = tagContacts.map(contact => {
          const newContact = {};
          
          if (contact["Sub Program"] !== undefined) newContact["Sub Program"] = contact["Sub Program"];
          if (contact.GHL_ID) newContact.GHL_ID = contact.GHL_ID;
          
          const systemMetaKeys = ["GHL_ID", "Sub Program"];
          
          uniqueMappedFields.forEach(f => {
            newContact[f] = "";
          });
          
          Object.entries(contact).forEach(([key, val]) => {
            if (systemMetaKeys.includes(key) || key.startsWith("_")) return;
            
            const target = columnMappings[key] || "Ignore";
            const skipEmpty = !!skipEmptySettings[key];
            const strVal = val === null || val === undefined ? "" : String(val).trim();
            
            if (skipEmpty && !strVal) return;
            if (target === "Ignore") return;
            
            // Standard field target
            if (newContact[target]) {
              newContact[target] = `${newContact[target]} ${strVal}`.trim();
            } else {
              newContact[target] = strVal;
            }
          });
          
          newContact._mappedFields = uniqueMappedFields;
          return newContact;
        });

        // 1. Check if program exists, else create
        let programId = "";
        const existing = programs.find(p => p.name === tag);
        if (existing) {
          programId = existing.id;
        } else {
          programId = await createProgram(tag);
          programsCreated++;
        }

        // 2. Queue into Firestore in chunks
        const imported = await importContacts(programId, tag, transformedContacts, [tag]);
        totalSynced += imported;
      }

      toast.success(
        `Successfully synced ${totalSynced} leads across ${tagsToSync.length} tags!${
          programsCreated > 0 ? ` Created ${programsCreated} new dialing folders.` : ""
        }`
      );

      setIsMappingOpen(false);
      setCrmFetchedGroups(null);
      setCrmQuery("");
      onImportComplete();
    } catch (err) {
      console.error(err);
      toast.error("CRM Import failed: " + err.message);
    } finally {
      setIsCrmImporting(false);
      setCrmImportProgress("");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Title Header */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-white/5 rounded-full blur-2xl"></div>
        <div className="space-y-2 z-10">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight">Lead Sync & Distribution 📂</h2>
        </div>

        {/* Live CRM Status Health Badge */}
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex items-center gap-4 z-10 w-full md:w-auto">
          <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
            <Database size={20} className="text-blue-200" />
          </div>
          <div>
            <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest">Connection Health</p>
            {crmStatus === "checking" && (
              <div className="flex items-center gap-1.5 text-sm font-semibold animate-pulse text-gray-300">
                <RefreshCw size={14} className="animate-spin" /> Verifying...
              </div>
            )}
            {crmStatus === "connected" && (
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block"></span>
                  Active CRM Connected
                </p>
                <p className="text-[11px] font-bold text-emerald-300">
                  {crmTotalCount.toLocaleString()} Total Leads Pool
                </p>
              </div>
            )}
            {crmStatus === "failed" && (
              <p className="text-sm font-bold text-red-300 flex items-center gap-1.5" title={crmError}>
                <AlertCircle size={14} /> Failed Offline
              </p>
            )}
          </div>
        </div>
      </div>

      {/* CRM Connection Error Notice */}
      {crmStatus === "failed" && (
        <div className="p-4 bg-red-50 text-red-800 rounded-3xl text-xs font-semibold leading-relaxed border border-red-100 flex items-start gap-2.5 max-w-6xl mx-auto shadow-sm animate-in slide-in-from-top duration-300">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            Connection offline: {crmError}.
            <button onClick={checkCRMConnection} className="underline text-blue-600 ml-1 hover:text-blue-800 font-bold">
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* ⚡ THE UNIFIED LANDSCAPE FILTER & SEARCH HUB */}
      <div className="bg-white border border-gray-150 rounded-3xl p-6 shadow-sm space-y-6 animate-in fade-in duration-300">
        
        {/* Section 1: Main Search Bar */}
        <div className="space-y-2 relative">
          <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
            <Tag size={12} className="text-blue-500" /> CRM Search Tag / Query
          </label>
          <div className="flex flex-col md:flex-row gap-3 relative">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
              <input 
                ref={searchInputRef}
                type="text"
                placeholder="Type tag name (e.g. 30may_2026_b4, yoga, or 2024)"
                value={crmQuery}
                onChange={e => setCrmQuery(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
                disabled={isCrmFetching || isCrmImporting || crmStatus !== "connected"}
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-none transition"
              />

              {/* Autocomplete Suggestion Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 max-h-52 overflow-y-auto overflow-x-hidden border-t-0 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-2.5 bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">Recent Queries & Programs</div>
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onMouseDown={() => {
                        setCrmQuery(s);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 text-sm font-semibold text-gray-800 border-b border-gray-50 last:border-0 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="md:w-60 shrink-0">
              {isCrmFetching ? (
                <button
                  onClick={handleStopFetching}
                  className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-2xl shadow-lg shadow-red-100 transition flex items-center justify-center gap-2 animate-pulse"
                >
                  <AlertCircle size={18} />
                  Stop Fetching Leads
                </button>
              ) : (
                <button
                  onClick={handleFetchCrmLeads}
                  disabled={crmStatus !== "connected" || !crmQuery}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-lg shadow-blue-200 transition flex items-center justify-center gap-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
                >
                  <Sparkles size={18} />
                  Fetch Matching Contacts
                </button>
              )}
            </div>
          </div>

          {crmFetchProgress && (
            <div className="mt-4 space-y-2 bg-blue-50/50 p-3.5 rounded-2xl border border-blue-100 max-w-xl">
              <div className="flex justify-between text-xs font-bold text-blue-650">
                <span className="animate-pulse">{crmFetchProgress}</span>
                <span className="animate-spin"><RefreshCw size={12} className="text-blue-600" /></span>
              </div>
              <div className="w-full bg-blue-100 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-650 h-full w-[80%] rounded-full animate-[pulse_1.5s_infinite]"></div>
              </div>
            </div>
          )}
        </div>



        {/* Section 3: Discovered CRM Tags (Badge Panel) */}
        <div className="pt-4 border-t border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1 w-full">
            <div className="flex justify-between md:justify-start items-center gap-3">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Discovered Active CRM Tags</span>
              {isScanningTags && (
                <span className="text-[9px] font-bold text-blue-650 flex items-center gap-1">
                  <RefreshCw size={10} className="animate-spin" /> Scanning...
                </span>
              )}
            </div>
            
            {discoveredTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-0.5 pr-1">
                {discoveredTags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setCrmQuery(tag)}
                    className={`px-2.5 py-1.5 text-[10px] font-black rounded-xl transition border ${
                      crmQuery === tag 
                        ? "bg-blue-650 text-white border-blue-600 shadow-sm"
                        : "bg-white hover:bg-blue-50/50 border-gray-250 text-gray-700 hover:text-blue-650"
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-gray-50 rounded-xl text-left text-[10px] text-gray-400 font-bold">
                No active tags discovered yet. Use the scan button to extract tags.
              </div>
            )}
          </div>

          <div className="shrink-0 w-full md:w-auto">
            <button
              type="button"
              onClick={() => handleDiscoverTags(false)}
              disabled={isScanningTags || crmStatus !== "connected"}
              className="w-full md:px-4 py-2 text-center text-[10px] font-extrabold text-blue-650 hover:text-blue-800 transition hover:bg-blue-50 rounded-xl border border-dashed border-blue-200 select-none flex items-center justify-center gap-1.5"
            >
              🔄 Force Re-Scan CRM Active Tags
            </button>
          </div>
        </div>

      </div>

      {/* ⚡ THE FULL-WIDTH RESULTS AND WORKSPACE */}
      <div className="space-y-6">
        {!crmFetchedGroups ? (
          /* Empty / Suggestion state */
          <div className="bg-white border border-gray-150 rounded-3xl p-8 shadow-sm space-y-6 animate-in fade-in duration-300">
            {showDiagnosticTip ? (
              <div className="space-y-4 max-w-3xl mx-auto animate-in fade-in duration-300">
                <div className="p-4 bg-amber-50/80 text-amber-900 rounded-2xl border border-amber-200 flex items-start gap-3 text-xs leading-relaxed">
                  <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                  <div className="space-y-2">
                    <h4 className="font-extrabold text-amber-955 text-sm">Why did "{crmQuery}" return 0 results?</h4>
                    <p className="text-amber-800 font-semibold">
                      GoHighLevel's V1 API searches for leads by matching standard fields like <strong className="font-extrabold">Name, Phone, or Email</strong>. It does <strong className="font-extrabold">not</strong> search tags server-side.
                    </p>
                    <p className="text-amber-855 font-semibold">
                      If there is no contact with the text <code className="bg-amber-100/50 px-1 py-0.5 rounded font-black text-amber-955">"{crmQuery}"</code> in their name or phone, GHL will return 0 results even if the tag itself exists!
                    </p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-150 space-y-3.5 shadow-sm">
                  <h5 className="font-black text-gray-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-blue-500" /> Dynamic Tag Recommendation
                  </h5>
                  <p className="text-xs text-gray-655 leading-relaxed font-semibold">
                    💡 <span className="text-blue-600 font-bold">Standard workflow:</span> Search for a broader month or keyword term (like <strong className="font-black text-gray-850">"30may"</strong> or <strong className="font-black text-gray-850">"may"</strong>) to pull all matching leads. Once fetched, our system will automatically parse and group them into their specific tags locally!
                  </p>
                  <div className="pt-1.5 border-t border-gray-100 flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-gray-400">Click a recommended keyword to search:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {["30may", "may", "2026"].map(keyword => (
                        <button
                          key={keyword}
                          type="button"
                          onClick={() => {
                            setCrmQuery(keyword);
                            setShowDiagnosticTip(false);
                            searchInputRef.current?.focus();
                          }}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 text-[10px] font-black rounded-lg border border-blue-100 transition"
                        >
                          Query "{keyword}"
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 space-y-4 max-w-md mx-auto text-center">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-md border border-gray-150 flex items-center justify-center text-blue-500">
                  <Database size={28} />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-base font-black text-gray-800">No CRM Contacts Loaded</h4>
                  <p className="text-gray-500 text-xs leading-relaxed font-semibold">
                    Enter a tag or query in the input above and click Fetch Matching Contacts to download leads.
                  </p>
                </div>
              </div>
            )}


          </div>
        ) : (
          /* Dynamic Sync Workspace (Full-Width, One-Below-Another) */
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6 animate-in fade-in duration-300">
            
            {/* Header Stats */}
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-gray-855">Ready to Sync</h3>
                <p className="text-xs text-gray-400 font-semibold">Verify leads details and tags before committing to dialer.</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Leads matching filters</span>
                <span className="text-xl font-black text-blue-600">
                  {allMatchingLeads.length.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Target Programs Tag Groups Selector (Checklist) */}
            <div className="space-y-3.5 bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
              <div className="flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-wider">
                <span>Target Dialing Programs (Tags found in results)</span>
                <span>Toggle to Include/Exclude</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(crmFetchedGroups).map(tag => {
                  const originalCount = crmFetchedGroups[tag]?.length || 0;
                  const filteredCount = filteredGroups?.[tag]?.length || 0;
                  const isSelected = !!selectedCrmTags[tag];

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => filteredCount > 0 && toggleTagSelection(tag)}
                      className={`px-3 py-2.5 rounded-2xl border text-xs font-bold transition flex items-center gap-2.5 select-none ${
                        filteredCount === 0
                          ? "bg-gray-100 border-gray-150 text-gray-400 opacity-60 cursor-not-allowed"
                          : isSelected
                            ? "bg-blue-50/50 border-blue-300 text-blue-700 shadow-sm"
                            : "bg-white hover:bg-gray-50 border-gray-250 text-gray-655"
                      }`}
                    >
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        disabled={filteredCount === 0}
                        onChange={() => {}} // toggled via button click
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                      />
                      <div className="text-left leading-tight">
                        <span className="block font-black truncate max-w-[180px]">#{tag}</span>
                        <span className="text-[9px] text-gray-455 font-semibold">{filteredCount} leads</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Flat list of matching contacts (one below another, full-width) */}
            <div className="space-y-3 pt-2">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex justify-between border-b border-gray-100 pb-2.5 px-2">
                <span>Contact Details & Demographics</span>
                <span>Active CRM Tags & Origin</span>
              </div>

              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {allMatchingLeads.map((lead, idx) => (
                  <div 
                    key={lead.GHL_ID || idx}
                    className="p-4 bg-white border border-gray-150 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between hover:border-blue-200 hover:bg-blue-50/5 transition duration-150 shadow-sm gap-3 animate-in fade-in duration-150"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-black text-blue-600 shrink-0 text-sm">
                        {lead.Name ? lead.Name[0].toUpperCase() : "?"}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <span className="font-extrabold text-gray-800 block truncate text-sm">
                          {lead.Name || "Unnamed Lead"}
                        </span>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-400 font-semibold text-[10px]">
                          {lead.Phone && (
                            <span className="flex items-center gap-1 text-gray-655 font-bold">
                              <Phone size={10} className="text-gray-400" /> {lead.Phone}
                            </span>
                          )}
                          {lead.Email && (
                            <span className="flex items-center gap-1">
                              <Mail size={10} className="text-gray-400" /> {lead.Email}
                            </span>
                          )}
                          {(lead.City || lead.State) && (
                            <span className="flex items-center gap-1 text-gray-500">
                              <MapPin size={10} className="text-gray-400" /> {[lead.City, lead.State].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-50">
                      <div className="flex flex-wrap sm:justify-end gap-1">
                        {lead.Tags && lead.Tags.split(", ").slice(0, 3).map(tag => (
                          <span key={tag} className="text-[9px] bg-gray-50 text-gray-500 font-extrabold px-2 py-0.5 rounded-lg border border-gray-100">
                            #{tag}
                          </span>
                        ))}
                        {lead.Tags && lead.Tags.split(", ").length > 3 && (
                          <span className="text-[9px] bg-blue-50 text-blue-600 font-black px-1.5 py-0.5 rounded-lg">
                            +{lead.Tags.split(", ").length - 3} more
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-gray-400 font-extrabold block uppercase tracking-wider">
                        Source: {lead.Source || "Unknown"}
                      </span>
                    </div>
                  </div>
                ))}

                {allMatchingLeads.length === 0 && (
                  <div className="p-10 text-center bg-gray-50 rounded-2xl border border-dashed text-gray-500 text-xs font-semibold">
                    <span>⚠️ No target programs selected. Toggle the target program checkboxes above to include leads for syncing.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sync Action footer */}
            <div className="pt-6 border-t border-gray-100 space-y-4">
              <button
                onClick={handleOpenMappingDialog}
                disabled={isCrmImporting || allMatchingLeads.length === 0}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-black shadow-lg shadow-blue-200 transition flex items-center justify-center gap-2 disabled:from-gray-100 disabled:to-gray-100 disabled:text-gray-400 disabled:shadow-none"
              >
                {isCrmImporting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin animate-spin-slow" />
                    <span>{crmImportProgress}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Sync {allMatchingLeads.length} Leads to Dialer Dashboard</span>
                  </>
                )}
              </button>

              <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex items-start gap-2.5 animate-in fade-in duration-300">
                <span className="text-blue-500 shrink-0 text-sm">💡</span>
                <p className="text-[11px] font-bold text-gray-500 leading-relaxed">
                  The dialer will automatically create dedicated dialing folders for each active tag. Leads that have already been assigned to attenders in previous syncs will be automatically skipped to prevent dialing duplicates.
                </p>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Field Mapping Dialog */}
      {isMappingOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-150 animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Mapped columns</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Choose how CRM columns align with Dialer contact fields. Ignored columns will be skipped during import.
                </p>
              </div>
              <button 
                onClick={() => setIsMappingOpen(false)}
                className="text-slate-450 hover:text-slate-700 p-2 hover:bg-gray-150 rounded-xl transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 pb-3">
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/4">Column in file</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/4">Sample values</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/8">Status</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/8">Object</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/4">Field</th>
                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/6 text-center">Update empty values</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mappingFields.map(field => {
                    const samples = getSampleValues(field);
                    const target = columnMappings[field];
                    const isMapped = target && target !== "Ignore";
                    const skipEmpty = !!skipEmptySettings[field];

                    return (
                      <tr key={field} className="hover:bg-slate-50/50 transition-colors">
                        {/* Column Name */}
                        <td className="py-4 pr-4 font-extrabold text-slate-700 text-sm align-top">
                          {field}
                        </td>
                        
                        {/* Sample Values */}
                        <td className="py-4 pr-4 text-xs text-slate-500 leading-relaxed align-top whitespace-pre-line font-medium">
                          {samples.length > 0 ? (
                            samples.map((s, idx) => (
                              <div key={idx} className="truncate max-w-xs">{s}</div>
                            ))
                          ) : (
                            <span className="text-gray-300 italic">No values</span>
                          )}
                        </td>
                        
                        {/* Status badge */}
                        <td className="py-4 pr-4 align-top pt-5">
                          {isMapped ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-250 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase">
                              <Check size={10} className="stroke-[3px]" /> Mapped
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-500 border border-gray-250 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase">
                              <X size={10} className="stroke-[3px]" /> Ignored
                            </span>
                          )}
                        </td>
                        
                        {/* Object Column */}
                        <td className="py-4 pr-4 text-xs text-slate-500 font-bold align-top pt-5">
                          Contact
                        </td>
                        
                        {/* Dropdown field selector */}
                        <td className="py-4 pr-4 align-top">
                          <select
                            value={target}
                            onChange={(e) => {
                              const val = e.target.value;
                              setColumnMappings(prev => ({ ...prev, [field]: val }));
                            }}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-sm"
                          >
                            <optgroup label="Standard Fields">
                              <option value="Name">Name (Caller Name)</option>
                              <option value="Phone">Phone</option>
                              <option value="Mobile">Mobile No</option>
                              <option value="Email">Email</option>
                              <option value="City">City</option>
                              <option value="State">State</option>
                              <option value="Khoji">Khoji (Yes/No / Have you done Maha Asmani)</option>
                              <option value="Source">Source of Information</option>
                              <option value="Tags">Tags</option>
                            </optgroup>
                            <optgroup label="Options">
                              <option value="Ignore">Don't Import (Ignore)</option>
                            </optgroup>
                          </select>
                        </td>
                        
                        {/* Checkbox settings */}
                        <td className="py-4 text-center align-top pt-5">
                          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={skipEmpty}
                              onChange={(e) => {
                                const val = e.target.checked;
                                setSkipEmptySettings(prev => ({ ...prev, [field]: val }));
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-indigo-650 focus:ring-indigo-550 transition cursor-pointer"
                            />
                            <span className="text-[11px] font-semibold text-slate-600">Skip empty values</span>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer buttons */}
            <div className="px-8 py-5 border-t border-gray-100 flex justify-between bg-slate-50 shrink-0">
              <button
                onClick={() => setIsMappingOpen(false)}
                className="px-5 py-2.5 bg-gray-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-gray-200 transition"
              >
                Back
              </button>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setIsMappingOpen(false)}
                  className="px-5 py-2.5 text-slate-500 hover:text-slate-700 font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImportLeads}
                  disabled={isCrmImporting}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs transition shadow-md shadow-blue-200 flex items-center gap-2 disabled:bg-slate-300 disabled:shadow-none"
                >
                  {isCrmImporting ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <>
                      <span>Next</span>
                      <ArrowRight size={12} />
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
