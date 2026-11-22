# UX and motion upgrade v7: critique and plan

Owner brief: the app "still feels primitive". Target: top-tier UI, UX and motion, following the UX/UI knowledge base (`C:\Users\A\Desktop\DEV\UX UI`). Floor: the v6 mockups (`design/mockups/v6`). Date: 2026-11-21.

## How this was judged

- **Evidence.** Every screen was captured at 1440x900 and 390x844 in English and Arabic with the QA harness (`apps/web/qa/shoot.mjs`, mocked API, `BASE=... SIZES=desktop,mobile390`). Before shots are in `apps/web/qa/upgrade-v7/before-*.png`, after shots in `after-*.png`. Code was read for the cause of each defect.
- **Lenses.** `impeccable` critique (Operate mode for teacher screens, Experience for the student result), `ui-ux-pro-max` (Hick, Von Restorff, Peak-End, Doherty, Nielsen), `taste` (subtraction, one signature move, authored neutrals), `design:design-system` (token coverage), `emil-motion` and `motion` (purpose, 150 to 300 ms, origin, interruptibility, compositor-only).
- **KB rules pulled (MUST).** Motion (T11 1.7): justify each animation by function, interruptible, compositor properties only, respect reduced motion, never make users wait. States (T11, T08): loader only after 150 to 300 ms and a skeleton shaped like the content; disable shimmer under reduced motion; every screen has ideal, empty, error, partial, loading. Hierarchy (T05): one focal point and one primary action per view, prominence maps 1:1 to importance, combine levers (weight and colour, not size alone). Type (T06): sizes from a predefined scale, `rem`, body at least 16 px. Colour (T07): roles not hues, every pair verified. Forms (T09): labels, inline errors, feedforward before disabling. Children (T20): no loss framing, no pressure, reward effort, well-being above engagement.
- **Detector.** `impeccable detect` over `src`: four findings, all minor (one `transition: width` in `app.css:1535`, three accent-border patterns in `teacher.css:177,186` and `extras.css:903`). Run in a single context (no sub-agent isolation), so this critique is a degraded run by the skill's definition.

## What makes it feel primitive (ranked)

1. **The rail is built from heavy white 56 px tiles.** A 2019-era rule `.rail button` (`teacher.css:289`) out-ranked the rail's own item styles, so every button item became a bordered white tile while link items did not. The result is two different item looks, a toggle that is a white slab, and a footer that was clipped off the bottom in the workspace at 900 px tall (Results half hidden, language switch cut). *KB: consistency (T23), alignment (T05 1.4), no 2-D clipping.* Fix: flat items on one rule, nav list scrolls, footer pinned.
2. **The workspace header does five jobs in one row.** Truncated title ("Photosyn..."), five tabs each with an illustration, a status dot and a badge, then Download, Preview and Share. Two secondary actions fight the one primary. *Hick, Von Restorff, T05 "one primary action", T05 "limit high-dominance elements".* Fix: secondary actions become icon-only (names kept for assistive tech) below 1560 px, the title keeps a minimum width, the primary stays the only gradient button.
3. **Motion is almost absent.** Only four files use `motion`; tab switches, list reorders, dialogs, drawers and toasts all snap. State changes feel abrupt, which reads as cheap. *Emil: motion explains state change; T11 1.7.* Fix: a motion token set and a small set of purposeful animations (section 5).
4. **Depth is flat and uniform.** One shadow (`--sh`) is used for everything, borders are all 1 px lilac, hover does little. There is no elevation scale, so nothing is "above" anything. *taste: depth is a material; T05 figure and ground.* Fix: `--e1..e3` ink-tinted elevation, hover lift on things that open.
5. **Loading is text or three grey bars.** Create shows the word "Loading", result and join steps show plain lines, panels show three centred bars. Layout jumps when data arrives. *T08 skeleton shaped like the content; Doherty threshold.* Fix: content-shaped skeletons with a sweep (static under reduced motion), `aria-busy`.
6. **Type is one heavy weight.** Almost everything is 800 to 900 (titles, tabs, chips, buttons, row labels), sizes are ad-hoc pixels (11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 40 across four sheets), so hierarchy relies on size alone. *T06 predefined scale; T05 combine levers.* Done: a rem scale and weight roles are defined as tokens. Not done: migrating every old pixel size to the tokens (see "Not done").
7. **Iconography and illustration are mixed without a rule.** Lucide line icons, full-colour illustrated SVGs in the tabs and rail, emoji on slides, and the dropzone used a plain document glyph where the v6 mockup uses the cloud illustration. *taste: consistent illustration; T25.* Done: the dropzone uses the cloud illustration and lifts on hover and drag. Open: rail and tab illustrations are kept (product decision from v6), sized by one rule.
8. **Empty states are bare lines.** "No lessons yet" under Previous lessons is a muted sentence. *T08 first-use empty state is onboarding.* Fix: illustration plus sentence.
9. **Student reward moment is a pasted sticker.** The result card laid a static confetti SVG behind the text, stars only scaled in, and the XP number just appeared. The practice hub wrapped game buttons into a ragged second row. *Peak-End rule; T20 reward effort, only on wins.* Fix: a short confetti burst only when at least one star was earned, stars spring in one by one, XP counts up, hub game buttons are an even grid with one primary per lesson.
10. **Feedback is thin at the key moments.** The "Make lesson kit" button changes label only; the Refine button greys out; a correct answer changes colour only; Share shows the code with no arrival. *T11 feedforward and feedback.* Fix: busy sweep on Make and Refine, a one-shot ring on the correct answer, the "Not yet" feedback rises in calmly, code and QR arrive with a soft pop.

Smaller observations, not ranked: the public landing page is dense for a first screen and prints the demo password and demo e-mails in clear text (intended for the demo picker, but worth removing before a real launch); Create's disabled "Make lesson kit" gives no hint of what is missing (the nearby text states it, the button does not); chart numbers jumped in without reveal; `transition: width` at `app.css:1535` animates a layout property.

## Strengths to keep

Strong, consistent violet identity and a friendly mascot set; RTL and bilingual layout mirrored correctly; targets at least 44 px and 64 px for Explorer; every screen already has loading, error and empty handling; calm copy ("Not yet", "Questions are not ranked"); the no-scroll shell.

## Plan and what was done

| Step | Work | Status |
|---|---|---|
| 1 | Critique, screenshots before | Done (`qa/upgrade-v7/before-*`) |
| 2 | Tokens: type, space, radii, elevation, colour roles, focus, motion; `docs/design/DESIGN_SYSTEM.md` | Done (`styles/v7.css`, `lib/motion.ts`) |
| 3 | Primitives: `CountUp`, `Confetti`, `Skeleton`, sliding `Tabs` indicator, FLIP hook for lists | Done |
| 4 | Create: skeleton, cloud dropzone with hover and drag states, Refine shimmer, busy Make button, staggered entrance, empty previous-lessons | Done |
| 5 | Making: card entrance, done pop, working pulse, step dots | Done (CSS) |
| 6 | Workspace: tab pill slides, tab content rises, list reorder springs (FLIP), icon-only secondary actions, rail fixed | Done |
| 7 | Dialogs, drawer and toasts: origin-aware entrances | Done (enter only, see Not done) |
| 8 | Share: code and QR arrival | Done |
| 9 | Results: count-up numbers, donut, line and bar reveals | Done |
| 10 | Student: hub grid, skeletons on join steps, calm quiz feedback, result card (burst, stars, XP count-up) | Done |
| 11 | Verify: typecheck, lint, tests, build, scroll check, Lighthouse, impeccable gate | See the final report |

## Motion inventory

| Where | Motion | Duration and curve | Purpose | Reduced motion |
|---|---|---|---|---|
| Tabs (workspace, results) | Pill slides between tabs (layout, transform) | spring snappy 520/40 | Orientation, shows where you are | instant |
| Workspace tab content | Rise 8 px and fade | 200 ms ease-out | Show that content changed | fade only |
| Item list reorder | Rows spring from old to new place (FLIP) | spring snappy | Object permanence when moving | none |
| Dialogs | Scale .97 and rise 12 px from the centre | 360 ms ease-out, overlay 140 ms | Origin and focus | fade only |
| Phone drawer | Slides from the start edge (mirrored in RTL) | 300 ms ease-out | Origin | fade only |
| Toasts | Rise from below with a small scale | 300 ms ease-out | Feedback | fade only |
| Create card | Children rise in a 40 ms stagger, previous lessons 50 ms stagger | 360 ms ease-out | Sequence, not a wall | fade only |
| Dropzone | Hover lifts the illustration 3 px; drag-over scales 1.015, solid border, ring | 200 to 300 ms | Feedforward for drop | none |
| Refine with AI, Make lesson kit | Light sweep across the button while busy | 1.1 to 1.2 s loop, only while busy | Honest progress | none |
| Buttons | Hover lift 1 px, press scale .97 | 140 ms and 90 ms | Tactile feedback | no lift |
| Cards (lessons, share choice, demo) | Hover lift 2 px with elevation | 200 ms | Affordance | none |
| Making | Step dot pops when done, pulses while active; cards rise in a stagger, pop when done, pulse while working | 300 to 360 ms | Honest status | fade only |
| Share | Code and QR pop in (QR delayed 90 ms) | 360 ms | Peak moment | fade only |
| Results | Numbers count up; donut arc, line and bars reveal | 0.7 to 0.9 s | Make the data arrive; final value always in the DOM | none, final value |
| Quiz | "Not yet" or "Right" feedback rises; correct answer gets one soft ring; selected answer scales 1.01 | 200 and 700 ms | Calm feedback, no shake | none |
| Result card (win) | Confetti burst (18 pieces, once), stars spring in one by one, `+XP` counts up | 1.4 s, spring playful | Celebrate effort, wins only | no burst, no count |
| Practice hub | Lesson cards rise in a stagger | 360 ms | Sequence | fade only |
| Skeletons | Light sweep | 1.3 s loop | Loading | static tint |

Every animation uses `transform` and `opacity` (the chart reveals use SVG stroke offsets). The practice and question screens do not animate near the primary task while it is in progress: the quiz question, the game boards and the editor stay still.

## Not done (honest list)

- Exit animations for dialogs and toasts: entrances only. Exits need `AnimatePresence` at each call site and would delay unmount in tests.
- Shared-element transition from the lesson card to the workspace header (cross-route; needs the View Transitions API wired through the Next router).
- Migrating every legacy pixel font size and the many hex colours in `app.css`, `extras.css`, `teacher.css`, `student.css` onto the new tokens. The tokens exist and new code uses them; the old sheets still carry literals.
- Reducing the heavy 800 to 900 weights across the old sheets.
- Rewriting the landing page and moving the demo credentials out of public view.
- A rendered Windows High Contrast check, screen-reader pass and a MotionScore audit (the Motion+ audit methodology needs the paid Motion+ MCP; a manual review against its rules is in the final report).
