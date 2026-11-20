# Educator Helper redesign — brief for the three mockup directions

Read `PRODUCT.md` first. Every direction is a **clickable, single-file HTML mockup** (`mockups/<dir>/index.html`)
showing the same teacher flow with the same content, so the instructor can compare structure and feel, not data.

## Audit of the current build (what we fix)

| # | Problem in current build | Principle broken | Fix used in all directions |
|---|---|---|---|
| 1 | Home stacks four jobs (input, quote panel, kit, editor) in one long page | Hick's law, one primary action per view | One lesson = one workspace; home only lists lessons + "New lesson" |
| 2 | "Lesson insight" quote and vanity stats (53 activities, 2.5h saved) take prime space | Aesthetic & minimalist design | Removed; time saved shown once, small, after generation |
| 3 | Draggable "Lesson board" modal duplicates the kit cards; editor tabs duplicate them again | Consistency, modal misuse | One navigation for resources, inside the lesson |
| 4 | Only title + objectives as input; no grade, class, duration, level, language | Tesler's law (AI should absorb complexity, but needs context) | Smart defaults from the chosen class; editable chips |
| 5 | "Source readiness 100%" means nothing to a teacher | Match the real world | Replaced by plain checks: "Objectives found", "Grade level set" |
| 6 | No generation progress; all-or-nothing | Visibility of system status, Doherty | Each resource appears as it finishes; teacher can start reviewing the first |
| 7 | No way to see what the AI was unsure about or where content came from | Honest AI, error prevention | Review queue: flagged items ("check this fact", "reading level above grade 6"), source links to page of the uploaded file |
| 8 | Five resources all equal "Open →"; no status | Visibility of status | Each resource has a status: To review / Ready / Shared |
| 9 | Share = link + QR, no class, no due date, live mode unclear | Match the real world | Assign to class with due date, or "Start live" for in-class quiz |
| 10 | Results = average, top students, donut chart | Recognition over recall, actionability | Who needs help, which question failed, one-click re-teach (AI makes a 5-minute review) |
| 11 | Eyebrow labels on every block, 01–05 numbers, purple gradient, mascots, 5 accents | Generic AI look | One accent, real hierarchy, no eyebrows, numbers only where order matters |

## Shared content (use exactly)

- Teacher: **Alex Green**, Science, Riverside Middle School. Avatar initials "AG".
- Classes: **6B** (24 students, Science), **6A** (26 students), **7C** (22 students).
- Today: Thursday 14 November. Next lesson: 6B, Period 3, 10:40–11:25 (45 min).
- Current lesson: **Photosynthesis: how plants make food** — Grade 6 Science, 45 min, class 6B.
  - Source file: `Plants_Unit3_Photosynthesis.pdf` (14 pages).
  - Objectives: 1) Explain that plants use sunlight, water and carbon dioxide to make glucose and oxygen.
    2) Name the role of leaves, roots and stem. 3) Read a simple word equation.
- Kit (5 resources):
  - Presentation — 12 slides — status Ready.
  - Worksheet — 8 activities, 2 levels (Core / Stretch) — status To review (1 flag).
  - Quiz — 10 questions (6 multiple choice, 2 true/false, 2 short answer) — status To review (2 flags).
  - Mini-game — "Plant parts match", 8 pairs — status Ready.
  - Summary cards — 12 cards — status Ready.
- AI review flags (the review queue):
  1. Quiz Q4: "Plants get their food from the soil." marked True/False — answer key says False; AI confidence low on distractor wording ("from the soil" is a common misconception — keep it, but check explanation). Source: p. 6.
  2. Quiz Q9 short answer: reading level grade 8 ("chlorophyll absorbs light energy"); suggested rewrite at grade 6: "Chlorophyll is the green part of the leaf that catches sunlight."
  3. Worksheet activity 5: word equation uses "glucose" before it is introduced in the slides. Suggest: add slide 6 note or a glossary box.
- Sample quiz question shown in editors: Q1 "What does a plant need to make its own food?" options: Sunlight, water and carbon dioxide (correct) / Soil and water only / Oxygen and sugar / Only sunlight.
- Earlier lessons list: "States of matter" (6B, last week, 92% avg), "The water cycle" (6A, 2 weeks ago, 81%), "Food chains" (7C, draft).
- Results (after live quiz, 22 of 24 students answered): class average 74%. Q4 (soil misconception) only 41% correct. Q7 (word equation) 58%.
  Students who need help (below 60%): Ali Ben Salah 50%, Youssef Haddad 40%, Mia Lopez 55%, Omar Kacem 50%.
  Top: Sara Ahmed 100%, Fatma Trabelsi 95%, Lina Mansour 90%. Not submitted: Adam Cherif, Noah Brown.
  Suggested next step: "Make a 5-minute warm-up on 'plants don't eat soil' for tomorrow" (button).

## Flow screens every direction must include (switchable, e.g. via a top-right screen picker + in-UI buttons)

1. **Home / Today** — next lesson card for 6B, lesson list, one primary "New lesson".
2. **Create** — upload or describe; class picker sets grade/duration automatically; options collapsed under "Options" (language, levels/differentiation, which resources to make — all 5 on by default). One primary "Make lesson kit".
3. **Generating** — resources appear one by one with real progress; teacher can open the first ready one. "Usually takes about 40 seconds."
4. **Review & edit** — the heart. Resource switcher, preview of the selected resource (show the Quiz with Q1 and Q4), and the review queue of the 3 AI flags with Accept / Edit / Dismiss. Inline AI actions on a selection: "Simpler", "Add example", "Translate", "Regenerate this". Status per resource.
5. **Share / Teach** — Assign to 6B (due date, Core/Stretch levels) or Start live quiz (join code + QR, projector view where student names are hidden, live answered count).
6. **Results** — who needs help, question breakdown (Q4 41% highlighted), not submitted, suggested next step button.

Also: one **mobile** layout (results on phone at ≤ 420px) must work — make the page responsive, not a separate mockup.

## Quality floor (all directions)

- Real icon library: Lucide via `<script src="https://unpkg.com/lucide@latest"></script>` then `lucide.createIcons()`; `<i data-lucide="name">`. No emoji as icons.
- Google Fonts, chosen per direction (below). No Inter, Roboto, Arial, Poppins, Space Grotesk.
- No eyebrow / kicker labels in caps above headings. No gradient text. No glassmorphism. No colored thick left borders on cards. No mascots. No purple gradient.
- Body text contrast ≥ 4.5:1. Visible `:focus-visible` rings. Buttons are `<button>`, links `<a>`. Theme `::selection`, scrollbar, caret.
- Motion: transform/opacity only, 150–300ms, ease-out `cubic-bezier(0.16,1,0.3,1)`; one authored moment = the generating screen (resources arriving). Respect `prefers-reduced-motion`.
- Copy: sentence case, buttons name the outcome ("Make lesson kit", "Assign to 6B", "Start live quiz", "Make warm-up").
- Tabular numbers (`font-variant-numeric: tabular-nums`) in results.
- No external images; draw small illustrations with inline SVG or CSS when needed (e.g., a simple leaf/plant diagram on a slide).
