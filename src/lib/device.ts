import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const DEVICE_STORAGE_KEY = 'smartattend_device_hardware_id';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
}

/**
 * Retrieves a persistent cryptographic UUID for this physical device.
 * Generated once and persisted in hardware SecureStore (or localStorage on web).
 */
export async function getDeviceFingerprint(): Promise<DeviceInfo> {
  let deviceId: string | null = null;

  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        deviceId = window.localStorage.getItem(DEVICE_STORAGE_KEY);
        if (!deviceId) {
          deviceId = Crypto.randomUUID();
          window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
        }
      }
    } else {
      deviceId = await SecureStore.getItemAsync(DEVICE_STORAGE_KEY);
      if (!deviceId) {
        deviceId = Crypto.randomUUID();
        await SecureStore.setItemAsync(DEVICE_STORAGE_KEY, deviceId);
      }
    }
  } catch {
    // Fallback if SecureStore has temporary issue
    deviceId = Crypto.randomUUID();
  }

  // Construct a clean, human-readable device name for lecturer audits
  let deviceName = 'Mobile Device';
  try {
    const brand = Device.brand ? Device.brand.trim() : '';
    const model = Device.modelName ? Device.modelName.trim() : '';
    const os = Device.osName ? `${Device.osName} ${Device.osVersion || ''}`.trim() : '';

    if (model) {
      deviceName = brand && !model.toLowerCase().includes(brand.toLowerCase())
        ? `${brand} ${model}`
        : model;
    } else if (Device.deviceName) {
      deviceName = Device.deviceName;
    } else if (os) {
      deviceName = os;
    } else {
      deviceName = Platform.OS === 'ios' ? 'Apple iPhone' : 'Android Device';
    }
  } catch {
    deviceName = Platform.OS === 'ios' ? 'Apple Device' : 'Android Device';
  }

  return {
    deviceId: deviceId || 'unknown-device',
    deviceName,
  };
}
