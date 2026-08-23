import { useState, useEffect } from 'react';
import { subscribeToSyncStatus } from '../lib/db';

export function useSyncState(attenderId, attenderName) {
  const [syncState, setSyncState] = useState({
    status: 'LOADING_LOCAL', // 'LOADING_LOCAL', 'READY', 'SYNCING', 'SYNCED', 'SYNC_ERROR', 'OFFLINE'
    lastSyncTime: null,
    error: null
  });

  useEffect(() => {
    if (!attenderId && !attenderName) return;

    const handleOffline = () => setSyncState(s => ({ ...s, status: 'OFFLINE' }));
    const handleOnline = () => setSyncState(s => ({ ...s, status: 'SYNCING' })); // Will trigger delta sync via sync.js

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    const unsub = subscribeToSyncStatus(attenderId, attenderName, (newState) => {
      if (!navigator.onLine) {
        setSyncState({ ...newState, status: 'OFFLINE' });
      } else {
        setSyncState(newState);
      }
    });

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (unsub) unsub();
    };
  }, [attenderId, attenderName]);

  return syncState;
}
