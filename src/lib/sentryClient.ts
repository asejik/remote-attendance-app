// The only Sentry functions the app uses. Imported on demand by monitoring.ts;
// named imports keep the rest of the SDK out of the bundle.
export { captureMessage, init } from '@sentry/react';
