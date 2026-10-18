import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Info, Loader2, X, XCircle } from 'lucide-react';
import { card } from './classes';

// Shared building blocks for every screen ("Field Ledger", docs/DESIGN.md).
// Colours, radii and shadows come from the tokens in src/index.css.

// The app icon, drawn inline so it needs no request (scripts/generate-brand-assets.mjs draws the same).
export const LogoMark = ({ size = 36, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden className={className}>
    <rect width="512" height="512" rx="110" fill="#0f6b63" />
    <path d="M256 92c-66 0-120 54-120 120 0 90 120 208 120 208s120-118 120-208c0-66-54-120-120-120z M320 212a64 64 0 1 0-128 0a64 64 0 1 0 128 0z" fill="#fff" fillRule="evenodd" />
    <circle cx="256" cy="212" r="27" fill="#fff" />
  </svg>
);

export const Wordmark = ({ className = 'text-2xl' }: { className?: string }) => (
  <span className={`font-display font-extrabold tracking-tight text-gray-900 ${className}`}>Site<span className="text-brand">Proof</span></span>
);

type Tone = 'error' | 'warning' | 'success' | 'info';
const tones: Record<Tone, { box: string; Icon: typeof Info }> = {
  error: { box: 'bg-red-50 text-red-900 border-red-200', Icon: XCircle },
  warning: { box: 'bg-amber-50 text-amber-950 border-amber-200', Icon: AlertTriangle },
  success: { box: 'bg-brand-50 text-brand-900 border-brand-100', Icon: CheckCircle },
  info: { box: 'bg-gray-100 text-gray-800 border-gray-200', Icon: Info },
};

// A message box: icon plus text, never colour alone. Errors are announced at once.
// With onClose it gets a close (×) button.
export const Alert = ({ tone, children, className = '', onClose, closeLabel = 'Close message' }: {
  tone: Tone; children: ReactNode; className?: string; onClose?: () => void; closeLabel?: string;
}) => {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-control border p-3 text-sm ${box} ${className}`}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={closeLabel}
          className="-my-2.5 -mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-control hover:bg-black/5 focus-visible:outline-3 focus-visible:outline-current">
          <X size={20} aria-hidden />
        </button>
      )}
    </div>
  );
};

// Small status label (flags, review state). Text is always present, so colour is never the only signal.
export const Badge = ({ tone = 'neutral', children }: { tone?: 'neutral' | 'warning' | 'success' | 'danger'; children: ReactNode }) => {
  const cls = {
    neutral: 'bg-gray-100 text-gray-700',
    warning: 'bg-amber-100 text-amber-950',
    success: 'bg-brand-50 text-brand-900',
    danger: 'bg-red-50 text-red-900',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{children}</span>;
};

// Each admin page's title (one per screen), with room for its main actions.
export const PageHeader = ({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h2 className="font-display text-3xl font-extrabold leading-tight text-gray-900">{title}</h2>
      {subtitle && <p className="mt-1 text-gray-600">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);

export const Spinner = ({ label, className = 'py-10' }: { label: string; className?: string }) => (
  <div className={`flex justify-center ${className}`} role="status" aria-label={label}>
    <Loader2 className="animate-spin text-gray-400" aria-hidden />
  </div>
);

// Placeholder rows while a list loads, shaped like the content that will replace them.
export const SkeletonList = ({ rows = 3, label }: { rows?: number; label: string }) => (
  <div role="status" aria-label={label} className="space-y-3">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className={`${card} flex items-center gap-4 p-4`}>
        <div className="h-12 w-12 animate-pulse rounded-full bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-1/3 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    ))}
  </div>
);

// Shown while the app works out where to send someone (saved session, staff
// record). It matches the phone's launch screen, so reopening the app goes
// teal → home with no login form flashing in between.
export const Splash = () => (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-brand" role="status" aria-label="Loading SiteProof">
    <svg width="96" height="96" viewBox="0 0 512 512" aria-hidden>
      <path d="M256 92c-66 0-120 54-120 120 0 90 120 208 120 208s120-118 120-208c0-66-54-120-120-120z M320 212a64 64 0 1 0-128 0a64 64 0 1 0 128 0z" fill="#fff" fillRule="evenodd" />
      <circle cx="256" cy="212" r="27" fill="#fff" />
    </svg>
    <span className="font-display text-4xl font-extrabold tracking-tight text-white" aria-hidden>Site<span className="text-brand-100">Proof</span></span>
  </div>
);
