# Backend best-practices audit (Nibras API)

Audit of `apps/api` against the owner's "Stackwise" backend knowledge base (`C:\Users\A\Desktop\DEV\backend`, `kb/`),
queried with `educator/tools/kb/sw.mjs` (`route`, `rules`, `chk`, `search`). Topics used:

- **T09** Backend security, **T07** Scaling and limits, **T04** API design and errors (problem+json, rate-limit headers)
- **T05** Database design (indexes, bounded queries), **T10** Reliability and observability, **T11** Async jobs and queues
- **T12** Realtime/WebSockets, **T13** Testing/CI, **T14** Deployment, **T15** LLM engineering, **T29** Runtimes and graceful shutdown
- **T32** Storage, files and uploads, **T45** AI security, **R-serverless-edge-app** (Vercel/Railway split)

Statuses: PASS, PARTIAL, GAP, N/A. Rows marked "(fixed)" were PARTIAL or GAP before this audit; the Evidence column points at
the fixed code. Line numbers are as of this audit.

## Checklist

| # | Rule (KB id / section) | Status | Evidence | Note |
|---|---|---|---|---|
| 1 | Security response headers: nosniff, frame deny, referrer, HSTS (T09 Core rules) | PASS (fixed) | `src/common/security-headers.ts`, `src/bootstrap.ts:26` | Was missing. No CSP: JSON API, no HTML except Bull Board. |
| 2 | Do not leak the server stack (`X-Powered-By`) (T09) | PASS (fixed) | `src/bootstrap.ts:25` | |
| 3 | CORS explicit allow-list, no reflected origin with credentials (T09 CSRF/CORS) | PASS | `src/bootstrap.ts:28`, `src/common/origins.ts:2` | Env-driven list, credentials on. |
| 4 | CSRF on cookie auth: SameSite plus JSON-only mutations (T09) | PASS | `src/common/student-cookie.ts:47`, `src/bootstrap.ts:37` | SameSite=lax, httpOnly, secure in prod. Web rewrite keeps cookies same-origin. |
| 5 | Request body size limit (T09, T04) | PASS | `src/bootstrap.ts:37` | `express.json({ limit: "1mb" })`. |
| 6 | Upload size/count limit and type check by bytes (T32) | PASS | `src/lessons/lessons.controller.ts:70,92`; `src/documents/documents.service.ts:111-120` | 20 MB, 1 file, magic bytes, extension must agree. |
| 7 | Slow-client / request timeouts on the HTTP server (T09, T29) | PASS (fixed) | `src/common/http-server.ts`, `src/bootstrap.ts:27` | requestTimeout 120 s, headers 65 s, keep-alive 61 s. |
| 8 | Rate limit sensitive and public routes (T09 abuse defense) | PASS (fixed) | `src/common/rate-limit.ts`; `@RateLimit` on join, play, AI, export, share; `src/join/join.controller.ts` | Public join lookups now 120/min per IP, joins 60/min: generous so a classroom behind one NAT is never locked out, while guessing six-digit codes stays throttled. |
| 9 | Rate-limit key must not be client-spoofable (T09, T07) | PASS (fixed) | `src/common/rate-limit.ts:53-54` | Used the first `X-Forwarded-For` entry, which a client can set to dodge the limit; now `req.ip` with `trust proxy 1`. |
| 10 | 429 with `Retry-After` and problem+json (T04 Rate limit headers) | PASS (fixed) | `src/common/problem.filter.ts:54-70`, `src/common/rate-limit.ts:26` | Header added; body unchanged. Draft `RateLimit-*` headers not sent. |
| 11 | Shared limiter store across instances (T07, T28) | PASS | `src/common/rate-limit.ts:42` | Redis INCR/PEXPIRE when `REDIS_URL`; memory fallback fails open, documented in code. |
| 12 | Token endpoint rate limited (T09) | PASS (fixed) | `src/realtime/realtime.controller.ts:16` | `GET /realtime/token` had no limit. |
| 13 | Auth: separate stricter limits for login/signup/reset (T09) | PASS (fixed) | `src/auth/auth-rate-limit.ts`, `src/auth/auth.factory.ts`, migration `auth_rate_limit` | Better Auth limiter moved to the `rateLimit` table (Redis secondary storage when `REDIS_URL`), so it holds across instances. Sign-in/sign-up 10/min, forgot-password 3/min. On in production. Server-side demo login does not pass through it. |
| 14 | Password policy and secret strength checks at boot (T09) | PASS | `src/auth/auth.factory.ts:12-14,21` | Secret 32+ chars enforced, min password 8. |
| 15 | Signed cookies/tokens: HMAC, constant-time compare, expiry (T09) | PASS | `src/common/student-cookie.ts:33`, `src/common/realtime-token.ts:49` | `timingSafeEqual`, exp checked. |
| 16 | AuthZ on every resource, scoped by owner (T09 BOLA/IDOR) | PASS | `src/lessons/lesson-view.service.ts:24-25`, `src/auth/teacher.guard.ts`, `src/auth/student.guard.ts` | Controllers use `TeacherGuard`/`StudentGuard`; lookups carry `teacherId`/`classId`. |
| 17 | Admin tooling behind allow-list, hidden otherwise (T09) | PASS | `src/admin/bull-board.ts:12-23` | 404 for non-admins. |
| 18 | Input validation at the edge (T04, T09) | PASS | `src/common/zod.pipe.ts`; 30 `ZodValidationPipe` uses | Shared Zod schemas, 400 problem+json with per-field errors. |
| 19 | No raw SQL with interpolation (T09 injection) | PASS | only a tagged `$queryRaw` in `src/health/health.controller.ts:24` | Prisma everywhere else. |
| 20 | Errors as RFC 9457 problem+json, no internals leaked (T04) | PASS | `src/common/problem.filter.ts:25-70` | Unknown errors map to a generic 500 body. |
| 21 | Secrets/PII not logged (T09, T10) | PASS | `src/ai/generators.ts:108-126` | Logs carry lesson ids, kinds, tokens, latency only; no student names or cookies. |
| 22 | Error tracking without PII (T10) | PASS | `src/observability/sentry.ts:6-12` | Optional DSN, no `sendDefaultPii`, low trace sample rate. |
| 23 | Health endpoint checks dependencies with a timeout (T10, T14) | PASS (fixed) | `src/health/health.controller.ts:8-24` | DB ping now bounded to 3 s. Railway `healthcheckPath` set. |
| 24 | Graceful shutdown: drain, close workers, close DB (T29) | PASS (fixed) | `src/main.ts:16,21`, `src/prisma/prisma.service.ts:18`, `src/jobs/bullmq.queue.ts:114` | A raw SIGTERM handler closed Prisma before Nest drained; now a Nest shutdown hook. |
| 25 | Container runs as non-root (T14) | PASS | `apps/api/Dockerfile:30` | `USER node`. Not modified. |
| 26 | Migrations versioned, applied at deploy, CI runs them (T05, T13) | PASS | `prisma/schema/migrations/`, `.github/workflows/ci.yml:48` | `migrate deploy`. |
| 27 | Index every foreign key and hot filter (T05) | PASS (fixed) | `prisma/schema/domain.prisma` (Participant, GameResult, XpEvent), migration `20261120234513_add_fk_lookup_indexes` | Added `participant(studentId)`, `game_result(lessonId)`, `xp_event(studentId, createdAt)`. |
| 28 | Unique constraints back idempotent writes (T05, T04) | PASS | `prisma/schema/domain.prisma:106,218,233,302,320` | `(sessionId,studentId)`, `(participantId,questionIndex)`, `(lessonId,kind)`. |
| 29 | Bounded list queries / pagination (T04, T05) | PASS (fixed) | `src/lessons/lessons.service.ts` cap 500; `src/results/results.service.ts`; dashboard `take` 6/20/30 | Results now read plain session rows plus one grouped count, and answers only for the selected session. |
| 30 | Cascade deletes defined on relations (T05) | PASS | `prisma/schema/domain.prisma` `onDelete: Cascade/SetNull` | |
| 31 | Idempotent job enqueue (T11) | PASS | `src/jobs/bullmq.queue.ts:31-44,101-107`, `src/jobs/job-queue.ts:183`, `src/lessons/generation.service.ts:71` | Deterministic `jobId`, duplicate returns false; inline keys; atomic claim. |
| 32 | Retries with exponential backoff, bounded attempts (T11) | PASS | `src/jobs/bullmq.queue.ts:23-29` | 3 attempts, 4 s exponential. |
| 33 | Per-job timeout (T11) | PASS | `src/jobs/bullmq.queue.ts:13-20,98` | `withTimeout(LIMITS.jobTimeoutMs)`. |
| 34 | Concurrency limit on expensive jobs (T11, T15) | PASS | `src/jobs/bullmq.queue.ts:8,86,89` | 5 workers plus global limiter. |
| 35 | Completed/failed job retention bounded (T11) | PASS | `src/jobs/bullmq.queue.ts:26-27` | `removeOnComplete`, failed kept 24 h. |
| 36 | Dead-letter / failed-job visibility (T11) | PARTIAL | `src/jobs/bullmq.queue.ts:87` (warn log), Bull Board | Failed jobs kept 24 h and visible in Bull Board; no alerting. |
| 37 | Stuck-job recovery (T11) | PASS | `src/lessons/generation.service.ts:15,72` | Stale generation reclaimed after 4x job timeout. |
| 38 | Background work survives serverless freeze (R-serverless-edge-app) | PASS | `src/common/background.ts:11-14`, `apps/api/vercel.json` | `waitUntil` on Vercel, `maxDuration` 300. |
| 39 | Driver choice honours platform limits (R-serverless-edge-app, T12) | PASS | `src/jobs/job-queue.ts:225-235` | Warns when BullMQ or Socket.IO is selected on Vercel. |
| 40 | DB client and app reuse on serverless (R-serverless-edge-app) | PASS | `src/prisma/prisma.service.ts:5-9`, `src/vercel.ts:12-23` | Cached client and app per instance. |
| 41 | WebSocket handshake authenticated (T12) | PASS | `src/realtime/realtime.gateway.ts:34-40` | Signed 5-minute token; middleware rejects otherwise. |
| 42 | WebSocket room authorization per join (T12) | PASS | `src/realtime/realtime.gateway.ts:10-22` | `canJoin` checks teacher ownership or class membership. |
| 43 | WebSocket origin allow-list (T12) | PASS | `src/realtime/realtime.gateway.ts:26` | |
| 44 | Realtime has a non-socket fallback for serverless (T12) | PASS | `src/jobs/job-queue.ts:217-222` | `REALTIME=poll`. |
| 45 | WebSocket limits: rooms per socket, message size, heartbeat (T12) | PARTIAL | Socket.IO defaults (1 MB buffer, ping 25 s) | No cap on rooms joined per socket; message body validated by type only. |
| 46 | LLM calls have a timeout (T15) | PASS (fixed) | `src/ai/claude.provider.ts:81` | `LIMITS.aiCallTimeoutMs` (120 s) existed but was never applied; SDK default is 10 min. |
| 47 | LLM retries bounded; 429/5xx mapped to friendly errors (T15) | PASS | `src/ai/claude.provider.ts:43-53,81` | SDK retries 2; `mapSdkError`. |
| 48 | Structured output validated; refusal and max_tokens handled (T15) | PASS | `src/ai/claude.provider.ts:90-103`, `src/ai/generators.ts:108-126` | Schema-validated, retry with the stronger model. |
| 49 | Prompt injection: source treated as untrusted data (T45) | PASS | `src/ai/prompts.ts:49-53,113,125` | Delimited and declared untrusted. |
| 50 | Prompt caching for repeated context (T15) | PASS | `src/ai/claude.provider.ts:56,85` | `cache_control: ephemeral` on the shared block. |
| 51 | Token/cost metering and per-user quotas (T15, T39) | PASS | `src/ai/generators.ts:116`, `src/lessons/pipeline.service.ts:83` | Tokens logged per call; 100 lessons per month per teacher. |
| 52 | Per-user upload limiter (T09, T32) | PASS (fixed) | `src/lessons/pipeline.service.ts` (`UploadLimiter`), `src/common/rate-limit.ts` (`sharedCounterStore`) | Runs on the shared Redis counter store when `REDIS_URL` is set; memory fallback (also if Redis is down). |
| 53 | Student data minimised; no student PII to the LLM (T34, T45) | PASS | `src/ai/prompts.ts:11`, `src/join/join.service.ts:62-64` | Join returns `displayName` only. |
| 54 | Uploaded originals stored privately (T32) | N/A | `src/storage/storage.service.ts` | The owner dropped storage: no `BLOB_READ_WRITE_TOKEN` is set, so originals are never stored (only the clean text and the sha256). Revisit only if storage returns. |
| 55 | Storage failures never block the main flow (T32) | PASS | `src/storage/storage.service.ts:33-35` | Returns null and warns. |
| 56 | Storage keys not user-controlled (T32) | PASS | `src/storage/storage.service.ts:20-22` | Extension sanitised, server-built key. |
| 57 | Unit/integration tests and coverage in CI (T13) | PASS | `apps/api/jest.config.js`, `.github/workflows/ci.yml:49-52` | 94.2% lines. |
| 58 | E2E against a real DB in an isolated schema (T13) | PASS | `apps/api/test/global-setup.ts` | Schema `helpo_e2e`, rebuilt from migrations. |
| 59 | CI runs typecheck, lint, tests, build (T13) | PASS | `.github/workflows/ci.yml:49-52` | |
| 60 | Dependency audit / update automation (T13, T09 supply chain) | GAP | no `npm audit` step or Dependabot config | Outside `apps/api`; see Known gaps. |
| 61 | Env validation at boot (T14 12-factor) | PARTIAL | `src/auth/auth.factory.ts:12`, `src/common/student-cookie.ts:12` | Auth and cookie secrets throw; no single typed env schema, some secrets checked lazily. |
| 62 | Structured request logging with correlation id (T10) | PASS (fixed) | `src/common/request-context.ts`, `src/bootstrap.ts`, `src/common/problem.filter.ts` | `x-request-id` (valid uuid kept, else generated) on every response and in problem+json as `requestId`; one JSON access line per request (method, route pattern, status, ms, requestId; no IP, body, query or names); `/api/health` skipped. |
| 63 | Metrics / tracing (T10) | PARTIAL | `src/observability/sentry.ts:6` | Sentry traces at 5%; no metrics endpoint. |
| 64 | Idempotency-Key header on non-idempotent POSTs (T04) | PARTIAL | rows 28 and 31 | Risky writes are idempotent by natural key or job id instead of a header. |
| 65 | API versioning / deprecation policy (T04) | N/A | | Single first-party web client deployed with the API; `docs/API.md` is the contract. |
| 66 | Row-level security in the DB for multi-tenancy (T28) | N/A | | Tenant scoping is in the service layer (row 16); no RLS requirement. |
| 67 | Payments, ledgers, outbound webhooks (T33, T35) | N/A | | Not used. |

Counts (67 items): PASS 52 (11 of them fixed in this audit), PARTIAL 10, GAP 2, N/A 3.

## Fixed in this audit

Fixes 1-10 have Jest tests in `apps/api/src/common/hardening.spec.ts`; fixes 11-16 in `access-hardening.spec.ts`, `results.service.spec.ts`, `demo.service.spec.ts` and `admin.spec.ts`.

1. Security headers middleware (nosniff, X-Frame-Options, Referrer-Policy, COOP, X-Permitted-Cross-Domain-Policies, HSTS in production) and `x-powered-by` removed. Test: "security headers (KB T09)".
2. HTTP server timeouts (request, headers, keep-alive). Test: "HTTP server timeouts (KB T09/T14)".
3. Rate-limit client key now uses `req.ip` instead of the spoofable `X-Forwarded-For` header. Test: "keys on req.ip (trust proxy), not on a client-supplied X-Forwarded-For".
4. `Retry-After` header on every 429 (window in seconds, header only, body unchanged). Tests: "a 429 carries Retry-After ...", "falls back to 60 s ...".
5. Rate limit on `GET /api/realtime/token`. Test: "the realtime token endpoint is rate limited".
6. Anthropic client timeout set to `LIMITS.aiCallTimeoutMs` (120 s, was the 10 min SDK default), retries explicit. Test: "AI client timeout (KB T15)".
7. Health probe DB ping bounded to 3 s. Test: "health probe timeout (KB T10)".
8. Graceful shutdown: removed the raw `process.on("SIGTERM")` that closed Prisma while requests and workers were still draining; Prisma now closes from Nest's `onApplicationShutdown` after `enableShutdownHooks`. Test: "graceful shutdown (KB T29)".
9. Lesson list capped at 500 rows. Test: "bounded queries (KB T05/T04)".
10. Three missing indexes via `prisma migrate dev --name add_fk_lookup_indexes` (generated SQL, not hand-edited): `participant(studentId)`, `game_result(lessonId)`, `xp_event(studentId, createdAt)`. Test: "Prisma schema indexes (KB T05)".

11. Public join lookups throttled per IP (120/min lookups, 60/min joins). Test: "public join lookups are throttled per IP, generously" (`access-hardening.spec.ts`).
12. Better Auth rate limit storage moved to the database (Redis secondary storage with `REDIS_URL`), sign-in kept strict; new `RateLimit` model via `prisma migrate dev --name auth_rate_limit`. Tests: "Better Auth rate limit storage".
13. Upload limiter on the shared Redis counter store with memory fallback. Tests: "UploadLimiter on the shared store".
14. Results no longer loads every session with its answers (session rows + one grouped count; answers only for the selected session). Test: "ResultsService query shape".
15. `x-request-id` middleware, `requestId` in problem+json and a structured access log. Tests: "request id and access log".
16. Pre-configured demo access (`DEMO_LOGIN`), admin overview and role guard, demo quota (`DEMO_LESSON_QUOTA`), reserved join codes. Tests: `demo.service.spec.ts`, `admin.spec.ts`.

## Known gaps / decisions

Resolved since the first audit: public join lookups, Better Auth limiter storage, the upload limiter, the results query and request-id logging (see the Fixed list). Vercel Blob is N/A: the owner dropped storage and no token is set.

- **Realtime limits**: Socket.IO runs only on Railway (`REALTIME=socket`); Vercel cannot hold sockets, so it polls. No per-socket room cap yet (low risk: `canJoin` authorizes each room).
- **Dependency audit / Dependabot** and a typed env schema are outside the allowed scope (repo root, CI) or need a design decision.
- **`railway.json`, Dockerfile and deploy config** were not touched, per the audit rules.
- **Pre-existing e2e failure** (not caused by this audit): `test/api.e2e-spec.ts:120` expects the share link to contain `/play?code=`, but `src/sessions/sessions.service.ts:13` builds `/join?code=`. One of the two is stale; the owner must pick the canonical URL.

## Follow-up after the audit (orchestrator)

- **Client IP behind two proxies.** Browser traffic reaches the API through the Vercel rewrite and then the Railway edge. With
  `trust proxy = 1`, `req.ip` would be a Vercel egress address, and every user would share one rate-limit bucket. The hop count is
  now `TRUST_PROXY_HOPS` (default 1, production 2; `trustProxyHops()` in `apps/api/src/common/http-server.ts`, tested in
  `hardening.spec.ts`). Trade-off: a client calling the Railway URL directly can add one forged `X-Forwarded-For` entry and
  pick its own limiter key. Authenticated AI routes still need a teacher session, so the cost exposure stays bounded.
- **Share link.** `/join?code=` is canonical, so the e2e assertion was updated (`test/api.e2e-spec.ts`).
