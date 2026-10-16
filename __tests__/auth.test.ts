import {
  isAllowedDomain,
  ALLOWED_EMAIL_DOMAIN,
  formatFriendlyAuthError,
  neonAuth,
} from '../src/lib/auth';
import * as SecureStore from 'expo-secure-store';
import { db } from '../src/lib/neon';

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
    from: jest.fn(),
  },
}));

describe('auth.ts unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  describe('neonAuth session and lifecycle', () => {
    const originalFetch = (globalThis as any).fetch;

    afterEach(() => {
      (globalThis as any).fetch = originalFetch;
    });

    it('getStoredSession returns null when storage is empty', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      const session = await neonAuth.getStoredSession();
      expect(session).toBeNull();
    });

    it('getStoredSession returns valid session when profile exists in db', async () => {
      const mockUser = { id: 'usr-123', email: 'student@run.edu.ng', name: 'John Doe', role: 'student' };
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
        if (key === 'attendance_neon_user') return Promise.resolve(JSON.stringify(mockUser));
        if (key === 'attendance_neon_token') return Promise.resolve('mock-jwt-token');
        if (key === 'attendance_neon_cookie') return Promise.resolve('mock-cookie');
        return Promise.resolve(null);
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'usr-123' }, error: null }),
      };
      (db.from as jest.Mock).mockReturnValue(mockQueryBuilder);

      const session = await neonAuth.getStoredSession();
      expect(session).not.toBeNull();
      expect(session?.user.id).toBe('usr-123');
      expect(session?.token).toBe('mock-jwt-token');
    });

    it('signUp enforces @run.edu.ng domain before sending HTTP request', async () => {
      const fetchMock = jest.fn();
      (globalThis as any).fetch = fetchMock;

      const res = await neonAuth.signUp({
        email: 'attacker@gmail.com',
        password: 'password123',
        name: 'Attacker',
        role: 'student',
      });

      expect(res.user).toBeNull();
      expect(res.error).toContain('run.edu.ng');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('signUp creates user profile and persists session upon success', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'usr-new-1', email: 'newstudent@run.edu.ng', name: 'New Student' },
          token: 'token-abc',
        }),
        headers: {
          get: jest.fn().mockReturnValue('cookie-xyz'),
        },
      });

      const mockInsertBuilder = {
        insert: jest.fn().mockResolvedValue({ error: null }),
      };
      (db.from as jest.Mock).mockReturnValue(mockInsertBuilder);

      const res = await neonAuth.signUp({
        email: 'newstudent@run.edu.ng',
        password: 'SecurePassword123',
        name: 'New Student',
        role: 'student',
        matricNumber: 'RUN/2021/045',
      });

      expect(res.error).toBeNull();
      expect(res.user?.id).toBe('usr-new-1');
      expect(res.user?.matric_number).toBe('RUN/2021/045');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('attendance_neon_user', expect.any(String));
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('attendance_neon_token', 'token-abc');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('attendance_neon_cookie', 'cookie-xyz');
    });

    it('signIn resolves matric number to student email before signing in', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: { email: 'matricuser@run.edu.ng' },
          error: null,
        }).mockResolvedValueOnce({
          data: {
            id: 'usr-matric',
            name: 'Matric Student',
            email: 'matricuser@run.edu.ng',
            role: 'student',
            matric_number: 'RUN/2021/999',
            department: 'Computer Science',
          },
          error: null,
        }),
      };
      (db.from as jest.Mock).mockReturnValue(mockQueryBuilder);

      (globalThis as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'usr-matric', email: 'matricuser@run.edu.ng' },
          token: 'matric-token',
        }),
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
      });

      const res = await neonAuth.signIn({
        identifier: 'RUN/2021/999',
        password: 'Password123!',
      });

      expect(res.error).toBeNull();
      expect(res.user?.email).toBe('matricuser@run.edu.ng');
      expect(res.user?.faculty).toBe('Faculty of Computing and Digital Technology');
    });

    it('signOut calls backend endpoint and wipes storage', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValueOnce({ ok: true });
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('test-token');

      await neonAuth.signOut();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('attendance_neon_user');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('attendance_neon_token');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('attendance_neon_cookie');
    });

    it('changePassword sends current and new passwords to neon auth endpoint', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('test-token');
      (globalThis as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const res = await neonAuth.changePassword({
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword123',
      });

      expect(res.success).toBe(true);
      expect(res.error).toBeNull();
    });
  });
});
