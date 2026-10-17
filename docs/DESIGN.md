# SiteProof design system: "Field Ledger"

The look of every SiteProof screen. Tokens live in `src/index.css` (`@theme`); shared building blocks in `src/components/ui.tsx` (components) and `src/components/classes.ts` (class strings). **Use these, never one-off colours, sizes or shadows.** Chosen 2026-10-17 (P06): direction A "Field Ledger", with direction B's site buttons and step ring.

## Who it's for

- **Workers:** cheap Android phones, often outdoors in bright sun, poor or no network, sometimes gloves, mixed literacy.
- **Admins:** laptops and phones, reviewing many clock-ins at once.
- **Buyers:** NGO and contractor managers who need to trust the evidence.

**Personality:** trustworthy, plain-spoken, field-tough, calm.
- **Trustworthy:** clock-ins read like records (aligned times, receipts, stamps), not like a game.
- **Plain-spoken:** short sentences that say what happened and what to do next.
- **Field-tough:** high contrast, big targets, no dropdowns where a tap will do.
- **Calm:** one strong colour, little motion, no decoration.

## Colour

| Token (Tailwind) | Value | Use | Contrast |
|---|---|---|---|
| `brand` | `#0F6B63` | Primary buttons, selected states, links, brand | White on it 6.4:1; on white 6.4:1 |
| `brand-700` | `#0B5751` | Hover, status text ("Uploaded") | 8.4:1 on white |
| `brand-900` | `#06312E` | Text on `brand-50` | 13:1 |
| `brand-50` / `brand-100` | `#EEF7F6` / `#D4ECE9` | Success backgrounds, done steps | — |
| `gray-50` | `#F2F5F4` | Page background (cool stone) | — |
| `gray-100`–`200` | `#E7EDEB` / `#D3DDDB` | Dividers, card borders, skeletons | — |
| `gray-300`–`400` | `#B4C4C1` / `#8A9D9A` | Input borders, decorative icons **only** | Not for text |
| `gray-500` | `#566966` | Small secondary text | 5.8:1 on white |
| `gray-600` | `#445653` | Secondary text (default) | 7.8:1 on white |
| `gray-700`–`900` | `#33433F` … `#0F1F1D` | Body text, headings | 10–17:1 |
| `amber-100` / `amber-950` | Tailwind | Flags and warnings (chip background / text) | 7.9:1 |
| `amber-400` | Tailwind | The current step (with `gray-900` text) | — |
| `red-50` / `red-700` / `red-900` | Tailwind | Errors, Reject, Not accepted | 7.7:1+ |

Tailwind's grey scale is **replaced** by the brand-tinted neutrals above, so `text-gray-600` etc. are already on-brand. No Tailwind blue is used. Field guidance asks for about 7:1 outdoors, so body text stays at `gray-600` or darker. **Status is never colour alone:** every state also has a word and an icon.

## Type

| Role | Font | Where |
|---|---|---|
| `font-sans` (default) | **Atkinson Hyperlegible Next** 400/600/700 | All body text. Made for low vision; tells I, l and 1 apart (staff codes, PINs) |
| `font-display` | **Archivo** 700/800 | Page titles, status ("Clocked in"), big buttons, the wordmark |
| `font-mono` | **Atkinson Hyperlegible Mono** 500 | Times, staff codes, record IDs, PIN entry; add `tabular-nums` so columns line up |

The fonts are bundled from Fontsource (Latin subset, only these weights, about 77 KB, precached for offline use). No font CDN: the CSP allows `font-src 'self'` only.

**Scale (rem):** `text-xs` .75 · `text-sm` .875 · `text-base` 1 · `text-xl` 1.25 · `text-2xl` 1.5 · `text-3xl` 1.875 · worker status `min(2.75rem, 11vw)` (fits at 200% text). Worker screens use at least 16 px for anything that has to be read; 14 px only for secondary lines. Headings: `font-display font-extrabold leading-tight`. Labels: `text-sm font-semibold text-gray-700`. Eyebrows: `text-xs font-bold uppercase tracking-[0.08em] text-gray-600`.

## Shape, depth, spacing

- **Radius:** `rounded-control` 0.75 rem (inputs, buttons, alerts), `rounded-card` 1 rem (cards, dialogs), `rounded-full` (pills: site buttons, badges).
- **Shadows:** `shadow-card` (resting cards), `shadow-raised` (the main action, the proof slip, the login card). Nothing else casts a shadow. No glass or blur.
- **Spacing:** Tailwind's 4 px scale. Page gutter 16 px (`p-4`). Gaps between sections 20 px (`gap-5` / `space-y-5`). Card padding 16–20 px.
- **Widths:** worker screens `max-w-md`; admin `max-w-6xl`; forms and dialogs `max-w-md`/`max-w-xl`.
- **Touch:** every control at least 44 × 44 px (`min-h-11`); primary worker buttons 56–80 px.

## Motion

Three durations: **150 ms** (presses, hovers), **250 ms** (`animate-rise`: a card arriving), **400 ms** (`animate-stamp`: the signature moment). One easing: `ease-out-soft` (`cubic-bezier(.2,.8,.2,1)`). Pressed state: `active:scale-[0.98]`. Only `transform` and `opacity` animate. `prefers-reduced-motion` turns all animation off (`src/index.css`). Nothing moves in the background.

## Components (`src/components/ui.tsx`, `classes.ts`)

| Piece | Use |
|---|---|
| `button.primary` / `secondary` / `danger` / `dangerOutline` / `link` / `icon` | One primary action per screen. `link` is a quiet text action that still meets 44 px. `icon` buttons always have `aria-label` |
| `field`, `label` | Text inputs, selects, date pickers: one border, one teal focus ring |
| `card` | White surface with a light border and `shadow-card` |
| `Alert` (`error` / `warning` / `success` / `info`) | Messages: icon plus text; errors are announced (`role="alert"`) |
| `Badge` | Short state labels (Needs review, Approved, Rejected) |
| `PageHeader` | Each admin page's title, one line of explanation, and its main action |
| `Spinner`, `SkeletonList` | Loading: skeleton rows for lists, a spinner for single panels |
| `LogoMark`, `Wordmark` | The icon (drawn inline, no request) and "Site**Proof**" |

**Worker pieces (`src/components/worker/`):** `SitePicker` (large site buttons, real radio inputs; a dropdown above 8 sites), `ClockSteps` + `StepRing` (where the worker is in a clock-in), `ProofSlip`, `RecentList`.

## Signature moments

1. **The proof slip.** After every clock-in the worker gets a receipt: the time in large mono digits, the date, site, distance, GPS accuracy, worker, record ID, their photos, and live ticks ("Saved on this phone" → "Sent to your organisation"). A round **ON SITE** stamp lands once (400 ms) when the phone's own check passes. It shows **AWAY** with the distance otherwise, and nothing without GPS. The server's flags remain the final word.
2. **The step ring.** Location → face photo → (site photo): chips name the steps and a ring shows progress. Done steps are teal, the current step amber. It appears while locating, on the camera, and on the site-photo step.
3. **The ledger.** Wherever records are listed (Recent clock-ins, Review), times sit in one mono column, and flags are amber pills with an icon and words.

## Rules

- Hierarchy by size and weight first, colour second. One dominant element per screen (the worker status, the admin page title).
- Copy says what happened and what to do next, without blame (see existing messages). Never call the smile check "biometric".
- Empty states say what will appear and how to get there. Errors offer the next step.
- Dark text on light backgrounds (readable in sun). No gradients, glass, emoji or decorative motion.
- Icons: Lucide only, default stroke (2). Decorative icons get `aria-hidden`.
- New screens: 360 px first, then desktop. Check with axe (no violations), tap targets (44 px) and 200% text before shipping.
