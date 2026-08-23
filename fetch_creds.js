import 'dotenv/config';
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    initializeApp();
  }
}

const db = getFirestore();

async function getCreds() {
  const adminSnap = await db.collection("settings").doc("admin_auth").get();
  console.log("Admin password:", adminSnap.exists ? adminSnap.data().password : "123456 (default)");

  const attendersSnap = await db.collection("attenders").get();
  console.log("\nAttenders:");
  attendersSnap.forEach(doc => {
    const data = doc.data();
    console.log(`- Name: ${data.name} | PIN: ${data.password}`);
  });
}

getCreds().catch(console.error);
