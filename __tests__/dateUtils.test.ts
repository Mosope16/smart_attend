import {
  parseSafeDate,
  formatTime,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatDDMMYYYY,
} from '../src/lib/dateUtils';

describe('dateUtils.ts unit tests', () => {
  describe('parseSafeDate', () => {
    it('returns a valid Date for null, undefined, or empty string', () => {
      expect(parseSafeDate(null)).toBeInstanceOf(Date);
      expect(parseSafeDate(undefined)).toBeInstanceOf(Date);
      expect(parseSafeDate('')).toBeInstanceOf(Date);
    });

    it('returns the Date object unchanged if valid Date is passed', () => {
      const d = new Date(2026, 8, 24, 10, 30);
      expect(parseSafeDate(d)).toBe(d);
    });

    it('returns a new valid Date if an invalid Date object is passed', () => {
      const invalid = new Date('invalid date string');
      const res = parseSafeDate(invalid);
      expect(isNaN(res.getTime())).toBe(false);
    });

    it('handles numeric timestamps (epoch ms)', () => {
      const ts = 1700000000000;
      const res = parseSafeDate(ts);
      expect(res.getTime()).toBe(ts);
    });

    it('converts Postgres timestamp format with space into valid Date', () => {
      const pgTimestamp = '2026-09-24 15:30:00+00';
      const res = parseSafeDate(pgTimestamp);
      expect(isNaN(res.getTime())).toBe(false);
      expect(res.getUTCFullYear()).toBe(2026);
      expect(res.getUTCMonth()).toBe(8); // September is month 8 (0-indexed)
      expect(res.getUTCDate()).toBe(24);
    });

    it('handles ISO strings normally', () => {
      const iso = '2026-06-15T08:00:00.000Z';
      const res = parseSafeDate(iso);
      expect(res.toISOString()).toBe(iso);
    });

    it('handles completely malformed string gracefully without throwing', () => {
      const res = parseSafeDate('gibberish string');
      expect(res).toBeInstanceOf(Date);
      expect(isNaN(res.getTime())).toBe(false);
    });
  });

  describe('formatTime', () => {
    it('formats 24-hour hour into 12-hour AM/PM format', () => {
      const morning = new Date(2026, 0, 1, 9, 5);
      expect(formatTime(morning)).toBe('09:05 AM');

      const afternoon = new Date(2026, 0, 1, 14, 30);
      expect(formatTime(afternoon)).toBe('02:30 PM');

      const midnight = new Date(2026, 0, 1, 0, 0);
      expect(formatTime(midnight)).toBe('12:00 AM');

      const noon = new Date(2026, 0, 1, 12, 45);
      expect(formatTime(noon)).toBe('12:45 PM');
    });
  });

  describe('formatDate', () => {
    it('formats date with day and month by default', () => {
      // 2026-09-24 is a Thursday
      const d = new Date(2026, 8, 24);
      const str = formatDate(d);
      expect(str).toContain('24 Sep');
      expect(str).toContain('Thu');
    });

    it('formats date with year when option is enabled', () => {
      const d = new Date(2026, 8, 24);
      const str = formatDate(d, { showDay: false, showYear: true });
      expect(str).toBe('24 Sep 2026');
    });
  });

  describe('formatDateTime', () => {
    it('combines formatted date and formatted time with bullet separator', () => {
      const d = new Date(2026, 8, 24, 16, 15);
      const str = formatDateTime(d);
      expect(str).toContain('24 Sep');
      expect(str).toContain('04:15 PM');
      expect(str).toContain('·');
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "Just now" for dates within 45 seconds', () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe('Just now');
    });

    it('returns "X mins ago" for dates within an hour', () => {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      expect(formatRelativeTime(tenMinsAgo)).toBe('10 mins ago');

      const oneMinAgo = new Date(Date.now() - 65 * 1000);
      expect(formatRelativeTime(oneMinAgo)).toBe('1 min ago');
    });

    it('returns "X hrs ago" for dates within a day', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
      expect(formatRelativeTime(threeHoursAgo)).toBe('3 hrs ago');
    });

    it('returns "Yesterday" for dates between 24 and 48 hours ago', () => {
      const yesterday = new Date(Date.now() - 30 * 3600 * 1000);
      expect(formatRelativeTime(yesterday)).toBe('Yesterday');
    });

    it('returns "X days ago" for dates within 30 days', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 86400 * 1000);
      expect(formatRelativeTime(fiveDaysAgo)).toBe('5 days ago');
    });

    it('falls back to formatted date with year for dates older than 30 days', () => {
      const lastYear = new Date(2024, 0, 15);
      const str = formatRelativeTime(lastYear);
      expect(str).toBe('15 Jan 2024');
    });
  });

  describe('formatDDMMYYYY', () => {
    it('formats date strictly with leading zeros as DD/MM/YYYY', () => {
      const d = new Date(2026, 1, 5); // Feb 5, 2026
      expect(formatDDMMYYYY(d)).toBe('05/02/2026');

      const d2 = new Date(2026, 11, 25); // Dec 25, 2026
      expect(formatDDMMYYYY(d2)).toBe('25/12/2026');
    });
  });
});
