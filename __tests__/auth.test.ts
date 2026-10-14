import { isAllowedDomain, ALLOWED_EMAIL_DOMAIN, formatFriendlyAuthError } from '../src/lib/auth';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn((dict) => dict.ios),
  },
}));

jest.mock('../src/lib/neon', () => ({
  db: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

describe('auth.ts unit tests', () => {
  describe('isAllowedDomain', () => {
    it('verifies ALLOWED_EMAIL_DOMAIN is run.edu.ng', () => {
      expect(ALLOWED_EMAIL_DOMAIN).toBe('run.edu.ng');
    });

    it('approves legitimate student email addresses with @run.edu.ng', () => {
      expect(isAllowedDomain('john.doe@run.edu.ng')).toBe(true);
      expect(isAllowedDomain('student123@run.edu.ng')).toBe(true);
      expect(isAllowedDomain('adebayo.m@run.edu.ng')).toBe(true);
    });

    it('approves emails with subdomains (e.g. departmental or postgraduate)', () => {
      expect(isAllowedDomain('student@student.run.edu.ng')).toBe(true);
      expect(isAllowedDomain('researcher@pg.run.edu.ng')).toBe(true);
      expect(isAllowedDomain('lecturer@fms.run.edu.ng')).toBe(true);
    });

    it('normalizes case and leading/trailing whitespace before validation', () => {
      expect(isAllowedDomain('  student@RUN.EDU.NG  ')).toBe(true);
      expect(isAllowedDomain('STUDENT@Run.Edu.Ng')).toBe(true);
    });

    it('rejects general public email providers', () => {
      expect(isAllowedDomain('student@gmail.com')).toBe(false);
      expect(isAllowedDomain('student@yahoo.com')).toBe(false);
      expect(isAllowedDomain('student@outlook.com')).toBe(false);
      expect(isAllowedDomain('student@icloud.com')).toBe(false);
    });

    it('rejects domain spoofing and lookalike phishing attempts', () => {
      expect(isAllowedDomain('student@evilrun.edu.ng')).toBe(false);
      expect(isAllowedDomain('student@run.edu.ng.attacker.com')).toBe(false);
      expect(isAllowedDomain('student@fake-run.edu.ng.com')).toBe(false);
      expect(isAllowedDomain('student@run.edu.com')).toBe(false);
    });

    it('rejects falsy, empty, or non-string inputs safely without throwing', () => {
      expect(isAllowedDomain('')).toBe(false);
      expect(isAllowedDomain('   ')).toBe(false);
      expect(isAllowedDomain(null)).toBe(false);
      expect(isAllowedDomain(undefined)).toBe(false);
      expect(isAllowedDomain(12345 as any)).toBe(false);
      expect(isAllowedDomain({} as any)).toBe(false);
    });
  });

  describe('formatFriendlyAuthError', () => {
    it('returns default fallback message when error is falsy', () => {
      expect(formatFriendlyAuthError(null)).toBe('An unexpected error occurred. Please try again.');
      expect(formatFriendlyAuthError(undefined)).toBe('An unexpected error occurred. Please try again.');
    });

    it('translates network, DNS, and Neon connectivity errors into user-friendly message', () => {
      const friendlyNetMsg = 'No internet connection. Please connect to the internet and try again.';
      expect(formatFriendlyAuthError('Network request failed')).toBe(friendlyNetMsg);
      expect(formatFriendlyAuthError({ message: 'getaddrinfo ENOTFOUND ep-broad-fire.neon.tech' })).toBe(friendlyNetMsg);
      expect(formatFriendlyAuthError('Failed to fetch from neon database')).toBe(friendlyNetMsg);
      expect(formatFriendlyAuthError('ERR_INTERNET_DISCONNECTED')).toBe(friendlyNetMsg);
    });

    it('translates invalid credential errors cleanly', () => {
      expect(formatFriendlyAuthError('Invalid email or password')).toBe('Invalid email, matric number, or password.');
      expect(formatFriendlyAuthError({ error: 'invalid credentials provided' })).toBe('Invalid email, matric number, or password.');
    });

    it('preserves clean domain-specific error messages intact', () => {
      const domainErr = 'Only institutional email addresses ending in @run.edu.ng are permitted.';
      expect(formatFriendlyAuthError(domainErr)).toBe(domainErr);
    });
  });
});
