// Error monitoring (Sentry), enabled only when VITE_SENTRY_DSN is set.
// No personal data: no IPs or cookies, no request bodies, and URL query strings
// (which can hold signed-URL tokens) are stripped from breadcrumbs and events.
// The SDK (~30 kB gzipped) is loaded after start-up so it doesn't delay the first
// screen on slow connections; reports made before it arrives are queued.
type SentryModule = typeof import('./sentryClient');
let sentry: SentryModule | null = null;
let enabled = false;
const queued: ((s: SentryModule) => void)[] = [];
const withSentry = (fn: (s: SentryModule) => void) => {
  if (sentry) fn(sentry);
  else if (enabled && queued.length < 20) queued.push(fn);
};

const stripQuery = (url?: string) => url?.split('?')[0];

export const initMonitoring = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || import.meta.env.VITE_E2E === '1') return; // no reports from browser-test builds
  enabled = true;
  import('./sentryClient').then((Sentry) => {
    Sentry.init({
      dsn,
      release: __APP_VERSION__,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'console') return null; // may contain coordinates or names
        if (breadcrumb.data?.url) breadcrumb.data.url = stripQuery(String(breadcrumb.data.url));
        return breadcrumb;
      },
      beforeSend(event) {
        if (event.request) event.request = { url: stripQuery(event.request.url) };
        delete event.user;
        return event;
      },
    });
    sentry = Sentry;
    queued.splice(0).forEach((fn) => fn(Sentry));
  }).catch(() => {
    enabled = false; // the chunk failed to load (precached on web, bundled on Android, so rare)
    queued.length = 0;
  });
};

// Upload problems are caught by the sync engine, so Sentry would never see them
// on its own. Only the error code and HTTP status are sent: no coordinates,
// names or photos. A no-op when Sentry isn't enabled.
export const reportSyncProblem = (kind: 'refused' | 'failing', code: string | undefined, status: number | undefined, message: string) => {
  withSentry((Sentry) => Sentry.captureMessage(kind === 'refused' ? 'Upload refused by the server' : 'Upload keeps failing', {
    level: kind === 'refused' ? 'error' : 'warning',
    tags: { sync: kind, code: code ?? 'none', status: status ? String(status) : 'none' },
    extra: { message: message.slice(0, 200) },
    fingerprint: ['sync', kind, code ?? String(status ?? 'none')],
  }));
};
