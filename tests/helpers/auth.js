import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getAuth, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth as clientAuth } from '../../src/lib/firebase';

// 1. Initialize Admin SDK for emulator
if (!getApps().length) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  initializeApp({
    projectId: 'tgf-call-center-2-7144d',
  });
}

/**
 * Ensures a test user exists in the Auth Emulator with the specified claims.
 */
async function ensureTestUser(uid, email, password, claims) {
  const adminAuth = getAdminAuth();
  try {
    try {
      await adminAuth.getUser(uid);
      // User exists, update claims and password if needed
      await adminAuth.updateUser(uid, { password });
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        // Create user
        await adminAuth.createUser({
          uid,
          email,
          password,
        });
      } else {
        throw e;
      }
    }
    // Set custom claims (this perfectly simulates production authorization)
    await adminAuth.setCustomUserClaims(uid, claims);
  } catch (error) {
    console.error('Error ensuring test user:', error);
    throw error;
  }
}

// 2. Fixture Creators
export async function setupAdmin() {
  await ensureTestUser('admin1', 'admin@test.com', 'password123', { role: 'admin', admin: true });
}

export async function setupAttender(uid, email) {
  await ensureTestUser(uid, email, 'password123', { role: 'attender' });
}

// 3. Client Sign-in Helpers
export async function signInAdmin() {
  await signInWithEmailAndPassword(clientAuth, 'admin@test.com', 'password123');
}

export async function signInAttender(email) {
  await signInWithEmailAndPassword(clientAuth, email, 'password123');
}

export async function signOut() {
  await firebaseSignOut(clientAuth);
}
