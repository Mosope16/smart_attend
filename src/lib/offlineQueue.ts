import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateDistanceMeters } from './geo';

export const OFFLINE_QUEUE_STORAGE_KEY = '@smartattend_offline_attendance_queue';
export const OFFLINE_SYNC_GRACE_MINUTES = 120; // Allows syncing up to 2 hours after lecture ends

export interface OfflineCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  isMocked: boolean;
}

export interface QueuedAttendanceRecord {
  id: string;               // Unique client queue item id
  sessionId?: string;       // Known if scanned via dynamic QR payload
  attendanceCode: string;   // 5-character manual code or scanned code
  studentId: string;
  studentName: string;
  matricNumber?: string | null;
  deviceId: string;
  deviceName: string;
  recordedAt: string;       // ISO timestamp when user marked attendance in classroom
  coords?: OfflineCoords | null;
  qrPayload?: any;          // Full payload if scanned from dynamic QR
  signature: string;        // Cryptographic tamper seal
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed' | 'synced';
  lastError?: string;
}

/**
 * Computes a deterministic tamper-proof signature over the record's immutable fields.
 * If the record is altered in storage (e.g. changing studentId, timestamp, or GPS fix),
 * the signature will mismatch and sync will reject it.
 */
export function computeQueueSignature(record: {
  studentId: string;
  attendanceCode: string;
  recordedAt: string;
  deviceId: string;
  coords?: OfflineCoords | null;
}): string {
  const parts = [
    record.studentId,
    record.attendanceCode.trim().toUpperCase(),
    record.recordedAt,
    record.deviceId,
    record.coords?.latitude != null ? record.coords.latitude.toFixed(5) : 'none',
    record.coords?.longitude != null ? record.coords.longitude.toFixed(5) : 'none',
    'smartattend_offline_v1',
  ].join('::');

  let hash = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    hash ^= parts.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Verifies whether an offline record's signature is valid.
 */
export function verifyRecordIntegrity(record: QueuedAttendanceRecord): boolean {
  if (!record || !record.signature) return false;
  const expected = computeQueueSignature(record);
  return record.signature === expected;
}

/**
 * Detects whether an error is caused by offline status or network disconnect.
 */
export function isNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.details || String(err)).toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('timedout') ||
    msg.includes('offline') ||
    msg.includes('no address associated') ||
    msg.includes('network error') ||
    msg.includes('err_internet_disconnected')
  );
}

// In-memory fallback if AsyncStorage is unavailable (e.g. mock test environments)
let inMemoryQueue: QueuedAttendanceRecord[] | null = null;

async function loadRawQueue(): Promise<QueuedAttendanceRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return inMemoryQueue || [];
    return JSON.parse(raw);
  } catch (e) {
    return inMemoryQueue || [];
  }
}

async function saveRawQueue(queue: QueuedAttendanceRecord[]): Promise<void> {
  inMemoryQueue = queue;
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    // handled by inMemoryQueue fallback
  }
}

/**
 * Enqueues a new attendance check-in for offline synchronization.
 */
export async function enqueueOfflineAttendance(params: {
  attendanceCode: string;
  studentId: string;
  studentName: string;
  matricNumber?: string | null;
  deviceId: string;
  deviceName: string;
  sessionId?: string;
  coords?: OfflineCoords | null;
  qrPayload?: any;
  recordedAt?: string;
}): Promise<QueuedAttendanceRecord> {
  const recordedAt = params.recordedAt || new Date().toISOString();
  const queue = await loadRawQueue();

  const recordWithoutMeta = {
    attendanceCode: params.attendanceCode.trim().toUpperCase(),
    studentId: params.studentId,
    studentName: params.studentName,
    matricNumber: params.matricNumber || null,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    sessionId: params.sessionId,
    coords: params.coords || null,
    qrPayload: params.qrPayload || null,
    recordedAt,
  };

  const signature = computeQueueSignature(recordWithoutMeta);

  const newRecord: QueuedAttendanceRecord = {
    ...recordWithoutMeta,
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    signature,
    retryCount: 0,
    status: 'pending',
  };

  // Avoid queuing duplicate attempts for the exact same student + code in the same minute
  const exists = queue.some(
    (q) => q.studentId === newRecord.studentId && q.attendanceCode === newRecord.attendanceCode && q.status !== 'failed'
  );

  if (!exists) {
    queue.push(newRecord);
    await saveRawQueue(queue);
  }

  return newRecord;
}

/**
 * Retrieves all queued offline attendance records.
 */
export async function getQueuedAttendanceRecords(): Promise<QueuedAttendanceRecord[]> {
  return await loadRawQueue();
}

/**
 * Returns the count of pending offline records awaiting synchronization.
 */
export async function getPendingQueueCount(): Promise<number> {
  const queue = await loadRawQueue();
  return queue.filter((r) => r.status === 'pending' || r.status === 'syncing').length;
}

/**
 * Removes a specific record by ID from the offline queue.
 */
export async function removeQueuedRecord(id: string): Promise<void> {
  const queue = await loadRawQueue();
  const filtered = queue.filter((r) => r.id !== id);
  await saveRawQueue(filtered);
}

/**
 * Updates status and error message on a queued record.
 */
export async function updateQueuedRecord(
  id: string,
  updates: Partial<Pick<QueuedAttendanceRecord, 'status' | 'retryCount' | 'lastError'>>
): Promise<void> {
  const queue = await loadRawQueue();
  const index = queue.findIndex((r) => r.id === id);
  if (index !== -1) {
    queue[index] = { ...queue[index], ...updates };
    await saveRawQueue(queue);
  }
}

/**
 * Clears the entire offline queue (e.g. on user reset or testing).
 */
export async function clearOfflineQueue(): Promise<void> {
  inMemoryQueue = [];
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}

export interface SyncResult {
  total: number;
  synced: number;
  failed: number;
  results: Array<{
    id: string;
    attendanceCode: string;
    success: boolean;
    message: string;
  }>;
}

/**
 * Synchronizes pending offline attendance records with the cloud database.
 * Validates integrity, session timing, course enrollment, geofencing, and single-device rules.
 */
export async function syncOfflineAttendanceQueue(supabase: any): Promise<SyncResult> {
  const queue = await loadRawQueue();
  const pending = queue.filter((r) => r.status === 'pending' || r.status === 'failed');

  const summary: SyncResult = {
    total: pending.length,
    synced: 0,
    failed: 0,
    results: [],
  };

  if (pending.length === 0) {
    return summary;
  }

  for (const record of pending) {
    await updateQueuedRecord(record.id, { status: 'syncing', retryCount: record.retryCount + 1 });

    // 1. Verify tamper seal
    if (!verifyRecordIntegrity(record)) {
      await updateQueuedRecord(record.id, {
        status: 'failed',
        lastError: 'Integrity check failed: Offline record has been tampered with.',
      });
      summary.failed++;
      summary.results.push({
        id: record.id,
        attendanceCode: record.attendanceCode,
        success: false,
        message: 'Security validation failed: Record signature mismatch.',
      });
      continue;
    }

    try {
      // 2. Resolve matching session
      let sessionQuery = supabase.from('attendance_sessions').select('id, course_id, end_time, latitude, longitude, radius_meters');

      if (record.sessionId) {
        sessionQuery = sessionQuery.eq('id', record.sessionId);
      } else {
        sessionQuery = sessionQuery.eq('attendance_code', record.attendanceCode.toUpperCase());
      }

      const { data: sessionData, error: sessionErr } = await sessionQuery.order('start_time', { ascending: false }).limit(1).single();

      if (sessionErr || !sessionData) {
        throw new Error('Attendance session not found or code is invalid.');
      }

      const session = sessionData;

      // 3. Verify record was taken during the session (with a reasonable 10-minute end-grace)
      const recordedTime = new Date(record.recordedAt).getTime();
      const sessionEndTime = new Date(session.end_time).getTime();
      const maxAllowedRecordedTime = sessionEndTime + 10 * 60 * 1000; // 10 min grace after lecture

      if (recordedTime > maxAllowedRecordedTime) {
        throw new Error('Attendance was recorded after the session had ended.');
      }

      // 4. Verify enrollment
      const { data: enrollment, error: enrollErr } = await supabase
        .from('enrollments')
        .select('id')
        .eq('course_id', session.course_id)
        .eq('student_id', record.studentId)
        .single();

      if (enrollErr || !enrollment) {
        throw new Error('Student is not enrolled in this course.');
      }

      // 5. Verify Geofence Proximity (if session had coordinates)
      if (session.latitude != null && session.longitude != null && record.coords) {
        const allowedRadius = session.radius_meters || 50;
        const dist = calculateDistanceMeters(
          record.coords.latitude,
          record.coords.longitude,
          session.latitude,
          session.longitude
        );

        // Allow up to reported accuracy tolerance
        const accuracyAllowance = Math.min(record.coords.accuracy || 0, 40);
        if (dist > allowedRadius + accuracyAllowance) {
          throw new Error(`Recorded location was outside the attendance zone (~${Math.round(dist)}m away).`);
        }
      }

      // 6. Check if student already marked
      const { data: existingRecord } = await supabase
        .from('attendance_records')
        .select('id')
        .eq('session_id', session.id)
        .eq('student_id', record.studentId)
        .single();

      if (existingRecord) {
        // Already recorded; treat as synced and remove from queue
        await removeQueuedRecord(record.id);
        summary.synced++;
        summary.results.push({
          id: record.id,
          attendanceCode: record.attendanceCode,
          success: true,
          message: 'Already recorded in this session.',
        });
        continue;
      }

      // 7. Anti-Proxy: Check if physical device marked another student
      const { data: deviceRecord } = await supabase
        .from('attendance_records')
        .select('id, student_id')
        .eq('session_id', session.id)
        .eq('device_id', record.deviceId)
        .single();

      if (deviceRecord && deviceRecord.student_id !== record.studentId) {
        throw new Error('Proxy blocked: This physical device was used by another student.');
      }

      // 8. Insert into cloud attendance_records
      const { error: insertErr } = await supabase.from('attendance_records').insert({
        session_id: session.id,
        student_id: record.studentId,
        device_id: record.deviceId,
        device_name: record.deviceName,
        status: 'present',
        timestamp: record.recordedAt, // preserve original time marked inside room
      });

      if (insertErr) {
        // If 23505 duplicate key, treat as resolved
        if (insertErr.code === '23505') {
          await removeQueuedRecord(record.id);
          summary.synced++;
          summary.results.push({
            id: record.id,
            attendanceCode: record.attendanceCode,
            success: true,
            message: 'Attendance already recorded.',
          });
          continue;
        }
        throw new Error(insertErr.message || 'Database insert failed.');
      }

      // Synced successfully: remove from local queue
      await removeQueuedRecord(record.id);
      summary.synced++;
      summary.results.push({
        id: record.id,
        attendanceCode: record.attendanceCode,
        success: true,
        message: 'Attendance successfully synchronized to cloud.',
      });
    } catch (err: any) {
      const errMsg = err?.message || 'Sync failed';
      await updateQueuedRecord(record.id, {
        status: 'failed',
        lastError: errMsg,
      });
      summary.failed++;
      summary.results.push({
        id: record.id,
        attendanceCode: record.attendanceCode,
        success: false,
        message: errMsg,
      });
    }
  }

  return summary;
}
