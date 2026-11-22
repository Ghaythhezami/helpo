# Nibras design system (v7)

One token source: `apps/web/src/styles/v7.css` (`:root` block) on top of the older palette in `globals.css`. One primitive set: `apps/web/src/components/ui/`. Motion tokens are mirrored in `apps/web/src/lib/motion.ts`. This file is the contract; if code and this file disagree, fix the code.

Direction in three words: **warm, calm, playful** for students; **warm, calm, precise** for teachers. One accent (violet), authored neutrals (ink-tinted, never grey), one signature move (the sliding tab pill plus ink-tinted layered shadows).

## 1. Colour roles

The brand palette stays (`--pri #6035CF`, gradient `#582BC8 to #764BD2`, page `#F4F0FE`). v7 names the roles so components stop picking hex values.

| Role token | Value | Use | Contrast |
|---|---|---|---|
| `--c-text` (`--ink`) | `#24185F` | Headings, body | 15.9:1 on white |
| `--c-text-muted` (`--ink2`) | `#4A3F86` | Secondary text | 7.99:1 |
| `--c-text-subtle` (`--ink3`) | `#6A60A0` | Captions, placeholders | 4.94:1 on page (AA) |
| `--c-accent` (`--pri`) | `#6035CF` | Links, focus ring, selected | 6.45:1 on white |
| `--c-accent-soft` (`--soft`) | `#EBE2FD` | Selected rows, hover fills | decorative |
| `--c-surface` / `--c-surface-sunk` | `#FFF` / `#F8F5FF` | Cards / wells | n/a |
| `--c-border` (`--line`) | `#E6DEFB` | Decorative dividers only | not for controls |
| `--c-border-strong` (`--field-line`) | `#8777C4` | Input and control borders | 3.08:1 (WCAG 1.4.11) |
| `--c-success` / `-bg` | `#17703F` / `#DCF5E3` | Ready, correct | 5.32:1 |
| `--c-attention` / `-bg` | `#7A4E00` / `#FDE4A3` | To check | 5.76:1 |
| `--c-danger` / `-bg` | `#A8231B` / `#FDE8E6` | Errors (always with icon and text) | 7.2:1 |

Rules: accent is scarce (primary action, selection, focus). Status is never colour alone: icon and text always travel with it. Gradients only on the primary button, the selected rail item and the brand tab pill.

## 2. Typography

Display is Fredoka (Baloo Bhaijaan 2 in Arabic), text is Nunito (Tajawal in Arabic). Root stays 100% (16 px) so the user's setting scales every `rem`.

| Token | Size | Role |
|---|---|---|
| `--fs-xs` | 0.75rem (12) | Overlines, chips (never body) |
| `--fs-sm` | 0.875rem (14) | Secondary text, captions |
| `--fs-md` | 1rem (16) | Body, inputs (inputs never below 16) |
| `--fs-lg` | 1.125rem (18) | Lead text, student answers |
| `--fs-xl` | 1.375rem (22) | Card titles, dialog titles |
| `--fs-2xl` | 1.75rem (28) | Screen section titles |
| `--fs-3xl` | 2.25rem (36) | Result numbers |
| `--fs-display` | clamp(1.75rem, 3.2vw, 2.75rem) | One per screen, the page headline |

Line height: `--lh-tight` 1.15 (display), `--lh-snug` 1.3 (titles), `--lh-body` 1.5. Weights: body 600, strong 800, display 700. Numbers in counters use tabular figures. One `h1` per screen.

## 3. Spacing and radii

4 pt rhythm: `--sp-1..7` = 4, 8, 12, 16, 24, 32, 48. Space groups things before borders do. Radii: `--r-sm` 10 (chips, inputs inside dense rows), `--r-md` 14 (rail items, list rows), `--r-lg` 20 (cards), `--r-xl` 28 (hero cards, dialogs), `--r-pill` (buttons, tabs). Nested radii step down by the padding.

Touch targets: at least 44 px everywhere, at least 64 px in the Explorer band (grades 2 to 5). Inline text links get a 44 px hit area through padding.

## 4. Elevation

Ink-tinted, one light source from above. Never a grey shadow, never more than three levels.

| Token | Use |
|---|---|
| `--e0` | Flat, inside another surface |
| `--e1` | Resting cards, tiles, list rows |
| `--e2` | Hero card, hovered cards, selected media |
| `--e3` | Dialogs, popovers, drag in progress |

Hover lift is `translateY(-2px)` plus `--e2`. Press returns to rest and scales to 0.97 to 0.99.

## 5. Focus

`:focus-visible` shows a 3 px solid `--pri` ring with a 3 px offset (6.45:1 on the page). It appears at once, is never transitioned out, and is never removed. Forced-colors maps it to `Highlight`.

## 6. Motion tokens

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 90 ms | Press feedback |
| `--dur-fast` | 140 ms | Hover, colour, small toggles |
| `--dur-base` | 200 ms | Tab content, small reveals |
| `--dur-slow` | 300 ms | Drawers, toasts |
| `--dur-enter` | 360 ms | Dialogs, cards entering |
| `--dur-exit` | 160 ms | Anything leaving (faster than entering) |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | Entering and responding to input |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | Leaving |
| `--ease-in-out` | `cubic-bezier(.65,0,.35,1)` | Moving on screen |

Springs (`lib/motion.ts` `SPRING`): `snappy` (stiffness 520, damping 40) for controls and the tab pill, `soft` (300/32) for surfaces, `playful` (420/16) only for student rewards (stars).

Principles (Emil Kowalski): motion has a purpose (state, origin, feedback, attention); UI motion is 150 to 300 ms; animate transform and opacity only (SVG stroke offsets for chart reveals); origin-aware (dialogs from centre, drawer from the start edge, toast from below); interruptible (springs, no blocking); no motion near the primary task while it is in progress (the editor, the quiz question and the whiteboard stay still); under `prefers-reduced-motion` every movement becomes an instant or opacity-only change and confetti, shimmer and count-ups are removed.

## 7. Components (`components/ui`)

| Component | Variants and states | Notes |
|---|---|---|
| `Button` / `ButtonLink` | primary, secondary, ghost; sm, md, big; hover, active (scale .97), focus, `aria-disabled` (stays focusable), `aria-busy` (sweep) | One primary per view |
| `Tabs` | roving tabindex, RTL arrows, badge, status dot; sliding indicator (`layoutId` per group) | Indicator is a spring, instant under reduced motion |
| `Dialog` | modal, wide, drawer; focus trap, Esc, focus return | Enters from centre (scale .97, rise 12 px); drawer slides from the start edge |
| `Toast` | plain 3.5 s, with Undo 8 s; polite live region | Rises from below |
| `Progress` | `scaleX` fill, never `width` | |
| `Pill` | ready, check, soft, neutral; icon plus text | |
| `states.tsx` | `LoadingState` (skeleton), `EmptyState` (illustration, title, one action), `ErrorState` (retry) | Skeleton after 150 ms is the rule; no spinners |
| `motion.tsx` | `CountUp` (final value in the DOM from first paint), `Confetti` (wins only), `Skeleton` | New in v7 |
| `illus.tsx` | Decorative illustration from `/public/illustrations` | Always `aria-hidden` |

Iconography: Lucide, one stroke weight (`.ic` 2.6), 20 px in buttons, 24 px in the rail, 16 px inline. Illustrations are the mascot set in `/public/illustrations`; emoji are not used as icons.

## 8. Patterns

- **Empty states:** illustration (44 to 96 px), one sentence that says why, one verb-first action.
- **Loading:** a skeleton shaped like the content (Create card, list rows, result card), `role="status"`, `aria-busy`, hidden text for screen readers.
- **Errors:** text next to the field, `aria-invalid` plus `aria-describedby`, how to fix it, retry where a retry exists.
- **Rewards (student):** wrong answers read "Not yet" with the explanation and no negative motion; stars, XP count-up and confetti appear only on the result card of a finished round with at least one star; no individual leaderboards for grades 2 to 5; no timers in Explorer.
- **No page scroll:** the shell is 100dvh; only inner panels scroll (the rail list scrolls, its footer stays).

## 9. Do and don't

| Do | Don't |
|---|---|
| Use a token | Type a hex or a pixel radius into a component |
| Animate `transform` and `opacity` | Animate `width`, `height`, `top`, `margin` |
| Give every animation a reduced-motion fallback | Loop animation near a task in progress |
| Keep one primary action per view | Put two gradient buttons side by side |
| Show status with icon and text | Rely on colour alone |
