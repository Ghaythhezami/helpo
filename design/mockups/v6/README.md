# Nibras v6 mockups: radical simplification of v5
Open `index.html` (teacher, add `?dev` for a screen switcher, `?lang=ar`, `?screen=2`) and `play.html` (student, `?code=482913`, `?mode=quiz|match|memory|rush`). Serve over http (e.g. `python -m http.server`) for best results.
1. **2 teacher screens, not a dashboard.** Create (upload or prompt, previous lessons strip) and Lesson workspace. All v5 navigation, home, class and results pages are gone.
2. **No page scroll anywhere.** `100dvh` shell with `overflow:hidden`; only inner panels (item list, edit panel, previous-lessons strip) scroll.
3. **Margins are the editor.** Item list on one side, edit fields, "Ask Nibras", "2 things to check" and results on the other; both collapse, and become bottom sheets on phones.
4. **Teaching whiteboard.** A draggable, resizable, minimizable, maximizable board with pencil, eraser, 5 colors, stroke size, undo and clear; plus a "Draw on slide" overlay using the same tools. Full screen on phones.
5. **One primary action per screen.** "Make lesson kit" on Create, "Share" in the workspace; defaults over settings (extra options sit behind "More options"); plain words ("What Nibras understood").
6. **Share in two clicks.** Choose live or own-pace, then big code, QR, link and Copy.
7. **Student = join only.** Code + first name, then straight into a full-screen quiz or mini-game (match pairs, memory, true/false rush). Gentle feedback, stars and "+40 XP for effort", no leaderboard, no student home, journey or avatar pages.
8. **Arabic and RTL** (Baloo Bhaijaan 2 + Tajawal) on both apps; the margins mirror.
9. **Accessibility:** AA colors, visible focus, Tab-reachable tabs, Esc closes dialogs, reduced motion respected, 44px tap targets on mobile.
10. v5 look kept (purple gradient, Nunito/Fredoka, rounded cards, mascot and illustrations), but calmer with far fewer elements.
