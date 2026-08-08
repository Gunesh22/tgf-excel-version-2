export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const GHL_TOKEN = process.env.GHL_TOKEN || process.env.VITE_GHL_TOKEN;
    const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || process.env.VITE_GHL_LOCATION_ID;
    const GHL_VERSION = process.env.GHL_VERSION || process.env.VITE_GHL_VERSION || "2021-07-28";

    if (!GHL_TOKEN) {
      return res.status(500).json({ error: "Server missing GHL_TOKEN configuration" });
    }

    const isV1 = !GHL_TOKEN.startsWith("pit-");
    const { endpoint, method = "GET", payload, params } = req.body || req.query || {};

    let targetUrl = "";
    const headers = {
      "Authorization": `Bearer ${GHL_TOKEN}`
    };

    if (!isV1) {
      headers["Content-Type"] = "application/json";
      headers["Version"] = GHL_VERSION;
    }

    if (endpoint === "searchContacts") {
      if (isV1) {
        const url = new URL("https://rest.gohighlevel.com/v1/contacts/");
        if (params?.limit) url.searchParams.set("limit", params.limit);
        if (params?.query) url.searchParams.set("query", params.query);
        if (params?.startAfter) url.searchParams.set("startAfter", params.startAfter);
        if (params?.startAfterId) url.searchParams.set("startAfterId", params.startAfterId);
        targetUrl = url.toString();
      } else {
        targetUrl = "https://services.leadconnectorhq.com/contacts/search";
      }
    } else if (endpoint === "getContact") {
      targetUrl = `https://rest.gohighlevel.com/v1/contacts/${params.id}`;
    } else if (endpoint === "customFields") {
      targetUrl = isV1 
        ? "https://rest.gohighlevel.com/v1/custom-fields/" 
        : `https://services.leadconnectorhq.com/locations/${params?.locationId || GHL_LOCATION_ID}/customFields`;
      if (!isV1) headers["Version"] = "2023-02-21";
    } else if (endpoint === "tags") {
      targetUrl = isV1 
        ? "https://rest.gohighlevel.com/v1/tags/" 
        : `https://services.leadconnectorhq.com/locations/${params?.locationId || GHL_LOCATION_ID}/tags`;
      if (!isV1) headers["Version"] = "2023-02-21";
    } else if (req.body?.targetUrl) {
      const allowedDomains = ["https://rest.gohighlevel.com/", "https://services.leadconnectorhq.com/"];
      const isAllowed = allowedDomains.some(domain => String(req.body.targetUrl).startsWith(domain));
      if (!isAllowed) {
        return res.status(403).json({ error: "Access denied: Target URL is not an authorized GHL domain." });
      }
      targetUrl = req.body.targetUrl;
    } else {
      return res.status(400).json({ error: "Invalid GHL endpoint requested" });
    }

    const fetchOptions = {
      method: method.toUpperCase(),
      headers
    };

    if (fetchOptions.method !== "GET" && fetchOptions.method !== "HEAD" && payload) {
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("GHL Proxy Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
