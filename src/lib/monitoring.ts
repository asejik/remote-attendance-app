import * as Sentry from '@sentry/react';

// Error monitoring (Sentry), enabled only when VITE_SENTRY_DSN is set.
// No personal data: no IPs or cookies, no request bodies, and URL query strings
// (which can hold signed-URL tokens) are stripped from breadcrumbs and events.
const stripQuery = (url?: string) => url?.split('?')[0];

export const initMonitoring = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
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
};
