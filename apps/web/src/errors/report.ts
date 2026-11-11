// Optional error reporting (Sentry-compatible, e.g. Bugsink). Disabled unless the
// build sets VITE_ERRORS_DSN. The SDK is loaded lazily so it costs nothing otherwise.
const IGNORE = [/Failed to fetch/i, /Load failed/i, /NetworkError/i, /AbortError/i, /ResizeObserver loop/i];

export function initErrorReporting(): void {
  const dsn = import.meta.env.VITE_ERRORS_DSN as string | undefined;
  if (!dsn || typeof window === "undefined") return;
  import("@sentry/browser")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: "production",
        tracesSampleRate: 0,
        sendDefaultPii: false,
        ignoreErrors: IGNORE,
        beforeSend: (event) => (navigator.onLine === false ? null : event),
      });
    })
    .catch(() => {});
}
