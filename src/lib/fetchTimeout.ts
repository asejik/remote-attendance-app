// A time limit for every request the Supabase client makes. Without one, a
// request the network or server never answers leaves the screen waiting
// forever (seen on dev: "Logging in" spinning). On timeout the request fails
// like a dropped connection, and each screen shows its usual "check your
// connection" message; sync retries later.
export const REQUEST_TIMEOUT_MS = 30_000;
// Photo uploads on 2G (~50 kbit/s) need about 30 s for a 170 KB site photo.
export const UPLOAD_TIMEOUT_MS = 120_000;

const isUpload = (url: string, method: string) => method !== 'GET' && /\/storage\/v1\/object\/(?!sign\/)/.test(url);

export const timeoutFor = (url: string, method = 'GET') => (isUpload(url, method.toUpperCase()) ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);

// fetch() with a time limit until the response starts. Keeps any caller's own
// abort signal working. Uses a plain timer (not AbortSignal.timeout/any), so it
// also works on older Android WebViews.
export const fetchWithTimeout = (base: typeof fetch = fetch): typeof fetch => (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init.method ?? (input instanceof Request ? input.method : 'GET');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('The request timed out', 'TimeoutError')), timeoutFor(url, method));
  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true });
  }
  return base(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};
