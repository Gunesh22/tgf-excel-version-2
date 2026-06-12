import React from "react";
import {
  BarChart3, FolderOpen, Upload, Users, ClipboardCheck, FileText
} from "lucide-react";

export const COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];

export const TAB_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={18} /> },
  { id: "monthly", label: "Monthly Report", icon: <FileText size={18} /> },
  { id: "programs", label: "Programs", icon: <FolderOpen size={18} /> },
  { id: "import", label: "Lead Distribution 📂", icon: <Upload size={18} /> },
  { id: "attenders", label: "Attenders", icon: <Users size={18} /> },
  { id: "abhivyakti", label: "Abhivyakti", icon: <ClipboardCheck size={18} /> },
];

export const CONNECTED_STATUSES = ["Info given", "Interested", "Reg.Done", "reminder", "Query", "Already Reg.d", "Next time", "Shivir done", "Not possible"];
export const NOT_CONNECTED_STATUSES = ["NA", "Busy", "Call Cut", "switched off", "Invalid No", "Not interested", "Called by mistake", "no network", "wrong no.", "no answer"];

export const STANDARD_TARGETS = ["Name", "Phone", "Mobile", "Email", "City", "State", "Khoji", "Source", "Tags", "Ignore"];

export const getDefaultExcelMapping = (colName) => {
  const c = colName.trim().toLowerCase();
  if (["name", "caller", "caller name", "lead name", "lead", "name of caller", "first name", "last name", "contact name"].includes(c)) return "Name";
  if (["mobile", "mobile no", "mobile number"].includes(c)) return "Mobile";
  if (["phone", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "cont no", "contact no", "contact_no"].includes(c)) return "Phone";
  if (["email", "mail", "e-mail", "email id", "emailaddress"].includes(c)) return "Email";
  if (["city", "location", "khoji city", "place", "city name"].includes(c)) return "City";
  if (["state", "state name", "province", "region"].includes(c)) return "State";
  if (["khoji", "khoji yes or no", "khoji yes or no (have you done maha asmani)", "have you done maha asmani", "maha asmani", "mahaasmani", "have you done mahaasmani"].includes(c) || c.includes("asmani") || c.includes("aasmani") || c.includes("आसमानी")) return "Khoji";
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
    const foundKey = Object.keys(obj).find(k => keysList.includes(k.toLowerCase()));
    return foundKey ? obj[foundKey] : "";
  };

  const nameVal = findValue(log, ["name", "caller", "caller name", "lead name", "lead", "name of caller"]);
  const phoneVal = findValue(log, ["phone", "mobile", "whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "mobile number"]);
  const emailVal = findValue(log, ["email", "mail", "e-mail", "email id", "emailaddress"]);
  const cityVal = findValue(log, ["city", "location", "khoji city", "place", "city name"]);
  const countryVal = findValue(log, ["country", "nation"]);
  const tagsVal = findValue(log, ["tags", "tag"]);
  const statusVal = log.status || "Pending";
  const remarkVal = log.remark || "";
  const subProgramVal = log["Sub Program"] || log.subProgram || "";

  let callbackDateStr = "";
  if (log.callbackDate) {
    const d = log.callbackDate.toDate ? log.callbackDate.toDate() : new Date(log.callbackDate);
    if (d && !isNaN(d)) {
      callbackDateStr = d.toLocaleDateString("en-IN");
    }
  }

  row["Name"] = nameVal;
  row["Phone"] = phoneVal;
  row["Email"] = emailVal;
  row["City"] = cityVal;
  row["Country"] = countryVal;
  row["Tags"] = tagsVal;
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
      "country", "nation", "tags", "tag", "status", "remark", "callbackdate", "sub program"
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
    historyStr = log.history.map(h => `[${new Date(h.timestamp).toLocaleDateString("en-IN")}] ${h.attenderName}: ${h.status} - ${h.remark}`).join(" | ");
  }
  row["Call History Timeline"] = historyStr;

  return row;
};
