# AGENTS.md: Nibras

Instructions for any coding agent working in this repository. Read this before editing. Deeper docs:
`docs/ARCHITECTURE.md` (pipeline, security), `docs/API.md` (endpoint contract), `docs/DEPLOY.md` (Railway + Vercel),
`docs/spec/` (AI Integration Spec), `docs/best-practices/` (backend and UX audits).

## Product in one paragraph

Nibras (Arabic name نبراس) turns one lesson into a five-resource kit with Claude: summary cards, worksheet, slides, quiz
and mini-game. The teacher uploads a file (PDF, DOCX, PPTX, TXT) or describes the lesson. Nibras analyses it once into
a **lesson blueprint**, and five generators build the resources from that blueprint. The teacher reviews and edits them,
explains on a whiteboard, and shares with a code or QR. Students in grades 2 to 12 join with a code and their first name,
then play. The app is English and Arabic, with full RTL.

## Repository layout (npm workspaces)

```
packages/shared   @helpo/shared: domain rules, Zod schemas (AI outputs + request bodies), API types. Build it first.
apps/api          @helpo/api: NestJS 11 modular monolith on ONE port: REST + Socket.IO gateway + BullMQ workers
                  Better Auth, Prisma (schema in prisma/schema/*.prisma), @anthropic-ai/sdk
apps/web          @helpo/web: Next.js App Router, React, Tailwind v4, TanStack Query, motion, socket.io-client
design/mockups/v5 visual source (v6 mockups: https://helpo-mockups.vercel.app)
```

Package names keep the old `helpo` prefix on purpose. The brand shown to users is **Nibras**.

## Commands

| Task | Command |
|---|---|
| Install (repo root only, one at a time) | `npm install` |
| Build all (shared, then api, then web) | `npm run build` |
| Shared only (run after changing `packages/shared`) | `npm run build -w @helpo/shared` |
| Dev servers | `npm run dev:api` (http://localhost:3001), `npm run dev:web` (http://localhost:3000) |
| Typecheck / lint | `npm run typecheck`, `npm run lint` |
| Unit tests + coverage (lcov for SonarQube) | `npm test` (always the FULL suite before a scan, or the lcov is incomplete) |
| API e2e (real Postgres) | `npm run test:e2e -w @helpo/api` |
| DB | `npm run db:migrate`, `npm run db:seed` (demo login is written to `.local/demo-account.txt`) |
| SonarQube | `npm run sonar` (needs `SONAR_HOST_URL`, `SONAR_TOKEN`; local values in `.local/sonar.env`) |

Local services run in Docker: Postgres on port 5433 and Redis on port 6380. Without `ANTHROPIC_API_KEY`, the API runs in
**demo mode**, which returns deterministic offline content.

## Definition of done

The following must pass before you call a change finished:

1. `npm run typecheck`, `npm run lint` (0 warnings), `npm test`, and `npm run build`.
2. API changes: `npm run test:e2e -w @helpo/api`.
3. Coverage stays at least 90% lines in api and web, and the SonarQube quality gate stays OK (new-code coverage at least 80%).
4. UI changes: the no-page-scroll check passes at 1440×900, 1280×720, 390×844 and 360×740, in EN and AR. See `apps/web/qa/`.

## Product rules (owner decisions, do not change without asking)

- **Navigation.** The logo always goes home: `/app` when signed in, `/` when signed out, `/join` on student screens. Teachers and admins get a collapsible side menu on the start side (mirrored in RTL), which becomes a drawer on phones. Students get no menu.
- **Teacher app has two screens, and no page ever scrolls.**
  - `/app` (Create) holds upload or describe, Refine with AI, and the previous lessons.
  - `/app/lessons/[id]` (Workspace) holds the five tabs, the edit margins and the draggable whiteboard. Share and Results
    open as dialogs.
  - Only inner panels may scroll.
- **The student UI is join, then play.** It is a code plus first name (or the class picker), then the live quiz, the
  self-paced quiz or a game, then a result card. There is no student home, avatar or journey.
- **Logo is the Latin "Nibras" only**, in both languages.
- **No individual leaderboards for grades 2 to 5** (Explorer band). The server enforces this with `leaderboardAllowed()`.
  XP rewards effort, streaks are forgiving, and there is no currency.
- **Tap targets are at least 44 px, and at least 64 px for the Explorer band.** Inputs use at least a 16 px font, and
  `prefers-reduced-motion` is respected.
- **No S3 for now.** Original uploads are stored only when `BLOB_READ_WRITE_TOKEN` (Vercel Blob) is set. Otherwise the
  app keeps only the clean text and its sha256.
- **Every translatable DB text has `...En` / `...Ar` columns.** The locale comes from the `x-helpo-locale` header, then
  the `helpo_locale` cookie, then `en`.

## AI rules (`apps/api/src/ai`)

- Use Claude via `@anthropic-ai/sdk` only, with structured outputs (`messages.parse` + `zodOutputFormat`) and Zod
  schemas from `@helpo/shared`.
- Model routing is set by env:
  - `CLAUDE_ANALYSIS_MODEL` (default `claude-opus-5-5`) runs the single analysis call and retries after a failure.
  - `CLAUDE_GEN_MODEL` (default `claude-sonnet-5-5`) runs the five generators.
- Do not send `temperature`. Steer with `effort`.
- **The blueprint is the only input to the generators, never the document.** The blueprint block is byte-identical across
  the five calls and cached with `cache_control`.
- **Validation and repair.** Each response goes through these steps:
  1. Schema check.
  2. Business rules (`validate` returns a list of problems).
  3. A retry with the problems appended (3 attempts).
  4. Grounding: drop items whose `concept` is not in the blueprint.
  5. Dedupe.
  6. Review checks, stored as `AiCheck`.
  7. Post-processing shuffles quiz options.
- **Prompt-only lessons** (no file) send the teacher text as a `<topic>` section built from subject knowledge, not as
  `<document>`. Files are `<document>`: untrusted data, and the only allowed source of facts. The topic text outranks a
  provisional title.
- **Student content never mentions Nibras, AI or the tool.** Never send student names to Claude.
- Prompts are versioned files (`ai/prompts/*.v1.ts`). Each resource stores `promptVersion`, `model`, `tokensIn` and
  `tokensOut`. When you change a prompt meaningfully, bump the version.
- Demo mode (`DemoAiProvider`) must stay grounded in its own blueprint. Demo generators read terms from `ctx.blueprint`.

## API conventions

- Scope every teacher query by `teacherId`. Another teacher's id returns **404**, not 403.
- Errors are RFC 9457 `application/problem+json`. Validate request bodies with the Zod schemas from shared.
- Students authenticate with the signed httpOnly `helpo_student` cookie. Correct answers never reach the browser before
  reveal or submission.
- Jobs go through the `JobQueue` port:
  - `QUEUE_DRIVER=bullmq`: BullMQ Flow, with job ids `${lessonId}__${kind}`. BullMQ forbids `:` in custom ids.
  - `QUEUE_DRIVER=inline`: `waitUntil`, for serverless.
- Realtime:
  - `REALTIME=socket`: Socket.IO on the same port, rooms `lesson:{id}` and `session:{id}`, auth with a 5-minute token
    from `GET /api/realtime/token`.
  - `REALTIME=poll`: the web app polls every 1.5 s.
  - Polling always stays on as the fallback.
- The rate limiter keys on `req.ip`. Set `TRUST_PROXY_HOPS` to the number of proxies in front (production uses 2:
  Vercel rewrite, then Railway).
- **Migrations are created only with `npx prisma migrate dev --name <x>` in `apps/api`. Never hand-edit migration SQL.**

## Web conventions

- Every `/api/*` call goes through the Next.js rewrite to `API_ORIGIN` (same-origin cookies). Use `lib/api.ts` and the
  hooks in `lib/queries.ts`.
- Live updates use `useRealtimeRoom` (`lib/realtime.ts`). It is enabled by `NEXT_PUBLIC_REALTIME=socket`; keep it.
- All UI strings live in `apps/web/messages/en.json` and `ar.json`. Keys must stay in parity (a test checks this).
- Read `apps/web/AGENTS.md`: this Next.js version differs from training data, so check `node_modules/next/dist/docs/`.
- Design: follow the v6 mockups and the UX audit in `docs/best-practices/ux.md`. Use one primitive system
  (`components/ui`).

## Deployment

| Part | Where |
|---|---|
| Web | Vercel project `nibras-web` (root `apps/web`): https://nibras-web-sage.vercel.app |
| API | Railway project `nibras`, service `nibras-api` (`apps/api/Dockerfile`, build context = repo root), with Postgres + Redis: https://nibras-api-production-caff3bab.up.railway.app |
| Repo | https://github.com/mrdahdah/nibras (private, `main`); `origin` is Ghayth's https://github.com/Ghaythhezami/helpo |

- Deploy the API with `railway up --service nibras-api --detach`. Deploy the web with `vercel deploy --prod` from the repo
  root. GitHub Actions CI runs on every push.
- `SEED_ON_START=true` runs the idempotent seed once after migrations. Set it back to `false`. The hosted seed uses the
  secret `DEMO_PASSWORD`.
- Railway's `railway.json` (config as code) is deprecated after 2026-12-01. The build uses `RAILWAY_DOCKERFILE_PATH`.

## Safety

- Never commit or print secrets. `.env`, `.env.*` and `.local/` are gitignored. `ANTHROPIC_API_KEY` and other keys
  belong to the owner, so don't create or paste them.
- Run **one `npm install` at a time from the repo root.** Concurrent installs corrupted `node_modules` before.
- Don't push to Ghayth's repo except the `mockups` branch. Commit and push only when asked, and end commit messages
  with the co-author line.
