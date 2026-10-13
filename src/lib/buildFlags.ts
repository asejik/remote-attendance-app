// Build-time switches (Vite env). Kept in one place so tests and pages agree.

// Device diagnostics screen: dev builds and test builds only (the Android test
// APK sets VITE_ENABLE_DIAGNOSTICS=1); hidden in production.
export const DIAGNOSTICS = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DIAGNOSTICS === '1';
