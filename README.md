# Educator Helper

A starting point for the teaching assistant shown in the project mockups. The teacher workspace provides email/password registration, sign-in, sign-out, and a sidebar; the remaining teacher screens are placeholders. The separate Next.js student app is a placeholder for a future joining flow.

## Stack

- Teacher app: React, TypeScript, Vite, Redux Toolkit and RTK Query.
- API: NestJS, Better Auth, Prisma, PostgreSQL.
- Student app: Next.js and React.

Prisma models are kept in separate files in `apps/api/prisma/schema`. The future AI generation, storage, Redis/queues, real-time activities, editors and export features from the concept are not implemented or installed yet.

## Local setup

Requires Node.js 20.19 or later, npm, and PostgreSQL. All three applications use `localhost`; use the same hostname everywhere so browser cookies work.

1. Install dependencies: `npm install`.
2. Create a PostgreSQL database named `educator_helper` (or use an existing database).
3. Copy `apps/api/.env.example` to `apps/api/.env`. Set `DATABASE_URL` and generate a unique `BETTER_AUTH_SECRET` using `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Never commit the `.env` file.
4. Run `npm run db:generate` and `npm run db:migrate`.
5. In separate terminals, run `npm run dev:api`, `npm run dev:teacher`, and optionally `npm run dev:student`.
6. Open the teacher app at http://localhost:5173 and create an account. The student placeholder is at http://localhost:3002; the API listens on http://localhost:3001.

To change the API URL used by the teacher app, copy `apps/teacher/.env.example` to `apps/teacher/.env` and set `VITE_API_URL`. Configure `TEACHER_URL` and `BETTER_AUTH_URL` in the API to match the actual origins. Deployments must use HTTPS and a strong unique secret. Registration is currently open and email addresses are not verified; add email verification and production deployment controls before exposing this initial version publicly.

## Commands

- `npm run build` builds all three apps.
- `npm run db:generate` regenerates Prisma Client after schema changes.
- `npm run db:migrate` applies committed migrations. For a new schema change, run `npx prisma migrate dev --name <description> --schema prisma/schema` from `apps/api` and commit the migration.

## GitHub

Sign in with `gh auth login`, then from the project root create and push a public repository with `gh repo create educator-helper --public --source . --remote origin --push` after reviewing the files and creating a commit.
