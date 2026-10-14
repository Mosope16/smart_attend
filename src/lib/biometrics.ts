import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BIOMETRIC_ENABLED_KEY = 'smartattend_biometric_enabled';
const BIOMETRIC_SAVED_USER_KEY = 'smartattend_saved_biometric_user';

export type BiometricType = 'fingerprint' | 'facial' | 'iris' | 'biometric' | 'none';

export interface BiometricCapabilities {
  hasHardware: boolean;
  isEnrolled: boolean;
  isAvailable: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  biometricType: BiometricType;
  biometricLabel: string;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  notAvailable?: boolean;
}

export interface SavedBiometricUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'lecturer';
  matric_number?: string | null;
  staff_id?: string | null;
}

/**
 * Checks the hardware and enrollment status of the device's biometric sensors (Fingerprint, Face ID, Iris).
 */
export async function getBiometricCapabilities(): Promise<BiometricCapabilities> {
  if (Platform.OS === 'web') {
    return {
      hasHardware: false,
      isEnrolled: false,
      isAvailable: false,
      supportedTypes: [],
      biometricType: 'none',
      biometricLabel: 'Biometrics unavailable on web',
    };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return {
        hasHardware: false,
        isEnrolled: false,
        isAvailable: false,
        supportedTypes: [],
        biometricType: 'none',
        biometricLabel: 'No biometric hardware',
      };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometricType: BiometricType = 'none';
    let biometricLabel = 'Fingerprint / Biometrics';

    const hasFingerprint = supportedTypes.includes(
      LocalAuthentication.AuthenticationType.FINGERPRINT
    );
    const hasFacial = supportedTypes.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
    );
    const hasIris = supportedTypes.includes(
      LocalAuthentication.AuthenticationType.IRIS
    );

    if (hasFingerprint) {
      biometricType = 'fingerprint';
      biometricLabel = Platform.OS === 'ios' ? 'Touch ID / Fingerprint' : 'Fingerprint Sensor';
    } else if (hasFacial) {
      biometricType = 'facial';
      biometricLabel = Platform.OS === 'ios' ? 'Face ID' : 'Facial Recognition';
    } else if (hasIris) {
      biometricType = 'iris';
      biometricLabel = 'Iris Scanner';
    } else if (hasHardware) {
      biometricType = 'biometric';
      biometricLabel = 'Biometric Authentication';
    }

    return {
      hasHardware,
      isEnrolled,
      isAvailable: hasHardware && isEnrolled,
      supportedTypes,
      biometricType,
      biometricLabel,
    };
  } catch (err) {
    console.warn('Error reading biometric capabilities:', err);
    return {
      hasHardware: false,
      isEnrolled: false,
      isAvailable: false,
      supportedTypes: [],
      biometricType: 'none',
      biometricLabel: 'Unavailable',
    };
  }
}

/**
 * Determines if biometric verification is enabled in app settings.
 * Defaults to true if the physical hardware has enrolled biometrics, unless explicitly turned off.
 */
export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const pref = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    if (pref !== null) {
      return pref === 'true';
    }
    // Default to true if device supports biometrics
    const caps = await getBiometricCapabilities();
    return caps.isAvailable;
  } catch {
    return false;
  }
}

/**
 * Persists the user's preference for biometric authentication.
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('Failed to save biometric preference:', err);
  }
}

/**
 * Performs biometric authentication (Fingerprint / Face ID) with native system prompt.
 */
export async function authenticateWithBiometrics(options?: {
  promptMessage?: string;
  cancelLabel?: string;
  fallbackLabel?: string;
  disableDeviceFallback?: boolean;
}): Promise<BiometricAuthResult> {
  if (Platform.OS === 'web') {
    return { success: true, notAvailable: true };
  }

  try {
    const caps = await getBiometricCapabilities();

    // If hardware is not enrolled, do not block users permanently
    if (!caps.hasHardware || !caps.isEnrolled) {
      return {
        success: true,
        notAvailable: true,
        error: 'Biometric hardware or enrolled fingerprint not found on this device.',
      };
    }

    const promptMessage =
      options?.promptMessage ||
      (caps.biometricType === 'facial'
        ? 'Verify your face to confirm attendance'
        : 'Touch the fingerprint sensor to verify attendance');

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: options?.cancelLabel || 'Cancel',
      fallbackLabel: options?.fallbackLabel || 'Use Passcode',
      disableDeviceFallback: options?.disableDeviceFallback ?? false,
    });

    if (result.success) {
      return { success: true };
    }

    if (result.error === 'user_cancel' || result.error === 'app_cancel' || result.error === 'system_cancel') {
      return {
        success: false,
        cancelled: true,
        error: 'Biometric verification cancelled.',
      };
    }

    if (result.error === 'lockout') {
      return {
        success: false,
        error: 'Biometrics locked due to too many failed attempts. Unlock your phone to continue.',
      };
    }

    return {
      success: false,
      error: 'Fingerprint / biometric verification failed. Please try again.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Biometric authentication encountered an error.',
    };
  }
}

/**
 * Stores the verified user profile for Quick Biometric Sign-In.
 */
export async function saveBiometricUser(user: SavedBiometricUser): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(BIOMETRIC_SAVED_USER_KEY, JSON.stringify(user));
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
  } catch (err) {
    console.warn('Failed to save biometric user:', err);
  }
}

/**
 * Retrieves the saved user profile for Quick Biometric Sign-In.
 */
export async function getSavedBiometricUser(): Promise<SavedBiometricUser | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_SAVED_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedBiometricUser;
  } catch {
    return null;
  }
}

/**
 * Clears the saved biometric user session on sign out.
 */
export async function clearBiometricUser(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_SAVED_USER_KEY);
  } catch {}
}
