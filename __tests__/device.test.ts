import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const mockDeviceState = {
  brand: 'Samsung' as string | null,
  modelName: 'Galaxy S21' as string | null,
  osName: 'Android' as string | null,
  osVersion: '14' as string | null,
  deviceName: 'Samsung Galaxy S21' as string | null,
};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
}));

jest.mock('expo-device', () => ({
  get brand() {
    return mockDeviceState.brand;
  },
  get modelName() {
    return mockDeviceState.modelName;
  },
  get osName() {
    return mockDeviceState.osName;
  },
  get osVersion() {
    return mockDeviceState.osVersion;
  },
  get deviceName() {
    return mockDeviceState.deviceName;
  },
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

import { getDeviceFingerprint } from '../src/lib/device';

describe('device.ts unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
    mockDeviceState.brand = 'Samsung';
    mockDeviceState.modelName = 'Galaxy S21';
    mockDeviceState.osName = 'Android';
    mockDeviceState.osVersion = '14';
    mockDeviceState.deviceName = 'Samsung Galaxy S21';
  });

  it('retrieves existing deviceId from SecureStore on mobile without generating new UUID', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('stored-uuid-12345');

    const info = await getDeviceFingerprint();

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('smartattend_device_hardware_id');
    expect(Crypto.randomUUID).not.toHaveBeenCalled();
    expect(info.deviceId).toBe('stored-uuid-12345');
    expect(info.deviceName).toBe('Samsung Galaxy S21');
  });

  it('generates and persists new cryptographic UUID when SecureStore is empty', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    (Crypto.randomUUID as jest.Mock).mockReturnValueOnce('generated-uuid-67890');

    const info = await getDeviceFingerprint();

    expect(Crypto.randomUUID).toHaveBeenCalled();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('smartattend_device_hardware_id', 'generated-uuid-67890');
    expect(info.deviceId).toBe('generated-uuid-67890');
  });

  it('handles SecureStore errors gracefully with fallback UUID', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('SecureStore Keystore error'));
    (Crypto.randomUUID as jest.Mock).mockReturnValueOnce('fallback-uuid-99999');

    const info = await getDeviceFingerprint();

    expect(info.deviceId).toBe('fallback-uuid-99999');
  });

  it('formats deviceName as "Brand Model" when model does not already contain brand', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('dummy-id');
    mockDeviceState.brand = 'Google';
    mockDeviceState.modelName = 'Pixel 7 Pro';

    const info = await getDeviceFingerprint();
    expect(info.deviceName).toBe('Google Pixel 7 Pro');
  });

  it('does not duplicate brand name if modelName already contains brand', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('dummy-id');
    mockDeviceState.brand = 'Samsung';
    mockDeviceState.modelName = 'Samsung Galaxy Note 20';

    const info = await getDeviceFingerprint();
    expect(info.deviceName).toBe('Samsung Galaxy Note 20');
  });

  it('falls back to OS or platform default when device model is unavailable', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('dummy-id');
    mockDeviceState.brand = null;
    mockDeviceState.modelName = null;
    mockDeviceState.deviceName = null;
    mockDeviceState.osName = 'iOS';
    mockDeviceState.osVersion = '17.2';
    (Platform as any).OS = 'ios';

    const info = await getDeviceFingerprint();
    expect(info.deviceName).toBe('iOS 17.2');
  });

  it('handles Web environment using localStorage', async () => {
    (Platform as any).OS = 'web';
    const mockLocalStorage: Record<string, string> = {};
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: {
          getItem: jest.fn((k: string) => mockLocalStorage[k] || null),
          setItem: jest.fn((k: string, v: string) => {
            mockLocalStorage[k] = v;
          }),
        },
      },
      writable: true,
      configurable: true,
    });

    (Crypto.randomUUID as jest.Mock).mockReturnValueOnce('web-uuid-11111');

    const info = await getDeviceFingerprint();
    expect(info.deviceId).toBe('web-uuid-11111');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('smartattend_device_hardware_id', 'web-uuid-11111');
  });
});
