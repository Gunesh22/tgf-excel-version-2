import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";


import fs from 'fs';
import path from 'path';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    let rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    let useEmulator = process.env.VITE_USE_FIREBASE_EMULATOR === 'true';
    
    // Fallback: Manually read .env if process.env is missing it (common in local Vite setups)
    if (!rawServiceAccount || !useEmulator) {
      try {
        const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8');
        
        const match = envFile.match(/FIREBASE_SERVICE_ACCOUNT='([^']+)'/);
        if (match) rawServiceAccount = match[1];

        const emuMatch = envFile.match(/VITE_USE_FIREBASE_EMULATOR=(true|false)/);
        if (emuMatch && emuMatch[1] === 'true') useEmulator = true;
      } catch (e) { /* ignore */ }
    }

    if (useEmulator) {
      console.log("[GHL.JS] ⚠️ EMULATOR MODE ENABLED! Pointing Firebase Admin to localhost...");
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }

    const serviceAccount = rawServiceAccount ? JSON.parse(rawServiceAccount) : null;

    if (serviceAccount) {
      initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      initializeApp();
    }
  } catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
  }
}

export default async function handler(req, res) {
  const db = getFirestore();
  const auth = getAuth();

  const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://your-production-domain.com'];
  const origin = req.headers.origin;
  
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow non-browser requests (like curl) if secret is present
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing Firebase Auth token" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return res.status(403).json({ error: "Forbidden: Invalid or expired Firebase Auth token" });
    }

    if (decodedToken.admin !== true) {
      return res.status(403).json({ error: "Forbidden: Only administrators can access the GHL API" });
    }

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
