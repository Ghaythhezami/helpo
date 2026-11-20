# Educator Helper — product context

## What it is
An AI teaching assistant. A teacher gives it one lesson (uploaded file or a short description) and it produces a
ready-to-teach kit of five resources: presentation, worksheet, quiz, mini-game and summary cards. The teacher
reviews and edits the kit, shares it with a class (link, QR code or live session), and sees results.

Planned stack: Next.js + React + TypeScript, Tailwind, shadcn/ui, Framer Motion (motion), NestJS, PostgreSQL/Prisma,
Socket.IO for live quizzes, BullMQ for background AI generation, OpenAI for generation, Recharts for analytics.

## Who uses it
Primary and middle-school teachers (grades 4–9), English UI first. Example: Alex Green, Grade 6 science teacher,
class 6B, 24 students. Teachers prepare in the evening on a laptop, project in class on a board or TV, and check
results on a phone between periods. They are time-poor, not designers, and must trust what goes in front of children.

## The job
"Turn tomorrow's lesson into material I can teach from, check it is correct and right for my class, run it, and
know who did not get it." Shortest honest path: Lesson in → Review → Teach → Check.

## What the instructor flagged (assumed reading, confirmed by the user)
1. Too many steps and screens: input, insight panel, kit cards, floating lesson board and editor all compete on one page.
2. AI output is hard to review: no sign of what the AI was unsure about, what came from the teacher's file, or reading level.
3. Too decorative: gradients, mascots, quote panel, five accent colours, sticky-note board.
4. Class and results are unclear: averages only, no "who needs help" and no next action.

## Constraints
- Must stay buildable with shadcn/ui primitives and Tailwind tokens.
- Classroom projection: content must read from the back of a room (large type, strong contrast).
- Child data: show student names only to the teacher, never on projected screens.
- AI must be honest: show sources and flag low-confidence content instead of hiding it.
