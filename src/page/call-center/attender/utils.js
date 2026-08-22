import { isKhojiField } from "../../../lib/khojiHelper";
export { isKhojiField };

export const STATUS_OPTIONS = [
  "Interested",
  "Reg.Done",
  "Not interested",
  "Not Attended",
  "NA",
  "Busy",
  "Call Cut",
  "switched off",
  "Invalid No",
  "Already Reg.d",
  "Info given",
  "Next time",
  "reminder",
  "Query",
  "Called by mistake",
  "Not possible",
  "Shivir done",
  "no answer"
];

export const OBJECTION_REASONS = [
  "Too Expensive",
  "Wrong Dates",
  "Location Too Far",
  "No Time",
  "Other"
];

export const SOURCE_OPTIONS = [
  "Facebook",
  "Instagram",
  "WhatsApp",
  "YouTube",
  "Google",
  "Website",
  "Books",
  "Call Centre",
  "Program",
  "Khoji",
  "Other",
  "NA"
];

export const CALLED_FOR_OPTIONS = [
  "Other",
  "TGF Info",
  "CBT Avd",
  "CBT Basic",
  "Off MA",
  "On MA",
  "On MA Hindi",
  "On MA Eng.",
  "Dhyan",
  "Nisarg Dhyan",
  "BUP",
  "BUT",
  "Hair Program",
  "Hair Avd",
  "Pranayam",
  "Pranayam Avd",
  "Program",
  "Shravan",
  "App",
  "Special MA",
  "Spiritual H",
  "Swasthya Shivir",
  "Ashram Visit",
  "Mini Shivir",
  "Kids Shivir",
  "Reminder",
  "Yoga 1 Month",
  "Yoga 3 Month",
  "Yoga 6 Month",
  "Yoga 1 Yr",
  "SHSH",
  "Digestive Basic",
  "Digestive Avd",
  "Spine Basic",
  "Spine Avd",
];

export const CALL_TYPE_OPTIONS = ["outgoing", "incoming", "outgoing f", "incoming f"];

export const CONNECTED_STATUSES = [
  "Info given",
  "Interested",
  "Reg.Done",
  "reminder",
  "Query",
  "Already Reg.d",
  "Next time",
  "Shivir done",
  "Not possible",
  "Pending",
  "Not interested",
  "Not Attended",
  "Call Log Added"
];

export const NOT_CONNECTED_STATUSES = [
  "NA",
  "Busy",
  "Call Cut",
  "switched off",
  "Invalid No",
  "Called by mistake",
  "No Network",
  "wrong no.",
  "no answer"
];

export const OPTIONAL_COMPULSORY_STATUSES = [
  "NA",
  "Busy",
  "Call Cut",
  "switched off",
  "Invalid No",
  "Called by mistake",
  "No Network",
  "wrong no.",
  "no answer"
];

export const isNotConnectedStatus = (status) => {
  if (!status) return false;
  const sLower = String(status).trim().toLowerCase();
  return OPTIONAL_COMPULSORY_STATUSES.some(s => s.toLowerCase() === sLower);
};

export const findValueInLog = (obj, keysList) => {
  if (!obj) return "";
  const matchingKeys = Object.keys(obj).filter(k => keysList.includes(k.toLowerCase()));
  for (const k of matchingKeys) {
    const val = String(obj[k] || "").trim();
    if (val) return val;
  }
  return "";
};

export const isUnansweredCallback = (log) => {
  if (!log) return false;
  // An Unanswered Callback is strictly a call attempt logged with an unconnected status
  const status = log.status || log.Status || findValueInLog(log, ["status"]);
  return isNotConnectedStatus(status);
};

export const DEFAULT_COLUMNS = [
  "Name",
  "Phone",
  "Source",
  "City",
  "Called For",
  "Call Type",
  "Status",
  "Remark",
  "Callback Date"
];

export const IGNORED_FIELDS = [
  "consent",
  "consent in hindi",
  "current date",
  "current_date",
  "21day current date",
  "21day_current date",
  "21day challenge day",
  "21day_challenge_day",
  "date added",
  "date_added",
  "program name",
  "razorpay",
  "program payment status",
  "payment status",
  "payment event",
  "khoji status",
  "possibility",
  "understand that this is an offline event and agree to attend in person",
  "have completed 15 days of meditation nonstop without fail",
  "confirm that i will definitely attend this event",
  "acknowledgement",
  "event startdate",
  "event type",
  "base amount",
  "program_payment_status",
  "payment_status",
  "payment_event",
  "khoji_status",
  "event_startdate",
  "event_type",
  "base_amount",
  "d2e payment status",
  "d2e_payment_status",
  "total registrations",
  "total_registrations",
  "organization type",
  "organization_type",
  "total number of registration",
  "total_number_of_registration",
  "total number of registrations",
  "total_number_of_registrations",
  "a serious business person",
  "form ai tools",
  "form_ai_tools",
  "ai टूल से",
  "from ai tools",
  "aapne kaise convice kiya",
  "actual online event count",
  "adhar card",
  "age",
  "your age",
  "attended",
  "not attended-reason",
  "attendy",
  "attender",
  "be 100% honest",
  "stopping you",
  "closed airport to venue",
  "company",
  "consent in gujarati",
  "cont no",
  "mobile number",
  "estimated budget",
  "event address",
  "event day",
  "event name",
  "event details",
  "guest category",
  "guest designation",
  "guest email id",
  "guest name",
  "have you done maha aasmani param gyan shivir",
  "how did you hear about us",
  "how would you like to attend the retreat",
  "ioc-ppc",
  "incremental challenge day",
  "khoji id",
  "khoji, new",
  "khoji/ new",
  "last run time",
  "ma not possible reason",
  "mahaasmani",
  "middle name",
  "number of students",
  "organization",
  "other video editing tool",
  "pan card number",
  "person - label",
  "person - phone",
  "person - closed deals",
  "person - open deals",
  "person - next activity date",
  "position/title",
  "position",
  "title",
  "profession",
  "profession details",
  "profession info",
  "prog. feedback",
  "projected budget",
  "registration_count_group",
  "registration count group",
  "school name",
  "select service",
  "shivir name",
  "shivir/event category",
  "shivir_code",
  "source of information",
  "specialization",
  "specific month",
  "tejasthan",
  "what is your tejstan/center name",
  "tell me briefly about your business",
  "tentative date of the mini shivir",
  "the preferred language of the retreat",
  "todays_date_25daychallenge",
  "todays date 25daychallenge",
  "type of the event",
  "what are you looking to achieve or explore",
  "what do you want to get out of this call",
  "what interests you the most about joining this retreat",
  "what is stopping you from hitting results",
  "what is your time slot",
  "what makes you different from the other applications",
  "whats the business",
  "whats your message",
  "when you want to attend the event",
  "where will you attend the program",
  "which mini shivir did you attend",
  "your area of living",
  "your city name",
  "your current monthly revenue",
  "your health issues",
  "your message",
  "your selfless service is a gift",
  "zone",
  "अन्य टूल",
  "other tool",
  "अपना प्रश्न यहाँ लिखें",
  "आप कितने समय से अध्यात्म की खोज में हैं",
  "ग्राफ़िक डिजाइनिंग",
  "graphic designing",
  "फोटोग्राफी और वीडियो शूटिंग",
  "photography & video shooting",
  "वीडियो एडिटिंग",
  "video editing",
  "वेबसाइट और लैंडिंग पेज",
  "website & landing page",
  "date",
  "content",
  "enter trainer name",
  "how would you like to attend the shivir",
  "how would you like to attend",
  "assignedname",
  "assignedto",
  "isassigned",
  "normalizedphone",
  "normalizedmobile",
  "assignedat",
  "registeredyearmonth",
  "querystatus"
];

export const isIgnoredField = (key) => {
  if (!key) return true;
  const k = key.toLowerCase().trim().replace(/_/g, " ");
  return IGNORED_FIELDS.some(ignored => {
    if (ignored === "date" || ignored === "content") {
      return k === ignored;
    }
    return k === ignored || k.includes(ignored);
  });
};

export const getFieldWithFallback = (log, fieldName) => {
  if (!log) return "";
  const name = fieldName.toLowerCase().trim();
  const keys = Object.keys(log);
  
  const getVal = (k) => String(log[k] || "").trim();

  let candidates = [];

  const directKey = keys.find(k => k.toLowerCase() === name);
  if (directKey) {
    candidates.push(directKey);
  }

  let aliases = [];
  if (name === "name") {
    aliases = ["caller", "caller name", "lead name", "lead", "name of caller"];
  } else if (name === "phone") {
    aliases = ["whatsapp", "phone number", "whatsapp number", "whatsappno", "contact", "contact number", "contact no", "contact_no"];
  } else if (name === "mobile") {
    aliases = ["mobile no", "mobile number"];
  } else if (name === "email") {
    aliases = ["mail", "e-mail", "email id", "emailaddress"];
  } else if (name === "city") {
    aliases = ["location", "khoji city", "place", "city name"];
  } else if (name === "state") {
    aliases = ["state name", "province", "region"];
  } else if (name === "source") {
    aliases = ["sourse", "source of informiton", "source of information"];
  } else if (name === "tags") {
    aliases = ["tag"];
  } else if (name === "called for") {
    aliases = ["called_for", "calledfor"];
  }

  if (aliases.length > 0) {
    keys.forEach(k => {
      if (aliases.includes(k.toLowerCase()) && !candidates.includes(k)) {
        candidates.push(k);
      }
    });
  }

  if (name === "khoji") {
    keys.forEach(k => {
      if (isKhojiField(k) && !candidates.includes(k)) {
        candidates.push(k);
      }
    });
  }

  // Special handling for Tags — tags array is the single source of truth
  if (name === "tags") {
    const tagsArr = Array.isArray(log.tags) ? log.tags : [];
    const tagsStr = log.Tags ? String(log.Tags) : "";
    // Merge both in case of legacy data
    const merged = new Set();
    tagsArr.forEach(t => String(t).split(",").map(x => x.trim()).filter(Boolean).forEach(x => merged.add(x)));
    tagsStr.split(",").map(x => x.trim()).filter(Boolean).forEach(x => merged.add(x));
    // Also check alias 'tag'
    const tagAlias = log.tag ? String(log.tag) : "";
    tagAlias.split(",").map(x => x.trim()).filter(Boolean).forEach(x => merged.add(x));

    if (log.attenderStates && typeof log.attenderStates === "object") {
      Object.values(log.attenderStates).forEach(st => {
        if (st) {
          const stTags = Array.isArray(st.tags) ? st.tags : (st.Tags ? String(st.Tags).split(",") : []);
          stTags.forEach(t => String(t).split(",").map(x => x.trim()).filter(Boolean).forEach(x => merged.add(x)));
        }
      });
    }

    return Array.from(merged).sort().join(", ");
  }

  for (const c of candidates) {
    const val = getVal(c);
    if (val) return val;
  }

  // Fallback to checking attenderStates if top-level field is empty
  if (log.attenderStates && typeof log.attenderStates === "object") {
    for (const stateObj of Object.values(log.attenderStates)) {
      if (stateObj && typeof stateObj === "object") {
        for (const c of candidates) {
          const valInState = String(stateObj[c] || "").trim();
          if (valInState) return valInState;
        }
        const keysInState = Object.keys(stateObj);
        const directKeyInState = keysInState.find(k => k.toLowerCase() === name);
        if (directKeyInState && String(stateObj[directKeyInState] || "").trim()) {
          return String(stateObj[directKeyInState]).trim();
        }
        if (aliases.length > 0) {
          const aliasKeyInState = keysInState.find(k => aliases.includes(k.toLowerCase()));
          if (aliasKeyInState && String(stateObj[aliasKeyInState] || "").trim()) {
            return String(stateObj[aliasKeyInState]).trim();
          }
        }
      }
    }
  }

  if (candidates.length > 0) {
    return getVal(candidates[0]);
  }
  return "";
};

export const getKhojiValue = (log) => {
  return getFieldWithFallback(log, "Khoji");
};

export const isKhojiAffirmative = (val) => {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return (
    v === "yes" ||
    v === "y" ||
    v === "true" ||
    v === "khoji" ||
    v.startsWith("yes") ||
    v.startsWith("y ") ||
    v.startsWith("y/") ||
    v.includes("हां") ||
    v.includes("हाँ") ||
    v.includes("dew d") ||
    v.includes("done") ||
    v.includes("completed") ||
    (v.includes("khoji") && !v.includes("not") && !v.includes("new"))
  );
};

export const isKhojiNegative = (val) => {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return (
    v === "no" ||
    v === "n" ||
    v === "false" ||
    v.startsWith("no") ||
    v.startsWith("n ") ||
    v.startsWith("n/") ||
    v.includes("ना") ||
    v.includes("नहीं") ||
    v.includes("नही") ||
    v.includes("not")
  );
};

export const updateDynamicOptions = (data) => {
  if (data) {
    if (Array.isArray(data.statusOptions)) {
      STATUS_OPTIONS.splice(0, STATUS_OPTIONS.length, ...data.statusOptions);
    }
    if (Array.isArray(data.sourceOptions)) {
      SOURCE_OPTIONS.splice(0, SOURCE_OPTIONS.length, ...data.sourceOptions);
    }
    if (Array.isArray(data.calledForOptions)) {
      CALLED_FOR_OPTIONS.splice(0, CALLED_FOR_OPTIONS.length, ...data.calledForOptions);
    }
    if (Array.isArray(data.connectedStatuses)) {
      CONNECTED_STATUSES.splice(0, CONNECTED_STATUSES.length, ...data.connectedStatuses);
    }
    if (Array.isArray(data.notConnectedStatuses)) {
      NOT_CONNECTED_STATUSES.splice(0, NOT_CONNECTED_STATUSES.length, ...data.notConnectedStatuses);
    }
    if (Array.isArray(data.optionalCompulsoryStatuses)) {
      OPTIONAL_COMPULSORY_STATUSES.splice(0, OPTIONAL_COMPULSORY_STATUSES.length, ...data.optionalCompulsoryStatuses);
    }
  }
};

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
  if (sLower === "no network") return "No Network";
  if (sLower === "wrong no" || sLower === "wrong no.") return "wrong no.";
  return status;
}

export function getSharedAttenders(log) {
  if (!log) return [];

  const idToNameMap = new Map();

  const registerPair = (id, name) => {
    if (!id || typeof id !== "string") return;
    const cleanId = id.trim();
    if (!cleanId) return;

    if (name && typeof name === "string") {
      const cleanName = name.trim();
      if (cleanName && cleanName !== cleanId && !cleanName.match(/^[a-zA-Z0-9_-]{15,35}$/)) {
        idToNameMap.set(cleanId, cleanName);
      }
    }
  };

  // 1. Gather mappings from attenderStates
  if (log.attenderStates && typeof log.attenderStates === "object") {
    Object.entries(log.attenderStates).forEach(([key, state]) => {
      if (state && typeof state === "object" && !state._deleted && !state.isDeleted) {
        const attId = state.attenderId || key;
        const attName = state.attenderName || state.assignedName || state.name;
        registerPair(attId, attName);
      }
    });
  }

  // 2. Gather mapping from top-level log fields
  registerPair(log.attenderId, log.attenderName || log.assignedName);

  // 3. Gather mapping by pairing assignedTo array with assignedName string
  const assignedToArr = Array.isArray(log.assignedTo)
    ? log.assignedTo
    : (typeof log.assignedTo === "string" && log.assignedTo.trim() ? log.assignedTo.split(",") : []);

  const assignedNameArr = typeof log.assignedName === "string" && log.assignedName.trim()
    ? log.assignedName.split(",")
    : [];

  assignedToArr.forEach((rawId, idx) => {
    const rawName = assignedNameArr[idx] || (assignedNameArr.length === 1 ? assignedNameArr[0] : "");
    registerPair(rawId, rawName);
  });

  const attendersSet = new Set();

  // A. Process attenderStates
  if (log.attenderStates && typeof log.attenderStates === "object") {
    Object.entries(log.attenderStates).forEach(([key, state]) => {
      if (state && typeof state === "object" && !state._deleted && !state.isDeleted) {
        const attId = (state.attenderId || key || "").trim();
        const attName = (state.attenderName || state.assignedName || state.name || "").trim();
        const canonical = (attName && !attName.match(/^[a-zA-Z0-9_-]{15,35}$/))
          ? attName
          : (idToNameMap.get(attId) || attId);
        if (canonical) attendersSet.add(canonical);
      }
    });
  }

  // B. Process assignedTo array
  assignedToArr.forEach(item => {
    if (!item || typeof item !== "string") return;
    const trimmed = item.trim();
    if (!trimmed) return;
    const resolved = idToNameMap.get(trimmed) || trimmed;
    attendersSet.add(resolved);
  });

  // C. Process assignedName array
  assignedNameArr.forEach(item => {
    if (!item || typeof item !== "string") return;
    const trimmed = item.trim();
    if (trimmed && !trimmed.match(/^[a-zA-Z0-9_-]{15,35}$/)) {
      attendersSet.add(trimmed);
    }
  });

  // D. Process history array
  if (Array.isArray(log.history)) {
    log.history.forEach(item => {
      if (item && typeof item === "object") {
        const attId = item.attenderId;
        const attName = item.attenderName || item.assignedName || item.by || item.editedBy || item.name;
        registerPair(attId, attName);
        if (attName && typeof attName === "string") {
          const trimmed = attName.trim();
          if (trimmed && !trimmed.match(/^[a-zA-Z0-9_-]{15,35}$/)) {
            attendersSet.add(trimmed);
          }
        }
      }
    });
  }

  const rawList = Array.from(attendersSet);
  const humanNames = rawList.filter(x => !x.match(/^[a-zA-Z0-9_-]{15,35}$/));
  const rawIds = rawList.filter(x => x.match(/^[a-zA-Z0-9_-]{15,35}$/));

  if (humanNames.length > 0) {
    const unmappedIds = rawIds.filter(id => !idToNameMap.has(id));
    if (humanNames.length >= assignedToArr.length && humanNames.length >= 1) {
      return humanNames;
    }
    return Array.from(new Set([...humanNames, ...unmappedIds]));
  }

  return rawList;
}


