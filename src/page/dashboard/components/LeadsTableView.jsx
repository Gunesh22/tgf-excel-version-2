import React, { useState, useMemo, useRef, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { toast } from "react-hot-toast";
import { hasMultipleNumbers, extractPhones } from "../utils";

export const LeadsTableView = ({ data, colsMap, columns }) => {
    const { sourceCol, shivirCol, phoneCol, cityCol, statusCol, actionCol } = colsMap;

    // Drag-to-scroll refs
    const scrollRef = useRef(null);
    const isDragging = useRef(false);
    const dragStartX = useRef(0);
    const dragScrollLeft = useRef(0);

    const onMouseDown = useCallback((e) => {
        isDragging.current = true;
        dragStartX.current = e.pageX - scrollRef.current.offsetLeft;
        dragScrollLeft.current = scrollRef.current.scrollLeft;
        scrollRef.current.style.cursor = 'grabbing';
    }, []);
    const onMouseMove = useCallback((e) => {
        if (!isDragging.current) return;
        e.preventDefault();
        const x = e.pageX - scrollRef.current.offsetLeft;
        const walk = (x - dragStartX.current) * 1.2;
        scrollRef.current.scrollLeft = dragScrollLeft.current - walk;
    }, []);
    const onMouseUp = useCallback(() => {
        isDragging.current = false;
        if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
    }, []);

    const [filterSource, setFilterSource] = useState("All");
    const [filterShivir, setFilterShivir] = useState("All");
    const [filterStatus, setFilterStatus] = useState("All");
    const [filterAction, setFilterAction] = useState("All");
    const [buttonFilter, setButtonFilter] = useState("All");

    const [searchQuery, setSearchQuery] = useState("");
    const [searchColumn, setSearchColumn] = useState("All");
    const [fontSize, setFontSize] = useState("sm");
// //     const [activeRowIdx, setActiveRowIdx] = useState(null);

    const [page, setPage] = useState(1);
    const rowsPerPage = 50;

    // Build a count of every individual phone number across the FULL dataset
    const phoneCounts = useMemo(() => {
        const counts = {};
        data.forEach(r => {
            extractPhones(r[phoneCol]).forEach(p => {
                counts[p] = (counts[p] || 0) + 1;
            });
        });
        return counts;
    }, [data, phoneCol]);

    // Set of phone numbers that appear MORE THAN ONCE across the full dataset
    // Using a Set ensures O(1) lookup and guarantees cross-page correctness
    const dupPhoneSet = useMemo(() => {
        const set = new Set();
        Object.entries(phoneCounts).forEach(([phone, count]) => {
            if (count > 1) set.add(phone);
        });
        return set;
    }, [phoneCounts]);

    // Helper: returns true if ANY phone number in this cell is a known duplicate
    const isDupRow = (phoneCell) =>
        extractPhones(phoneCell).some(p => dupPhoneSet.has(p));

    const filteredData = useMemo(() => {
        return data.filter(row => {

            // Search
            if (searchQuery.trim() !== "") {
                const query = searchQuery.toLowerCase();
                if (searchColumn === "All") {
                    const valStr = Object.values(row).join(" ").toLowerCase();
                    if (!valStr.includes(query)) return false;
                } else {
                    const valStr = String(row[searchColumn] || "").toLowerCase();
                    if (!valStr.includes(query)) return false;
                }
            }

            // Button states calculation
            const phone = String(row[phoneCol] || "").trim();
            const isDup = isDupRow(phone);
            const hasMult = hasMultipleNumbers(phone);
            const hasEmpty = columns.some(c => !row[c] || String(row[c]).trim() === "");
            const isNewKhoji = String(row[cityCol] || "").toLowerCase().includes("khoji") ||
                String(row[colsMap.nameCol] || "").toLowerCase().includes("new");

            if (buttonFilter === "New" && !isNewKhoji) return false;
            if (buttonFilter === "Multi" && !hasMult) return false;
            if (buttonFilter === "Duplicates" && !isDup) return false;
            if (buttonFilter === "Missing" && !hasEmpty) return false;
            if (buttonFilter === "NoDuplicates" && isDup) return false;

            // Table filters — normalize both sides so casing/whitespace don't break matching
            const norm = (v) => String(v || "").replace(/[\s\u00A0\u200B\t]+/g, " ").trim().toLowerCase();
            if (filterSource !== "All" && norm(row[sourceCol]) !== norm(filterSource)) return false;
            if (filterShivir !== "All" && norm(row[shivirCol]) !== norm(filterShivir)) return false;
            if (statusCol && filterStatus !== "All" && norm(row[statusCol]) !== norm(filterStatus)) return false;
            if (actionCol && filterAction !== "All" && norm(row[actionCol]) !== norm(filterAction)) return false;

            return true;
        });
    }, [data, buttonFilter, filterSource, filterShivir, filterStatus, filterAction, colsMap, phoneCounts, phoneCol, cityCol, columns, searchQuery, searchColumn, statusCol, actionCol]);

    const getOptions = (col) => {
        const norm = (v) => String(v || "").replace(/[\s\u00A0\u200B\t]+/g, " ").trim();
        const seen = new Set();
        const result = [];
        data.forEach(r => {
            const raw = norm(r[col]);
            const key = raw.toLowerCase();
            if (raw && !seen.has(key)) { seen.add(key); result.push(raw); }
        });
        return result.sort();
    };

    // Smart column sizing based on column name keywords
    const getColStyle = (colName) => {
        const c = colName.toLowerCase();
        if (c.includes("phone") || c.includes("cont") || c.includes("number") || c.includes("mobile"))
            return { minWidth: "220px", whiteSpace: "normal", wordBreak: "break-word" };
        if (c.includes("name") || c.includes("lead"))
            return { minWidth: "120px", maxWidth: "180px", whiteSpace: "nowrap" };
        if (c.includes("source") || c.includes("sourse") || c.includes("type") || c.includes("status"))
            return { minWidth: "90px", maxWidth: "130px", whiteSpace: "nowrap" };
        if (c.includes("shivir") || c.includes("month") || c.includes("city") || c.includes("khoji"))
            return { minWidth: "80px", maxWidth: "130px", whiteSpace: "nowrap" };
        if (c.includes("attendy") || c.includes("caller"))
            return { minWidth: "80px", maxWidth: "120px", whiteSpace: "nowrap" };
        if (c.includes("comment") || c.includes("remark") || c.includes("detail") || c.includes("history") || c.includes("action") || c.includes("note"))
            return { minWidth: "200px", maxWidth: "320px", whiteSpace: "normal", wordBreak: "break-word" };
        if (c.includes("date") || c.includes("time"))
            return { minWidth: "90px", maxWidth: "120px", whiteSpace: "nowrap" };
        // default
        return { minWidth: "80px", maxWidth: "160px", whiteSpace: "nowrap" };
    };

    const paginatedData = filteredData.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    const setBtnFilter = (type) => {
        setButtonFilter(type);
        setPage(1);
    };

    return (
        <div className="flex flex-col gap-6 p-8 bg-gray-50 min-h-screen">
            {/* Top Banner */}
            <div className="flex items-center gap-3 bg-blue-700 text-white px-5 py-3 rounded-xl shadow select-none">
                <Copy size={18} className="shrink-0" />
                <span className="text-sm font-bold tracking-wide">Right-click any cell to copy its value &nbsp;·&nbsp; Drag the table to scroll horizontally</span>
            </div>

            <div className="flex flex-col gap-1 shrink-0">
                <h1 className="text-2xl font-bold text-gray-900">Leads Management</h1>
                <p className="text-sm text-gray-500">Manage and monitor real-time inbound and outbound lead quality.</p>
            </div>

            {/* Row 1: Quick filter pills */}
            <div className="flex items-center gap-2 flex-wrap shrink-0 mb-2">
                <button onClick={() => setBtnFilter("All")} className={`px-4 py-1.5 rounded-full text-[13px] font-medium shadow-sm whitespace-nowrap transition-colors ${buttonFilter === "All" ? "bg-blue-700 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>All Leads</button>
                <button onClick={() => setBtnFilter("New")} className={`px-4 py-1.5 rounded-full text-[13px] font-medium shadow-sm whitespace-nowrap transition-colors ${buttonFilter === "New" ? "bg-blue-700 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>New (Khoji)</button>
                <button onClick={() => setBtnFilter("Duplicates")} className={`px-4 py-1.5 rounded-full text-[13px] font-medium shadow-sm whitespace-nowrap transition-colors ${buttonFilter === "Duplicates" ? "bg-amber-500 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>Duplicates</button>
                <button onClick={() => setBtnFilter("NoDuplicates")} className={`px-4 py-1.5 rounded-full text-[13px] font-medium shadow-sm whitespace-nowrap transition-colors ${buttonFilter === "NoDuplicates" ? "bg-green-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>No Duplicates</button>
            </div>

            {/* Row 2: Search + Font size + Dropdowns */}
            <div className="flex items-center gap-3 flex-wrap shrink-0 mb-4">
                <div className="flex items-center gap-0 bg-white rounded border border-gray-200 overflow-hidden">
                    <select className="px-2 py-1.5 bg-transparent text-[13px] text-gray-500 font-medium focus:outline-none border-r border-gray-200" value={searchColumn} onChange={(e) => setSearchColumn(e.target.value)}>
                        <option value="All">All Columns</option>
                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="relative flex items-center">
                        <Search size={13} className="text-gray-400 absolute left-2" />
                        <input type="text" placeholder="Search..." className="w-44 pl-7 pr-3 py-1.5 bg-transparent text-[13px] focus:outline-none" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
                    </div>
                </div>

                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-1">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase mr-1">Font</span>
                    <button onClick={() => setFontSize('sm')} className={`px-2 py-0.5 rounded text-[12px] font-medium ${fontSize === 'sm' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}>Sm</button>
                    <button onClick={() => setFontSize('md')} className={`px-2 py-0.5 rounded text-[12px] font-medium ${fontSize === 'md' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}>Md</button>
                    <button onClick={() => setFontSize('lg')} className={`px-2 py-0.5 rounded text-[12px] font-medium ${fontSize === 'lg' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}>Lg</button>
                </div>

                <select className="px-3 py-1.5 bg-white border border-gray-200 rounded text-[13px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500" value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }}>
                    <option value="All">All Sources</option>
                    {getOptions(sourceCol).map(o => <option key={o} value={o}>{o}</option>)}
                </select>

                <select className="px-3 py-1.5 bg-white border border-gray-200 rounded text-[13px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500" value={filterShivir} onChange={e => { setFilterShivir(e.target.value); setPage(1); }}>
                    <option value="All">All Shivirs</option>
                    {getOptions(shivirCol).map(o => <option key={o} value={o}>{o}</option>)}
                </select>

                {statusCol && (
                    <select className="px-3 py-1.5 bg-white border border-gray-200 rounded text-[13px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
                        <option value="All">All Statuses</option>
                        {getOptions(statusCol).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                )}

                {actionCol && (
                    <select className="px-3 py-1.5 bg-white border border-gray-200 rounded text-[13px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500" value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1); }}>
                        <option value="All">All Actions</option>
                        {getOptions(actionCol).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                )}
            </div>


            <div className="bg-white border border-gray-200 rounded shadow-sm flex flex-col flex-1">
                <div ref={scrollRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} className="w-full overflow-x-auto cursor-grab" style={{ userSelect: 'none' }}>
                    <table className="table-auto w-full text-left border-collapse">
                        <thead className="bg-white border-b border-gray-200">
                            <tr>
                                {columns.map(c => {
                                    const s = getColStyle(c);
                                    return <th key={c} style={{ minWidth: s.minWidth, maxWidth: s.maxWidth }} className="py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap leading-none overflow-hidden text-ellipsis">{c}</th>;
                                })}
                                <th style={{ minWidth: "90px", maxWidth: "110px" }} className="py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap leading-none">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {paginatedData.map((row, idx) => {
                                const phone = String(row[phoneCol] || "").trim();
                                const isDup = isDupRow(phone);
                                const hasMult = hasMultipleNumbers(phone);
                                const hasEmpty = columns.filter(c => c !== phoneCol).some(c => String(row[c] ?? "").trim() === "");

                                const rowBg = (isDup || hasMult) ? "bg-amber-50" : "";
                                const textSize = fontSize === 'sm' ? 'text-[13px]' : fontSize === 'md' ? 'text-[15px]' : 'text-[17px]';

                                const handleCopy = (e, value) => {
                                    e.preventDefault();
                                    navigator.clipboard.writeText(value).then(() => {
                                        toast.success(`Copied!`, { duration: 1000, position: 'bottom-center', style: { fontSize: '13px', padding: '6px 12px' } });
                                    });
                                };

                                return (
                                    <tr key={idx} className={`hover:bg-gray-50 transition-colors ${rowBg}`}>
                                        {columns.map(c => {
                                            const s = getColStyle(c);
                                            const val = String(row[c] || "");
                                            return (
                                                <td key={c} onContextMenu={(e) => handleCopy(e, val)} title="Right-click to copy" style={{ minWidth: s.minWidth, maxWidth: s.maxWidth, whiteSpace: s.whiteSpace, wordBreak: s.wordBreak }} className={`py-2.5 px-3 ${textSize} text-gray-800 border-b border-gray-100 overflow-hidden text-ellipsis cursor-context-menu`}>
                                                    {val}
                                                </td>
                                            );
                                        })}
                                        <td className="py-4 px-4 border-b border-gray-100 min-w-[120px]">
                                            <div className="flex gap-1.5 flex-wrap">
                                                {isDup && <span className="inline-flex items-center text-[13px] text-gray-500">Duplicate</span>}
                                                {hasMult && <span className="inline-flex items-center text-[13px] text-gray-500">Multi</span>}
                                                {hasEmpty && <span className="inline-flex items-center text-[13px] text-gray-500">Missing</span>}
                                                {(!isDup && !hasMult && !hasEmpty) && <span className="inline-flex items-center text-[13px] text-gray-500">Clean</span>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length + 1}>
                                        <div className="py-12 text-center text-gray-500">No leads found matching your filters.</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="py-2 px-4 flex items-center justify-between shrink-0">
                    <span className="text-[13px] text-gray-500">
                        Showing <span className="font-semibold text-gray-900">{((page - 1) * rowsPerPage) + 1}</span> to <span className="font-semibold text-gray-900">{Math.min(page * rowsPerPage, filteredData.length)}</span> of <span className="font-semibold text-gray-900">{filteredData.length}</span> leads
                    </span>
                    <div className="flex items-center gap-1">
                        <button className="p-1 rounded text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft size={16} />
                        </button>
                        <div className="w-7 h-7 rounded bg-blue-700 text-white flex items-center justify-center text-[13px] font-semibold mx-1">{page}</div>
                        <button className="p-1 rounded text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200" disabled={page >= Math.ceil(filteredData.length / rowsPerPage)} onClick={() => setPage(p => p + 1)}>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
