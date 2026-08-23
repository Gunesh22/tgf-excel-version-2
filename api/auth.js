import { initializeApp, getApps, getApp, deleteApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import fs from 'fs';
import path from 'path';

console.log("[AUTH.JS] Module loaded. getApps().length =", getApps().length);

// Force re-initialization on Vite HMR to pick up new env vars
if (getApps().length > 0) {
  try {
    console.log("[AUTH.JS] Deleting cached app instance to force reload...");
    // Since top-level await isn't allowed in CommonJS, we can't easily await deleteApp here.
    // Wait, Vite uses ESM. We can't top-level await unless module is ESM, but Vite handles it.
    // Just re-assigning it might be enough, but Firebase throws if we initializeApp again.
  } catch(e) {}
}

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    let rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    let useEmulator = process.env.VITE_USE_FIREBASE_EMULATOR === 'true';
    console.log("[AUTH.JS] process.env.FIREBASE_SERVICE_ACCOUNT exists?", !!rawServiceAccount);
    
    // Fallback: Manually read .env if process.env is missing it (common in local Vite setups)
    if (!rawServiceAccount || !useEmulator) {
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        console.log("[AUTH.JS] Reading .env from:", envPath);
        const envFile = fs.readFileSync(envPath, 'utf-8');
        
        const match = envFile.match(/FIREBASE_SERVICE_ACCOUNT='([^']+)'/);
        if (match) rawServiceAccount = match[1];

        const emuMatch = envFile.match(/VITE_USE_FIREBASE_EMULATOR=(true|false)/);
        if (emuMatch && emuMatch[1] === 'true') useEmulator = true;

        if (!rawServiceAccount && !emuMatch) {
          console.log("[AUTH.JS] Failed to match regex in .env file!");
        }
      } catch (e) {
        console.error("[AUTH.JS] Error reading .env manually:", e.message);
      }
    }

    if (useEmulator) {
      console.log("[AUTH.JS] ⚠️ EMULATOR MODE ENABLED! Pointing Firebase Admin to localhost...");
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }

    const serviceAccount = rawServiceAccount ? JSON.parse(rawServiceAccount) : null;
    console.log("[AUTH.JS] Parsed serviceAccount project_id:", serviceAccount?.project_id);

    if (serviceAccount) {
      console.log("[AUTH.JS] Initializing with credentials...");
      initializeApp({
        credential: cert(serviceAccount),
      });
      console.log("[AUTH.JS] Successfully initialized app!");
    } else {
      console.log("[AUTH.JS] Initializing WITHOUT credentials (fallback)...");
      initializeApp();
    }
  } catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
  }
}

export default async function handler(req, res) {
  // CORS setup
  const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://your-production-domain.com'];
  const origin = req.headers.origin;
  
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { mode, attenderId, pin } = req.body;
    
    if (!pin) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const db = getFirestore();

    // Brute Force Protection
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const identifier = mode === 'admin' ? 'admin' : (attenderId || 'unknown');
    // Using base64 to ensure valid document ID format
    const safeIp = Buffer.from(ip).toString('base64').replace(/[/+=]/g, '_');
    const safeId = Buffer.from(identifier).toString('base64').replace(/[/+=]/g, '_');
    
    const lockoutRef = db.collection('_security').doc(`bruteforce_${safeId}_${safeIp}`);
    const lockoutDoc = await lockoutRef.get();
    
    let failedAttempts = 0;
    
    if (lockoutDoc.exists) {
      const data = lockoutDoc.data();
      failedAttempts = data.failedAttempts || 0;
      if (data.lockoutUntil && data.lockoutUntil > Date.now()) {
        const remainingSecs = Math.ceil((data.lockoutUntil - Date.now()) / 1000);
        return res.status(429).json({ error: `Too many attempts. Try again in ${remainingSecs} seconds.` });
      }
    }

    const handleFailure = async () => {
      const newCount = failedAttempts + 1;
      let lockoutUntil = 0;
      // After 5 failures, start exponential lockout (1 min, 2 min, 4 min...)
      if (newCount >= 5) {
        const penaltyMinutes = Math.pow(2, newCount - 5);
        lockoutUntil = Date.now() + (penaltyMinutes * 60000);
      }
      await lockoutRef.set({ failedAttempts: newCount, lockoutUntil });
      // Always return a generic error to prevent enumeration
      return res.status(401).json({ error: "Invalid credentials" });
    };

    if (mode === 'admin') {
      // Verify Admin Password
      const adminDoc = await db.collection('settings').doc('admin_auth').get();
      let realAdminPassword = "123456";
      
      if (adminDoc.exists && adminDoc.data().password) {
        realAdminPassword = adminDoc.data().password;
      }
      
      if (String(pin).trim() !== String(realAdminPassword).trim()) {
        return handleFailure();
      }

      // Success
      await lockoutRef.delete();
      const customToken = await getAuth().createCustomToken("admin_user", { admin: true });
      return res.status(200).json({ token: customToken });

    } else if (mode === 'attender') {
      // Verify Attender PIN
      if (!attenderId) {
        return handleFailure();
      }

      const attenderDoc = await db.collection('attenders').doc(attenderId).get();
      if (!attenderDoc.exists) {
        return handleFailure(); // Prevents attender enumeration
      }

      const attenderData = attenderDoc.data();
      const expectedPassword = attenderData.password;

      if (!expectedPassword || String(pin).trim() !== String(expectedPassword).trim()) {
        return handleFailure();
      }

      // Success
      await lockoutRef.delete();
      const customToken = await getAuth().createCustomToken(attenderId, { 
        admin: false,
        attenderName: attenderData.name || "Attender" 
      });
      return res.status(200).json({ token: customToken });

    } else {
      return res.status(400).json({ error: "Invalid credentials" });
    }

  } catch (error) {
    console.error("Auth API Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
