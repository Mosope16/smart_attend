/**
 * Dynamic Rotating QR Challenge System (Anti-Relay & Anti-Proxy)
 * Generates short-lived time-windowed tokens (15-30s) displayed by the lecturer.
 * Students scanning a recorded or forwarded screenshot will fail verification once the window passes.
 */

export const DEFAULT_ROTATION_INTERVAL_SECONDS = 20;
export const MAX_CLOCK_DRIFT_WINDOWS = 1; // Allows current window and 1 immediate prior window (20-40s grace)

export interface DynamicQrPayload {
  v: 1;          // version
  s: string;     // session UUID
  c: string;     // base attendance code
  t: string;     // window-derived token
  w: number;     // window index
  exp: number;   // expiration epoch timestamp (ms)
}

/**
 * Fast deterministic hashing function (FNV-1a 32-bit mix + hex formatting).
 * Provides immediate synchronous token generation with zero native bridge overhead.
 */
export function computeWindowToken(sessionId: string, baseCode: string, windowIndex: number): string {
  const seed = `${sessionId}:${baseCode.toUpperCase()}:${windowIndex}:smartattend_salt`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert 32-bit unsigned integer to 6-character uppercase alphanumeric token
  const unsigned = hash >>> 0;
  return unsigned.toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

/**
 * Computes the active time-window index for a given timestamp.
 */
export function getWindowIndex(timestampMs = Date.now(), intervalSeconds = DEFAULT_ROTATION_INTERVAL_SECONDS): number {
  return Math.floor(timestampMs / (intervalSeconds * 1000));
}

/**
 * Returns remaining seconds and normalized progress (1 -> 0) in the current rotation window.
 */
export function getWindowProgress(timestampMs = Date.now(), intervalSeconds = DEFAULT_ROTATION_INTERVAL_SECONDS): {
  remainingSeconds: number;
  progress: number;
} {
  const elapsedInWindow = (timestampMs % (intervalSeconds * 1000)) / 1000;
  const remaining = Math.max(0, intervalSeconds - elapsedInWindow);
  return {
    remainingSeconds: Math.ceil(remaining),
    progress: remaining / intervalSeconds,
  };
}

/**
 * Generates a full Dynamic QR JSON string for the lecturer screen.
 */
export function generateDynamicQrString(
  sessionId: string,
  baseCode: string,
  timestampMs = Date.now(),
  intervalSeconds = DEFAULT_ROTATION_INTERVAL_SECONDS
): {
  payload: DynamicQrPayload;
  qrString: string;
} {
  const windowIndex = getWindowIndex(timestampMs, intervalSeconds);
  const token = computeWindowToken(sessionId, baseCode, windowIndex);
  const exp = (windowIndex + 1) * intervalSeconds * 1000;

  const payload: DynamicQrPayload = {
    v: 1,
    s: sessionId,
    c: baseCode.toUpperCase(),
    t: token,
    w: windowIndex,
    exp,
  };

  return {
    payload,
    qrString: JSON.stringify(payload),
  };
}

export interface QrValidationResult {
  isValid: boolean;
  code: string;
  isDynamic: boolean;
  windowIndex?: number;
  error?: string;
}

/**
 * Validates a scanned QR code payload against the active session.
 * Supports both Dynamic QR payloads and static backup attendance codes.
 */
export function validateScannedQr(
  rawScannedData: string,
  expectedSessionId?: string,
  timestampMs = Date.now(),
  intervalSeconds = DEFAULT_ROTATION_INTERVAL_SECONDS
): QrValidationResult {
  if (!rawScannedData || typeof rawScannedData !== 'string') {
    return { isValid: false, code: '', isDynamic: false, error: 'Empty or invalid QR code scanned.' };
  }

  const trimmed = rawScannedData.trim();

  // 1. Try parsing as Dynamic Rotating QR JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed: DynamicQrPayload = JSON.parse(trimmed);
      if (parsed.v === 1 && parsed.s && parsed.c && parsed.t && typeof parsed.w === 'number') {
        // If an expectedSessionId is specified, verify it matches
        if (expectedSessionId && parsed.s !== expectedSessionId) {
          return {
            isValid: false,
            code: parsed.c,
            isDynamic: true,
            error: 'This QR code belongs to a different lecture session.',
          };
        }

        const currentWindow = getWindowIndex(timestampMs, intervalSeconds);
        const windowDelta = currentWindow - parsed.w;

        // Reject if expired (older than MAX_CLOCK_DRIFT_WINDOWS)
        if (windowDelta > MAX_CLOCK_DRIFT_WINDOWS) {
          return {
            isValid: false,
            code: parsed.c,
            isDynamic: true,
            error: 'QR code expired. Please scan the current code displayed on the screen.',
          };
        }

        // Reject future windows beyond 1 interval (prevents clock manipulation)
        if (windowDelta < -1) {
          return {
            isValid: false,
            code: parsed.c,
            isDynamic: true,
            error: 'Device clock out of sync. Please verify your phone time settings.',
          };
        }

        // Verify cryptographic token for the scanned window
        const expectedToken = computeWindowToken(parsed.s, parsed.c, parsed.w);
        if (parsed.t !== expectedToken) {
          return {
            isValid: false,
            code: parsed.c,
            isDynamic: true,
            error: 'Forged or invalid QR security token.',
          };
        }

        return {
          isValid: true,
          code: parsed.c,
          isDynamic: true,
          windowIndex: parsed.w,
        };
      }
    } catch {
      // Not valid dynamic JSON, fall through to static code check
    }
  }

  // 2. Static attendance code fallback (e.g. 5-character manual code)
  const cleanCode = trimmed.toUpperCase();
  if (cleanCode.length >= 4 && cleanCode.length <= 10) {
    return {
      isValid: true,
      code: cleanCode,
      isDynamic: false,
    };
  }

  return {
    isValid: false,
    code: '',
    isDynamic: false,
    error: 'Unrecognized attendance QR format.',
  };
}
