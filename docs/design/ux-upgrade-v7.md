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


---

## v8 refinement (2026-11-27, after the team review meeting)

Brief: better navigation and use of space, much better mini-games and cards, far fewer requests, refinement throughout. The owner then added a focus lock and a signature loading animation for kit generation.

### What changed

| Area | Change |
|---|---|
| Navigation | The side rail is gone. A compact top bar holds the logo, New lesson, My lessons, Classes, Admin (admins) and the avatar menu (EN/عربي, Sign out). Phones get the same items in a drawer (Esc closes, focus trapped, 44 px). The open lesson's tabs, whiteboard, Share and Results live only in the workspace header and bottom bar. The workspace now uses the full width. |
| Create | A Curriculum select sits next to Class and Language (default General, labels from `CURRICULUM_LABELS`, sent in `CreateLessonBody`). |
| Generation | Making a kit opens one full-viewport generation view and a focus lock (`lib/generation-lock.ts`): the app behind is `inert`, Esc does nothing, other URLs redirect back, `beforeunload` warns, a refresh re-locks from `localStorage` or from the lessons list. Exits: confirmed Cancel, or READY / PARTIAL. A lamp hero draws a line of light to each resource as it is made (real `resource.progress`), with analysis then Slides, Worksheet, Quiz, Cards, Games each in waiting / working / done / failed with retry. Reduced motion shows a static ring. |
| Requests | One shared socket per tab, ref-counted rooms, one token fetch, backoff. No polling while connected; 5 s light-status fallback only while disconnected. See `apps/web/src/lib/REQUESTS.md`. |
| Games | Thinking games first everywhere (`GAME_KINDS`). New Odd one out. Reasons on wrong answers, optional hints with their cost, Match rounds of 3, 4, 5 pairs, Sort and Sequence by drag, tap or keyboard. Points shown apart from XP, `wrongTries` and `hintsUsed` posted. |
| Cards | Flip deck (tap, Space, arrows, swipe), progress bar, shuffle, Got it / Review again piles with a review loop, grid toggle and a print-to-PDF link for teachers. |
| Share | The teacher ticks the games to publish (top two thinking games by default), sees the points split live, and `ShareBody.games` is sent. The live board lists the published games and their points. |

### Audit findings and fixes

Method: every screen captured with `qa/shoot.mjs` (mocked API) at 1440, 1280, 1024, 390 and 360 in EN and AR, plus the generation frames (`qa/gen-frames.mjs`). Lenses: the impeccable critique questions (hierarchy, rhythm, use of space, states), the UX KB rules on loading, motion and navigation (`kbq rules`). The `impeccable` and `taste` skills were not run as skills in this pass; their checks were applied by hand.

| # | Finding | Fix |
|---|---|---|
| 1 | The old `.board` rule in `teacher.css` (a two-column grid for the live board) leaked into every game board. In the Explorer sort game the how-to text sat beside the tiles and the baskets fell off the screen. | Game boards are plain blocks (`v8-games.css`). |
| 2 | Explorer tiles: the read-aloud button covered the label ("Choc", "Sunli"). | Wider Explorer tiles, label wraps, compact tiles on short screens so the baskets stay in view at 1280x720. |
| 3 | Workspace header at 1280 and below hid the labels of every action, including Share and Results, and wasted the free space on the title row. | Share and Results keep their labels above 700 px; Download and Preview stay icon-only. |
| 4 | RTL item rows clipped the start of Latin text ("otosynthesis"). | Item rows are flex rows that wrap. |
| 5 | A lesson title in the other language lost its start to the ellipsis ("...s: how plants make food"). | `unicode-bidi: plaintext` on titles. |
| 6 | Odd one out cards were a thin strip in the top half of a 900 px screen. | Larger cards and gaps on tall desktops. |
| 7 | Curriculum labels were cut in the select ("General (no national cur"). | Select may grow to 300 px. |
| 8 | Generation view on a 360 px phone pushed Cancel and the last step off screen; the percent overlapped the lamp. | Compact hero, smaller title and rows on small screens, percent under the lamp. The view fits 360x740, 390x844, 1024x768, 1280x720 and 1440x900 without scrolling. |
| 9 | The generation view stalled when a lesson rested at ANALYZED (polling stopped). | The generation view treats ANALYZED as busy (`awaitGeneration`); the workspace does not. |
| 10 | Duplicated actions: Results was in the rail, the edit panel and a dialog; the lesson's tabs were in the rail and the header. | One place each: the workspace header. |
| 11 | Dead CSS: about 40 rules for the side rail. | Removed from `app.css` and `v7.css`. |

### Motion inventory (new)

| Where | Motion | Purpose | Reduced motion |
|---|---|---|---|
| Generation hero | Glow scales with overall percent (spring); a line of light draws from the lamp to each resource (`pathLength`); the node ring fills with the live percent; the node pops once when done; the flame breathes; 7 sparks rise | Honest progress, tied to real steps | Static ring and percent, no sparks |
| Generation steps | Working row has a light sweep and a live percent bar; the done icon pops; a real "what Nibras is doing" line rotates every 3.2 s | Status without fake tips | One fixed line, no sweep |
| Reveal | The workspace fades in from 0.985 scale for 700 ms after the lock lifts | Orientation | None |
| Games | Spring on drag, drop and baskets; calm shake on a miss | Feedback | Opacity and colour only |
| Cards | 3D flip (rotateY spring) | Object permanence | Cross-fade |

All new motion animates `transform`, `opacity` or SVG stroke offset. Decorative loops pause in background tabs (`visibilitychange`).

### Not done or not verified

- The MotionScore audit needs the paid Motion+ MCP, which is not authorised in this environment. A manual check against its rules found no layout-property animation.
- The 21st catalogue and lucide-animated icons were not used.
- Live-points counter in the games assumes a weight of 100; the server value (`GameResultView.points`, `StudentGame.pointsWeight`) is what the result screen shows.
- Cross-device lock relies on the lessons list (a lesson still being made and created within 30 minutes); a lesson waiting at ANALYZED is not re-locked on its own.


---

## v9 motion and polish (2026-11-27)

Brief: a tool-driven pass. The v8 pass applied the rules by hand; this one ran the skills and MCP servers and records what each produced.

### Tool evidence

| Tool | What was run | Outcome |
|---|---|---|
| `impeccable` (critique, before) | Read the critique playbook, ran `detect.mjs` on the owned files (0 findings), design review of the before frames in `apps/web/qa/motion-v9/before/`. The two-assessment sub-agent split was not used (degraded single-context run: this session was itself a sub-agent). | The lamp hero was flat (one glow, straight lines, no depth). Step icons were generic Lucide and static. The status circle and the mascot art doubled each other in every row. There was no completion moment (the view only faded). Dialogs, drawer and toast had no exits. The nav current item was a static fill. A miss in the games still used a sideways shake. The win card had one confetti and no sequence. |
| `taste` | Direction. | Three words: calm, precise, alive. One signature move: the line of light from the lamp. Subtraction first (the duplicated per-row status line became one rotating line). Wins are the only place that may be playful; the wrong-answer cue is a soft amber halo. |
| `emil-motion` | Purpose, duration, easing, origin, interruptibility. | 160 ms exits (ease-in), 300 ms entrances (ease-out), press 90 ms. Route move is origin-aware (end edge going deeper, start edge going back, mirrored in RTL). Springs only where interruptible (the nav pill, the lamp glow). The primary task (editor, quiz question) never moves. |
| `motion` | Motion for React patterns, CSS `linear()` springs. | `AnimatePresence` for the toast (`mode="wait"`) and the rotating status line; `pathLength` and `strokeDashoffset` for the lines of light; `layoutId` for the nav pill. The skill's `generate-css-easing` tool is not exposed in this environment, so `--ease-spring-soft` and `--ease-spring-pop` were sampled from a damped spring with a small script (27 points each). |
| MCP `lucide-animated` | `search_icons` for presentation, file, list, game, layers, check, sparkles, users, plus, shield, book; `get_icon` for layers; the registry JSON of layers, check, file-text, users, plus, shield-check and sparkles was read to take their animation (it needs only `motion`). | Found: sparkles, file-text, layers, check, users, plus, shield-check. Not in the library: presentation, gamepad, list-checks, book-open (it has chess pieces, book-text and bookmarks). `npx shadcn add` was not run (it could touch `package.json`). The icons are one local component, `components/ui/animated-icons.tsx`: the registry paths and variants as data, and the four missing icons animated in the same style from the Lucide path data. Used for the six generation steps and the nav. |
| MCP `21st` | `get_inspiration` ("AI generation progress stepper, completion celebration") and `search` ("multi-step loader progress"). | Metadata only, no paid code fetched. Ideas adopted and adapted to our primitives: the spring progress line with a traveling dot (our line of light with a spark), icon-to-check morph and a pulsing active badge (our check that draws once, the ripple), a rotating status line (our cross-fading real status text). Nothing pasted. |
| MCP `motion` | `search-motion-docs` for AnimatePresence exit and SVG path drawing. | The AnimatePresence docs and the "Exit animation" and "AnimatePresence modes" examples (MotionScore S) were used. The path-drawing query matched nothing; `pathLength` is documented on the motion component and was used as is. The MotionScore audit needs Motion+, which is not authorised here. |
| UX KB (`kbq rules`) | "loading progress", "motion animation", "celebration children", "wrong answer feedback". | One continuous bar for a multi-step job, determinate progress, never a loop that implies false progress. Motion only when purposeful, compositor properties only, exits faster than entrances, reduced motion removes parallax and large moves and keeps opacity. Calm, non-blocking feedback at the point of action. |
| `impeccable` (final gate) | `detect.mjs` on the changed files and CSS, then a review of the after frames. | See "Final gate" below. |

### What changed

| Area | Change |
|---|---|
| Generation hero | Four layers: a halo that scales with the real percent, a light cone that breathes, the lamp with a ground shadow, and the nodes. A line of light is drawn to each resource (`pathLength` with a soft glow underneath; a spark travels along it only while that resource works). Each node holds its own animated icon (looping while working), a ring with the live percent, and a ripple when done. |
| Completion | The nodes pop in a 90 ms stagger, one light bloom opens from the lamp, the percent turns into a check, then the whole view eases out (scale 1.025, 320 ms) and the workspace is revealed. A timer backs the exit up, because animations do not complete in a hidden tab. Reduced motion: a 500 ms hold and no bloom. |
| Status | One rotating, real status line (the existing `gen.doing.*` keys) cross-fades every 3.2 s with `AnimatePresence`. The polite live region still carries only the honest state. Rows rise in a short stagger. |
| Step rows | The status circle shows the resource's own animated icon: it loops while working, the check draws once when done, and a still dimmed icon shows while waiting. |
| Top bar | A frosted bar that fades out at its lower edge (no hard line). One shared pill slides to the current item (`layoutId`). Icons play once on hover and focus (New lesson plus, My lessons book, Classes users, Admin shield). |
| Route transitions | The stage enters from the end edge going deeper and from the start edge going back (18 px plus fade, mirrored in RTL). Never on the first paint. A plain fade under reduced motion. |
| Exits | Dialog and drawer play a 160 ms exit (class `closing`, then `onClose`); Esc, the backdrop and the close button share it. The toast leaves through `AnimatePresence`. Reduced motion and tests close at once. |
| Buttons | Press 90 ms, a firm `linear()` spring on release, and primary hover adds a touch of saturation. |
| Win card | A gold bloom, confetti scaled to the stars (18, 24 or 30 pieces, once), mascot then title then stars in a stagger, a glow on each earned star only, and `+XP` counting up after the last star. Wins only: no stars, no celebration. |
| Games | A wrong answer is a soft amber halo that fades (no shake, no red, no shame cue). A correct match settles with a tiny spring. The feedback line rises in. |

### Verification

Numbers are in the final report of this pass. Frames: `apps/web/qa/motion-v9/before/` and `after/` (EN and AR, 1280x720, produced by `qa/motion-v9/capture.mjs`).

### Final gate

- `detect.mjs`: no findings on the TypeScript files. The CSS reported "bounce easing" for the two spring tokens. They stay on purpose: `--ease-spring-soft` overshoots about 1.5 percent (imperceptible; press release and a match settling) and `--ease-spring-pop` about 12 percent and is used only on the student win card (the `playful` spring in the design system). The teacher-side check pop uses plain ease-out.
- Review: hierarchy, spacing rhythm and depth on the top bar and the generation view; AA contrast kept (the pill is the existing gradient behind white text); visible focus unchanged; RTL mirrored; no layout property animated (a test parses every `@keyframes`).

### Not done or not verified

- Route exits: the App Router unmounts the old page at once, so only the entrance is spatial. A real cross-fade needs the View Transitions API through the Next router (the `viewTransition` flag in `next.config.ts`, outside this pass).
- The MotionScore audit still needs Motion+.
- The slide previews and the item editor belong to the slides pass and were not touched.
