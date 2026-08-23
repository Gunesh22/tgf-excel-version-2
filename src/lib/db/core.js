import {
  collection, addDoc, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, query, where,
  serverTimestamp, writeBatch, onSnapshot,
  limit, Timestamp, orderBy,
  deleteField, documentId
} from "firebase/firestore";
import { db } from "../firebase.js";
import { isKhojiField } from "../khojiHelper.js";

export const formatContactName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .split(/\s+/)
    .map(word => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

// ─────────────────────────────────────────────
// IGNORED FIELDS DEFINITIONS
// ─────────────────────────────────────────────
const IGNORED_FIELDS = new Set([
  "consent", "consent in hindi", "current date", "current_date",
  "21day current date", "21day_current date", "21day challenge day", "21day_challenge_day",
  "date added", "date_added", "program name", "razorpay", "program payment status",
  "payment status", "payment event", "khoji status", "possibility",
  "understand that this is an offline event and agree to attend in person",
  "have completed 15 days of meditation nonstop without fail",
  "confirm that i will definitely attend this event",
  "acknowledgement",
  "event startdate", "event type", "base amount",
  "program_payment_status", "payment_status", "payment_event", "khoji_status",
  "event_startdate", "event_type", "base_amount",
  "d2e payment status", "d2e_payment_status", "total registrations", "total_registrations",
  "organization type", "organization_type", "total number of registration", "total_number_of_registration",
  "total number of registrations", "total_number_of_registrations",
  "a serious business person", "form ai tools", "form_ai_tools",
  "ai टूल से", "from ai tools", "aapne kaise convice kiya",
  "actual online event count", "adhar card", "age", "your age",
  "attended", "not attended-reason", "attendy", "attender",
  "be 100% honest", "stopping you", "closed airport to venue",
  "company", "consent in gujarati", "cont no", "mobile number",
  "estimated budget", "event address", "event day", "event name", "event details",
  "guest category", "guest designation", "guest email id", "guest name",
  "have you done maha aasmani param gyan shivir", "how did you hear about us",
  "how would you like to attend the retreat", "ioc-ppc", "incremental challenge day",
  "khoji id", "khoji, new", "khoji/ new", "last run time",
  "ma not possible reason", "mahaasmani", "middle name", "number of students",
  "organization", "other video editing tool", "pan card number", "person - label",
  "person - phone", "person - closed deals", "person - open deals", "person - next activity date",
  "position/title", "position", "title", "profession", "profession details", "profession info",
  "prog. feedback", "projected budget", "registration_count_group", "registration count group",
  "school name", "select service", "shivir done", "shivir name", "shivir/event category",
  "shivir_code", "source of information", "specialization", "specific month",
  "tejasthan", "what is your tejstan/center name", "tell me briefly about your business",
  "tentative date of the mini shivir", "the preferred language of the retreat",
  "todays_date_25daychallenge", "todays date 25daychallenge", "type of the event",
  "what are you looking to achieve or explore", "what do you want to get out of this call",
  "what interests you the most about joining this retreat", "what is stopping you from hitting results",
  "what is your time slot", "what makes you different from the other applications",
  "whats the business", "whats your message", "when you want to attend the event",
  "where will you attend the program", "which mini shivir did you attend",
  "your area of living", "your city name", "your current monthly revenue",
  "your health issues", "your message", "your selfless service is a gift",
  "zone", "अन्य टूल", "other tool", "अपना प्रश्न यहाँ लिखें",
  "आप कितने समय से अध्यात्म की खोज में हैं", "ग्राफ़िक डिजाइनिंग", "graphic designing",
  "फोटोग्राफी और वीडियो शूटिंग", "photography & video shooting", "वीडियो एडिटिंग", "video editing",
  "वेबसाइट और लैंडिंग पेज", "website & landing page",
  "date", "content", "enter trainer name", "how would you like to attend the shivir", "how would you like to attend"
]);

export const isIgnoredField = (key) => {
  if (!key) return true;
  const k = key.toLowerCase().trim().replace(/_/g, " ");
  if (IGNORED_FIELDS.has(k)) return true;
  for (const ignored of IGNORED_FIELDS) {
    if (ignored !== "date" && ignored !== "content" && k.includes(ignored)) {
      return true;
    }
  }
  return false;
};

export function findMatchingAttenderState(attenderStates, attenderId, attenderName) {
  if (!attenderStates || typeof attenderStates !== "object") return null;

  const idLower = attenderId ? String(attenderId).toLowerCase().trim() : "";
  const nameLower = attenderName ? String(attenderName).toLowerCase().trim() : "";

  const matches = [];

  for (const [key, stateObj] of Object.entries(attenderStates)) {
    if (!stateObj || typeof stateObj !== "object") continue;

    const keyLower = String(key).toLowerCase().trim();
    const stId = stateObj.attenderId ? String(stateObj.attenderId).toLowerCase().trim() : "";
    const stName = stateObj.attenderName ? String(stateObj.attenderName).toLowerCase().trim() : "";

    let isMatch = false;
    if (idLower && (keyLower === idLower || stId === idLower)) {
      isMatch = true;
    } else if (nameLower) {
      if (keyLower === nameLower || stName === nameLower) {
        isMatch = true;
      } else if (stName && (stName.includes(nameLower) || nameLower.includes(stName))) {
        isMatch = true;
      } else if (keyLower && (keyLower.includes(nameLower) || nameLower.includes(keyLower))) {
        isMatch = true;
      }
    }

    if (isMatch) {
      matches.push({ key, stateObj });
    }
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].stateObj;

  const getTimeMs = (val) => {
    if (!val) return 0;
    if (typeof val.toDate === "function") return val.toDate().getTime();
    if (val.seconds !== undefined) return val.seconds * 1000;
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  matches.sort((a, b) => {
    const tA = getTimeMs(a.stateObj.updatedAt || a.stateObj.lastCalledAt);
    const tB = getTimeMs(b.stateObj.updatedAt || b.stateObj.lastCalledAt);
    return tA - tB;
  });

  const mergedHistory = [];
  const seenHistoryKeys = new Set();
  let mergedState = {};

  matches.forEach(({ stateObj }) => {
    mergedState = { ...mergedState, ...stateObj };

    const hList = Array.isArray(stateObj.history) ? stateObj.history : [];
    hList.forEach(h => {
      const hTime = getTimeMs(h.timestamp);
      const hKey = `${hTime}_${h.remark || ""}_${h.status || ""}_${h.attenderName || ""}`;
      if (!seenHistoryKeys.has(hKey)) {
        seenHistoryKeys.add(hKey);
        mergedHistory.push(h);
      }
    });

    if (stateObj.remark && String(stateObj.remark).trim()) {
      const rStr = String(stateObj.remark).trim();
      const rKey = `${getTimeMs(stateObj.lastCalledAt || stateObj.updatedAt)}_${rStr}_${stateObj.status || ""}_${stateObj.attenderName || ""}`;
      if (!seenHistoryKeys.has(rKey) && !mergedHistory.some(h => h.remark === rStr)) {
        seenHistoryKeys.add(rKey);
        mergedHistory.push({
          status: stateObj.status || "",
          remark: rStr,
          calledFor: stateObj["Called For"] || stateObj.calledFor || "",
          source: stateObj.Source || stateObj.source || "",
          callType: stateObj.callType || "outgoing",
          attenderName: stateObj.attenderName || attenderName || "Attender",
          timestamp: stateObj.lastCalledAt || stateObj.updatedAt || new Date().toISOString()
        });
      }
    }
  });

  mergedHistory.sort((a, b) => getTimeMs(a.timestamp) - getTimeMs(b.timestamp));
  mergedState.history = mergedHistory;

  return mergedState;
}

export function combineContactHistories(rawData, attState = {}, attenderName = "") {
  if (!rawData && !attState) return [];
  const rawList = [];

  const getTimeMs = (val) => {
    if (!val) return 0;
    if (typeof val.toDate === "function") return val.toDate().getTime();
    if (val.seconds !== undefined) return val.seconds * 1000;
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const addHistoryItem = (h, fallbackName = "") => {
    if (!h || typeof h !== "object") return;
    const rTrim = String(h.remark || "").trim();
    const sTrim = String(h.status || "").trim();
    if (!rTrim && (!sTrim || sTrim === "Pending") && !h.timestamp && !h.date) return;

    const attName = h.attenderName || (attState && attState.attenderName) || fallbackName || attenderName || "Attender";

    rawList.push({
      status: sTrim,
      remark: rTrim,
      calledFor: h.calledFor || h.called_for || h["Called For"] || (attState && (attState["Called For"] || attState.calledFor)) || (rawData && rawData["Called For"]) || "",
      source: h.source || h.sourse || h.Source || (attState && (attState.Source || attState.source)) || (rawData && rawData.Source) || "",
      callType: h.callType || (attState && attState.callType) || (rawData && rawData.callType) || "outgoing",
      attenderName: attName,
      timestamp: h.timestamp || h.date || h.createdAt || h.updatedAt || h.lastCalledAt || new Date().toISOString()
    });
  };

  if (rawData && Array.isArray(rawData.history)) {
    rawData.history.forEach(h => addHistoryItem(h, rawData.assignedName || rawData.attenderName));
  }

  if (attState && Array.isArray(attState.history)) {
    attState.history.forEach(h => addHistoryItem(h, attState.attenderName));
  }

  if (attState && attState.remark && String(attState.remark).trim()) {
    addHistoryItem({
      status: attState.status || "",
      remark: attState.remark,
      calledFor: attState["Called For"] || attState.calledFor,
      source: attState.Source || attState.source,
      callType: attState.callType,
      attenderName: attState.attenderName,
      timestamp: attState.lastCalledAt || attState.updatedAt
    }, attState.attenderName);
  }

  if (rawData && rawData.remark && String(rawData.remark).trim()) {
    addHistoryItem({
      status: rawData.status || "",
      remark: rawData.remark,
      calledFor: rawData["Called For"],
      source: rawData.Source,
      callType: rawData.callType,
      attenderName: rawData.assignedName || rawData.attenderName,
      timestamp: rawData.lastCalledAt || rawData.updatedAt || rawData.createdAt
    }, rawData.assignedName || rawData.attenderName);
  }

  rawList.sort((a, b) => getTimeMs(a.timestamp) - getTimeMs(b.timestamp));

  const unique = [];
  const clean = s => String(s || "").trim().toLowerCase();

  rawList.forEach(item => {
    const itemRemark = clean(item.remark);
    const itemStatus = clean(item.status);
    const itemMs = getTimeMs(item.timestamp);

    const isDuplicate = unique.some(ex => {
      const exRemark = clean(ex.remark);
      const exStatus = clean(ex.status);
      const exMs = getTimeMs(ex.timestamp);

      const timeDiff = (itemMs > 0 && exMs > 0) ? Math.abs(itemMs - exMs) : 0;
      const isTimeUnknown = itemMs === 0 || exMs === 0;

      if (itemRemark && exRemark && itemRemark === exRemark) {
        if (isTimeUnknown || timeDiff < 1800000) return true;
      }

      if (itemStatus && exStatus && itemStatus === exStatus && itemMs > 0 && exMs > 0) {
        if (timeDiff < 180000) return true;
      }
      return false;
    });

    if (!isDuplicate) {
      unique.push(item);
    }
  });

  return unique;
}

export const normalizePhone = (phoneStr) => {
  if (!phoneStr) return "";
  let str = String(phoneStr).trim();
  str = str.replace(/@s\.whatsapp\.net/gi, "");
  str = str.replace(/\.0$/g, "");

  const multiSplit = str.split(/[,;\/\s+]+/);
  for (const part of multiSplit) {
    const digits = part.replace(/\D/g, "");
    if (digits.length >= 10) {
      return digits.slice(-10);
    }
  }

  const allDigits = str.replace(/\D/g, "");
  if (allDigits.length >= 10) {
    return allDigits.slice(-10);
  }

  return allDigits;
};

export const extractIndividualPhones = (phoneStr) => {
  if (!phoneStr) return [];
  let str = String(phoneStr).trim();
  str = str.replace(/@s\.whatsapp\.net/gi, "");
  str = str.replace(/\.0$/g, "");

  const parts = str.split(/[,;\/\s+]+/);
  const results = new Set();

  parts.forEach(part => {
    const digits = part.replace(/\D/g, "");
    if (digits.length >= 10) {
      results.add(digits.slice(-10));
    } else if (digits.length > 0) {
      results.add(digits);
    }
  });

  const fullDigits = str.replace(/\D/g, "");
  if (fullDigits.length >= 10) {
    results.add(fullDigits.slice(-10));
  }

  return Array.from(results);
};

export const getMonthStr = (dateObj) => {
  if (!dateObj) return "";
  if (typeof dateObj === "string" && dateObj.match(/^\d{4}-\d{2}/)) {
    return dateObj.slice(0, 7);
  }
  let d;
  if (dateObj && typeof dateObj.toDate === "function") {
    d = dateObj.toDate();
  } else if (dateObj && typeof dateObj === "object" && dateObj.seconds !== undefined) {
    d = new Date(dateObj.seconds * 1000);
  } else {
    d = new Date(dateObj);
  }
  if (!d || isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const getByteSize = (obj) => {
  if (!obj) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch (e) {
    try {
      return JSON.stringify(obj).length;
    } catch (err) {
      return 0;
    }
  }
};

