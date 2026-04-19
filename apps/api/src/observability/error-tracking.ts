/**
 * Error tracking integration — supports Sentry when SENTRY_DSN is set,
 * otherwise logs errors via structured JSON for aggregation.
 */

let sentryInitialized = false;
let SentryModule: any = null;

export async function initErrorTracking() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[error-tracking] SENTRY_DSN not set — using structured log fallback');
    return;
  }

  try {
    const sentryModuleName = '@sentry/node';
    SentryModule = await import(sentryModuleName);
    SentryModule.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || '0.1.0',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      beforeSend(event: any) {
        // Scrub tenant IDs from error data for privacy
        if (event.extra?.tenantId) {
          event.extra.tenantId = '[REDACTED]';
        }
        return event;
      },
    });
    sentryInitialized = true;
    console.log('[error-tracking] Sentry initialized');
  } catch (err) {
    console.warn('[error-tracking] Failed to initialize Sentry:', err);
  }
}

export function captureException(error: Error, context?: Record<string, unknown>) {
  if (sentryInitialized && SentryModule) {
    SentryModule.withScope((scope: any) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      SentryModule.captureException(error);
    });
  }

  // Always log structured error for log aggregation
  const logEntry = {
    level: 'error',
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    ...context,
    timestamp: new Date().toISOString(),
  };
  console.error(JSON.stringify(logEntry));
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (sentryInitialized && SentryModule) {
    SentryModule.captureMessage(message, level);
  }

  console.log(JSON.stringify({ level, message, timestamp: new Date().toISOString() }));
}

export function setUser(userId: string, tenantId: string) {
  if (sentryInitialized && SentryModule) {
    SentryModule.setUser({ id: userId, tenantId });
  }
}
