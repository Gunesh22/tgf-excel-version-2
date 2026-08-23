import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../src/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { setupAdmin, signInAdmin, signOut } from '../helpers/auth';

// Note: To test the actual DB functions we'll import them.
// For integrity testing, we need to ensure the DB state changes as expected.

describe('Data Integrity: Contacts', () => {
  beforeAll(async () => {
    await setupAdmin();
  });

  beforeEach(async () => {
    // Authenticate the client Web SDK as the Admin mock user
    await signInAdmin();
  });

  afterAll(async () => {
    await signOut();
  });

  it('should create and retrieve a contact', async () => {
    const contactRef = doc(db, 'contacts', 'test-contact-1');
    await setDoc(contactRef, {
      Name: 'John Doe',
      Phone: '1234567890',
      status: 'Interested'
    });

    const snap = await getDoc(contactRef);
    expect(snap.exists()).toBe(true);
    expect(snap.data().Name).toBe('John Doe');
  });

  it('should update a contact correctly', async () => {
    const contactRef = doc(db, 'contacts', 'test-contact-1');
    await setDoc(contactRef, { Name: 'John Doe Update', status: 'Reg.Done' }, { merge: true });

    const snap = await getDoc(contactRef);
    expect(snap.data().status).toBe('Reg.Done');
    expect(snap.data().Name).toBe('John Doe Update');
  });

  it('should delete a contact correctly', async () => {
    const contactRef = doc(db, 'contacts', 'test-contact-1');
    await deleteDoc(contactRef);

    const snap = await getDoc(contactRef);
    expect(snap.exists()).toBe(false);
  });
});
