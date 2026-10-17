// Class strings for the shared look ("Field Ledger", docs/DESIGN.md), built from
// the tokens in src/index.css. Components that use them live in ./ui.tsx.

const control = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 font-semibold transition duration-150 ease-out-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand';

export const button = {
  primary: `${control} bg-brand text-white shadow-card hover:bg-brand-700`,
  secondary: `${control} border border-gray-300 bg-white text-gray-900 hover:bg-gray-50`,
  danger: `${control} bg-red-700 text-white hover:bg-red-800`,
  dangerOutline: `${control} border border-red-300 bg-white text-red-800 hover:bg-red-50`,
  // A quiet text action that still meets the 44 px touch size.
  link: 'inline-flex min-h-11 items-center justify-center gap-1 font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-brand',
  icon: 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-gray-600 transition duration-150 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-3 focus-visible:outline-brand',
};

export const field = 'mt-1 block w-full min-h-11 rounded-control border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25 disabled:bg-gray-50';
export const label = 'block text-sm font-semibold text-gray-700';
export const card = 'rounded-card border border-gray-200 bg-white shadow-card';
export const eyebrow = 'text-xs font-bold uppercase tracking-[0.08em] text-gray-600';
