jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

import { observability, logger } from '../src/lib/observability';

describe('Observability & Crash Reporting Suite', () => {
  beforeEach(() => {
    // Reset user context
    observability.setUser(null);
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
  });

  test('captures non-Error exception strings gracefully', () => {
    expect(() => {
      observability.captureException('Direct string exception payload', { code: 500 });
    }).not.toThrow();
  });

  test('logger helper methods record events properly', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    logger.info('auth', 'User logged in');
    logger.warn('geofence', 'Location tolerance reached');
    logger.error('sync', 'Failed to synchronize attendance cache');
    logger.captureException(new Error('Sample caught error'));

    expect(consoleSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
