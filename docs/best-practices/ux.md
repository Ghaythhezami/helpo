# Nibras web: UX/UI best-practices audit

Audit of `apps/web` against the owner's UX/UI knowledge base (`UX UI/UX-UI-Knowledge-Base`), read through its MUST rules and the checklists CHK02 (WCAG 2.2 AA) and CHK05 (UI states). Date: 2026-11-21.

**Topics used.** T13 Accessibility, T07 Color and contrast, T09 Forms, T11 Interaction states, feedback and motion, T12 Content and microcopy, T14 Mobile and touch, T15 Responsive and i18n (RTL), T20 Emotion, trust and ethics (gamification, dark patterns), T24 Anti-patterns, T05 Layout and hierarchy, T01 Cognitive load, T17 SaaS patterns (onboarding, settings), T19 Voice (read-aloud), T21 Data visualization. In this KB the topic numbers differ a little from our older docs: states and motion are T11, accessibility is T13, forms T09, mobile T14, RTL sits inside T15 and T12.

**How it was checked.**
- Production (`https://nibras-web-sage.vercel.app`): `/`, `/login`, `/signup`, `/join`, `/join?code=123456`, English and Arabic, 1280, 390 and 320 px wide. Read-only, no credentials typed. Probe output: `apps/web/qa/audit/prod-probe.json`.
- Local dev server with the API mocked by the existing QA harness (`qa/shoot.mjs`): `/app`, `/app/lessons/l1`, `/play/quiz/*`, `/play/games/*`, `/join`, `/login`, `/signup`, English and Arabic, 320/390/1280 px. Probe: `qa/audit/local-probe.json`. Explorer (grades 2 to 5) measured with a mocked `EXPLORER` band.
- The probe (`qa/audit.mjs`, re-runnable: `BASE=<url> node qa/audit.mjs`, or `MOCK=1 PAGES='[...]'` against a local server) records `lang`/`dir`, h1/main counts, targets under 44 px, controls without a name, inputs without a label, text contrast on solid backgrounds, page scroll, and the focus ring on the first 14 Tab stops. Text on gradient buttons is skipped by the probe (it cannot read gradients) and was computed by hand: white on `#582BC8` to `#764BD2` is at least 5.66:1.
- Code reading with `file:line` evidence. Screenshots are in `apps/web/qa/audit/`.

Status key: PASS, PARTIAL, GAP, N/A. Line numbers are after this audit's edits. Items marked **fixed** were a GAP or PARTIAL before this audit.

## Checklist

### Accessibility (T13, CHK02)

| # | Rule (KB) | Status | Evidence | Note |
|---|---|---|---|---|
| 1 | `lang` and `dir` on `<html>` follow the locale (T13, T15) | PASS | `src/app/layout.tsx:36`; probe: `en/ltr` and `ar/rtl` on all 90 page, size and language combinations (30 production, 60 local) | Also set on the language switch buttons (`language-switch.tsx:14`). |
| 2 | Pinch-zoom is not blocked (T13 6, CHK02) | PASS | `layout.tsx:24` (no `maximum-scale`) | |
| 3 | Reflow at 320 px, no 2-D scrolling (T13, T15) | PASS | Probe: `scrollWidth == innerWidth` on every page at 320 and 390 px, EN and AR | |
| 4 | One `h1`, one `main`, named `nav` (T13, T04) | PASS | Probe `h1=1 main=1` on all pages; `public-shell.tsx:26` (`nav` has `aria-label`) | |
| 5 | Skip link is the first Tab stop and lands on `main` (CHK02) | PASS | `globals.css:153`, `frame.tsx`, `shell.tsx:88`, `public-shell.tsx:14`; probe: first Tab stop is the skip link on every page | |
| 6 | Text contrast at least 4.5:1 (3:1 large) (T07, T13) | PASS | **Fixed (skip link).** The skip link's text was purple on its dark pill (2.1:1) because `.tapp a` / `.sapp a` out-rank `.skip-link`; now white (`globals.css:172-176`). Probe: 0 other failures on solid backgrounds. Tokens: `--ink3` on page 4.94, `--ink2` 7.99, `--ready`/`--chk` on their chips 5.32/5.76 (`globals.css:5-17`) | `--ink3` on `--soft` is 4.44:1 (marginal); not found on a rendered text in the probed screens. `--good` (4.02:1) is only used as an icon and fill, never as text. |
| 7 | Non-text contrast at least 3:1 for control boundaries (CHK02, T07) | PASS | **Fixed.** Input borders were `--line` (1.30:1 on white) and `#C3B5F2` (1.87:1). Now `--field-line` `#8777c4` (3.08 to 3.84:1): `globals.css:7`, `teacher.css:112`, `teacher.css:373`, `student.css:250`, `app.css:1390` | Test: `ux-audit.test.tsx` "input borders use the 3:1 --field-line token". |
| 8 | Focus always visible, at least 2 px and 3:1 (T11, T13) | PASS | `globals.css:79` (3 px `--pri`, 6.45:1 on the page); probe: every one of 14 Tab stops per page had a 3 px outline | Dialog, tabs and switch inherit it. |
| 9 | Keyboard order is logical, no traps (CHK02) | PASS | Probe Tab order follows reading order on `/`, `/login`, `/join`, `/app`, workspace, games | Only the modal dialog traps, on purpose. |
| 10 | Icon-only controls have names; decorative SVG hidden (CHK02, T25) | PASS | Probe: 0 controls without an accessible name; `whiteboard.tsx:119-137`, `dialog.tsx:41`, `workspace.tsx:410-412` | |
| 11 | Dialogs: focus in, Esc closes, focus returns, Tab stays inside (T08, T13) | PASS | `dialog.tsx:16,33`, `aria-modal` at `dialog.tsx:39` | The floating whiteboard is a non-modal `role="dialog"` (`whiteboard.tsx:191`) with no Esc handler; see Known gaps. |
| 12 | Custom tabs expose roles and states; arrows follow reading direction (T13, T08) | PASS | **Fixed.** `tabs.tsx:25-28` (RTL-aware arrows), `tabs.tsx:51-52` roving tabindex; the badge text `to check` was hard-coded English, now `t("tabs.toCheck")` (`tabs.tsx:59`) | Tests: "Tabs: in Arabic (RTL) the left arrow moves forward", "the hidden 'to check' text is translated". |
| 13 | Status and errors announced by live regions (T11, T13) | PASS | `toast.tsx:62`, `states.tsx:38`, `auth-form.tsx` (`role="alert"` in an `aria-live` wrapper), `join-flow.tsx:179` | |
| 14 | `prefers-reduced-motion` removes non-essential motion (T11, T13) | PASS | **Fixed.** Only 4 element-level guards existed for 31 animation/transition rules. Added a catch-all at `globals.css:186-197`; motion components already used `useReducedMotion` (`quiz.tsx:27`, `making.tsx:47`, `win.tsx:14`) | Test: "globals.css has a catch-all prefers-reduced-motion block". Not verified by a rendered run: no animation was in flight at probe time. |
| 15 | No hover-only actions (T11, T14) | PASS | `app.css:1142-1148`: the row tools appear on hover, on `:focus-within`, and always on coarse pointers | |
| 16 | Drag has a non-drag alternative (WCAG 2.5.7) (T13) | PASS | Sort and Match use click-to-select; **fixed** each list item has a menu with visible Move up / Move down / Duplicate / Delete (`workspace.tsx`, `.row-menu`, 44 px targets, `aria-expanded`), `Alt+Arrow` stays; **fixed** the whiteboard title bar is focusable: arrows move it, Shift+arrows resize it, each change is announced (`whiteboard.tsx`, `board.keys`). Tests: "Whiteboard keyboard", workspace reorder tests use the menu | Whiteboard stays full screen on phones. Esc on the floating whiteboard is still not handled (see Known gaps). |
| 17 | Sound is never the only cue; sound off by default; mute control (CHK02, T11) | PASS | `game-play.tsx:38` (off by default, the class setting only allows it); `game-bits.tsx:55` Sound toggle | |
| 18 | Colour is never the only carrier of meaning (CHK02) | PASS | Grid cells have hidden text (`results.tsx:206`), chart marks have `aria-label` (`charts.tsx:34,72,87`), tab status has hidden text (`workspace.tsx:247`) | |
| 19 | `prefers-contrast` and `forced-colors` support (CHK02) | PASS | **Fixed.** `@media (forced-colors: active)` and `@media (prefers-contrast: more)` at the end of `app.css`: 2 px borders on panels, tiles, tabs, tools, inputs and dialogs; `Highlight` focus ring; selected tab, rail item and tool use Highlight/HighlightText; swatches and the canvas use `forced-color-adjust: none`; tab status dots carry a glyph (check, dots, exclamation, dash). Tests: "Contrast and forced-colors support" | Not rendered in real Windows High Contrast; rules are verified by a CSS-text test and the whiteboard toolbar keeps its borders. |
| 20 | Page title describes the page (WCAG 2.4.2) (T13) | PASS | Titles come from `generateMetadata` per route (`lib/meta.ts`); the lesson page title is `<lesson title> · Nibras` (`workspace.tsx`). Tests: "Workspace: the document title names the lesson", "every route exports generateMetadata..." | Route titles are now translated (see 49). |
| 21 | Text expansion and text spacing (T06, T15) | PARTIAL | Layout uses wrapping and logical properties; mobile at 320 px passes in EN and AR | The WCAG 1.4.12 text-spacing bookmarklet was not run. |

### Touch and children (T14, T20, T13)

| # | Rule (KB) | Status | Evidence | Note |
|---|---|---|---|---|
| 22 | Targets at least 44 px (T14, CHK02) | PASS | **Fixed.** Language switch was 40 px high in the app shell (`app.css:43`), now 44 px with a thinner pill so the header height is unchanged. Mobile logo was 38 px wide, now 44 (`app.css:754`). Probe after fix: nothing under 44 px except the visually-hidden file input | |
| 23 | Inline links in a sentence have a usable hit area (T14) | PASS | **Fixed.** The sign-in/sign-up switch link was 19 px tall; now a 44 px hit area with no layout shift (`extras.css`, `.authalt a`) | WCAG 2.5.8 exempts inline links, this goes beyond it. |
| 24 | Grades 2 to 5 (Explorer): targets at least 64 px (T14 10-15 mm for children) | PASS | `band.ts:22` (`minTarget: 64`); game-bar controls 64 px; **fixed** Explorer read-aloud buttons are 64 px (`.sapp[data-band="explorer"] .ra`, tile padding widened). Test: "makes Explorer read-aloud buttons 64px" | Language switch and logo stay 44 px. |
| 25 | The Explorer band applies on every student screen (T14) | PASS | **Fixed.** `/play/*` always rendered `data-band="navigator"` (`play/layout.tsx` had no band), so Explorer styles only applied on `/join`. New `PlayFrame` reads the student's band (`frame.tsx:11-15`, `play/layout.tsx`) | Test: "PlayFrame: the frame takes the student's band". Measured: no page scroll in Explorer on any play screen at 320 and 390 px. |
| 26 | No individual leaderboards for children (T20) | PASS | `share-dialog.tsx:41,115-120` (Individual is disabled for grades 2 to 5, reason shown); default is Teams; `quiz.tsx:143` ("Questions are not ranked") | The block is in the UI; the API contract was not audited here. |
| 27 | Forgiving streaks, no loss framing (T20) | PASS | `messages/en.json` `student.saver`, `student.saver.none` ("A missed day will not break your streak."); wrong answers read "Not yet" (`cell.wrong`, `game.eq.wrong`) | |
| 28 | No timers or pressure for the youngest (T20, T01) | PASS | `band.ts:26` (`timers: false` for Explorer); timer is an opt-in toggle for Studio only (`game-bits.tsx:55`) | |
| 29 | No dark patterns: no fake urgency, confirmshaming, forced ads (T20, T24) | PASS | Landing copy: "No ads, no public profiles, no rankings" (`landing.tsx`); no countdowns or upsells found in `src`; destructive actions use `InlineConfirm` (`confirm.tsx`) | |
| 30 | Read-aloud for young readers (T19, T13) | PASS | `read-aloud.tsx`, `band.ts:23`; browser speech only, opt-in by tap, nothing autoplays | |
| 31 | Safe join: no password, no free personal data for children (T20) | PASS | `join-flow.tsx`: pick name from a list or type first name and last initial (`messages` `join.why.code`) | |

### Forms and errors (T09, T12)

| # | Rule (KB) | Status | Evidence | Note |
|---|---|---|---|---|
| 32 | Every field has a visible, persistent label (T09, CHK02) | PASS | `auth-form.tsx:73-90`, `join-flow.tsx:112,163`; probe: 0 unlabelled inputs, 0 placeholder-only | |
| 33 | Errors are text, linked to the field, announced (T09, CHK02) | PASS | **Fixed.** Fields now get `aria-invalid` and `aria-describedby` pointing at the error (`auth-form.tsx`, `ERR_ID`); join code field points at the status message (`join-flow.tsx:113,179`) | Tests: "AuthForm: a failed sign-in marks the fields invalid...", "AuthForm sign-up: names the missing fields", "Join: a code that matches nothing marks the code field invalid". |
| 34 | Error copy says how to fix it, in the user's language (T12, T09) | PASS | **Fixed.** Sign-in showed the server's English text even in Arabic; now always our translated line (`auth-form.tsx`, `messages` `auth.error.login`); existing-account case has its own instruction (`auth.error.exists`). A wrong join code showed "Nothing is live yet" because of an inverted condition (`usingCode && byCode.isError` is never true); now shows "That code doesn't match anything live." (`join-flow.tsx:188`) | Tests: "the sign-in error is Arabic in the Arabic UI", "an existing account gets a plain instruction". |
| 35 | Autocomplete, input types, paste allowed (T09) | PASS | `auth-form.tsx:74,78,84,92` (`name`, `organization`, `email`, `current/new-password`); no paste blocking; `inputMode="numeric"` on the code (`join-flow.tsx:113`) | |
| 36 | Do not disable the submit button without saying why (T09) | PASS | **Fixed.** Submit is never disabled while idle; on submit each invalid field gets an inline message, `aria-invalid`, `aria-describedby`, and focus moves to the first one (`auth-form.tsx`). Tests: "never disables submit while idle and validates inline on submit", "asks for a name and school..." | The join button still shows its reason (`join.why.*`). |
| 37 | Mark required and optional fields; password help (T09) | PASS | **Fixed.** Visible "(required)" text on every field, show/hide password toggle (`aria-pressed`, 44 px, `auth.show`/`auth.hide`), `autocomplete` on all fields, password hint linked. Test: "shows required marks as text, autocomplete hints and a 44px show/hide password toggle" |  |
| 38 | Directional icons mirror in RTL (T15) | PASS | **Fixed.** The sign-in arrow did not flip (`auth-form.tsx:95`); other arrows use `.flip` (`landing.tsx:27`, `making.tsx:145`, `workspace.tsx:362`). Prod screenshot `prod-_login-ar-mobile.png` showed the arrow pointing the wrong way | Test: "AuthForm: the forward arrow flips in RTL". |

### UI states (T11, CHK05)

| # | Rule (KB) | Status | Evidence | Note |
|---|---|---|---|---|
| 39 | Loading, error and data states on every data view (CHK05) | PASS | `states.tsx:59-77` (`Async`), used in `workspace.tsx:52`, `results.tsx:25-29`, `quiz.tsx:18`; skeleton respects reduced motion via the global guard | |
| 40 | A failed load is not shown as "empty" (CHK05) | PASS | **Fixed.** `CreateScreen` treated a failed class list as "no classes yet" and offered "Create a class". Now an error with Try again (`create-screen.tsx:31`) | Test: "Create: a failed class load is an error with Retry". |
| 41 | Empty states explain and offer one action (CHK05, T12) | PASS | `states.tsx:23-32`; `create-screen.tsx:35-40`, `results.tsx:121`, `classes.tsx:231` | |
| 42 | Network and server errors are human, with Retry (CHK05, T12) | PASS | **Fixed.** `errorMessage` (`api.ts`) now gives specific text: 400 names the fields ("Please check: page range."), 409, 413 (20 MB), 422, 429 with the `Retry-After` seconds, offline, network, server; EN and AR. Tests: "Specific error messages" |  |
| 43 | Toast timing: plain at most 5 s, with Undo 8 to 10 s (T11) | PASS | **Fixed.** Undo toasts lasted 7 s, now 8 s (`toast.tsx:45`); plain 3.5 s | Test: "Toast: a toast with Undo stays 8 seconds". |
| 44 | Irreversible actions confirm; reversible ones undo (T11, T20) | PASS | `confirm.tsx` (its group name was hard-coded English, now translated), `check-resolution` undo (`workspace-more.test.tsx:126`) | |
| 45 | Dismissal and overlays have a way back (CHK05) | PASS | `dialog.tsx:16,43` (Esc, backdrop click, close button) | |
| 46 | Offline state (CHK05) | N/A | The app is online-only (live classroom, API, sockets); no PWA or service worker | |
| 47 | Dark mode contrast (CHK05, T07) | N/A | There is no dark theme | |

### Copy, layout, RTL, charts (T12, T05, T15, T21, T01)

| # | Rule (KB) | Status | Evidence | Note |
|---|---|---|---|---|
| 48 | Plain language, short sentences, verbs on buttons (T12) | PASS | Screens in `qa/audit/prod-_-en-desktop.png`, `prod-_join-en-desktop.png`; samples: "Pick your grade, class and name to continue.", "Nothing reaches students until you approve it." | Judged by reading; no readability score computed. |
| 49 | Page titles and metadata are localised (T15) | PASS | **Fixed.** `lib/meta.ts` reads the `helpo_locale` cookie; every page and layout uses `generateMetadata` with translated `meta.title.*` and `meta.description`. Tests: "Page titles and descriptions" |  |
| 50 | No hard-coded UI strings (T15) | PASS | **Fixed** two (`tabs.tsx`, `confirm.tsx`). Remaining literals are placeholders that are numbers or class names (`join-flow.tsx:113`, `classes.tsx:54`) | |
| 51 | RTL: layout mirrors, logical properties used (T15) | PASS | `extras.css:1`, `student.css`, `app.css` use `inline`/`block` properties; screenshots `prod-_login-ar-mobile.png`, `prod-_-ar-desktop.png`: logo and switch swap sides, text right-aligned | Skip link is pinned to the left (`globals.css:155`); harmless. |
| 52 | RTL: keyboard arrows follow reading direction (T13, T15) | PARTIAL | Tabs fixed (#12). The check-card arrows in the workspace (`workspace.tsx:184`) move to the next check on either arrow, so direction does not matter | The slide pager buttons are flipped by CSS (`workspace.tsx:410`) but there is no left/right key for slides. |
| 53 | Numbers and codes keep LTR in RTL text (T15) | PASS | `<bdi dir="ltr">` on codes and counts (`join-flow.tsx:106`, `workspace.tsx:411`), `dir="ltr"` on code inputs | |
| 54 | Two no-scroll screens keep the page fixed (T05) | PASS | `app.css:1-10`; scroll probe: 0 failures on `/app`, `/app/lessons/l1`, all play screens, `/join`, `/login`, `/signup`, 320/390/1280 px, EN and AR | Includes Explorer on all play screens. |
| 55 | One primary action per view, clear hierarchy (T05, T01) | PASS | Screens: `local-_app-en-desktop.png`, `local-_app_lessons_l1-en-desktop.png` (one gradient button per surface, secondary actions outlined) | Judged visually. |
| 56 | Charts have text alternatives and do not rely on colour alone (T21) | PASS | `charts.tsx:34,56,72,87`; results grid has hidden labels (`results.tsx:190-206`) | Keyboard focus on chart points: `tabIndex={0}` (`charts.tsx:72`). |
| 57 | Settings and onboarding: sensible defaults, explained (T17) | PASS | Sound off by default (`game-play.tsx:38`), Individual board off for grades 2 to 5 with the reason shown (`share-dialog.tsx:120`), class settings in `classes.tsx` | |

## Fixed in this audit

Each has a Jest test in `apps/web/src/components/__tests__/ux-audit.test.tsx` (named below).

1. **Language switch under 44 px** in the app shell (`app.css`); **mobile logo 38 px wide** (`app.css`); **inline sign-in switch link 19 px tall** (`extras.css`). Tests: "the language switch is at least 44px tall...", "the sign-in / sign-up switch link has a 44px hit area".
2. **Explorer (grades 2 to 5) never applied on `/play/*`**, and its game bar was 44 px. `PlayFrame` reads the student's band; Back, Sound, Pause and Hint are 64 px. Tests: "PlayFrame: the frame takes the student's band...", "Explorer gets 64px on the game bar controls".
3. **No global reduced-motion guard**: catch-all in `globals.css`. Test: "globals.css has a catch-all prefers-reduced-motion block...".
4. **Input borders at 1.3:1 to 1.9:1**: new `--field-line` token at 3.1 to 3.8:1. Test: "input borders use the 3:1 --field-line token...".
5. **Tabs: arrows wrong in RTL** and an English-only hidden "to check". Tests: "Tabs: in Arabic (RTL) the left arrow moves forward...", "Tabs: the hidden 'to check' text for a badge is translated".
6. **`InlineConfirm` group name was English only.** Test: "InlineConfirm: the group name is translated".
7. **Sign-in arrow did not mirror in RTL.** Test: "AuthForm: the forward arrow flips in RTL...".
8. **Auth errors**: fields now `aria-invalid` and `aria-describedby` the error; the sign-in error is always translated (it showed the server's English text); the sign-up "already exists" case has its own instruction. Tests: "AuthForm: a failed sign-in marks the fields invalid...", "...the sign-in error is Arabic in the Arabic UI", "AuthForm sign-up: names the missing fields...", "AuthForm sign-up: an existing account gets a plain instruction...". Two older tests in `auth-shell.test.tsx` were updated: they asserted the raw server text.
9. **Wrong join code** showed "Nothing is live yet" (inverted condition) and the field had no error link. Test: "Join: a code that matches nothing marks the code field invalid...".
10. **Failed class load looked like "no classes yet".** Test: "Create: a failed class load is an error with Retry...".
11. **Lesson page title** was static "Lesson". Test: "Workspace: the document title names the lesson".
12. **Undo toast shortened to 7 s**, now 8 s. Test: "Toast: a toast with Undo stays 8 seconds...".
13. **Skip link unreadable at 2.1:1** (purple text on the dark pill, on every page). Test: "the skip link keeps white text above the .tapp/.sapp link colour". Evidence: `qa/audit/local-skip-link-focus.png`.

14. **Demo accounts and admin**: one-click demo picker on `/`, `/login` (hidden when the API has none), `/admin` dashboard for admins only. Tests: `ux-final.test.tsx` ("DemoPicker", "Admin").
15. **Logo always goes home** (`/app`, `/`, `/join`) and the teacher app has a collapsible side rail (drawer on phones, mirrored in RTL, state in `localStorage`). Tests: "Side menu and logo".
16. **Forced colours and high contrast** (#19), **visible Move up / Move down** (#16), **whiteboard keyboard move and resize** (#16), **Explorer read-aloud 64 px** (#24), **sign-in and sign-up validation, required marks, show password** (#36, #37), **localised titles and descriptions** (#49) and **specific error messages** (#42). Tests: `ux-final.test.tsx`.

New message keys (EN and AR, parity test included): `meta.*`, `error.400.fields`, `error.409`, `error.413`, `error.422`, `error.429.after`, `error.offline`, `auth.required|show|hide|err.*`, `board.keys|moved|resized`, `ws.menu|moveUp|moveDown|duplicate|delete`, `demo.*`, `admin.*`, `menu.*`.

Earlier new keys: `common.confirm`, `tabs.toCheck`, `auth.error.exists`. Test helper `src/test/better-auth-react.ts` now types `error.code`.

## Known gaps / decisions

1. **Floating whiteboard has no Esc handler** (#11); it can be closed or minimised with its buttons. Decision: Esc would also fire while drawing shortcuts are used.
2. **Real Windows High Contrast** was not rendered (#19); the rules are covered by a CSS-text test only.
3. **Individual boards for grades 2 to 5** are blocked in the UI only (`share-dialog.tsx:41`); confirm the API rejects it too (out of scope here).
4. **Not verified:** screen-reader output (NVDA/VoiceOver), the WCAG 1.4.12 text-spacing pass, 400 % zoom, rendered `prefers-reduced-motion` (no animation was in flight at probe time; the CSS and a test cover it), teacher flows behind real sign-in on production (never typed a password into production), and the live-class screens (`/app/lessons/[id]/teach`).
5. **Probe limits:** it cannot read gradient backgrounds (white on purple buttons were computed by hand), and mocked API data stands in for the teacher screens.

## Follow-up (orchestrator)

- The grades 2–5 leaderboard rule is also enforced on the server: `apps/api/src/sessions/sessions.service.ts:88` passes every share through `leaderboardAllowed()` (`packages/shared/src/domain.ts`), so INDIVIDUAL becomes TEAMS for the Explorer band even if a client sends it.
