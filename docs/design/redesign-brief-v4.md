# Educator Helper v4 — "Helpo" style (from the user's reference screens)

References: `Screens/Image20261118203051.png`, `Screens/Image20261118203057.png`, `Screens/Image20261118203119.png`.
**The user's reference wins** over earlier bans: purple/lavender, soft gradients, glossy illustrated objects and a
friendly mascot are part of this world. Keep every functional rule from v3 (`docs/redesign-brief-v3.md`): honest AI
checks with Accept/Edit/Dismiss + undo, age bands for students, standards/objectives, privacy lines, accessibility
floor, one primary action per view. Content and data are the same as v2/v3 (Riverside Middle School, 6B Navigator,
Unit 3 Plants and energy, Lesson 4 of 6 Photosynthesis, the 3 checks, results numbers).

## Brand and world

- Product name in UI: **Helpo** (logotype: purple graduation-cap mark + "Helpo" + small yellow spark). Tagline
  used once, in the footer: "Learn, create, grow".
- Feeling: cheerful, soft, magical-but-tidy, made for a school with children; teacher screens stay organised.
- Light source top-left; everything has soft rounded volume (inner highlight, soft drop shadow tinted purple).

## Tokens

| Token | Value | Use |
|---|---|---|
| bg | #F4EFFF | page; plus 2–3 large soft blobs #E9DEFF / #EFE7FF at the edges (CSS radial shapes, fixed, behind content) |
| surface | #FFFFFF at 86–92% on lavender with 1px #E7DDFF border | panels (large radius 28px) |
| ink | #24185F | headings and body (deep purple-navy) |
| ink-2 | #4A3F86 | secondary text |
| ink-3 | #6A60A0 | meta (check ≥ 4.5:1 on white) |
| primary | #5B3FD9 → #7A5AF0 (gradient 135°) | primary buttons, active nav pill, section header pills; white text |
| primary-solid | #5B3FD9 (hover #4A30C4) | links, focus ring, progress fill |
| primary-soft | #EEE6FF | chips like "92% avg", soft pills |
| card-blue | #DCEBFF, border #A9CBFF | Slides card |
| card-lilac | #EFE3FF, border #D2B8FF | Worksheet card |
| card-mint | #DDF6E7, border #A3E2BE | Quiz card |
| card-butter | #FFF1C7, border #FFD46E | Game card |
| card-periwinkle | #E8E5FF, border #C5BEFF | Cards card |
| ready | text #17703F on #DDF5E5, check icon | status |
| to-check | text #7A4E00 on #FFE7A3, warning icon | status |
| neutral chip | text #4A3F86 on #EFEDF6 | Draft, Not planned |
| accent-sun | #FFC83D, orange #FF9A3D | illustration only (stars, sparks) — never text |

Type: **Nunito** (600/700/800/900) for everything; **Fredoka** 600 only for the logotype and the big pill section
titles. Headings 800, tight but friendly; body 16px; minimum 13px for meta.

Shapes: radius 28 (panels), 20 (cards), 999 (pills, buttons, nav); buttons are pill-shaped with gradient and a soft
purple shadow `0 8px 20px -8px rgba(91,63,217,.55)`; pastel resource cards have 2px tinted borders and a soft inner
highlight; section headers are purple gradient pills with an illustrated icon on the left (e.g. "Unit 3: Plants and
energy" with a star).

## Illustrations (original inline-quality SVG files in `mockups/v4/assets/`)

Glossy, soft-3D look made with SVG gradients and highlights, consistent palette (purples, blue, orange, yellow, green),
no text inside except the calendar "14". Files (exact names, all `viewBox` noted):
books-pencils.svg (320×240) · calendar-14.svg (200×200) · star-buddy.svg (200×200, smiling star with blush) ·
trophy.svg (200×200) · rocket.svg (120×120) · lightbulb.svg (120×120) · magic-book.svg (320×240, open book with
sparkles) · clipboard-check.svg (240×240) · sprout-sun.svg (320×240, sprout in soil with sun) · robot-helper.svg
(64×64) · cloud-upload.svg (96×96) · res-slides.svg · res-worksheet.svg · res-quiz.svg · res-game.svg · res-cards.svg
(all 120×120) · badge-quiz-master.svg · badge-creative.svg · badge-top-class.svg (all 120×120) · drop.svg · leaf.svg ·
cup.svg (64×64, result-row icons: water drop, leaf, small trophy cup) · scene-photosynthesis.svg ·
scene-water-cycle.svg · scene-food-chain.svg (320×180 landscape thumbnails) · palette-brush.svg (200×200) ·
level-star.svg (96×96, star medal).

Use rules (to answer "too decorative"): one hero illustration per screen header, small object icons in cards/rows,
corner decoration (books, palette, star buddy) only on the Today screen and never overlapping content or controls;
all decorative images `alt=""` and `aria-hidden`.

## Screens (hash routes) — follow the reference layouts

Top bar: logotype left; centred pill nav **Today · New lesson · Check kit · Levels · Results** (icons from the asset
set or Lucide, active = purple gradient pill); right: class switcher "6B · Navigator" pill select and AG avatar.

1. `#today` — hero panel (calendar or books illustration, "Today, Thursday 14 November", school line, "Next lesson:
   Photosynthesis: how plants make food", "Lesson 4 of 6 for 6B, Period 3, 10:40–11:25 (45 min)", gradient
   "New lesson" button right); resource carousel of 5 pastel cards (Slides 12 slides Ready · Worksheet 8 activities
   1 to check · Quiz 10 questions 2 to check · Game 8 pairs Ready · Cards 12 cards Ready) with round prev/next
   buttons; under it a "Check kit" gradient pill + chip "3 AI checks to look at before you teach" with robot icon;
   lower-left panel with purple pill header "Unit 3: Plants and energy" + "62% complete" bar + lesson timeline
   (Lessons 1–3 Taught, Lesson 4 Ready, Lessons 5–6 Not planned) + suggestion box "Plan Lesson 5. We suggest starting
   with the Q4 warm-up." [Plan Lesson 5]; lower-right panel pill header "Recent results" + rows (cup · States of
   matter, 6B, last week · 92% avg; drop · The water cycle, 6A, 2 weeks ago · 81% avg; leaf · Food chains, 7C ·
   Draft) + "View all".
2. `#new-lesson` — hero "Create a new lesson" with magic-book illustration, "Turn your document into an interactive
   lesson with slides, activities and more." and a dashed drop zone (cloud-upload, "Drag and drop your file here or
   click to browse", PDF · DOCX · PPTX) — show the attached state `Plants_Unit3_Photosynthesis.pdf`; then the v3
   fields (class 6B → Grade 6 · 45 min, band preview "What 6B will see", standard MS-LS1-6, objectives O1–O3 with
   page refs, options) in soft panels; "Make lesson kit" gradient button; right column "Your recent lessons" (3 scene
   thumbnails with play buttons: Photosynthesis 6B 14 Nov, The Water Cycle 6A 12 Nov, Food Chains 7C 10 Nov) and a
   "Need help?" lightbulb card [View guide].
3. `#generating` — five pastel resource cards fill in one by one (the authored motion moment), honest progress text,
   "Stop making the kit" while running, success panel "Your kit is ready, made in 38 s" with star-buddy.
4. `#check-kit` — hero "Check your lesson kit" with clipboard-check illustration, "Make sure everything is ready
   before teaching."; right a checklist panel (Slides are ready ✓, Worksheet 1 to check, Quiz 2 to check, Game is
   ready ✓, Cards are ready ✓); below, the real check workspace: resource tabs as pastel pills, preview of the
   selected resource (real Slides/Worksheet/Quiz/Game/Cards previews), the 3 AI checks one at a time (Accept / Edit /
   Dismiss, undo toast, keyboard A/E/D), and when all done the banner "Your lesson kit is complete!" with a small star.
5. `#levels` — "Your class's learning journey" panel: 6B is on "Stop 4 of 6" of Unit 3 with a level-star medal,
   progress bar 62%, next "Lesson 5"; "Class achievements" (badge-quiz-master "Quiz streak: 4 lessons in a row",
   badge-creative "Creative class: 3 projects", badge-top-class "Plant experts: 80% on O2") — class-level only, never
   individual rankings; then "Lesson levels" Support / Core / Stretch for activity A2 with real text and students per
   level (6 / 13 / 5) steppers, plus accommodations counts (teacher only).
6. `#results` — "Your results" for Lesson 4: donut 74% class average (with legend), stat tiles Correct answers
   163 / 220, Average time 12 min, Best score 100% (no names on tiles), line chart "Class average by lesson"
   (L1 88, L2 84, L3 79, L4 74) with points and tooltips; then mastery by objective (O1 68, O2 85, O3 58 vs 70%
   target), the Q4 misconception callout, "Needs help" list (4 students), "Not submitted" (2), stickers to send,
   re-teach plan [Add to Lesson 5], [Sync scores to gradebook], "View as table" toggles. Status colours for marks:
   correct #2E8F63, not yet #5B3FD9, partial #A36F0D with icons; text stays ink.
7. `#lesson-view` — the lesson player (reference "Lesson View (Slides / Activities)"): left rail of resources with
   counters (Slides 1/12, Worksheet 0/8, Quiz 0/10, Game 0/8, Cards 0/12), centre slide "What is Photosynthesis?
   Plants use sunlight to make their own food." with sprout-sun illustration and prev/next round buttons + dots,
   right "Lesson progress 17%" and [Next]; top-right [Present on board] and [Start live quiz].
8. `#teach` — live quiz on the board in the same style (big join code 482 913, QR, 18 of 24 joined, question 4
   large, names hidden ON, teacher dock: Previous · Show answer · Next question · End quiz with inline confirm).
9. `#student` — student device with band switch Grade 3 Explorer / Grade 7 Navigator / Grade 11 Studio (same content
   as v3). Explorer and Navigator in Helpo style (pastel tiles, star buddy cheering on correct); Studio calmer: white,
   minimal purple, no mascot.

Plus a "Show a problem" route `#generating-problem` (mini-game failed: Try again / Skip for now).

## Mockup chrome and quality floor

Same as v3: single `mockups/v4/index.html`, `<nav class="picker" aria-label="Mockup screens">` fixed bottom centre
(all routes + `../v3/index.html` "Earlier versions"), responsive 1440 / 1024 / 390 with zero page overflow, one h1 per
screen, no skipped heading levels, accessible names start with visible text, contrast ≥ 4.5:1 for all text (white
text only on #5B3FD9 or darker part of the gradient; never on pastel or yellow), targets ≥ 24px (44 teacher touch,
64 Explorer), focusable hash targets, `prefers-reduced-motion`, themed selection/caret/scrollbar, meta description,
favicon (purple cap). Emoji are still banned (use the SVG assets). Motion: generating cards pop in once; star buddy
waves once on success; nothing loops forever.

## Update: exact colours sampled from the reference PNG (these override the token table above)

The user wants the same design and colours as the reference, **especially the purple**. Sampled values:
- Primary purple: **#6035CF**; gradient for pills/buttons **#582BC8 → #764BD2** (135°); hover #4F24B5; links/focus
  #6035CF; progress fill **#8752E2**; brand wordmark **#7549C6**.
- Page: **#F4F0FE** with blobs #EBE2FD / #F2E3FD; panels white #FBFAFD with border #E6DEFB; hero panel #F1EEFD.
- Resource cards: Slides **#C7E2FD**, Worksheet **#F2E2FE**, Quiz **#D4FBDC**, Game **#FDE9C6**, Cards **#E8E0FD**
  (borders one step darker, 2px).
- Chips: Ready text #17703F on #DCF5E3 (check icon); To check text #7A4E00 on **#FDE4A3**; avg chip text #3E1E9E on
  #EBE2FD; Draft/Not planned text #4A3F86 on **#E1E1F2**.
- Ink: #24185F (headings), #4A3F86 (body secondary). White text sits only on the purple gradient/#6035CF.
- Purple is the dominant colour of the product: nav active pill, all primary buttons, section header pills, progress,
  the logo mark, selection highlight (#E3D7FD) and focus rings.

## Update: one-action student join screen (`#join`)

User request: "put 1 action to join the class or mini game, very simple, just a join interface and choose class/grade".
- One screen, one primary action: a big purple gradient **Join** button (≥ 64px tall, full width on phone).
- Step 1 "Pick your grade": large round chips 2 3 4 5 6 7 8 9 10 11 12 (Grade 6 preselected if remembered on this
  device). Step 2 "Pick your class": big tiles for that grade (6A, 6B, 6C) with the teacher's name under each
  (6B: Mr. Green... use "Alex Green").
- The selected class shows what is live now, decided by the teacher: e.g. "Live now: Photosynthesis quiz" with the
  quiz icon, or "Mini-game: Plant parts match" with the game icon. The Join button label follows it: "Join the quiz"
  / "Join the mini-game". Nothing live → button disabled with the reason "Your teacher hasn't started anything yet".
- Secondary, quiet: "Have a code?" link that reveals one large code field (482 913) for older students.
- After Join: a friendly "You're in, Sara A.!" with star-buddy and "Waiting for your teacher to start", then (demo)
  the quiz or game screen. First name + initial only; no sign-in, no passwords for young students.
- Explorer-friendly: big targets, read-aloud button on the two step titles, numbers big, no typing required.
