/**
 * Attendance Telemetry & Empirical Test Logger (Layer 4)
 * Records and computes empirical evaluation metrics:
 * - False Acceptance Rate (FAR) in adjacent rooms & outside walls
 * - False Rejection Rate (FRR) inside the lecture hall
 * - GPS horizontal accuracy distribution (±X meters)
 * - Check-in latency (ms)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type TestZone = 'INSIDE_ROOM' | 'WALL_BOUNDARY' | 'ADJACENT_ROOM' | 'QUAD_FAR';

export interface TelemetryRecord {
  id: string;
  timestamp: string;
  sessionId: string;
  studentId: string;
  zone: TestZone;
  distanceMeters: number;
  accuracyMeters: number | null;
  allowedRadiusMeters: number;
  isMocked: boolean;
  latencyMs: number;
  qrType: 'DYNAMIC' | 'STATIC';
  decision: 'ACCEPTED' | 'REJECTED';
  rejectionReason?: string;
  isFalseAcceptance: boolean;
  isFalseRejection: boolean;
}

export interface ZoneSummary {
  trials: number;
  accepted: number;
  rejected: number;
  meanDistance: number;
  meanAccuracy: number;
  meanLatencyMs: number;
  errorRatePct: number; // For inside: FRR%; For outside: FAR%
}

export interface TelemetrySummary {
  totalTrials: number;
  totalAccepted: number;
  totalRejected: number;
  overallFarPct: number;
  overallFrrPct: number;
  meanLatencyMs: number;
  zones: Record<TestZone, ZoneSummary>;
}

const STORAGE_KEY = 'smartattend_layer4_telemetry';

export async function logAttendanceAttempt(
  data: Omit<TelemetryRecord, 'id' | 'timestamp' | 'isFalseAcceptance' | 'isFalseRejection'>
): Promise<TelemetryRecord> {
  const isInside = data.zone === 'INSIDE_ROOM';
  const isAccepted = data.decision === 'ACCEPTED';

  const record: TelemetryRecord = {
    ...data,
    id: `tel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    isFalseAcceptance: !isInside && isAccepted,
    isFalseRejection: isInside && !isAccepted,
  };

  try {
    const existing = await getTelemetryHistory();
    const updated = [record, ...existing].slice(0, 500); // Keep last 500 records
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to persist attendance telemetry:', err);
  }

  return record;
}

export async function getTelemetryHistory(): Promise<TelemetryRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearTelemetryHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function calculateTelemetrySummary(records: TelemetryRecord[]): TelemetrySummary {
  const zones: Record<TestZone, ZoneSummary> = {
    INSIDE_ROOM: { trials: 0, accepted: 0, rejected: 0, meanDistance: 0, meanAccuracy: 0, meanLatencyMs: 0, errorRatePct: 0 },
    WALL_BOUNDARY: { trials: 0, accepted: 0, rejected: 0, meanDistance: 0, meanAccuracy: 0, meanLatencyMs: 0, errorRatePct: 0 },
    ADJACENT_ROOM: { trials: 0, accepted: 0, rejected: 0, meanDistance: 0, meanAccuracy: 0, meanLatencyMs: 0, errorRatePct: 0 },
    QUAD_FAR: { trials: 0, accepted: 0, rejected: 0, meanDistance: 0, meanAccuracy: 0, meanLatencyMs: 0, errorRatePct: 0 },
  };

  if (!records || records.length === 0) {
    return {
      totalTrials: 0,
      totalAccepted: 0,
      totalRejected: 0,
      overallFarPct: 0,
      overallFrrPct: 0,
      meanLatencyMs: 0,
      zones,
    };
  }

  let totalLatency = 0;
  let falseAcceptances = 0;
  let outsideTrials = 0;
  let falseRejections = 0;
  let insideTrials = 0;

  records.forEach((r) => {
    totalLatency += r.latencyMs;
    const z = zones[r.zone] || zones.INSIDE_ROOM;
    z.trials += 1;
    if (r.decision === 'ACCEPTED') z.accepted += 1;
    if (r.decision === 'REJECTED') z.rejected += 1;
    z.meanDistance += r.distanceMeters;
    z.meanAccuracy += r.accuracyMeters ?? 0;
    z.meanLatencyMs += r.latencyMs;

    if (r.zone === 'INSIDE_ROOM') {
      insideTrials += 1;
      if (r.isFalseRejection) falseRejections += 1;
    } else {
      outsideTrials += 1;
      if (r.isFalseAcceptance) falseAcceptances += 1;
    }
  });

  // Normalize zone averages
  (Object.keys(zones) as TestZone[]).forEach((key) => {
    const z = zones[key];
    if (z.trials > 0) {
      z.meanDistance = Math.round(z.meanDistance / z.trials);
      z.meanAccuracy = Math.round(z.meanAccuracy / z.trials);
      z.meanLatencyMs = Math.round(z.meanLatencyMs / z.trials);
      const errors = key === 'INSIDE_ROOM' ? z.rejected : z.accepted;
      z.errorRatePct = Math.round((errors / z.trials) * 100);
    }
  });

  return {
    totalTrials: records.length,
    totalAccepted: records.filter((r) => r.decision === 'ACCEPTED').length,
    totalRejected: records.filter((r) => r.decision === 'REJECTED').length,
    overallFarPct: outsideTrials > 0 ? Math.round((falseAcceptances / outsideTrials) * 100) : 0,
    overallFrrPct: insideTrials > 0 ? Math.round((falseRejections / insideTrials) * 100) : 0,
    meanLatencyMs: Math.round(totalLatency / records.length),
    zones,
  };
}

export function exportTelemetryToCsv(records: TelemetryRecord[]): string {
  const headers = [
    'Timestamp',
    'Session ID',
    'Zone',
    'Distance (m)',
    'Accuracy (m)',
    'Allowed Radius (m)',
    'Latency (ms)',
    'QR Type',
    'Decision',
    'False Accept',
    'False Reject',
    'Rejection Reason',
  ];

  const rows = records.map((r) => [
    `"${r.timestamp}"`,
    `"${r.sessionId}"`,
    `"${r.zone}"`,
    r.distanceMeters,
    r.accuracyMeters ?? 'N/A',
    r.allowedRadiusMeters,
    r.latencyMs,
    `"${r.qrType}"`,
    `"${r.decision}"`,
    r.isFalseAcceptance ? 'YES' : 'NO',
    r.isFalseRejection ? 'YES' : 'NO',
    `"${(r.rejectionReason || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
