# Helpo v5 — gamified, refined, with full mini-game screens

Base: v4 (`mockups/v4/index.html`, `docs/redesign-brief-v4.md` incl. the sampled purple palette, and the v3 functional
rules in `docs/redesign-brief-v3.md`). v5 keeps the Helpo look exactly (purple #6035CF, gradient #582BC8 → #764BD2,
lavender #F4F0FE, pastel resource cards, glossy illustrations, Nunito + Fredoka) and adds:

1. **Gamified UX for students and teachers**, done ethically (rules below).
2. **Mini-game screens** in Helpo style: a game hub, a full game, and an end screen.
3. **Refinements and upgrades** across every v4 screen.

## Files (v5 is two apps that share the look)

- `mockups/v5/index.html` — **teacher app** (upgrade of v4).
- `mockups/v5/play.html` — **student app** (join, student home, game hub, games, win, band variants).
- `mockups/v5/assets/` — v4 illustrations (already copied) + the new game art listed below.
- Both pages link to each other in their picker ("Teacher app" / "Student app") and to `../v4/index.html`.

## Gamification rules (from the UX knowledge base, T20 / T24 / T11)

- **Progress toward the learner's own goal first**: XP bar to the next level, "My journey" map, personal bests.
  Points and badges always point to real learning (objectives O1–O3, finishing, improving, helping).
- **Effort counts**: XP for trying, finishing, improving and correcting a "Not yet" — not only for being right.
  Example XP: +10 answer, +5 retry after "Not yet", +20 finish a game, +15 beat your own best.
- **No individual leaderboards or rankings.** Competition only as **class vs. a shared goal** ("6B class goal:
  500 XP this week — 380 so far") or a friendly **team challenge** where teams are mixed and named (Sun team,
  Rain team), scores shown only as a shared total.
- **Forgiving streaks**: "4-day learning streak" with one automatic streak saver; after a gap: "Welcome back —
  pick up where you left off". Never "You lost your streak".
- **No variable-reward loops, no loot boxes, no currency that looks like money, no purchases, no timers for
  Explorer**, natural stopping points ("You're done for today — great work"). Sound and celebration toggles.
- **Rewards are cosmetic and earned**: unlock avatar accessories (hat, scarf, glasses, backpack) and avatar
  backgrounds by reaching levels; badges are a collection with locked silhouettes and a plain "how to earn" line.
- **Mascot (star buddy) only celebrates**: never delivers errors, status or instructions (those are plain text).
- **Teacher control**: per-class toggles — Points and badges on/off, Team challenges on/off, Sounds on/off —
  and a view of what students see.
- **Teacher-side gamification is light and useful**: class quest progress, "Kit check streak" for the teacher's own
  preparation, a weekly recap with celebration; never compares teachers.

## Shared gamified content

- Student: Sara A., class 6B, Navigator band, **Level 7 · Plant Scout**, 340 / 500 XP to Level 8, 4-day streak
  (1 saver left), badges earned 6 of 18.
- Class: 6B class goal this week 500 XP, 380 earned (76%). Team challenge "Sun team vs Rain team" is OFF by default
  in the mock; when on, show only "Together: 380 XP".
- Daily quests (student): "Finish 1 mini-game" (done), "Answer 5 quiz questions" (3/5), "Fix one Not yet" (0/1).
- Badges: Plant Scout (earned), Word Equation Wizard (locked — "Get O3 to 80%"), Kind Helper (earned, given by
  teacher), Never Gives Up (earned — 5 retries), Water Wise, Cell Explorer, etc.
- Avatar: an original round character; unlocked items: green scarf (Level 5), explorer hat (Level 7); locked:
  glasses (Level 9), backpack (Level 10).

## Mini-games (student app)

- `#hub` — **Game hub**: 3 game cards in pastel Helpo style, each with its objective chip and length:
  1. **Plant Parts Match** (O2, 8 pairs, about 3 min) — the lesson's game.
  2. **Sort the Needs** (O1, drag items into "Plants need" / "Plants don't need": sunlight, water, carbon dioxide,
     soil minerals vs candy, darkness, plastic) — tap-to-place alternative for touch/keyboard.
  3. **Equation Builder** (O3, put word-equation tiles in order: carbon dioxide + water → glucose + oxygen).
  Shows personal best stars per game, "New" tag, and which one the teacher assigned ("From Alex Green").
- `#game` — **Plant Parts Match** full screen: top bar (back, game title, round 1 of 2, sound toggle, pause);
  board with 2 columns of chunky pastel tiles (left: Roots, Leaf, Stem, Flower; right: take in water, makes food,
  carries water, makes seeds) with illustrated icons; tap left then right to match; correct pairs lock with a
  green check and +10 XP pop; wrong = gentle shake + "Not yet — try another" (no penalty); combo meter
  ("3 in a row!") as a subtle bar; "Hint" button reveals one pair at the cost of nothing; progress dots; Explorer
  band adds read-aloud on every tile and pictures; Studio band variant is a clean timed-optional "speed round".
- `#game-sort` — **Sort the Needs** board (two baskets, 7 items) with the same feedback system.
- `#game-equation` — **Equation Builder** (5 tiles + arrow) with the same feedback system.
- `#win` — **Round complete**: 3-star rating (stars fill once), "+60 XP", XP bar animates to the new value,
  "Personal best!" tag, badge unlocked card ("Plant Scout"), class goal contribution ("You added 60 XP to 6B's
  goal"), buttons: [Play again] [Next game] [Back to my journey]; a stopping-point line "Nice work. You can stop
  here or play another round."

## Student app other screens (play.html)

- `#join` — same one-action join as v4 (grade → class → one Join button), refined.
- `#home` — **My journey** (student home): avatar card with level and XP bar, streak chip with saver, daily
  quests list, "Live now" banner with Join, journey map of Unit 3 (stops 1–6, current stop 4), badges shelf
  (earned + locked silhouettes), class goal bar, "Customize my avatar" link.
- `#avatar` — avatar customizer: preview + unlocked/locked items grid with "Unlocks at Level 9".
- `#quiz` — the live quiz question on the student device in Helpo style (Q4 True/False, read aloud, +10 XP on
  answer, "Answer saved").
- Band switch everywhere a student screen is shown: Explorer (Grade 3), Navigator (Grade 7), Studio (Grade 11);
  Studio tones gamification down (no mascot, small XP line, badges list instead of shelf art).

## Teacher app upgrades (index.html)

- Keep all v4 screens; refine spacing, states and microcopy; fix anything the v4 review noted.
- `#today`: add a slim **class quest** strip (6B goal 380/500 XP) and **Launch mini-game** action next to
  Check kit; "Kit check streak: 3 lessons checked before class".
- `#levels` becomes **Class world**: Unit 3 as an illustrated world map (6 islands/stops, class avatar marker on 4),
  class goal, class badges earned/locked, and **Gamification settings** card (toggles: Points & badges, Team
  challenges, Sounds, Celebrations; per-band defaults) + the Support/Core/Stretch levels section (keep).
- `#teach`: add **Launch mini-game** (choose Plant Parts Match / Sort the Needs / Equation Builder, students join
  with the same code) alongside Start live quiz; live view shows "18 of 24 playing", class progress only.
- `#results`: add **Game insights** (Plant Parts Match: average 2.4 stars, most missed pair "Stem ↔ carries
  water"), the class goal, and badges to award ("Kind helper", "Never gives up") to selected students.
- Teacher weekly recap card on Today: "This week: 3 kits made, 2 live quizzes, 6B earned 380 XP" with a small
  celebration once.

## New art for v5 (add to `mockups/v5/assets/`, same glossy style and palette)

xp-star.svg (64) · streak-flame.svg (64, friendly flame, no danger look) · streak-saver.svg (64, shield) ·
quest-scroll.svg (96) · badge-locked.svg (120, grey silhouette with lock) · badge-word-wizard.svg (120) ·
badge-kind-helper.svg (120) · badge-never-gives-up.svg (120) · badge-water-wise.svg (120) · avatar-base.svg
(200, original round character, neutral, friendly) · avatar-hat.svg · avatar-scarf.svg · avatar-glasses.svg ·
avatar-backpack.svg (200, transparent overlays aligned to avatar-base) · world-map.svg (960×420, Unit 3 as 6
islands with paths, sea, clouds; no text) · island-stop.svg (120) · basket-yes.svg / basket-no.svg (160) ·
tile-roots.svg / tile-leaf.svg / tile-stem.svg / tile-flower.svg (96) · tile-candy.svg / tile-darkness.svg /
tile-plastic.svg / tile-minerals.svg / tile-co2.svg (96) · confetti.svg (240, few shapes, used once) ·
trophy-team.svg (160) · gamepad-hub.svg (240, hero for the hub).

## Quality floor (unchanged, mandatory)

Responsive 1440 / 1024 / 390, zero page overflow, one h1 per screen, no skipped headings, accessible names start
with visible text, contrast ≥ 4.5:1 (white only on purple), targets ≥ 44 (≥ 64 Explorer), focusable hash targets,
`prefers-reduced-motion` turns pops/shakes/confetti into fades, no infinite loops, sound off by default in the
mock, themed selection/caret/scrollbar, meta description, favicon, picker `<nav class="picker" aria-label="Mockup
screens">`. Game interactions must work by mouse, touch and keyboard (tiles are buttons with aria-pressed; matched
pairs announced via aria-live).
