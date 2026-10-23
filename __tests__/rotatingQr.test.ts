import {
  computeWindowToken,
  getWindowIndex,
  getWindowProgress,
  generateDynamicQrString,
  validateScannedQr,
  DEFAULT_ROTATION_INTERVAL_SECONDS,
} from '../src/lib/rotatingQr';

describe('rotatingQr.ts unit tests', () => {
  const sessionId = 'd3b07384-d113-4f9e-97c7-c5980e1c2a11';
  const baseCode = 'CSC301';

  describe('computeWindowToken', () => {
    it('generates deterministic tokens for identical inputs', () => {
      const t1 = computeWindowToken(sessionId, baseCode, 100);
      const t2 = computeWindowToken(sessionId, baseCode, 100);
      expect(t1).toBe(t2);
      expect(t1.length).toBe(6);
    });

    it('generates different tokens across sequential time windows', () => {
      const t1 = computeWindowToken(sessionId, baseCode, 100);
      const t2 = computeWindowToken(sessionId, baseCode, 101);
      expect(t1).not.toBe(t2);
    });

    it('generates different tokens for different session IDs', () => {
      const otherSession = 'e7c22394-b224-4f9e-97c7-c5980e1c2b22';
      const t1 = computeWindowToken(sessionId, baseCode, 100);
      const t2 = computeWindowToken(otherSession, baseCode, 100);
      expect(t1).not.toBe(t2);
    });
  });

  describe('getWindowIndex and getWindowProgress', () => {
    it('computes correct window index based on 20s interval', () => {
      const timestamp1 = 60000; // 60s -> window 3 (60/20)
      expect(getWindowIndex(timestamp1, 20)).toBe(3);

      const timestamp2 = 79999; // 79.99s -> still window 3
      expect(getWindowIndex(timestamp2, 20)).toBe(3);

      const timestamp3 = 80000; // 80s -> window 4
      expect(getWindowIndex(timestamp3, 20)).toBe(4);
    });

    it('computes remaining seconds and progress in current window', () => {
      const timestamp = 25000; // 25s: in window 1 (20-40s), 5s elapsed, 15s remaining
      const prog = getWindowProgress(timestamp, 20);
      expect(prog.remainingSeconds).toBe(15);
      expect(prog.progress).toBeCloseTo(0.75, 2);
    });
  });

  describe('generateDynamicQrString & validateScannedQr', () => {
    it('generates valid JSON payload that passes validation within current window', () => {
      const now = 100000;
      const { qrString } = generateDynamicQrString(sessionId, baseCode, now, 20);

      const result = validateScannedQr(qrString, sessionId, now, 20);
      expect(result.isValid).toBe(true);
      expect(result.isDynamic).toBe(true);
      expect(result.code).toBe(baseCode);
    });

    it('accepts scan within the 1-window grace period (e.g. 15s delay)', () => {
      const generatedAt = 100000; // window 5 (100/20 = 5)
      const { qrString } = generateDynamicQrString(sessionId, baseCode, generatedAt, 20);

      // Student scans at 122000 (window 6: 122/20 = 6, delta = 1 window)
      const scannedAt = 122000;
      const result = validateScannedQr(qrString, sessionId, scannedAt, 20);
      expect(result.isValid).toBe(true);
      expect(result.code).toBe(baseCode);
    });

    it('rejects scan when window has expired (e.g. photo shared 2 minutes ago)', () => {
      const generatedAt = 100000; // window 5
      const { qrString } = generateDynamicQrString(sessionId, baseCode, generatedAt, 20);

      // Student scans 60 seconds later (window 8, delta = 3 windows)
      const scannedAt = 160000;
      const result = validateScannedQr(qrString, sessionId, scannedAt, 20);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('QR code expired');
    });

    it('rejects token when session ID does not match expected session', () => {
      const now = 100000;
      const { qrString } = generateDynamicQrString(sessionId, baseCode, now, 20);

      const wrongSessionId = '00000000-0000-0000-0000-000000000000';
      const result = validateScannedQr(qrString, wrongSessionId, now, 20);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('different lecture session');
    });

    it('rejects forged token inside payload', () => {
      const now = 100000;
      const { payload } = generateDynamicQrString(sessionId, baseCode, now, 20);
      payload.t = 'HACK99'; // Tampered token

      const result = validateScannedQr(JSON.stringify(payload), sessionId, now, 20);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Forged or invalid QR security token');
    });

    it('accepts plain static 5-character attendance code as legacy fallback', () => {
      const result = validateScannedQr('ABC12');
      expect(result.isValid).toBe(true);
      expect(result.isDynamic).toBe(false);
      expect(result.code).toBe('ABC12');
    });
  });
});
