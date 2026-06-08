/**
 * GoHighLevel (GHL) CRM API Integration
 * 
 * Supports both V1 API Keys (JWT) and V2 Private Integration Tokens (PIT).
 * 
 * V2 Base URL: https://services.leadconnectorhq.com
 * V1 Base URL: https://rest.gohighlevel.com/v1
 * 
 * Auth: Bearer token in Authorization header
 */

const GHL_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IkZsTVlXa3ZnNlRKWlJDVVNRNWJXIiwidmVyc2lvbiI6MSwiaWF0IjoxNzUzMjY5NzE3NjUyLCJzdWIiOiJCMnRvbGZ4Qmh4bEJQUzZTdnU1aSJ9.o7P8Z0Jj9OdcSNvkHpnpdsmSGzZp8cnm-o2LLAVp0zo";
const GHL_LOCATION_ID = "FlMYWkvg6TJZRCUSQ5bW";
const GHL_VERSION = "2021-07-28";

// Decode base64 helper (Node.js & browser safe)
const base64Decode = (str) => {
  if (typeof atob === "function") {
    return atob(str);
  }
  return Buffer.from(str, "base64").toString("binary");
};

/**
 * Automatically decodes the GHL JWT token to extract the location ID if available.
 * Defaults back to the static GHL_LOCATION_ID if not a JWT token.
 */
export const getGhlLocationId = () => {
  if (GHL_TOKEN && !GHL_TOKEN.startsWith("pit-")) {
    try {
      const parts = GHL_TOKEN.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(base64Decode(parts[1]));
        if (payload.location_id) return payload.location_id;
      }
    } catch (e) {
      console.error("Failed to decode JWT for location_id:", e);
    }
  }
  return GHL_LOCATION_ID;
};

const ghlHeaders = () => {
  const isV2 = GHL_TOKEN.startsWith("pit-");
  const headers = {
    "Authorization": `Bearer ${GHL_TOKEN}`,
  };
  if (isV2) {
    headers["Content-Type"] = "application/json";
    headers["Version"] = GHL_VERSION;
  }
  return headers;
};

/**
 * Fetch or search contacts.
 * Supports pagination via page/startAfter params depending on V1/V2.
 * @param {number} page - Page number (V2 only, 1-indexed)
 * @param {number} pageLimit - Results per page (max 100)
 * @param {string} [query] - Optional search query string
 * @param {Array} [filters] - Optional advanced V2 filters array
 * @param {string} [v1StartAfter] - V1 cursor startAfter timestamp
 * @param {string} [v1StartAfterId] - V1 cursor startAfter contact ID
 * @returns {Promise<{contacts: Array, total: number, count: number, meta?: any}>}
 */
export const searchContacts = async (
  page = 1, 
  pageLimit = 100, 
  query = "", 
  filters = null,
  v1StartAfter = null,
  v1StartAfterId = null,
  signal = null
) => {
  const isV1 = !GHL_TOKEN.startsWith("pit-");
  const locId = getGhlLocationId();

  if (isV1) {
    const url = new URL("https://rest.gohighlevel.com/v1/contacts/");
    url.searchParams.set("limit", pageLimit);
    if (query) url.searchParams.set("query", query);
    if (v1StartAfter) url.searchParams.set("startAfter", v1StartAfter);
    if (v1StartAfterId) url.searchParams.set("startAfterId", v1StartAfterId);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: ghlHeaders(),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `GHL V1 API error: ${res.status}`);
    }

    return res.json();
  } else {
    const body = {
      locationId: locId,
      page,
      pageLimit,
    };
    if (query) body.query = query;
    if (filters) body.filters = filters;

    const res = await fetch("https://services.leadconnectorhq.com/contacts/search", {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `GHL API error: ${res.status}`);
    }

    return res.json();
  }
};

/**
 * Fetch ALL contacts by paginating through search/list results.
 * Supports both V1 cursor pagination and V2 offset pagination.
 * @param {string} [query] - Optional search query string
 * @param {function} onProgress - Callback with (fetchedSoFar, total) for progress UI
 * @returns {Promise<Array>} All contacts
 */
export const fetchAllContacts = async (query = "", onProgress = null, signal = null, maxContacts = null) => {
  const isV1 = !GHL_TOKEN.startsWith("pit-");
  const allContacts = [];
  const pageLimit = 100;
  
  if (isV1) {
    let startAfter = null;
    let startAfterId = null;
    let total = null;
    let pageCount = 1;

    while (true) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
      const data = await searchContacts(pageCount, pageLimit, query, null, startAfter, startAfterId, signal);
      
      const contacts = data.contacts || [];
      total = data.meta?.total || total || contacts.length;
      
      allContacts.push(...contacts);
      
      if (onProgress) onProgress(allContacts.length, total);
      
      if (maxContacts && allContacts.length >= maxContacts) break;
      
      startAfter = data.meta?.startAfter;
      startAfterId = data.meta?.startAfterId;
      
      // If we got fewer than pageLimit or there are no more cursor elements, we're done
      if (!startAfter || !startAfterId || contacts.length < pageLimit) break;
      // Safety threshold
      if (pageCount > 500) break;
      
      pageCount++;
      
      // Allow abort signal to break during wait
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 120);
        if (signal) {
          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          });
        }
      });
    }
  } else {
    let page = 1;
    let total = null;

    while (true) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
      const data = await searchContacts(page, pageLimit, query, null, null, null, signal);
      
      const contacts = data.contacts || [];
      total = data.total || data.meta?.total || total || contacts.length;
      
      allContacts.push(...contacts);
      
      if (onProgress) onProgress(allContacts.length, total);
      
      if (maxContacts && allContacts.length >= maxContacts) break;
      
      if (contacts.length < pageLimit) break;
      if (page > 500) break;
      
      page++;
      
      // Allow abort signal to break during wait
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 120);
        if (signal) {
          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          });
        }
      });
    }
  }

  return allContacts;
};

/**
 * Map a GHL contact object to our internal flat format.
 * GHL contacts have nested structures (customFields, tags, etc.)
 * Handles both V1 customField arrays and V2 customFields arrays seamlessly.
 */
let cachedCustomFieldsMap = null;

export const fetchCustomFieldsMap = async (signal = null) => {
  if (cachedCustomFieldsMap) return cachedCustomFieldsMap;

  try {
    const isV1 = !GHL_TOKEN.startsWith("pit-");
    const locId = getGhlLocationId();
    let fields = [];

    if (isV1) {
      const url = "https://rest.gohighlevel.com/v1/custom-fields/";
      const res = await fetch(url, {
        method: "GET",
        headers: ghlHeaders(),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        fields = data.customFields || [];
      } else {
        console.warn(`Failed to fetch custom fields (V1): ${res.status}`);
      }
    } else {
      const url = `https://services.leadconnectorhq.com/locations/${locId}/customFields`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          ...ghlHeaders(),
          "Version": "2023-02-21"
        },
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        fields = data.customFields || [];
      } else {
        console.warn(`Failed to fetch custom fields (V2): ${res.status}`);
      }
    }

    const map = {};
    fields.forEach(cf => {
      if (cf.id && cf.name) {
        map[cf.id.toLowerCase()] = cf.name;
      }
    });
    cachedCustomFieldsMap = map;
    return cachedCustomFieldsMap;
  } catch (e) {
    console.error("Failed to fetch custom fields metadata:", e);
    return {};
  }
};

export const mapGHLContactToRow = (contact, customFieldsMap = {}) => {
  const row = {};

  // Standard fields mapping (Strictly limited to requested + essential query metadata)
  row["Name"] = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || contact.contactName || "";
  row["Phone"] = contact.phone || "";
  row["Email"] = contact.email || "";
  row["City"] = contact.city || "";
  row["Country"] = contact.country || "";
  row["Source"] = contact.source || "";
  row["Date Added"] = contact.dateAdded || "";
  row["GHL_ID"] = contact.id || "";

  // Tags — join as comma-separated
  if (contact.tags && Array.isArray(contact.tags)) {
    row["Tags"] = contact.tags.join(", ");
  } else {
    row["Tags"] = "";
  }

  // Initialize all custom fields in the location to empty string
  Object.values(customFieldsMap).forEach(fieldName => {
    row[fieldName] = "";
  });

  // Populate custom fields values
  const customFieldsArray = contact.customFields || contact.customField;
  if (customFieldsArray && Array.isArray(customFieldsArray)) {
    customFieldsArray.forEach(cf => {
      const id = (cf.id || "").toLowerCase();
      const val = cf.value;
      const formattedVal = Array.isArray(val) ? val.join(", ") : (val || "");

      // Map to exact CRM name, fall back to key or ID if name metadata is not resolved
      const fieldName = customFieldsMap[id] || cf.fieldKey || cf.key || id;
      if (fieldName) {
        row[fieldName] = formattedVal;
      }
    });
  }

  return row;
};

/**
 * Fetch all contacts and map them to our internal row format.
 * This is the main function called from the UI.
 * @param {string} [query] - Optional search query string
 * @param {function} [onProgress] - Progress callback
 * @returns {Promise<{rows: Array, total: number}>}
 */
export const fetchAndMapAllContacts = async (query = "", onProgress = null, signal = null) => {
  const customFieldsMap = await fetchCustomFieldsMap(signal);
  const contacts = await fetchAllContacts(query, onProgress, signal);
  const rows = contacts.map(c => mapGHLContactToRow(c, customFieldsMap));
  return { rows, total: rows.length };
};

/**
 * Fetch contacts and group them by tags (used as sub-programs).
 * Returns { tagName: [rows...], ... }
 * @param {string} [query] - Optional search query string
 * @param {function} [onProgress] - Progress callback
 * @param {AbortSignal} [signal] - Abort signal to cancel fetch
 */
export const fetchContactsGroupedByTag = async (query = "", onProgress = null, signal = null) => {
  const customFieldsMap = await fetchCustomFieldsMap(signal);
  const maxContacts = query ? 2000 : 1000;
  let contacts = [];
  let isFallbackUsed = false;

  if (query) {
    console.log(`Executing exact search for: "${query}"`);
    contacts = await fetchAllContacts(query, onProgress, signal, maxContacts);
  } else {
    console.log("No query provided. Fetching latest 1000 contacts...");
    contacts = await fetchAllContacts("", onProgress, signal, 1000);
  }

  // Fallback 1: Split query on spaces, dashes, underscores, and try to search GHL with the first keyword of >=3 chars
  if (contacts.length === 0 && query) {
    const parts = query.split(/[\s_\-]+/).filter(p => p.length >= 3);
    const prefix = parts[0];
    if (prefix && prefix.toLowerCase() !== query.toLowerCase()) {
      console.log(`GHL V1 Tag Query Fallback 1: Querying prefix keyword: "${prefix}"`);
      contacts = await fetchAllContacts(prefix, onProgress, signal, maxContacts);
      isFallbackUsed = true;
    }
  }

  // Fallback 2: Local Scan fallback. Fetch the latest 1,500 contacts and filter locally by tag
  if (contacts.length === 0 && query) {
    console.log("GHL V1 Tag Query Fallback 2: Fetching latest 1500 leads to search tags locally...");
    if (onProgress) onProgress(0, 1500);
    contacts = await fetchAllContacts("", onProgress, signal, 1500);
    isFallbackUsed = true;
  }

  const groups = {};
  
  contacts.forEach(contact => {
    const row = mapGHLContactToRow(contact, customFieldsMap);
    const tags = contact.tags || [];
    
    if (tags.length === 0) {
      if (!groups["No Tag"]) groups["No Tag"] = [];
      groups["No Tag"].push({ ...row, "Sub Program": "No Tag" });
    } else {
      // Put contact in each tag group
      tags.forEach(tag => {
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push({ ...row, "Sub Program": tag });
      });
    }
  });

  // If fallback or search was used, filter groups to only keep those matching the query
  if ((isFallbackUsed || query) && query) {
    const lowerQuery = query.toLowerCase();
    const filteredGroups = {};
    Object.keys(groups).forEach(tag => {
      if (tag.toLowerCase().includes(lowerQuery)) {
        filteredGroups[tag] = groups[tag];
      }
    });
    return filteredGroups;
  }
  
  return groups;
};

/**
 * Test API connection — useful for checking if token has required scopes
 */
export const testConnection = async () => {
  try {
    const isV1 = !GHL_TOKEN.startsWith("pit-");
    const data = await searchContacts(1, 1);
    const contacts = data.contacts || [];
    return {
      success: true,
      total: isV1 ? (data.meta?.total || 0) : (data.total || data.meta?.total || 0),
      sample: contacts[0] || null,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
};

/**
 * Fetch all tags for the sub-account (location).
 * Supports both V1 tags/ endpoint and V2 locations/:locationId/tags endpoint.
 */
export const fetchLocationTags = async (signal = null) => {
  const isV1 = !GHL_TOKEN.startsWith("pit-");
  const locId = getGhlLocationId();

  if (isV1) {
    const url = "https://rest.gohighlevel.com/v1/tags/";
    const res = await fetch(url, {
      method: "GET",
      headers: ghlHeaders(),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `GHL V1 Tags API error: ${res.status}`);
    }

    const data = await res.json();
    return data.tags || [];
  } else {
    const url = `https://services.leadconnectorhq.com/locations/${locId}/tags`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...ghlHeaders(),
        "Version": "2023-02-21"
      },
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `GHL V2 Tags API error: ${res.status}`);
    }

    const data = await res.json();
    return data.tags || [];
  }
};

export { GHL_LOCATION_ID, GHL_TOKEN };
