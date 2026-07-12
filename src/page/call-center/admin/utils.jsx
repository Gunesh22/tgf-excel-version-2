import React from "react";
import {
  BarChart3, FolderOpen, Upload, Users, ClipboardCheck, FileText, Settings
} from "lucide-react";
import { isKhojiField } from "../../../lib/khojiHelper";

export function parseTimestamp(t) {
  if (!t) return null;
  if (t instanceof Date) return t;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t === "object" && t.seconds !== undefined) {
    return new Date(t.seconds * 1000 + Math.round((t.nanoseconds || 0) / 1000000));
  }
  return new Date(t);
}

export const COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];

export const TAB_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={18} /> },
  { id: "monthly", label: "Report", icon: <FileText size={18} /> },
  { id: "programs", label: "Programs", icon: <FolderOpen size={18} /> },
  { id: "import", label: "Lead Distribution 📂", icon: <Upload size={18} /> },
  { id: "attenders", label: "Attenders", icon: <Users size={18} /> },
  { id: "abhivyakti", label: "Abhivyakti", icon: <ClipboardCheck size={18} /> },
  { id: "settings", label: "Settings", icon: <Settings size={18} /> },
];

export const CONNECTED_STATUSES = ["Info given", "Interested", "Reg.Done", "reminder", "Query", "Already Reg.d", "Next time", "Shivir done", "Not possible", "Pending", "Not interested", "Not Attended"];
export const NOT_CONNECTED_STATUSES = ["NA", "Busy", "Call Cut", "switched off", "Invalid No", "Called by mistake", "No Network", "wrong no.", "no answer"];

export const STANDARD_TARGETS = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Source", "Tags", "Ignore"];

export const getDefaultExcelMapping = (colName) => {
  const c = colName.trim().toLowerCase();
  if (["name", "caller", "caller name", "lead name", "lead", "name of caller", "first name", "last name", "contact name"].includes(c)) return "Name";
  if (["mobile", "mobile no", "mobile number"].includes(c)) return "Mobile";
  if (["phone", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "cont no", "contact no", "contact_no"].includes(c)) return "Phone";
  if (["email", "mail", "e-mail", "email id", "emailaddress"].includes(c)) return "Email";
  if (["city", "location", "khoji city", "place", "city name"].includes(c)) return "City";
  if (["state", "state name", "province", "region"].includes(c)) return "State";
  if (isKhojiField(c)) return "Khoji";
  if (["tags", "tag"].includes(c)) return "Tags";
  if (["source of informiton", "source of information"].includes(c)) return "Source";
  if (["source", "sourse", "origin"].includes(c)) return "Ignore";
  return "Ignore";
};

export const cleanExportRow = (log) => {
  const INTERNAL_KEYS = [
    "id", "programId", "programName", "contactId", "attenderId", "createdAt", "updatedAt",
    "history", "_callbackDue", "_deleted", "isCallbackDue", "isHotLead", "callCount",
    "callbackStatus", "lastCalledAt", "firstCalledAt", "registeredAt", "conversionSource",
    "convertedBy", "subProgram", "objectionReason"
  ];

  const row = {};
  
  // Find standard field mappings
  const findValue = (obj, keysList) => {
    const matchingKeys = Object.keys(obj).filter(k => keysList.includes(k.toLowerCase()));
    for (const k of matchingKeys) {
      const val = String(obj[k] || "").trim();
      if (val) return val;
    }
    return "";
  };

  const nameVal = findValue(log, ["name", "caller", "caller name", "lead name", "lead", "name of caller"]);
  const phoneVal = findValue(log, ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number"]);
  const emailVal = findValue(log, ["email", "mail", "e-mail", "email id", "emailaddress"]);
  const cityVal = findValue(log, ["city", "location", "khoji city", "place", "city name"]);
  const countryVal = findValue(log, ["country", "nation"]);
  const tagsVal = findValue(log, ["tags", "tag"]);
  const sourceVal = log.source || findValue(log, ["source", "sourse", "source of information", "source of informiton"]);
  const calledForVal = log.calledFor || findValue(log, ["called for", "called_for", "calledfor"]);
  const statusVal = log.status || "Pending";
  const remarkVal = log.remark || "";
  const subProgramVal = log["Sub Program"] || log.subProgram || "";

  let callbackDateStr = "";
  if (log.callbackDate) {
    const d = parseTimestamp(log.callbackDate);
    if (d && !isNaN(d.getTime())) {
      callbackDateStr = d.toLocaleDateString("en-IN");
    }
  }

  row["Name"] = nameVal;
  row["Phone"] = phoneVal;
  row["Email"] = emailVal;
  row["City"] = cityVal;
  row["Country"] = countryVal;
  row["Tags"] = tagsVal;
  row["Source"] = sourceVal;
  row["Called For"] = calledForVal;
  row["Sub Program"] = subProgramVal;
  row["Status"] = statusVal;
  row["Remark"] = remarkVal;
  row["Callback Date"] = callbackDateStr;

  // Add all other dynamic/custom keys from GHL / Excel
  Object.keys(log).forEach(key => {
    if (INTERNAL_KEYS.includes(key) || key.startsWith("_")) return;
    
    // Skip if it was mapped to a standard field above
    const isStandard = [
      "name", "caller", "caller name", "lead name", "lead", "name of caller",
      "phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number",
      "email", "mail", "e-mail", "email id", "emailaddress",
      "city", "location", "khoji city", "place", "city name",
      "country", "nation", "tags", "tag", "status", "remark", "callbackdate", "sub program",
      "source", "sourse", "source of information", "source of informiton",
      "called for", "called_for", "calledfor"
    ].includes(key.toLowerCase());
    
    if (!isStandard) {
      row[key] = log[key];
    }
  });

  if (log.attenderName) {
    row["Attended By"] = log.attenderName;
  }

  let historyStr = "";
  if (log.history && Array.isArray(log.history)) {
    historyStr = log.history.map(h => {
      const d = parseTimestamp(h.timestamp);
      const dateStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "Invalid Date";
      return `[${dateStr}] ${h.attenderName}: ${h.status} - ${h.remark}`;
    }).join(" | ");
  }
  row["Call History Timeline"] = historyStr;

  return row;
};

export function getCanonicalStatus(status) {
  if (!status) return "";
  const sLower = status.trim().toLowerCase();
  if (sLower === "interested") return "Interested";
  if (sLower === "reg.done" || sLower === "registered") return "Reg.Done";
  if (sLower === "not interested" || sLower === "not intrested") return "Not interested";
  if (sLower === "na") return "NA";
  if (sLower === "busy") return "Busy";
  if (sLower === "call cut") return "Call Cut";
  if (sLower === "switched off") return "switched off";
  if (sLower === "invalid no") return "Invalid No";
  if (sLower === "already reg.d" || sLower === "already registered") return "Already Reg.d";
  if (sLower === "info given") return "Info given";
  if (sLower === "next time") return "Next time";
  if (sLower === "reminder") return "reminder";
  if (sLower === "query") return "Query";
  if (sLower === "called by mistake") return "Called by mistake";
  if (sLower === "not possible") return "Not possible";
  if (sLower === "shivir done") return "Shivir done";
  if (sLower === "no answer") return "no answer";
  if (sLower === "no network") return "No Network";
  if (sLower === "wrong no" || sLower === "wrong no.") return "wrong no.";
  return status;
}

