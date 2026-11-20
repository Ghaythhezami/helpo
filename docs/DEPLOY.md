# Deploying Nibras

| Part | Host | Mode |
|---|---|---|
| Web (Next.js) | Vercel, project `nibras-web` | rewrites `/api/*` to `API_ORIGIN` (same-origin cookies) |
| API (NestJS, one port) | Railway, project `nibras`, service `nibras-api` | `QUEUE_DRIVER=bullmq` + `REALTIME=socket` once those drivers land; `inline` + `poll` until then |
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
WEB_URL / WEB_ORIGIN / BETTER_AUTH_URL = the web origin (https://nibras-web.vercel.app)
CORS_ORIGINS = extra allowed origins, comma-separated
BETTER_AUTH_SECRET, STUDENT_COOKIE_SECRET, REALTIME_TOKEN_SECRET   (generated; local copy in .local/prod-secrets.env, gitignored)
ANTHROPIC_API_KEY                         (set by the owner; without it the API runs in demo mode)
CLAUDE_ANALYSIS_MODEL=claude-opus-5-5     CLAUDE_GEN_MODEL=claude-sonnet-5-5     CLAUDE_EFFORT=medium
MAX_UPLOAD_MB=20                          MONTHLY_LESSON_QUOTA=100
```

To seed the demo data once, use the public database URL from the Railway Postgres service:

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" npm run db:seed -w @helpo/api
```

## Vercel (web)

Set the root directory to `apps/web`, then set these variables:
- `API_ORIGIN=https://nibras-api-production-caff3bab.up.railway.app`
- `NEXT_PUBLIC_REALTIME=socket`
- `NEXT_PUBLIC_API_WS_URL` = the same Railway URL

The browser talks to `/api/*` on the web domain, so Better Auth and student cookies stay first-party. Socket.IO
connects directly to Railway with a short-lived token from `GET /api/realtime/token`.
