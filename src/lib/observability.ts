import { Platform } from 'react-native';

export interface Breadcrumb {
  timestamp: string;
  category: string;
  message: string;
  level: 'info' | 'warn' | 'error';
  data?: Record<string, any>;
}

export interface UserContext {
  id: string;
  email?: string;
  role?: string;
}

class ObservabilityManager {
  private dsn: string | null = null;
  private breadcrumbs: Breadcrumb[] = [];
  private readonly maxBreadcrumbs = 50;
  private userContext: UserContext | null = null;
  private isInitialized = false;

  constructor() {
    this.dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || null;
  }

  /**
   * Initializes global unhandled crash and exception listeners.
   */
  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Native unhandled exception handler
    if (Platform.OS !== 'web' && typeof (globalThis as any).ErrorUtils !== 'undefined') {
      const defaultHandler = (globalThis as any).ErrorUtils.getGlobalHandler();
      (globalThis as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
        this.captureException(error, { isFatal, origin: 'ErrorUtils' });
        if (defaultHandler) {
          defaultHandler(error, isFatal);
        }
      });
    }

    // Web unhandled error handler
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.captureException(event.error || event.message, { origin: 'window.onerror' });
      });
      window.addEventListener('unhandledrejection', (event) => {
        this.captureException(event.reason, { origin: 'unhandledrejection' });
      });
    }
  }

  setUser(user: UserContext | null) {
    this.userContext = user;
    if (user) {
      this.addBreadcrumb('auth', `User context established: ${user.role} (${user.id})`);
    } else {
      this.addBreadcrumb('auth', 'User context cleared');
    }
  }

  addBreadcrumb(category: string, message: string, data?: Record<string, any>, level: Breadcrumb['level'] = 'info') {
    const crumb: Breadcrumb = {
      timestamp: new Date().toISOString(),
      category,
      message,
      level,
      data,
    };
    this.breadcrumbs.push(crumb);
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  captureException(error: any, context?: Record<string, any>) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const payload = {
      message: errorObj.message,
      stack: errorObj.stack,
      context,
      user: this.userContext,
      breadcrumbs: [...this.breadcrumbs],
      timestamp: new Date().toISOString(),
      platform: Platform.OS,
    };

    console.error('[Observability Error]', errorObj.message, payload);

    // If Sentry DSN is configured, send HTTP event directly (zero native binary dependencies required)
    if (this.dsn) {
      this.sendToRemoteDSN(payload).catch(() => {});
    }
  }

  private async sendToRemoteDSN(payload: any) {
    if (!this.dsn) return;
    try {
      // Basic Sentry HTTP envelope format for serverless / edge reporting
      const url = new URL(this.dsn);
      const projectId = url.pathname.replace(/^\//, '');
      const sentryEndpoint = `${url.protocol}//${url.host}/api/${projectId}/store/`;
      const key = url.username;

      await fetch(sentryEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=smartattend-native/1.0`,
        },
        body: JSON.stringify({
          event_id: Math.random().toString(36).substring(2, 18),
          timestamp: payload.timestamp,
          platform: 'javascript',
          level: 'error',
          logger: 'smartattend.observability',
          user: payload.user,
          exception: {
            values: [
              {
                type: 'Error',
                value: payload.message,
                stacktrace: { frames: [] },
              },
            ],
          },
          breadcrumbs: payload.breadcrumbs.map((b: Breadcrumb) => ({
            timestamp: b.timestamp,
            category: b.category,
            message: b.message,
            level: b.level,
            data: b.data,
          })),
          extra: {
            platform: payload.platform,
            ...payload.context,
          },
        }),
      });
    } catch {
      // Fail silently to never impact user experience
    }
  }
}

export const observability = new ObservabilityManager();

export const logger = {
  info: (category: string, message: string, data?: Record<string, any>) => {
    observability.addBreadcrumb(category, message, data, 'info');
  },
  warn: (category: string, message: string, data?: Record<string, any>) => {
    console.warn(`[${category}]`, message, data);
    observability.addBreadcrumb(category, message, data, 'warn');
  },
  error: (category: string, message: string, data?: Record<string, any>) => {
    console.error(`[${category}]`, message, data);
    observability.addBreadcrumb(category, message, data, 'error');
  },
  captureException: (error: any, context?: Record<string, any>) => {
    observability.captureException(error, context);
  },
};
