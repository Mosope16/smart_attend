import {
  calculateHaversineDistance,
  validateGeofenceProximity,
  getCurrentAttendanceLocation,
  DEFAULT_GEOFENCE_RADIUS_METERS,
} from '../src/lib/geo';
import * as Location from 'expo-location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: {
    Balanced: 3,
    Lowest: 1,
  },
}));

describe('geo.ts unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateHaversineDistance', () => {
    it('returns 0 for identical GPS points', () => {
      const lat = 7.1475;
      const lon = 4.4567;
      const distance = calculateHaversineDistance(lat, lon, lat, lon);
      expect(distance).toBe(0);
    });

    it('calculates approximately correct distance between known coordinates', () => {
      // Coordinates approx 111km apart (1 degree latitude change)
      const lat1 = 7.0;
      const lon1 = 4.0;
      const lat2 = 8.0;
      const lon2 = 4.0;
      const distance = calculateHaversineDistance(lat1, lon1, lat2, lon2);
      // 1 degree latitude is ~111,195 meters
      expect(distance).toBeGreaterThan(111000);
      expect(distance).toBeLessThan(112000);
    });

    it('calculates small distances in meters accurately (e.g. classroom size ~20m)', () => {
      const lat1 = 7.147500;
      const lon1 = 4.456700;
      // Slight delta (~0.00018 degrees lat is ~20 meters)
      const lat2 = 7.147680;
      const lon2 = 4.456700;
      const distance = calculateHaversineDistance(lat1, lon1, lat2, lon2);
      expect(distance).toBeGreaterThan(15);
      expect(distance).toBeLessThan(25);
    });

    it('handles negative coordinates correctly', () => {
      const lat1 = -33.8688;
      const lon1 = 151.2093;
      const lat2 = -33.8689;
      const lon2 = 151.2094;
      const distance = calculateHaversineDistance(lat1, lon1, lat2, lon2);
      expect(distance).toBeGreaterThan(0);
    });
  });

  describe('validateGeofenceProximity', () => {
    it('allows check-in if session coordinates are not set (remote/online session)', () => {
      const resultNull = validateGeofenceProximity(7.1475, 4.4567, null, null);
      expect(resultNull.isWithin).toBe(true);
      expect(resultNull.distance).toBe(0);
      expect(resultNull.message).toContain('No geofence restriction set');

      const resultUndefined = validateGeofenceProximity(7.1475, 4.4567, undefined, undefined);
      expect(resultUndefined.isWithin).toBe(true);
    });

    it('verifies location when student is inside the allowed radius', () => {
      const centerLat = 7.147500;
      const centerLon = 4.456700;
      // Student 10m away
      const studentLat = 7.147590;
      const studentLon = 4.456700;

      const result = validateGeofenceProximity(studentLat, studentLon, centerLat, centerLon, 50);
      expect(result.isWithin).toBe(true);
      expect(result.distance).toBeLessThanOrEqual(50);
      expect(result.message).toContain('Location verified within classroom');
    });

    it('fails verification when student is outside the allowed radius', () => {
      const centerLat = 7.147500;
      const centerLon = 4.456700;
      // Student ~200m away
      const studentLat = 7.149300;
      const studentLon = 4.456700;

      const result = validateGeofenceProximity(studentLat, studentLon, centerLat, centerLon, 50);
      expect(result.isWithin).toBe(false);
      expect(result.distance).toBeGreaterThan(50);
      expect(result.message).toContain('Geofence check failed');
      expect(result.message).toContain('Maximum allowed: 50m');
    });

    it('uses DEFAULT_GEOFENCE_RADIUS_METERS when radius is omitted', () => {
      expect(DEFAULT_GEOFENCE_RADIUS_METERS).toBe(50);
      const centerLat = 7.147500;
      const centerLon = 4.456700;
      const result = validateGeofenceProximity(centerLat, centerLon, centerLat, centerLon);
      expect(result.isWithin).toBe(true);
    });
  });

  describe('getCurrentAttendanceLocation', () => {
    it('returns error when foreground location permission is denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

      const res = await getCurrentAttendanceLocation();
      expect(res.coords).toBeNull();
      expect(res.error).toContain('Location permission is required');
    });

    it('returns error when device location services are disabled', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);

      const res = await getCurrentAttendanceLocation();
      expect(res.coords).toBeNull();
      expect(res.error).toContain('Please enable GPS / Location Services');
    });

    it('returns cached coordinates when available within maxAge', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
      (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
        coords: { latitude: 7.1475, longitude: 4.4567, accuracy: 5 },
      });

      const res = await getCurrentAttendanceLocation();
      expect(res.coords).toEqual({
        latitude: 7.1475,
        longitude: 4.4567,
        accuracy: 5,
      });
      expect(res.error).toBeNull();
    });

    it('falls back to fresh position when cache is not present', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
      (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null);
      (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
        coords: { latitude: 7.1480, longitude: 4.4570, accuracy: 8 },
      });

      const res = await getCurrentAttendanceLocation();
      expect(res.coords).toEqual({
        latitude: 7.1480,
        longitude: 4.4570,
        accuracy: 8,
      });
      expect(res.error).toBeNull();
    });
  });
});
