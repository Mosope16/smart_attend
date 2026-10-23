import {
  logAttendanceAttempt,
  getTelemetryHistory,
  clearTelemetryHistory,
  calculateTelemetrySummary,
  exportTelemetryToCsv,
  TelemetryRecord,
} from '../src/lib/attendanceTelemetry';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('attendanceTelemetry.ts unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logAttendanceAttempt', () => {
    it('correctly tags false rejection when inside room but rejected', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('[]');

      const record = await logAttendanceAttempt({
        sessionId: 's1',
        studentId: 'u1',
        zone: 'INSIDE_ROOM',
        distanceMeters: 45,
        accuracyMeters: 15,
        allowedRadiusMeters: 50,
        isMocked: false,
        latencyMs: 1200,
        qrType: 'DYNAMIC',
        decision: 'REJECTED',
        rejectionReason: 'Biometric error',
      });

      expect(record.isFalseRejection).toBe(true);
      expect(record.isFalseAcceptance).toBe(false);
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('correctly tags false acceptance when outside room but accepted', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('[]');

      const record = await logAttendanceAttempt({
        sessionId: 's1',
        studentId: 'u2',
        zone: 'ADJACENT_ROOM',
        distanceMeters: 28,
        accuracyMeters: 20,
        allowedRadiusMeters: 30,
        isMocked: false,
        latencyMs: 1400,
        qrType: 'DYNAMIC',
        decision: 'ACCEPTED',
      });

      expect(record.isFalseAcceptance).toBe(true);
      expect(record.isFalseRejection).toBe(false);
    });
  });

  describe('calculateTelemetrySummary', () => {
    it('accurately computes FAR and FRR error rates across zones', () => {
      const records: TelemetryRecord[] = [
        // 2 Inside room tests: 1 accept, 1 reject (FRR = 50%)
        {
          id: '1', timestamp: '', sessionId: 's1', studentId: 'u1',
          zone: 'INSIDE_ROOM', distanceMeters: 10, accuracyMeters: 5, allowedRadiusMeters: 50,
          isMocked: false, latencyMs: 1000, qrType: 'DYNAMIC', decision: 'ACCEPTED',
          isFalseAcceptance: false, isFalseRejection: false,
        },
        {
          id: '2', timestamp: '', sessionId: 's1', studentId: 'u2',
          zone: 'INSIDE_ROOM', distanceMeters: 55, accuracyMeters: 30, allowedRadiusMeters: 50,
          isMocked: false, latencyMs: 1500, qrType: 'DYNAMIC', decision: 'REJECTED',
          isFalseAcceptance: false, isFalseRejection: true,
        },
        // 2 Outside room tests: 1 rejected correctly, 1 falsely accepted (FAR = 50%)
        {
          id: '3', timestamp: '', sessionId: 's1', studentId: 'u3',
          zone: 'WALL_BOUNDARY', distanceMeters: 48, accuracyMeters: 10, allowedRadiusMeters: 50,
          isMocked: false, latencyMs: 1200, qrType: 'DYNAMIC', decision: 'ACCEPTED',
          isFalseAcceptance: true, isFalseRejection: false,
        },
        {
          id: '4', timestamp: '', sessionId: 's1', studentId: 'u4',
          zone: 'ADJACENT_ROOM', distanceMeters: 90, accuracyMeters: 12, allowedRadiusMeters: 50,
          isMocked: false, latencyMs: 1100, qrType: 'DYNAMIC', decision: 'REJECTED',
          isFalseAcceptance: false, isFalseRejection: false,
        },
      ];

      const summary = calculateTelemetrySummary(records);
      expect(summary.totalTrials).toBe(4);
      expect(summary.totalAccepted).toBe(2);
      expect(summary.totalRejected).toBe(2);
      expect(summary.overallFrrPct).toBe(50); // 1 of 2 inside rejected
      expect(summary.overallFarPct).toBe(50); // 1 of 2 outside accepted
      expect(summary.meanLatencyMs).toBe(1200);
      expect(summary.zones.INSIDE_ROOM.trials).toBe(2);
    });
  });

  describe('exportTelemetryToCsv', () => {
    it('formats records into valid CSV with headers and rows', () => {
      const records: TelemetryRecord[] = [
        {
          id: '1', timestamp: '2026-10-22T23:00:00Z', sessionId: 's1', studentId: 'u1',
          zone: 'INSIDE_ROOM', distanceMeters: 12, accuracyMeters: 8, allowedRadiusMeters: 50,
          isMocked: false, latencyMs: 1050, qrType: 'DYNAMIC', decision: 'ACCEPTED',
          isFalseAcceptance: false, isFalseRejection: false,
        },
      ];

      const csv = exportTelemetryToCsv(records);
      expect(csv).toContain('Timestamp,Session ID,Zone,Distance (m),Accuracy (m)');
      expect(csv).toContain('"INSIDE_ROOM",12,8,50,1050,"DYNAMIC","ACCEPTED",NO,NO');
    });
  });
});
