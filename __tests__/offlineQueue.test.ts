import {
  computeQueueSignature,
  verifyRecordIntegrity,
  isNetworkError,
  enqueueOfflineAttendance,
  getQueuedAttendanceRecords,
  getPendingQueueCount,
  removeQueuedRecord,
  clearOfflineQueue,
  syncOfflineAttendanceQueue,
  QueuedAttendanceRecord,
} from '../src/lib/offlineQueue';

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage[key] || null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete mockStorage[key];
  }),
}));

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


describe('offlineQueue.ts unit tests', () => {
  beforeEach(async () => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
    await clearOfflineQueue();
  });

  describe('Cryptographic Signature & Integrity', () => {
    const baseRecord = {
      studentId: 'student-uuid-123',
      attendanceCode: 'B7K4X',
      recordedAt: '2026-10-23T08:15:00.000Z',
      deviceId: 'device-hardware-999',
      coords: {
        latitude: 7.44123,
        longitude: 4.45678,
        accuracy: 12,
        isMocked: false,
      },
    };

    it('generates consistent deterministic signatures', () => {
      const sig1 = computeQueueSignature(baseRecord);
      const sig2 = computeQueueSignature(baseRecord);
      expect(sig1).toHaveLength(8);
      expect(sig1).toBe(sig2);
    });

    it('detects tampering when studentId or attendance code is altered', () => {
      const validSig = computeQueueSignature(baseRecord);
      const tamperedStudent = computeQueueSignature({ ...baseRecord, studentId: 'different-uuid' });
      const tamperedCode = computeQueueSignature({ ...baseRecord, attendanceCode: 'HACK9' });

      expect(tamperedStudent).not.toBe(validSig);
      expect(tamperedCode).not.toBe(validSig);
    });

    it('verifies record integrity correctly', () => {
      const record: QueuedAttendanceRecord = {
        id: 'test-id-1',
        attendanceCode: 'B7K4X',
        studentId: 'student-uuid-123',
        studentName: 'Tunde Bakare',
        deviceId: 'device-hardware-999',
        deviceName: 'Samsung Galaxy A54',
        recordedAt: '2026-10-23T08:15:00.000Z',
        coords: baseRecord.coords,
        signature: computeQueueSignature(baseRecord),
        retryCount: 0,
        status: 'pending',
      };

      expect(verifyRecordIntegrity(record)).toBe(true);

      // Alter timestamp
      const tamperedRecord = { ...record, recordedAt: '2026-10-23T10:00:00.000Z' };
      expect(verifyRecordIntegrity(tamperedRecord)).toBe(false);
    });
  });

  describe('Network Error Detection', () => {
    it('identifies network failures and connection timeouts', () => {
      expect(isNetworkError('TypeError: Network request failed')).toBe(true);
      expect(isNetworkError(new Error('Fetch failed'))).toBe(true);
      expect(isNetworkError({ message: 'getaddrinfo ENOTFOUND ep-broad-fire.neon.tech' })).toBe(true);
      expect(isNetworkError('Connection timed out')).toBe(true);
      expect(isNetworkError('Offline: err_internet_disconnected')).toBe(true);
    });

    it('returns false for business logic or application errors', () => {
      expect(isNetworkError(new Error('Student not enrolled in course'))).toBe(false);
      expect(isNetworkError('Invalid attendance code')).toBe(false);
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
    });
  });

  describe('Queue Management (Enqueue, Count, Remove, Clear)', () => {
    it('enqueues a record and computes a signature', async () => {
      const record = await enqueueOfflineAttendance({
        attendanceCode: 'A9B2C',
        studentId: 'student-1',
        studentName: 'Adeola Johnson',
        deviceId: 'device-1',
        deviceName: 'Pixel 8',
        coords: { latitude: 7.4, longitude: 4.4, accuracy: 15, isMocked: false },
      });

      expect(record.id).toMatch(/^offline_/);
      expect(record.status).toBe('pending');
      expect(record.signature).toBeDefined();

      const queue = await getQueuedAttendanceRecords();
      expect(queue).toHaveLength(1);
      expect(queue[0].attendanceCode).toBe('A9B2C');

      const count = await getPendingQueueCount();
      expect(count).toBe(1);
    });

    it('prevents enqueuing duplicate record for the same student and code', async () => {
      await enqueueOfflineAttendance({
        attendanceCode: 'A9B2C',
        studentId: 'student-1',
        studentName: 'Adeola Johnson',
        deviceId: 'device-1',
        deviceName: 'Pixel 8',
      });

      await enqueueOfflineAttendance({
        attendanceCode: 'A9B2C',
        studentId: 'student-1',
        studentName: 'Adeola Johnson',
        deviceId: 'device-1',
        deviceName: 'Pixel 8',
      });

      const queue = await getQueuedAttendanceRecords();
      expect(queue).toHaveLength(1);
    });

    it('removes a record by ID', async () => {
      const record = await enqueueOfflineAttendance({
        attendanceCode: 'CODE1',
        studentId: 'student-1',
        studentName: 'Adeola',
        deviceId: 'dev-1',
        deviceName: 'Phone',
      });

      expect(await getPendingQueueCount()).toBe(1);
      await removeQueuedRecord(record.id);
      expect(await getPendingQueueCount()).toBe(0);
    });
  });

  describe('syncOfflineAttendanceQueue', () => {
    const lectureEndTime = new Date(Date.now() + 30 * 60000).toISOString();

    const createMockSupabase = (overrides: Record<string, any> = {}) => {
      return {
        from: jest.fn((table: string) => {
          if (table === 'attendance_sessions') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue(
                overrides.sessionResponse || {
                  data: {
                    id: 'session-uuid-1',
                    course_id: 'course-uuid-1',
                    end_time: lectureEndTime,
                    latitude: 7.44000,
                    longitude: 4.45000,
                    radius_meters: 50,
                  },
                  error: null,
                }
              ),
            };
          }
          if (table === 'enrollments') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue(
                overrides.enrollmentResponse || {
                  data: { id: 'enrollment-1' },
                  error: null,
                }
              ),
            };
          }
          if (table === 'attendance_records') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue(
                overrides.existingRecordResponse || {
                  data: null,
                  error: null,
                }
              ),
              insert: jest.fn().mockResolvedValue(
                overrides.insertResponse || {
                  data: [{ id: 'record-new-1' }],
                  error: null,
                }
              ),
            };
          }
          return {};
        }),
      };
    };

    it('successfully synchronizes valid offline record to cloud database', async () => {
      await enqueueOfflineAttendance({
        attendanceCode: 'B7K4X',
        studentId: 'student-uuid-1',
        studentName: 'Chidi Anagonye',
        deviceId: 'device-unique-1',
        deviceName: 'Techno Camon 20',
        coords: {
          latitude: 7.44005, // within ~5 meters of session
          longitude: 4.45005,
          accuracy: 8,
          isMocked: false,
        },
      });

      const mockSupabase = createMockSupabase();
      const result = await syncOfflineAttendanceQueue(mockSupabase);

      expect(result.total).toBe(1);
      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(await getPendingQueueCount()).toBe(0);
    });

    it('rejects tampered record during sync', async () => {
      const record = await enqueueOfflineAttendance({
        attendanceCode: 'TAMPR',
        studentId: 'student-uuid-1',
        studentName: 'Hacker',
        deviceId: 'dev-1',
        deviceName: 'Device',
      });

      // Manually corrupt signature in storage
      const queue = await getQueuedAttendanceRecords();
      queue[0].signature = 'CORRUPTED';
      mockStorage['@smartattend_offline_attendance_queue'] = JSON.stringify(queue);

      const mockSupabase = createMockSupabase();
      const result = await syncOfflineAttendanceQueue(mockSupabase);

      expect(result.failed).toBe(1);
      expect(result.synced).toBe(0);
      expect(result.results[0].message).toContain('signature mismatch');
    });

    it('rejects record if student is not enrolled', async () => {
      await enqueueOfflineAttendance({
        attendanceCode: 'B7K4X',
        studentId: 'unregistered-student',
        studentName: 'Stranger',
        deviceId: 'dev-1',
        deviceName: 'Device',
      });

      const mockSupabase = createMockSupabase({
        enrollmentResponse: { data: null, error: { message: 'Not found' } },
      });

      const result = await syncOfflineAttendanceQueue(mockSupabase);
      expect(result.failed).toBe(1);
      expect(result.results[0].message).toContain('not enrolled');
    });

    it('rejects record if GPS coordinates were outside classroom boundary', async () => {
      await enqueueOfflineAttendance({
        attendanceCode: 'B7K4X',
        studentId: 'student-uuid-1',
        studentName: 'Absent Student',
        deviceId: 'dev-1',
        deviceName: 'Device',
        coords: {
          latitude: 7.50000, // ~6.6 km away
          longitude: 4.50000,
          accuracy: 10,
          isMocked: false,
        },
      });

      const mockSupabase = createMockSupabase();
      const result = await syncOfflineAttendanceQueue(mockSupabase);

      expect(result.failed).toBe(1);
      expect(result.results[0].message).toContain('outside the attendance zone');
    });
  });
});
