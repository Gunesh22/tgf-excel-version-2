import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../src/lib/firebase';
import admin from 'firebase-admin';

// Initialize the Firebase Admin SDK to connect to the local emulator
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'demo-tgf-call'
  });
}

// Ensure the Admin SDK uses the emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

export const signInAsTestAdmin = async () => {
  const uid = 'admin-test-user';
  // Create a custom token with the admin claim
  const customToken = await admin.auth().createCustomToken(uid, { admin: true });
  
  // Sign in the client SDK using this custom token
  await signInWithCustomToken(auth, customToken);
};

export const signOutTestUser = async () => {
  await auth.signOut();
};
