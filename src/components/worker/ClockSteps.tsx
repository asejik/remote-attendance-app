import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

// Where the worker is in a clock-in: location, face photo, then (if the
// organisation asks for it) a site photo. Chips name each step; the ring shows
// progress at a glance (docs/DESIGN.md, "step ring").
export interface ClockStepsProps {
  current: number; // 0-based index of the step in progress
  withSitePhoto: boolean;
}

const stepNames = (withSitePhoto: boolean) => ['Location', 'Face photo', ...(withSitePhoto ? ['Site photo'] : [])];

export const ClockSteps = ({ current, withSitePhoto }: ClockStepsProps) => {
  const steps = stepNames(withSitePhoto);
  return (
    <ol aria-label="Clock-in steps" className={`grid gap-2 ${steps.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {steps.map((name, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={name} aria-current={now ? 'step' : undefined}
            className={`rounded-control px-3 py-2 ${done ? 'bg-brand-100 text-brand-900' : now ? 'bg-amber-400 text-gray-900' : 'bg-gray-100 text-gray-600'}`}>
            <span className="flex items-center gap-1 font-display text-xs font-extrabold uppercase tracking-[0.08em]">
              Step {i + 1} {done && <><Check size={13} strokeWidth={3} aria-hidden /><span className="sr-only">done</span></>}
            </span>
            <span className="block text-sm font-bold">{name}</span>
          </li>
        );
      })}
    </ol>
  );
};

// Progress ring: one segment per step, done steps in teal, the current one in amber.
export const StepRing = ({ current, withSitePhoto, size = 168, children }: ClockStepsProps & { size?: number; children?: ReactNode }) => {
  const count = stepNames(withSitePhoto).length;
  const r = 70;
  const circumference = 2 * Math.PI * r;
  const gap = 14;
  const segment = circumference / count - gap;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Step ${Math.min(current + 1, count)} of ${count}`}>
      <svg viewBox="0 0 160 160" width={size} height={size} className="-rotate-90" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <circle key={i} cx="80" cy="80" r={r} fill="none" strokeWidth="11" strokeLinecap="round"
            stroke={i < current ? '#0f6b63' : i === current ? '#fbbf24' : '#e7edeb'}
            strokeDasharray={`${segment} ${circumference - segment}`} strokeDashoffset={-i * (segment + gap)} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
};
