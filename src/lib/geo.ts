import * as Location from 'expo-location';

export const DEFAULT_GEOFENCE_RADIUS_METERS = 50;
export const MAX_ACCEPTABLE_ACCURACY_METERS = 60;

/**
 * Calculates the great-circle distance between two GPS coordinates using the Haversine formula.
 * @returns Distance in meters.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Mean Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Requests high-accuracy current location for attendance validation.
 * Uses a robust timeout and fallback to cached GPS/network coordinates
 * to ensure reliability inside concrete university buildings.
 */
export async function getCurrentAttendanceLocation(): Promise<{
  coords: { latitude: number; longitude: number; accuracy: number | null } | null;
  error: string | null;
}> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return {
        coords: null,
        error: 'Location permission is required to verify you are present in the lecture hall.',
      };
    }

    const isEnabled = await Location.hasServicesEnabledAsync();
    if (!isEnabled) {
      return {
        coords: null,
        error: 'Please enable GPS / Location Services on your device to mark attendance.',
      };
    }

    let location: Location.LocationObject | null = null;

    // 1. Fast-path: If the device already has a position cached within the last 5 minutes, use it immediately
    try {
      const cached = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
      if (cached?.coords) {
        location = cached;
      }
    } catch {
      // Ignore cache lookup errors
    }

    // 2. Fresh position: Balanced accuracy acquires Wi-Fi/cellular & GPS quickly indoors
    if (!location) {
      try {
        const locationPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: true,
        });
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('GPS timeout')), 4000)
        );

        location = await Promise.race([locationPromise, timeoutPromise]);
      } catch {
        // Fallback A: Use any OS-cached position (even if older than 5 mins)
        try {
          location = await Location.getLastKnownPositionAsync({});
        } catch {
          // Ignore fallback error
        }

        // Fallback B: Coarse/Lowest cellular positioning as last resort
        if (!location) {
          try {
            const coarsePromise = Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Lowest,
            });
            const coarseTimeout = new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Coarse timeout')), 2500)
            );
            location = await Promise.race([coarsePromise, coarseTimeout]);
          } catch {
            // Ignore
          }
        }
      }
    }

    if (!location) {
      return {
        coords: null,
        error: 'Unable to retrieve your GPS coordinates. Please ensure Location is enabled with High Accuracy.',
      };
    }

    // Anti-Spoofing: Reject mock / simulated GPS locations (Android Fake GPS / Mock Location apps)
    if ((location as any).mocked === true) {
      return {
        coords: null,
        error: 'Mock or simulated GPS location detected. Please disable location spoofing applications to mark attendance.',
      };
    }

    // Accuracy Gating: Reject readings with high uncertainty (e.g. coarse cellular fallback > 60m)
    const accuracy = location.coords.accuracy;
    if (accuracy != null && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
      return {
        coords: null,
        error: `GPS signal is too imprecise (reported accuracy: ±${Math.round(accuracy)}m; maximum allowed: ±${MAX_ACCEPTABLE_ACCURACY_METERS}m). Please move closer to a window or open area and retry.`,
      };
    }

    return {
      coords: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      },
      error: null,
    };
  } catch (err: any) {
    console.error('Error acquiring GPS location:', err);
    return {
      coords: null,
      error: 'Unable to retrieve your current GPS coordinates. Please check your signal and try again.',
    };
  }
}

/**
 * Validates whether the student's location falls within the lecture hall geofence boundary.
 * Also accounts for reported GPS uncertainty margin.
 */
export function validateGeofenceProximity(
  studentLat: number,
  studentLon: number,
  sessionLat?: number | null,
  sessionLon?: number | null,
  allowedRadius = DEFAULT_GEOFENCE_RADIUS_METERS,
  studentAccuracy?: number | null
): {
  isWithin: boolean;
  distance: number;
  accuracy: number | null;
  message: string;
} {
  // If session coordinates were not set (e.g. online/remote lecture), allow check-in
  if (sessionLat == null || sessionLon == null) {
    return {
      isWithin: true,
      distance: 0,
      accuracy: studentAccuracy ?? null,
      message: 'No geofence restriction set for this session.',
    };
  }

  const distance = calculateHaversineDistance(studentLat, studentLon, sessionLat, sessionLon);
  const rounded = Math.round(distance);
  const roundedAcc = studentAccuracy != null ? Math.round(studentAccuracy) : null;
  const accSuffix = roundedAcc != null ? ` (accuracy: ±${roundedAcc}m)` : '';

  if (distance <= allowedRadius) {
    return {
      isWithin: true,
      distance: rounded,
      accuracy: roundedAcc,
      message: `Location verified within classroom (${rounded}m from lecturer)${accSuffix}.`,
    };
  }

  return {
    isWithin: false,
    distance: rounded,
    accuracy: roundedAcc,
    message: `Geofence check failed: You are ${rounded}m away from the lecture hall (Maximum allowed: ${allowedRadius}m)${accSuffix}.`,
  };
}

