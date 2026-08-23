// Telemetry Logger Disabled by User Request

if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("TGF_FIREBASE_TELEMETRY_LOGS");
  } catch { /* empty */ }
}

export function formatDurationSec() { return "0s"; }
export function trackSnapshotListenerStart() { /* empty */ }
export function recordSnapshotEvent() { /* empty */ }
export function getActiveListenersSummary() { return []; }
export function logFirestoreOp() { /* empty */ }
export function subscribeTelemetry() { return () => { /* empty */ }; }
export function getTelemetryLogs() { return []; }
export function clearTelemetryLogs() { /* empty */ }
export function getTelemetryStats() {
  return { totalReads: 0, totalWrites: 0, totalDeletes: 0, totalSnapshots: 0, totalCacheHits: 0, totalLogsCount: 0 };
}
export function exportTelemetryJSON() { /* empty */ }
