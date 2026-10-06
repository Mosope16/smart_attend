import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const NOTIF_PERMISSION_PROMPTED_KEY = '@notif_permission_prompted';
const NOTIFIED_SESSIONS_KEY = '@notified_session_ids';

/**
 * Detect whether the app is executing inside Expo Go
 */
export const isExpoGo: boolean =
  isRunningInExpoGo() ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo';

/**
 * Expo SDK 53 removed Android remote notifications from Expo Go.
 * We disable native push registration in this specific environment
 * to prevent crashes while preserving full functionality in Dev/Production builds.
 */
export const isExpoGoAndroid: boolean = isExpoGo && Platform.OS === 'android';

// Safely resolve expo-notifications without triggering Expo Go Android module-level crash
let Notifications: typeof import('expo-notifications') | null = null;
if (!isExpoGoAndroid) {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    console.warn('[Notifications] Could not load expo-notifications module:', e);
  }
}

// Configure notification behavior when app is in foreground (Dev Builds / iOS / Non-ExpoGo)
if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Initialize notification channels on Android
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android' && Notifications && typeof Notifications.setNotificationChannelAsync === 'function') {
    try {
      await Notifications.setNotificationChannelAsync('course-attendance', {
        name: 'Course Attendance Alerts',
        description: 'Instant alerts when attendance sessions open for your enrolled courses',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#16A34A',
        enableLights: true,
        enableVibrate: true,
      });

      await Notifications.setNotificationChannelAsync('course-enrollment', {
        name: 'Course Enrollments',
        description: 'Updates when you enroll in new courses',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#16A34A',
      });
    } catch (e) {
      console.warn('Failed to configure Android notification channels:', e);
    }
  }
}

/**
 * Check the current push notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
  status: any;
}> {
  if (isExpoGoAndroid || !Notifications || typeof Notifications.getPermissionsAsync !== 'function') {
    return {
      granted: false,
      canAskAgain: false,
      status: 'undetermined',
    };
  }

  try {
    const settings = await Notifications.getPermissionsAsync();
    return {
      granted: settings.granted || settings.status === Notifications.PermissionStatus.GRANTED,
      canAskAgain: settings.canAskAgain,
      status: settings.status,
    };
  } catch (e) {
    console.warn('Error reading notification permissions:', e);
    return {
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
    };
  }
}

/**
 * Request notification permissions from the OS
 */
export async function requestNotificationAccess(): Promise<boolean> {
  if (isExpoGoAndroid) {
    Alert.alert(
      'Expo Go Environment Notice',
      'Push notifications on Android require a Development Build or Preview APK (EAS Build) starting from Expo SDK 53.\n\nAll core app features, geofencing, QR codes, and attendance tracking are fully functional.',
      [{ text: 'Understood' }]
    );
    await AsyncStorage.setItem(NOTIF_PERMISSION_PROMPTED_KEY, 'true');
    return false;
  }

  if (!Notifications || typeof Notifications.requestPermissionsAsync !== 'function') {
    return false;
  }

  try {
    await setupNotificationChannels();
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    const isGranted = status === Notifications.PermissionStatus.GRANTED;
    await AsyncStorage.setItem(NOTIF_PERMISSION_PROMPTED_KEY, 'true');
    return isGranted;
  } catch (e) {
    console.warn('Error requesting notification permissions:', e);
    return false;
  }
}

/**
 * Prompt user to grant notification access if they haven't yet, explaining the value for enrolled courses
 */
export async function ensureNotificationAccessPrompt(courseCode?: string): Promise<boolean> {
  if (isExpoGoAndroid) {
    return false;
  }

  const current = await getNotificationPermissionStatus();
  if (current.granted) {
    return true;
  }

  return new Promise((resolve) => {
    const title = courseCode
      ? `Get Alerts for ${courseCode}`
      : 'Enable Course Notifications';

    const message = courseCode
      ? `Would you like to receive instant notifications whenever an attendance session opens for ${courseCode}?`
      : 'Never miss an attendance session! Enable notifications to receive instant alerts when your lecturers start taking attendance.';

    Alert.alert(
      title,
      message,
      [
        {
          text: 'Not Now',
          style: 'cancel',
          onPress: () => {
            AsyncStorage.setItem(NOTIF_PERMISSION_PROMPTED_KEY, 'true');
            resolve(false);
          },
        },
        {
          text: 'Allow Notifications',
          style: 'default',
          onPress: async () => {
            const granted = await requestNotificationAccess();
            if (!granted && !current.canAskAgain) {
              Alert.alert(
                'Permission Required',
                'Notification permission was previously denied. Please enable notifications in your device settings to get attendance alerts.',
                [{ text: 'OK' }]
              );
            }
            resolve(granted);
          },
        },
      ],
      { cancelable: true }
    );
  });
}

/**
 * Dispatches a local notification confirming course enrollment
 */
export async function notifyCourseEnrolled(courseCode: string, courseTitle?: string): Promise<void> {
  if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') return;

  try {
    const perm = await getNotificationPermissionStatus();
    if (!perm.granted) return;

    await setupNotificationChannels();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Enrolled in ${courseCode}`,
        body: courseTitle
          ? `${courseTitle} — You will receive alerts when attendance sessions open.`
          : `You will now receive notifications whenever attendance sessions are active for ${courseCode}.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { type: 'enrollment', courseCode },
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('Failed to schedule course enrollment notification:', e);
  }
}

/**
 * Dispatches a notification when an attendance session starts for an enrolled course
 */
export async function notifyAttendanceSessionActive(
  courseCode: string,
  sessionId: string,
  courseTitle?: string
): Promise<void> {
  if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') return;

  try {
    const perm = await getNotificationPermissionStatus();
    if (!perm.granted) return;

    // Prevent notifying repeatedly for the same session
    const stored = await AsyncStorage.getItem(NOTIFIED_SESSIONS_KEY);
    const notifiedSet = new Set<string>(stored ? JSON.parse(stored) : []);

    if (notifiedSet.has(sessionId)) {
      return;
    }

    notifiedSet.add(sessionId);
    await AsyncStorage.setItem(
      NOTIFIED_SESSIONS_KEY,
      JSON.stringify(Array.from(notifiedSet).slice(-50))
    );

    await setupNotificationChannels();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Attendance Active: ${courseCode}`,
        body: courseTitle
          ? `An attendance session has just opened for ${courseTitle}. Tap to mark your attendance!`
          : `An attendance session has just opened for ${courseCode}. Tap to mark your attendance!`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { type: 'session_active', courseCode, sessionId },
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('Failed to schedule session active notification:', e);
  }
}

/**
 * Safely subscribe to notification responses (banner tap)
 */
export function addNotificationResponseListener(callback: (response: any) => void): { remove: () => void } {
  if (Notifications && typeof Notifications.addNotificationResponseReceivedListener === 'function') {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }
  return { remove: () => {} };
}
