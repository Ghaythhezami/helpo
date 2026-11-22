# Testing Nibras

| Layer | Command | What it covers |
|---|---|---|
| Unit + component (Jest) | `npm test` | shared domain rules, API services with mocked Prisma/Claude, web components with React Testing Library. Writes lcov for SonarQube. Run the FULL suite before a scan. |
| API end-to-end (Jest + supertest) | `npm run test:e2e -w @helpo/api` | real Postgres: auth, teacher scoping (404 for others), generation in demo mode, share and live quiz, practice mode, demo accounts, admin, request ids. |
| Browser end-to-end (Playwright) | `npm run e2e -w @helpo/web` | real browser against an isolated stack: one-click demo sign-ins, Refine with AI, making a kit, the five tabs, editing (versions), whiteboard, Preview as student, Download menu (incl. Esc), admin overview, typed and wrong-password sign-in. |
| Static analysis | `npm run sonar` | SonarQube quality gate (new-code coverage at least 80%, no new issues). |
| Supply chain | `node scripts/audit.mjs` | fails on high or critical production advisories except the documented exceptions in the script. |

## Browser suite details

`apps/web/playwright.config.ts` starts `scripts/e2e-stack.mjs`, which:
1. creates a `nibras_e2e` database next to your dev database (same server, credentials never printed), migrates and seeds it with the demo accounts (`DEMO_PASSWORD` is a test-only value);
2. builds shared, API and web, then runs the API on :3101 (`AI_MODE=demo`, inline queue, polling, rate limits off) and Next on :3100.

Knobs: `E2E_SKIP_BUILD=1` reuses the last build, `E2E_KEEP_DB=1` keeps the database. `node scripts/e2e-stack.mjs` alone keeps the stack running for manual checks. Reports and traces go to `.e2e-stack/` (gitignored). Selectors use roles and accessible names only.

Production smoke (non-destructive): `E2E_BASE_URL=https://nibras-web-sage.vercel.app npm run e2e -w @helpo/web` runs only the specs that are safe against production.
