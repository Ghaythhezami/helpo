# Educator Helper v3 — kid-friendly, grades 2 to 12

Read `PRODUCT.md`, `docs/redesign-brief.md` (v1 content) and `docs/redesign-brief-v2.md` (v2 content, pedagogy and
quality floor) first. v3 keeps everything v2 added (standards, objectives O1–O3, honest AI checks, levels,
accommodations, projector safety, mastery) and changes the feel: **friendly and welcoming for children aged 7–18 and
their teachers.** The product now serves **grades 2 to 12**.

## The core idea: one product, three age bands

A 7-year-old and a 17-year-old cannot share one student interface. The teacher's screens stay one design, warm and
friendly but still fast to use. Everything a **student** sees (the student device, the projector, slides, mini-game,
cards) adapts to the class's age band, which is set automatically from the class grade:

| Band | Grades | Name in UI | How it looks and behaves |
|---|---|---|---|
| Early | 2–5 | Explorer | Very large targets (≥ 64px), picture + word answers, read-aloud button on every question and answer, one thing per screen, gentle feedback ("Not yet — try again", never a red ✗), no timers, a small original seedling guide drawn in SVG may appear here only. Reading level grade 2–3. |
| Middle | 6–8 | Navigator | Friendly and lively but not babyish: rounded cards, colour by topic, progress path, encouraging feedback ("Nice reasoning"), optional read-aloud. Reading level grade 6. |
| Senior | 9–12 | Studio | Mature and calm, like a good productivity app: minimal decoration, no cartoon, dense enough to respect their time, keyboard-friendly, precise feedback ("Correct: the light-dependent reactions make ATP and NADPH"). |

The teacher sees and can change the band ("6B · Grade 6 · Navigator style") on Create and in Differentiate, with a
live preview of what students will see.

## Kid-friendly rules (all three directions)

- Child safety and privacy: no leaderboards or public rankings, no chat between students, avatars are simple shapes or
  icons (never photos), first name + initial only on student devices, names never on the projector. Line: "Built for
  children: no ads, no public profiles, no rankings."
- Encouragement over punishment: personal progress ("You got 7 of 10 — 2 more than last time"), stickers the teacher
  can send ("Great effort", "Super scientist", "Kind helper"), "Not yet" instead of "Wrong" for Early and Middle bands.
- Accessibility for young readers: read-aloud (speaker icon button), dyslexia-friendly font option toggle, icons
  always paired with words, high contrast, no information by colour alone.
- Warm but not chaotic: a bright, cheerful palette used with discipline (colour encodes topic or status; neutrals carry
  most of the surface). Friendly rounded shapes and simple original illustrations in inline SVG (plants, sun, water
  drops, leaf). NO emoji, NO stock mascots, NO clip-art, NO purple-gradient AI look.
- Teacher screens stay efficient: the v1 instructor feedback still applies — one primary action per view, short
  "to check" list, no clutter.

## Content (in addition to v2 shared content, which stays verbatim for the teacher flow)

Teacher: Alex Green, class 6B (Grade 6 → Navigator). The dashboard also lists the school's other bands to show
range: "Your school: Grades 2–12 · 38 classes".

Student-view samples (all three required, same concept at three grade levels):
- **Grade 3 · Explorer** — class 3A, lesson "What do plants need to grow?". Question 2 of 5: "What does a plant need
  to make its food?" Choose all that help: Sunlight (sun icon), Water (droplets icon), Air (wind icon), Candy (candy
  icon — the playful wrong option). Correct set: Sunlight, Water, Air. Feedback: "Great thinking! Plants use sunlight,
  water and air." / "Not yet — try again. Candy is for people, not plants!" Read-aloud buttons. Guide: a small
  seedling drawn in SVG.
- **Grade 7 · Navigator** — class 6B/7 level, the v2 Q4: "Plants get their food from the soil." True / False.
  "Question 4 of 10", progress path, "Answer saved", optional read-aloud.
- **Grade 11 · Studio** — class 11S, lesson "Photosynthesis: light-dependent reactions". "Which stage produces ATP and
  NADPH?" Light-dependent reactions (correct) / Calvin cycle / Glycolysis / Krebs cycle. Clean, keyboard hint
  "Press 1–4". Feedback precise.
- Mini-game (student, Navigator band): "Plant parts match" round 1 of 2, 4 pairs, friendly success state
  "4 of 4 matched".
- Stickers the teacher can send from Results: Great effort · Super scientist · Kind helper · Never gives up (draw as
  simple round badges with Lucide icons, original).

## Screens (hash routes, all required)

`#dashboard` · `#create` · `#generating` · `#review` · `#differentiate` · `#teach` · `#student-g3` ·
`#student-g7` · `#student-g11` · `#game` · `#results`   (`#student` is an alias of `#student-g7`)

- Teacher screens (dashboard, create, generating, review, differentiate, teach, results) follow the v2 screen
  descriptions, restyled kid-friendly, and Create/Differentiate add the age-band selector with live student preview.
- Results adds "Send a sticker" to students (per student or to the class) and a family-friendly summary option
  ("Share progress with families" — off by default).
- Student screens are framed as a tablet (Explorer, 1024×700 frame scaled to fit) or phone (Navigator, Studio,
  390×780 frame) with a band switcher above the frame: Grade 3 · Grade 7 · Grade 11.

## Mockup chrome and quality floor (mandatory, same as v2 plus)

- Single self-contained HTML file per direction, Google Fonts, Lucide icons via unpkg + `lucide.createIcons()`.
- Screen picker: `<nav class="picker" aria-label="Mockup screens">` fixed bottom centre, links to all routes plus
  `../index.html` ("All v3 versions"), horizontally scrollable on phones.
- Responsive 1440 / 1024 / 390, zero page-level horizontal overflow, grid children `min-width:0`, `.sr-only` inside a
  positioned parent, any hash target must be focusable (`tabindex="-1"`) or not exist.
- One h1 per screen, no skipped heading levels, accessible names start with visible text, contrast ≥ 4.5:1 for all
  text (white text on bright yellow/orange/green fails — use dark ink on bright colours), targets ≥ 24px (≥ 44px
  teacher touch, ≥ 64px Explorer band).
- No eyebrow uppercase labels, no gradient text, no glassmorphism, no thick coloured left borders, no emoji, no
  icon-tile stacked above headings, no infinite looping animation, no nested cards, no purple.
- Motion: transform/opacity only, ease-out `cubic-bezier(0.16,1,0.3,1)`; two authored moments allowed: Generating
  (teacher) and a short celebration (≤ 700 ms, a few shapes popping once) when an Explorer/Navigator student gets an
  answer right; `prefers-reduced-motion` turns both into simple fades.
- Tabular numbers, themed `::selection`/caret/scrollbars, `<meta name="description">`, inline SVG favicon.

## Update: cool palettes, premium feel, easy to use (overrides any warm palette above or in the agent prompts)

- **Cool palettes only:** blues, teals, aqua, ice, mint, slate. The only warm colour allowed is a small, functional
  amber for "check this" flags. No yellow sunshine fills, no coral, no sand, no purple.
- **Premium:** fewer colours per screen (one accent + one support colour), generous whitespace, crisp 1px borders,
  layered low-opacity shadows (e.g. `0 1px 2px rgba(16,32,64,.06), 0 8px 24px -12px rgba(16,32,64,.18)`), one radius
  scale (8 / 12 / 20), precise type scale, consistent 1.75-stroke Lucide icons, quiet surfaces with one focal point.
  Illustrations stay simple, flat, in the cool palette.
- **Easy to use:** one primary action per view, same place every time (bottom-right of a panel or top-right of a
  page), labels in plain words, nothing hidden that a teacher needs daily, progressive disclosure for the rest.
- **"Not yet" feedback for young students** uses the calm info blue (not red, not orange).
- **21st.dev references (from the 21st MCP):** "Segmented Progress Pill Stepper" (spring pill sliding across rounded
  segments) for student progress; "Custom Instructions" (style choice with a live sample answer) for the age-band
  preview. Use the ideas, restyled in our tokens.

| Direction | page | surface | line | ink / ink-2 / ink-3 | primary (hover, soft) | support | success | flag |
|---|---|---|---|---|---|---|---|---|
| G. Sky Classroom | #F5F8FC | #FFFFFF | #DCE4EE | #14213D / #3A4A66 / #52627D | #2457D6 (#1D46AD, #E8EEFC) | teal text #0B7373 on #E0F3F2, ice shapes #A9D6F5 | #17704A on #DEF4EA | #7A5200 on #FFF3D6 |
| H. Learning Path | #F2F7F8 | #FFFFFF | #D5E4E7 | #102A33 / #36535D / #4B6670 | #0F6E7A (#0B5862, #DDF0F2) | lagoon shapes #2CA6B8, glacier hills #CFE9EE/#B5DCE4 | #1D6B57 on #DDF2EA | #7A5200 on #FFF3D6 |
| I. Building Blocks | #F4F6FA | #FFFFFF | #1A2335 outlines | #172033 / #3D4860 / #505B73 | #2F48C9 (#263BA6, #E7EBFC) | block fills (ink text only): sky #A8D8F8, ice #CFE3FF, mint #A6E8D4, aqua #9DE0E6, slate #D5DCE8 | #17704A on #DEF4EA | #7A5200 on #FFF3D6 |

## UX checklist (ui-ux-pro-max): must be visibly true in every v3 direction

1. **Status always visible (Nielsen 1, Doherty):** "Saved" indicator in the lesson header; Accept/Dismiss update
   instantly (optimistic) with a toast "Checked Q4 · Undo" for 6 s; Generating shows per-resource progress and ends
   with a peak moment "Your kit is ready · made in 38 s".
2. **User control (3):** every AI check action is undoable; "End quiz" and "Share progress with families" ask for
   confirmation in an inline panel (not a modal) because they affect students/parents.
3. **Consistency, one name per concept (4):** use exactly these words everywhere: lesson, kit, check (not review),
   levels, band, teach, results. Primary action sits in the same place on every teacher screen.
4. **Error prevention + recovery (5, 9):** Create shows an inline, positive validation ("3 objectives found ✓") and,
   if the teacher deletes all objectives, a specific message ("Add at least one objective so the quiz has a goal").
   Generating includes one honest failure state for the mini-game ("The mini-game couldn't be made. Try again" +
   "Skip for now") reachable from a "Show a problem" link in the mockup picker.
5. **Recognition over recall (6):** class, band and lesson name stay visible on every lesson screen; options show
   current values in their collapsed summary.
6. **Flexibility (7):** teacher keyboard shortcuts on Check (A accept, E edit, D dismiss, → next), shown as a small
   hint; Studio students answer with 1–4.
7. **Minimalist (8):** each screen has one focal point and one primary action; secondary actions are quiet; nothing
   decorative competes with content.
8. **Empty states (patterns):** Lesson 5 "not planned" shows "Plan Lesson 5 — we suggest starting with the Q4
   warm-up" and a button.
9. **Forms:** one column, top-aligned visible labels, no placeholder-as-label.
10. **Kids and mobile (Fitts, thumb zone):** on phones the answer buttons sit in the lower half of the screen; targets
    ≥ 64px for Explorer; answer tiles are real buttons with aria-pressed; "Answer saved" announced via aria-live.
11. **Peak–end:** results end with one clear next step; students end a quiz with personal progress, never a rank.

## Evidence from the UX UI knowledge base (C:\Users\A\Desktop\DEV\UX UI, routed via its library)

- T07 [03.02 p.182; 04.09 p.57]: match colour tone to the actual audience; a palette that reads "for kids" makes paying
  users self-select out → teacher/school screens stay premium and cool; playfulness lives only in student bands.
- T13 / T08 [07.02 p.76-80; 06.08 p.411]: 10-15 mm targets for young children; a children's touch table used 64 px
  categories → Explorer ≥ 64 px, spacing ≥ 8 px between targets, hit area extends beyond the visible shape.
- T20 [10.02 p.125-129; 07.03 p.297]: before badges/points, show progress toward the user's own goal → personal
  progress first, stickers are a teacher gesture, never a currency.
- T17: separate buyer (school board), setup admin and daily users (teachers, students); a small "Your school" line on
  the dashboard and privacy lines speak to buyers without cluttering teacher work.
- T18: correct AI misconceptions at first contact (one-line explainer on Create: "The assistant only uses your file
  and the standard you pick"); keep facts (dates, names, scores) in structured fields, AI text only around them.
- T01: a completion screen must never dead-end → every finish (kit ready, quiz done, results) offers the next step.
- T20 persona (write it into the page `<meta name="description">` tone): friendly, clear, encouraging, calm, precise;
  avoid: childish (for teachers and teens).
- Data viz (dataviz skill, validated): status set correct #2E8F63 · not yet #2457D6 · partial #A36F0D passes all six
  checks (CVD ΔE ≥ 24.6, contrast ≥ 3:1); "not answered" is a neutral dotted outline. Always pair with icons and a
  table view; hover tooltip on every bar and grid cell.
