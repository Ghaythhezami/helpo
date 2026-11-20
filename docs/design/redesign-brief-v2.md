# Educator Helper v2 — "max" mockups, serious and built for schools

Read `PRODUCT.md` and `docs/redesign-brief.md` (v1 brief: audit, flow, base content) first. v2 keeps the same teacher
flow and lesson but raises the bar in three ways:

1. **Serious, institutional, education-native look.** It should feel like software a school or district would buy and
   trust with children's data (think the calm credibility of a good LMS or a national exam board), not a consumer toy.
   No mascots, no playful illustration, no pastel candy colours, no emoji, no gradients. Restraint, clear hierarchy,
   real academic vocabulary.
2. **Pedagogy built in.** Curriculum standards, learning objectives, Bloom's levels, differentiation (Support / Core /
   Stretch), accommodations, misconceptions, mastery by objective, re-teach plans.
3. **Max fidelity.** Every one of the 8 screens below, with real content previews for all five resources, real states
   (loading, flagged, resolved, empty, error), and working interactions.

## Shared content (use verbatim, in addition to the v1 brief content)

- School: Riverside Middle School · Science department · Term 1, Week 11.
- Teacher: Alex Green (initials AG), Grade 6 Science. Classes: 6B (24), 6A (26), 7C (22).
- Unit 3: **Plants and energy** (lessons 1–6). Current lesson: **Lesson 4 of 6 — Photosynthesis: how plants make food**,
  6B, Thursday 14 November, Period 3, 10:40–11:25 (45 min).
- Curriculum standard: **NGSS MS-LS1-6** — "Construct a scientific explanation based on evidence for the role of
  photosynthesis in the cycling of matter and flow of energy into and out of organisms." Framework selector shows
  NGSS (selected), Cambridge Lower Secondary Science, National curriculum (custom).
- Objectives (each has a code used across screens):
  - **O1** Explain that plants use light, water and carbon dioxide to make glucose and oxygen. (Understand)
  - **O2** Describe the roles of leaves, roots and stem. (Remember)
  - **O3** Read and complete the word equation for photosynthesis. (Apply)
- Word equation: carbon dioxide + water → glucose + oxygen (with light energy, in chlorophyll).
- Source: `Plants_Unit3_Photosynthesis.pdf`, 14 pages. Source trace: "41 of 44 statements traced to your file; 3 need
  your check."
- Kit: Presentation 12 slides · Worksheet 8 activities in 3 levels (Support / Core / Stretch) · Quiz 10 questions
  (Bloom's: 4 Remember, 4 Understand, 2 Apply; 6 multiple choice, 2 true/false, 2 short answer) · Mini-game "Plant parts
  match" 8 pairs · Summary cards 12 cards.
- Slide previews: S1 title "Photosynthesis: how plants make food" · S4 "The word equation" showing the equation ·
  S6 "Inside a leaf" (simple labelled leaf diagram drawn in inline SVG: chloroplast, stomata, vein).
- Worksheet preview (Core): A1 label the plant (roots, stem, leaf, flower) · A2 fill the gaps in the word equation ·
  A5 "Glucose — the sugar a plant makes for energy" glossary box (after fix). Support level adds a word bank and
  sentence starters; Stretch adds "Explain why a plant kept in the dark loses mass."
- Mini-game pairs: Roots ↔ take in water · Leaf ↔ makes food · Stem ↔ carries water · Flower ↔ makes seeds ·
  Chlorophyll ↔ catches light · Stomata ↔ let gases in and out · Glucose ↔ food made by the plant · Oxygen ↔ released into air.
- Summary card example: front "Photosynthesis", back "Plants use light, water and carbon dioxide to make glucose and oxygen."
- The 3 AI checks (same as v1): Q4 fact check (p. 6), Q9 reading level grade 8 → grade 6 rewrite, Worksheet A5
  "glucose" used before introduced.
- Accommodations (teacher-only, never projected): Read-aloud for 2 students, extra time for 1 student, Arabic glossary
  for 3 students. Show counts and let the teacher open the list; do not label individual students' needs in large text.
- Integrations: Export to Google Classroom, Microsoft Teams, PDF, PowerPoint; "Sync scores to gradebook".
- Privacy line used on share/teach screens: "Student data stays in your school's region. Names are never shown on the
  projector."
- AI honesty line: "AI can make mistakes. Nothing reaches students until you approve it."
- Results (after live quiz): 22 of 24 answered, average 74%. Mastery by objective: O1 68%, O2 85%, O3 58%.
  Misconception detected on Q4 (41% correct): "Plants get their food from the soil." Needs help (below 60%): Youssef
  Haddad 40%, Ali Ben Salah 50%, Omar Kacem 50%, Mia Lopez 55%. Top: Sara Ahmed 100%, Fatma Trabelsi 95%, Lina Mansour
  90%. Not submitted: Adam Cherif, Noah Brown. Per-question %: Q1 92, Q2 86, Q3 81, Q4 41, Q5 77, Q6 82, Q7 58, Q8 79,
  Q9 68, Q10 76. Re-teach plan: "5-minute warm-up for Lesson 5 on 'plants don't eat soil'" + "small-group task for 4
  students on the word equation (O3)".
- Student view (phone): student "Sara A." joins live quiz with code 482 913, sees Q4 with True/False, big buttons,
  progress "Question 4 of 10", and after answering "Answer saved". No score shown until the teacher reveals.

## The 8 screens (hash routes, all required)

`#dashboard` · `#create` · `#generating` · `#review` · `#differentiate` · `#teach` · `#student` · `#results`

1. **Dashboard** — today's periods, the next lesson with kit status, unit progress (Unit 3: lessons 1–3 taught,
   4 ready, 5–6 not planned), recent results, one primary "New lesson".
2. **Create** — source (file or describe), class (sets grade, length, students), framework + standard picker with
   MS-LS1-6 selected, objectives O1–O3 extracted from the file with page refs and Bloom's level tags, collapsed options
   (language, levels, resources). Primary "Make lesson kit". Readiness checks.
3. **Generating** — the one authored motion moment: five resources arrive one by one with honest progress, source
   tracing counter, first ready resource openable.
4. **Review** — resource tabs (Slides, Worksheet, Quiz, Game, Cards) each with a REAL preview (switching works); the
   3 AI checks with Accept / Edit / Dismiss that update counts; source trace; objective coverage (which objective each
   question covers); inline AI actions (Simpler, Add example, Translate, Regenerate); an "Ask for a change" input.
5. **Differentiate** — Support / Core / Stretch side by side for one worksheet activity, who gets which level (counts,
   editable), accommodations summary (read-aloud 2, extra time 1, Arabic glossary 3).
6. **Teach** — projector-ready live view (join code 482 913, QR as inline SVG, joined 18/24, current question large,
   names hidden toggle ON) and an assign panel (class, due Fri 15 Nov 08:00, levels, export targets).
7. **Student** — phone-frame student experience (join → Q4 → answer saved), plus a note on what the student never sees.
8. **Results** — headline sentence, mastery by objective, question breakdown (Q4 41% flagged misconception), student ×
   question grid (sticky names, icons not colour alone), needs help, not submitted, re-teach plan with "Add to Lesson 5",
   "Sync scores to gradebook".

## Mockup chrome and quality floor (mandatory)

- Single self-contained HTML file per direction (inline CSS + small vanilla JS). Google Fonts as specified per
  direction. Lucide icons: `<script src="https://unpkg.com/lucide@latest"></script>` + `lucide.createIcons()`.
- Screen picker: `<nav class="picker" aria-label="Mockup screens">` fixed at bottom center, links to all 8 hashes plus
  `../index.html` ("All v2 versions"). Must scroll horizontally on phones (`max-width: calc(100vw - 24px); overflow-x:auto`).
- Responsive: 1440 desktop, 1024 tablet, 390 phone. No page-level horizontal overflow at any width (wide tables scroll
  inside their own container; grid children need `min-width:0`; `.sr-only` spans must sit inside a `position:relative`
  parent).
- Semantics: one `<h1>` per screen, no skipped heading levels (h1 → h2 → h3). `<button>` for actions, `<a>` for
  navigation. Visible `:focus-visible`. Accessible names must START with the visible text.
- Contrast ≥ 4.5:1 for all text, including text on coloured buttons and badges. Touch targets ≥ 24px (44px for primary
  touch controls on the Teach and Student screens).
- Banned: eyebrow/kicker uppercase labels above headings, gradient text, glassmorphism, thick coloured left borders on
  cards, emoji, mascots, icon-in-a-tile stacked above a heading (put icons inline beside headings), infinite pulsing or
  looping animation, nested cards, purple.
- Motion: transform/opacity only, 150–300 ms, ease `cubic-bezier(0.16,1,0.3,1)`; one authored moment (Generating);
  `prefers-reduced-motion` respected.
- `font-variant-numeric: tabular-nums` on all numbers. Theme `::selection`, caret, scrollbars.
- `<meta name="description">` and an inline SVG favicon (`<link rel="icon" href="data:image/svg+xml,...">`).
- Copy: sentence case, buttons name the outcome, plain teacher language, never "AI magic".
