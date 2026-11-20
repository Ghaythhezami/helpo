# Helpo — architecture

Helpo turns one lesson (a teacher's file or description) into a five-resource kit — slides, worksheet,
quiz, mini-game and summary cards — with Claude, lets the teacher check what the AI was unsure about,
teach it live or assign it, and gives students (grades 2–12) a gamified, age-adapted experience.
UI source of truth: the v5 mockups (`design/mockups/v5/index.html` teacher app, `design/mockups/v5/play.html`
student app) and `docs/design/redesign-brief-v5.md`.

## Monorepo

```
apps/api        NestJS 11 + Better Auth + Prisma (PostgreSQL) + Zod + Claude (@anthropic-ai/sdk)
apps/web        Next.js (App Router) + React + TypeScript + Tailwind CSS v4 + shadcn-style primitives + motion
packages/shared Domain rules (bands, XP, streaks, mastery), Zod schemas (AI content + API bodies), API types
```

Both apps import `@helpo/shared`; the API never trusts the client for scores, XP or answers.

## Runtime and deployment (Vercel)

```
Browser ─► web (Vercel, Next.js) ──rewrite /api/* ─► api (Vercel Function, NestJS on Express)
                                                     ├─► Neon Postgres (pooled URL)  ─ Prisma
                                                     └─► Claude API (claude-opus-5-5, structured outputs)
```

- **Same origin for the browser.** `apps/web/next.config.ts` rewrites `/api/:path*` to `API_ORIGIN`, so Better Auth
  cookies are first-party on the web domain (no third-party cookie problems). `BETTER_AUTH_URL` = web origin.
- **AI generation** (Stackwise R-serverless: never run long jobs in the request): `POST /api/lessons/:id/generate`
  returns 202, then `waitUntil()` (from `@vercel/functions`) runs the five resource generations **in parallel**
  and writes each resource's status as it finishes; the Generating screen polls `GET /api/lessons/:id`.
  Function `maxDuration` 300 s. Locally the same code runs (waitUntil falls back to a detached promise).
- **Live quiz** uses short polling (1.5 s) instead of Socket.IO, because Vercel Functions cannot hold
  WebSockets. The polling endpoints are cheap reads keyed by session id.
- **Claude**: model from `CLAUDE_MODEL` (default `claude-opus-5-5`), effort from `CLAUDE_EFFORT` (default `medium`),
  structured outputs via `client.messages.parse` + `zodOutputFormat`, prompt caching on the lesson source block
  (shared across the five calls), refusal fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`),
  typed error handling, and an **offline demo mode**: when `ANTHROPIC_API_KEY` is missing, a deterministic local
  generator returns realistic content so the app is fully usable for demos and tests.

## Security and privacy (Stackwise T09, UX KB T20)

- Every teacher query is scoped by `teacherId`; negative tests prove teacher A cannot read teacher B's data.
- Students have **no passwords**: they join by picking grade → class → their name (or a 6-digit code). The API
  issues an HMAC-signed, httpOnly `helpo_student` cookie (student id + class id + expiry). Children only ever see
  first name + initial; the projector view never shows names.
- Inputs validated with Zod; errors are RFC 9457 problem+json; rate limits on join, answer and AI endpoints.
- Secrets only from environment variables; nothing secret is exposed to the client bundle.
- No individual leaderboards, forgiving streaks, XP for effort, no currency or purchases, mascot only celebrates.

## Testing and quality

- **Jest** everywhere: `packages/shared` (pure rules), `apps/api` (services with mocked Prisma/Claude + e2e with
  supertest against a test database), `apps/web` (components and hooks with React Testing Library).
- **SonarQube**: `sonar-project.properties` at the root reads the three `coverage/lcov.info` reports.
  `npm run sonar` runs a scan against a SonarQube server (`SONAR_HOST_URL`, `SONAR_TOKEN`).
- CI (GitHub Actions): install → typecheck → lint → test with coverage → build.

## Lesson pipeline (from Ghayth's technical flow)

```
1 Teacher input   PDF / DOCX / PPTX / TXT or a topic prompt; class sets grade, language, duration
2 Upload API      magic-byte type check, max 20 MB, sha256 duplicate detection, original kept in object
                  storage (Vercel Blob when BLOB_READ_WRITE_TOKEN is set), Lesson row created → UPLOADED
3 Extraction      no AI: pdfjs-dist (PDF), mammoth (DOCX), officeparser/JSZip (PPTX), native TXT/MD;
                  scanned PDF (little text) → Claude reads the PDF document directly; output = clean markdown
                  with page markers, detected language, character count → EXTRACTING
4 Analysis        ONE Claude call → LessonBlueprint JSON (title, subject, grade, summary, objectives, key
                  concepts, vocabulary, processes, relations, misconceptions, difficulty, suggested game),
                  validated with Zod and stored → ANALYZED
5 Generation      five generators run in parallel and all read the SAME blueprint (+ cached source):
                  cards 8–15, worksheet, slides 8–14 + speaker notes, quiz 5–20 (+ explanation, difficulty),
                  game content → GENERATING; each resource saved as it finishes
6 Teacher review  drafts appear as they finish; AI checks; edits; exports (PPTX via PptxGenJS, DOCX via docx,
                  PDF via pdf-lib); share/teach only after the teacher approves
Retry & partial   a generator that fails after retries leaves the other four usable: lesson PARTIAL,
                  "Try again" regenerates only the failed resource
```

Security: Zod everywhere, business-rule validation, grounding against the blueprint, duplicate detection,
age-appropriateness and language-consistency checks in the review pass, teacher approval before sharing,
uploaded text treated as untrusted data (prompt-injection defense: delimited, never followed as instructions),
API keys only on the server, **no student names ever sent to the AI**, rate limits, signed cookies/URLs.

## Games: a reusable template library, not generated code

AI never writes game code. The analysis + generation calls produce structured `GameContent` JSON **once per
lesson**, stored in the GAME resource and injected into pre-built React templates (`GAME_TEMPLATES` in
`@helpo/shared`: Match, Memory, Sort, Sequence). Every student plays the stored content with no further AI calls,
so the per-student cost of a game is zero. New templates (quiz battle, timed challenge) are added in code
once and become available to every lesson whose content fits (`playableTemplates`). Fully custom AI-generated
games can come later as a premium feature.

Engine: React + motion today (accessible, RTL-ready, same stack, small bundle). Phaser can back richer templates later
behind the same `GameContent` contract; H5P adds a PHP/LMS-oriented runtime and licence considerations, so it is not
the default.

Realtime: Vercel Functions cannot hold WebSockets, so live quizzes and game sessions use 1.5 s polling. For
Socket.IO multiplayer, run the NestJS API on a long-running host (Railway/Fly/Render, as in the original stack)
or use a managed realtime channel. Competitions are **team or class-goal based**: no individual leaderboards
for children (UX knowledge base T20/T24).

## AI Integration Spec (docs/spec/Educator_Helper_AI_Integration_Spec.pdf): how Nibras applies it

The spec is the reference. Nibras follows it with these mappings.

| Spec | Nibras |
|---|---|
| OpenAI `chat.completions.parse` + `zodResponseFormat` | Claude `messages.parse` + `zodOutputFormat` (structured outputs), `@anthropic-ai/sdk` |
| `OPENAI_ANALYSIS_MODEL` / `OPENAI_GEN_MODEL` | `CLAUDE_ANALYSIS_MODEL` (default `claude-opus-5-5`) / `CLAUDE_GEN_MODEL` (default `claude-sonnet-5-5`); the stronger model is also used for retry-after-failure |
| temperature 0.2 / 0.3 / 0.5–0.7 | not sent (current Claude models are steered with `effort`, not sampling settings); `effort` low for generators, medium for analysis |
| OpenAI moderation endpoint | a Claude safety pass in the review step (age-appropriateness by grade, language consistency), plus checks stored as `AiCheck` |
| OCR: Tesseract / OpenAI vision | Claude reads the scanned PDF as a `document` block (fewer than 50 characters per page) |
| tiktoken | `client.messages.countTokens`, falling back to an estimate of characters ÷ 4 |
| S3-compatible bucket | none for now: the original upload is kept only when `BLOB_READ_WRITE_TOKEN` is set (Vercel Blob, key `lessons/{lessonId}/source.{ext}`); otherwise only the clean text and the sha256 (for the cache) are stored |
| Supabase Postgres | Neon Postgres (Vercel marketplace) locally Docker Postgres |

### Modular monolith, single port

NestJS modules as in the spec: Upload, Extraction, Analysis, Generation (Cards, Worksheet, Presentation, Quiz and
Game generators sharing one `Generator<T>` contract), Export, Session, Analytics. They communicate through function calls
and a `JobQueue` port, never over HTTP.

The job runner and the event channel have two drivers, selected by environment:

- **`QUEUE_DRIVER=bullmq` + `REALTIME=socket`** (spec default; local Docker Redis, or Railway/Render/Fly). This driver:
  - runs a BullMQ Flow with one parent `finalize` and five children `generate.{kind}`
  - uses `jobId = lessonId:kind` for idempotency
  - retries 3 times with exponential backoff (4 s), times out each job at 3 min and applies a global AI limiter
  - reports progress with `job.updateProgress`
  - emits Socket.IO events on the same HTTP port, under `/socket.io`
  - can start `WORKER_ONLY=true` instances (stage 2 of the spec)
  - mounts Bull Board under `/admin/queues`, protected by `ADMIN_EMAILS`

  Use a fixed-price Redis for BullMQ, not pay-per-command Upstash, with `maxRetriesPerRequest: null`.
- **`QUEUE_DRIVER=inline` + `REALTIME=poll`** (Vercel Functions). This driver:
  - runs the same processors with `waitUntil()`
  - keeps the same idempotency key, retry/backoff policy and progress writes, stored in Postgres
  - has the UI poll every 1.5 s

Same code and contracts in both. The deployed Vercel demo uses this driver because Vercel cannot hold WebSockets
or long-running workers.

### Validation, quality and safety layer (spec section 8), for every AI response

1. Schema: structured outputs + Zod; up to 2 automatic retries.
2. Business rules, per generator `validate(out, blueprint) → string[]`: counts within limits, exactly one correct mcq
   option, no empty text, answers present in options. When rules fail, the call is retried with the problem list
   appended (repair loop, 3 attempts).
3. Grounding: every quiz `concept` and every card `concept` must exist in `blueprint.keyConcepts` or `vocabulary`.
   Ungrounded items are dropped, and the resource is regenerated if it falls below its minimum.
4. Duplicates: normalized-text comparison drops duplicate questions and cards.
5. Moderation: the Claude safety pass, including the age-appropriate filter by grade. A blocked resource flags the
   lesson with a check.
6. Language: output language must equal `blueprint.language`, otherwise the call is retried.
7. Human review: resources are drafts. Prompt-only lessons carry the badge "AI-written, please review". The teacher
   approves the kit before sharing.

Post-processing in code shuffles quiz options, balances difficulty, trims text and removes duplicates.

Prompts live in versioned files (`apps/api/src/ai/prompts/*.v1.ts`). Each resource stores `promptVersion`, `model`,
`tokensIn` and `tokensOut`.

### Cost, security and observability

Cost and quota:
- Only the blueprint (about 1.5k–3k tokens) goes to the generators, never the document.
- Cache by file hash: the same file reuses its extraction and blueprint.
- Each teacher has a monthly lesson quota (`MONTHLY_LESSON_QUOTA`, default 100).
- Upload rate limit: 10 per hour per teacher.

Documents and prompts:
- Documents use a 150-page soft limit (above it, the teacher chooses a page range).
- Teacher prompts are 10–4000 characters, with control characters stripped.

Long documents use map-reduce analysis when the token count is above 60% of the analysis budget:
- chunks of 3k–5k tokens with overlap
- per-chunk mini-blueprints, built in parallel with limited concurrency
- one final reduce call that writes the blueprint

Sessions and students:
- Session codes are random, expire, and can be opened or closed by the teacher.
- Correct answers never reach the browser before submission.
- Short answers are matched against `acceptedAnswers` after normalization.
- No student name is ever sent to Claude.

Observability:
- Structured logs record lessonId, kind, attempt, latency, tokens and cost.
- Sentry is enabled when `SENTRY_DSN` is set.

Deviations, kept on purpose:
- Objectives in the blueprint are objects with a code and Bloom level, for mastery reporting.
- Worksheet sections carry a `level` (support/core/stretch) for v5 differentiation.
- The live `session.leaderboard` defaults to **TEAMS**. INDIVIDUAL is off for grades 2–5, and the projector shows first
  name + initial only (UX knowledge base T20/T24).
- The teacher dashboard keeps the full ranking.
