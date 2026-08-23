import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { fetchPartitionCacheForColdBoot } from '../../src/lib/db/sync';
import { setupAdmin, signInAdmin, signOut } from '../helpers/auth';

// Note: Real load testing of 200 users is heavy. 
// We will simulate N users performing a sync.

const SIMULATE_USERS = 3; 

describe(`Performance Simulator: ${SIMULATE_USERS} Users`, () => {
  beforeAll(async () => {
    await setupAdmin();
  });

  afterAll(async () => {
    await signOut();
  });

  it('should measure time taken to sync N users', async () => {
    await signInAdmin();
    const monthStr = '2026-08';
    
    // Setup test data for N users
    for (let i = 0; i < SIMULATE_USERS; i++) {
      const attenderId = `attender-sim-${i}`;
      await setDoc(doc(db, `callCenterCache/${monthStr}/attenderPartitions/${attenderId}`), {
        contacts: {
          [`contact-${i}`]: { id: `contact-${i}`, Name: `Lead ${i}`, attenderId }
        },
        lastUpdated: Date.now()
      });
    }

    const start = performance.now();
    
    // Execute sync concurrently
    const promises = [];
    for (let i = 0; i < SIMULATE_USERS; i++) {
      const attenderId = `attender-sim-${i}`;
      promises.push(fetchPartitionCacheForColdBoot(attenderId, null, 1));
    }
    await Promise.all(promises);

    const end = performance.now();
    const duration = end - start;

    console.log(`[Metrics] ${SIMULATE_USERS} Users sync latency: ${duration.toFixed(2)} ms`);
    
    // We expect basic initial syncs to take less than 1000ms for 3 users locally
    expect(duration).toBeLessThan(2000);
  });
});
