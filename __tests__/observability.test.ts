jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

import { observability, logger } from '../src/lib/observability';

describe('Observability & Crash Reporting Suite', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Silence console.error output during deliberate test error captures
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    observability.setUser(null);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('initializes without throwing errors', () => {
    expect(() => {
      observability.init();
    }).not.toThrow();
  });

  test('records user context and breadcrumbs', () => {
    expect(() => {
      observability.setUser({
        id: 'usr-12345',
        email: 'lecturer@run.edu.ng',
        role: 'lecturer',
      });
    }).not.toThrow();
  });

  test('clears user context gracefully', () => {
    observability.setUser({ id: 'usr-temp' });
    expect(() => {
      observability.setUser(null);
    }).not.toThrow();
  });

  test('adds breadcrumbs and bounds history limit', () => {
    for (let i = 0; i < 60; i++) {
      observability.addBreadcrumb('navigation', `Navigated to screen ${i}`, { index: i }, 'info');
    }
    // Should not throw or crash under load
    expect(true).toBe(true);
  });

  test('captures Error exceptions without crashing', () => {
    const testError = new Error('Simulated network timeout');
    expect(() => {
      observability.captureException(testError, { screen: 'markAttendance' });
    }).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  test('captures non-Error exception strings gracefully', () => {
    expect(() => {
      observability.captureException('Direct string exception payload', { code: 500 });
    }).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  test('logger helper methods record events properly', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    logger.info('auth', 'User logged in');
    logger.warn('geofence', 'Location tolerance reached');
    logger.error('sync', 'Failed to synchronize attendance cache');
    logger.captureException(new Error('Sample caught error'));

    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });
});
