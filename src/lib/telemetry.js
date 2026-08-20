// Telemetry Logger Disabled by User Request

if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("TGF_FIREBASE_TELEMETRY_LOGS");
  } catch (e) {}
}

export function formatDurationSec() { return "0s"; }
export function trackSnapshotListenerStart() {}
export function recordSnapshotEvent() {}
export function getActiveListenersSummary() { return []; }
export function logFirestoreOp() {}
export function subscribeTelemetry() { return () => {}; }
export function getTelemetryLogs() { return []; }
export function clearTelemetryLogs() {}
export function getTelemetryStats() {
  return { totalReads: 0, totalWrites: 0, totalDeletes: 0, totalSnapshots: 0, totalCacheHits: 0, totalLogsCount: 0 };
}
export function exportTelemetryJSON() {}
