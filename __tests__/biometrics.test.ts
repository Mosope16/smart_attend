import {
  getBiometricCapabilities,
  authenticateWithBiometrics,
  isBiometricEnabled,
  setBiometricEnabled,
  saveBiometricUser,
  getSavedBiometricUser,
  clearBiometricUser,
  SavedBiometricUser,
} from '../src/lib/biometrics';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, val: string) => store.set(key, val)),
    deleteItemAsync: jest.fn(async (key: string) => store.delete(key)),
    _store: store,
  };
});

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

describe('biometrics.ts unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore as any)._store?.clear();
    Platform.OS = 'android';
  });

  describe('getBiometricCapabilities', () => {
    it('returns unavailable on web platform', async () => {
      Platform.OS = 'web';
      const caps = await getBiometricCapabilities();
      expect(caps.hasHardware).toBe(false);
      expect(caps.isAvailable).toBe(false);
      expect(caps.biometricType).toBe('none');
      expect(caps.biometricLabel).toContain('web');
    });

    it('returns no hardware status when device lacks biometric sensors', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);

      const caps = await getBiometricCapabilities();
      expect(caps.hasHardware).toBe(false);
      expect(caps.isEnrolled).toBe(false);
      expect(caps.isAvailable).toBe(false);
      expect(caps.biometricType).toBe('none');
      expect(caps.biometricLabel).toBe('No biometric hardware');
    });

    it('identifies fingerprint sensor when fingerprint auth is supported on Android', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);

      const caps = await getBiometricCapabilities();
      expect(caps.hasHardware).toBe(true);
      expect(caps.isEnrolled).toBe(true);
      expect(caps.isAvailable).toBe(true);
      expect(caps.biometricType).toBe('fingerprint');
      expect(caps.biometricLabel).toBe('Fingerprint Sensor');
    });

    it('identifies Face ID when facial recognition is supported on iOS', async () => {
      Platform.OS = 'ios';
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);

      const caps = await getBiometricCapabilities();
      expect(caps.hasHardware).toBe(true);
      expect(caps.isAvailable).toBe(true);
      expect(caps.biometricType).toBe('facial');
      expect(caps.biometricLabel).toBe('Face ID');
    });

    it('identifies Iris Scanner when iris recognition is supported', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.IRIS,
      ]);

      const caps = await getBiometricCapabilities();
      expect(caps.hasHardware).toBe(true);
      expect(caps.isAvailable).toBe(true);
      expect(caps.biometricType).toBe('iris');
      expect(caps.biometricLabel).toBe('Iris Scanner');
    });

    it('marks isAvailable as false if hardware exists but user has not enrolled fingerprints/face', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);

      const caps = await getBiometricCapabilities();
      expect(caps.hasHardware).toBe(true);
      expect(caps.isEnrolled).toBe(false);
      expect(caps.isAvailable).toBe(false);
    });
  });

  describe('authenticateWithBiometrics', () => {
    it('returns notAvailable fallback when device has no hardware or biometrics are not enrolled', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);

      const res = await authenticateWithBiometrics({ promptMessage: 'Verify Identity' });
      expect(res.success).toBe(true);
      expect(res.notAvailable).toBe(true);
      expect(res.error).toContain('not found');
    });

    it('returns success: true when biometric authentication succeeds', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      const res = await authenticateWithBiometrics({ promptMessage: 'Verify Attendance' });
      expect(res.success).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('handles user cancellation gracefully', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: 'user_cancel',
      });

      const res = await authenticateWithBiometrics({ promptMessage: 'Verify Attendance' });
      expect(res.success).toBe(false);
      expect(res.cancelled).toBe(true);
      expect(res.error).toContain('cancelled');
    });

    it('handles lockout error gracefully', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: 'lockout',
      });

      const res = await authenticateWithBiometrics();
      expect(res.success).toBe(false);
      expect(res.error).toContain('locked');
    });
  });

  describe('biometric secure storage and user management', () => {
    const mockUser: SavedBiometricUser = {
      id: 'student-uuid-123',
      email: 'student@run.edu.ng',
      name: 'Adewale Johnson',
      role: 'student',
      matric_number: 'RUN/CMP/22/1001',
    };

    it('saves biometric user, updates preference, and retrieves stored biometric user correctly', async () => {
      expect(await getSavedBiometricUser()).toBeNull();

      await saveBiometricUser(mockUser);

      expect(await isBiometricEnabled()).toBe(true);
      const saved = await getSavedBiometricUser();
      expect(saved).toEqual(mockUser);
    });

    it('allows toggling biometric preference explicitly', async () => {
      await setBiometricEnabled(false);
      expect(await isBiometricEnabled()).toBe(false);

      await setBiometricEnabled(true);
      expect(await isBiometricEnabled()).toBe(true);
    });

    it('clears biometric user and removes saved profile from storage', async () => {
      await saveBiometricUser(mockUser);
      expect(await getSavedBiometricUser()).not.toBeNull();

      await clearBiometricUser();
      expect(await getSavedBiometricUser()).toBeNull();
    });
  });
});
