# Deploying Nibras

| Part | Host | Mode |
|---|---|---|
| Web (Next.js) | Vercel, project `nibras-web` (https://nibras-web-sage.vercel.app) | rewrites `/api/*` to `API_ORIGIN` (same-origin cookies) |
| API (NestJS, one port) | Railway, project `nibras`, service `nibras-api` | `QUEUE_DRIVER=bullmq` + `REALTIME=socket` (https://nibras-api-production-caff3bab.up.railway.app) |
| Postgres | Railway `Postgres` service | `DATABASE_URL=${{Postgres.DATABASE_URL}}` (private network) |
| Redis | Railway `Redis` service | `REDIS_URL=${{Redis.REDIS_URL}}`; a fixed-cost instance, which suits BullMQ polling |
| API (fallback) | Vercel, project `nibras-api` (optional) | `inline` + `poll`, for a serverless-only setup |

## Railway (API)

The build uses `apps/api/Dockerfile` with the repository root as context (`railway.json` at the root). The container runs
`prisma migrate deploy` and then `node dist/main.js` on `PORT`. Health check: `GET /api/health`.

Railway marks `railway.json` (config as code) as deprecated after 2026-12-01. Migrate with `railway config migrate`
before then.

```bash
railway up --service nibras-api --detach        # deploy the current checkout
railway logs --service nibras-api               # follow logs
```

Variables on `nibras-api`:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}   REDIS_URL=${{Redis.REDIS_URL}}   NODE_ENV=production
QUEUE_DRIVER=inline|bullmq                REALTIME=poll|socket              WORKER_ONLY=false
GENERATION_MODE=sequential|parallel       (default sequential: SLIDES, WORKSHEET, QUIZ, CARDS, GAME one after another; also shapes the BullMQ flow)
QUIZ_CACHE_TTL_MS=60000                   (optional; memory bound of the in-process quiz content cache)
WEB_URL / WEB_ORIGIN / BETTER_AUTH_URL = the web origin (https://nibras-web-sage.vercel.app)
CORS_ORIGINS = extra allowed origins, comma-separated
BETTER_AUTH_SECRET, STUDENT_COOKIE_SECRET, REALTIME_TOKEN_SECRET   (generated; local copy in .local/prod-secrets.env, gitignored)
ANTHROPIC_API_KEY                         (set by the owner; without it the API runs in demo mode)
CLAUDE_ANALYSIS_MODEL=claude-opus-5-5     CLAUDE_GEN_MODEL=claude-sonnet-5-5     CLAUDE_EFFORT=medium
MAX_UPLOAD_MB=20                          MONTHLY_LESSON_QUOTA=100
DEMO_LOGIN=true|false                     (default off: /api/demo/* answers 404)
DEMO_PASSWORD                             (secret; shared password of the pre-configured accounts; never in code)
DEMO_LESSON_QUOTA=30                      (lessons per month for demo@/admin@helpo.test, so a public link cannot burn the AI budget)
ADMIN_EMAILS                              (optional; Bull Board also admits users with role ADMIN)
```

The seed creates `demo@helpo.test` (teacher), `admin@helpo.test` (role ADMIN) and the demo student "Layla A." in 6B, and two
always-open activities on the photosynthesis lesson: a live quiz lobby with join code `202020` and a self-paced quiz with
join code `303030`. Re-running the seed resets them to open. Both codes are reserved: the random code generator skips them.

To seed the demo data (idempotent), set `DEMO_PASSWORD` (secret) and `SEED_ON_START=true` on `nibras-api`, deploy once,
then set `SEED_ON_START=false`. The seed runs after the migrations and never blocks startup. The production demo login
is kept in `.local/prod-demo-account.txt` (gitignored).

## Vercel (web)

Set the root directory to `apps/web`, then set these variables:
- `API_ORIGIN=https://nibras-api-production-caff3bab.up.railway.app`
- `NEXT_PUBLIC_REALTIME=socket`
- `NEXT_PUBLIC_API_WS_URL` = the same Railway URL

The browser talks to `/api/*` on the web domain, so Better Auth and student cookies stay first-party. Socket.IO
connects directly to Railway with a short-lived token from `GET /api/realtime/token`.
