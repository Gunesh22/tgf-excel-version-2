import { isKhojiField } from "../../../lib/khojiHelper";
export { isKhojiField };

export const STATUS_OPTIONS = [
  "Interested",
  "Reg.Done",
  "Not interested",
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
  "Reminder",
  "Query",
  "Already Reg.d",
  "Next time",
  "Shivir done",
  "Not possible",
  "Pending",
  "Not interested",
  "Not Attended"
];

export const NOT_CONNECTED_STATUSES = [
  "NA",
  "Busy",
  "Call Cut",
  "switched off",
  "Switched Off",
  "Invalid No",
  "Called by mistake",
  "no network",
  "No Network",
  "wrong no.",
  "Wrong No.",
  "no answer",
  "No Answer"
];

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
    return Array.from(merged).sort().join(", ");
  }

  for (const c of candidates) {
    const val = getVal(c);
    if (val) return val;
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

