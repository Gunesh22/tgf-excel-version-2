import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let testEnv;

beforeAll(async () => {
  // Load rules
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-tgf-call',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: 'localhost',
      port: 8080
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore Security Rules', () => {
  
  it('should deny read/write to unauthenticated users', async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthedDb.collection('contacts').get());
    await assertFails(unauthedDb.collection('contacts').add({ Name: 'Test' }));
  });

  describe('Attender specific rules', () => {
    it('should allow an attender to read their own partition', async () => {
      const attenderDb = testEnv.authenticatedContext('attenderA', {
        role: 'attender',
        sub: 'attenderA'
      }).firestore();
      
      const partitionRef = attenderDb.doc('callCenterCache/2026-08/attenderPartitions/attenderA');
      await assertSucceeds(partitionRef.get());
    });

    it('should deny an attender to read another attender partition', async () => {
      const attenderDb = testEnv.authenticatedContext('attenderA', {
        role: 'attender',
        sub: 'attenderA'
      }).firestore();
      
      const partitionRef = attenderDb.doc('callCenterCache/2026-08/attenderPartitions/attenderB');
      await assertFails(partitionRef.get());
    });

    it('should deny an attender from modifying protected fields (assignedTo) on their own contact', async () => {
      const attenderDb = testEnv.authenticatedContext('attenderA', {
        role: 'attender',
        sub: 'attenderA'
      }).firestore();
      
      const adminDb = testEnv.authenticatedContext('admin1', {
        role: 'admin',
        admin: true,
        sub: 'admin1'
      }).firestore();

      const contactRefAdmin = adminDb.collection('contacts').doc('secure-contact-1');
      await assertSucceeds(contactRefAdmin.set({
        Name: 'Test Contact',
        assignedTo: ['attenderA']
      }));

      const contactRefAttender = attenderDb.collection('contacts').doc('secure-contact-1');
      
      // Attempting to modify remark -> ALLOWED
      await assertSucceeds(contactRefAttender.update({
        remark: 'Called and interested'
      }));

      // Attempting to modify assignedTo -> DENIED
      await assertFails(contactRefAttender.update({
        assignedTo: ['attenderA', 'attenderB']
      }));

      // Attempting to modify attenderId -> DENIED
      await assertFails(contactRefAttender.update({
        attenderId: 'attenderB'
      }));
    });
  });

  describe('Admin privilege escalation', () => {
    it('should allow admin to read and write any collection', async () => {
      const adminDb = testEnv.authenticatedContext('admin1', {
        role: 'admin',
        admin: true,
        sub: 'admin1'
      }).firestore();

      await assertSucceeds(adminDb.collection('contacts').get());
      await assertSucceeds(adminDb.collection('contacts').add({ Name: 'Test Admin' }));
      await assertSucceeds(adminDb.doc('callCenterCache/2026-08').get());
    });
  });

  describe('API/GHL Authorization', () => {
    it('should allow GHL api key user to write to contacts', async () => {
      const apiDb = testEnv.authenticatedContext('apiUser', {
        role: 'api',
        admin: true,
        sub: 'apiUser'
      }).firestore();

      await assertSucceeds(apiDb.collection('contacts').add({ Name: 'GHL Lead' }));
    });
  });

});
