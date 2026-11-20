# Nibras

Nibras turns one lesson into a complete teaching kit with Claude. The teacher uploads a file (PDF, Word, PowerPoint,
TXT) or describes the lesson. Nibras then makes summary cards, a worksheet, slides, a quiz and a mini-game.
The teacher checks and edits the kit, explains with a built-in whiteboard, and shares it with a code or QR. Students
(grades 2 to 12) join with a code and their first name to play the live quiz or the game, and the teacher sees the
results. The app works in English and Arabic (right to left).

- Teacher app: two screens, with no page scroll.
  - **Create**: upload a file or describe the lesson, refine the prompt with AI, and find previous lessons.
  - **Lesson workspace**: five tabs, an edit panel in the margins, a draggable whiteboard with pencil and eraser,
    sharing and results.
- Student app: one interface. Join, then play the quiz or game, then see the result card.
- Design reference: `design/mockups/v5` and the v6 mockups at https://helpo-mockups.vercel.app.

## Stack

| Part | Technology |
|---|---|
| Web (`apps/web`) | Next.js (App Router), React, TypeScript, Tailwind CSS v4, TanStack Query, motion, Socket.IO client |
| API (`apps/api`) | NestJS modular monolith on one port: REST, Socket.IO gateway, BullMQ workers |
| Data | PostgreSQL + Prisma; Redis for BullMQ and rate limits |
| Auth | Better Auth (teachers). Students use a signed cookie and need no account or password. |
| AI | Claude via `@anthropic-ai/sdk`. One analysis call builds the lesson blueprint, then five generators run in parallel. Structured outputs are validated with Zod, and a repair loop retries failed checks. |
| Shared (`packages/shared`) | Domain rules, Zod schemas and API types used by both apps |
| Quality | Jest (shared, API unit and e2e, web with React Testing Library), SonarQube, GitHub Actions |

Architecture, the AI pipeline and the security rules are in `docs/ARCHITECTURE.md`. The API contract is in
`docs/API.md`, and deployment (Railway API + Vercel web) is in `docs/DEPLOY.md`. The AI Integration Spec is in
`docs/spec/`.

## Local setup

Requires Node.js 20.19 or later, Docker (for PostgreSQL and Redis) and npm.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # then set DATABASE_URL and the two secrets
npm run build -w @helpo/shared
npm run db:migrate && npm run db:seed       # the demo teacher login is written to .local/demo-account.txt
npm run dev:api                             # http://localhost:3001
npm run dev:web                             # http://localhost:3000
```

Without `ANTHROPIC_API_KEY`, the API runs in demo mode with realistic offline content. Set `QUEUE_DRIVER=bullmq`,
`REALTIME=socket` and `REDIS_URL` to run the background jobs and live updates exactly as in production.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Builds shared, then the API, then the web app |
| `npm run typecheck` / `npm run lint` | Type and lint checks for all packages |
| `npm test` | Jest with coverage for shared, API and web (lcov for SonarQube) |
| `npm run test:e2e -w @helpo/api` | API end-to-end tests against a real database |
| `npm run sonar` | SonarQube scan (needs `SONAR_HOST_URL` and `SONAR_TOKEN`) |
| `npm run db:migrate` | Applies Prisma migrations. Create new ones with `prisma migrate dev --name <x>` in `apps/api`. |
