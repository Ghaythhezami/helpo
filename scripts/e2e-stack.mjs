#!/usr/bin/env node
/**
 * Isolated stack for the Playwright browser suite (apps/web/e2e).
 *
 *   node scripts/e2e-stack.mjs            prepare + run the stack until SIGINT/SIGTERM (Playwright `webServer`)
 *   node scripts/e2e-stack.mjs --prepare  only prepare (database, migrate, seed, builds), then exit
 *
 * Steps: create the `nibras_e2e` database next to the dev one (same server, same credentials, never printed),
 * `prisma migrate deploy`, idempotent seed, build shared + api + web, then run the API on :3101 and Next on :3100.
 * The web app is built from a copy under .e2e-stack/web so a running `next dev` (or its `.next` folder) is never touched.
 *
 * Env knobs: E2E_DATABASE_URL (full URL), else DATABASE_URL, else apps/api/.env (database swapped to nibras_e2e),
 * E2E_SKIP_BUILD=1 (reuse the previous builds), E2E_KEEP_DB=1 (do not recreate nibras_e2e), E2E_WEB_PORT / E2E_API_PORT.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.join(ROOT, "apps", "api");
const WEB_DIR = path.join(ROOT, "apps", "web");
const STACK_DIR = path.join(ROOT, ".e2e-stack");
const WEB_COPY = path.join(STACK_DIR, "web");
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 3100);
const API_PORT = Number(process.env.E2E_API_PORT || 3101);
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_ORIGIN = `http://localhost:${API_PORT}`;
const DB_NAME = "nibras_e2e";
const DEMO_PASSWORD = "Nibras2020@"; // test-only password chosen by the owner for demo accounts
const IS_WIN = process.platform === "win32";
const NPM = IS_WIN ? "npm.cmd" : "npm";
const NPX = IS_WIN ? "npx.cmd" : "npx";

const log = (m) => console.log(`[e2e-stack] ${m}`);
const requireFrom = (dir) => createRequire(path.join(dir, "noop.js"));

/** Reads KEY=value pairs from a dotenv file without exporting anything. */
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** Returns { adminUrl, e2eUrl }: a connection to an existing database (to CREATE DATABASE) and to nibras_e2e. */
function databaseUrls() {
  const raw = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || readEnvFile(path.join(API_DIR, ".env")).DATABASE_URL;
  if (!raw) throw new Error("No database URL: set E2E_DATABASE_URL, DATABASE_URL, or apps/api/.env");
  const admin = new URL(raw);
  const e2e = new URL(raw);
  e2e.pathname = `/${DB_NAME}`;
  admin.searchParams.delete("schema");
  e2e.searchParams.set("schema", "public");
  if (path.posix.basename(admin.pathname) === DB_NAME) admin.pathname = "/postgres";
  return { adminUrl: admin.toString(), e2eUrl: e2e.toString() };
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: IS_WIN, cwd: ROOT, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
}

async function ensureDatabase(adminUrl) {
  const { PrismaClient } = requireFrom(API_DIR)("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: adminUrl });
  try {
    const rows = await prisma.$queryRawUnsafe(`SELECT 1 AS ok FROM pg_database WHERE datname = '${DB_NAME}'`);
    if (rows.length > 0 && process.env.E2E_KEEP_DB !== "1") {
      // fresh, deterministic data every run (leftover live sessions or lessons from earlier runs change the lists)
      await prisma.$executeRawUnsafe(`DROP DATABASE ${DB_NAME} WITH (FORCE)`);
      rows.length = 0;
    }
    if (rows.length === 0) {
      await prisma.$executeRawUnsafe(`CREATE DATABASE ${DB_NAME}`);
      log(`created database ${DB_NAME}`);
    } else log(`database ${DB_NAME} exists`);
  } finally {
    await prisma.$disconnect();
  }
}

/** Copies the web sources to .e2e-stack/web so `next build` never touches apps/web/.next. */
function syncWebCopy() {
  fs.mkdirSync(WEB_COPY, { recursive: true });
  fs.writeFileSync(path.join(STACK_DIR, ".gitignore"), "*\n");
  for (const entry of ["src", "public", "messages"]) {
    fs.rmSync(path.join(WEB_COPY, entry), { recursive: true, force: true });
    if (fs.existsSync(path.join(WEB_DIR, entry))) fs.cpSync(path.join(WEB_DIR, entry), path.join(WEB_COPY, entry), { recursive: true });
  }
  for (const file of ["next.config.ts", "postcss.config.mjs", "tsconfig.json", "next-env.d.ts", "package.json"]) {
    if (fs.existsSync(path.join(WEB_DIR, file))) fs.copyFileSync(path.join(WEB_DIR, file), path.join(WEB_COPY, file));
  }
}

function apiEnv(dbUrl, secrets) {
  return {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(API_PORT),
    DATABASE_URL: dbUrl,
    AI_MODE: "demo",
    QUEUE_DRIVER: "inline",
    REALTIME: "poll",
    DEMO_LOGIN: "true",
    DEMO_PASSWORD,
    WEB_URL: WEB_ORIGIN,
    WEB_ORIGIN,
    BETTER_AUTH_URL: WEB_ORIGIN,
    RATE_LIMIT_DISABLED: "1",
    BETTER_AUTH_SECRET: secrets.auth,
    STUDENT_COOKIE_SECRET: secrets.student,
    ANTHROPIC_API_KEY: "",
    REDIS_URL: "",
  };
}

function waitForPort(port, timeoutMs, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => {
        s.destroy();
        resolve();
      });
      s.once("error", () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`${label} did not open port ${port}`));
        else setTimeout(tryOnce, 500);
      });
    };
    tryOnce();
  });
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (IS_WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function main() {
  const prepareOnly = process.argv.includes("--prepare");
  const skipBuild = process.env.E2E_SKIP_BUILD === "1";
  const { adminUrl, e2eUrl } = databaseUrls();
  const secrets = { auth: randomBytes(32).toString("hex"), student: randomBytes(32).toString("hex") };

  await ensureDatabase(adminUrl);
  const env = apiEnv(e2eUrl, secrets);

  log("prisma migrate deploy");
  run(NPX, ["prisma", "migrate", "deploy"], { cwd: API_DIR, env });
  log("seed (idempotent)");
  run(NPM, ["run", "db:seed", "-w", "@helpo/api"], { env });

  const webEnv = { ...process.env, API_ORIGIN, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
  if (!skipBuild) {
    log("build shared + api");
    run(NPM, ["run", "build", "-w", "@helpo/shared"]);
    // A running dev API keeps the Prisma engine DLL locked on Windows, so only generate when the client is missing
    // (CI runs `npm run db:generate` before this script).
    if (!fs.existsSync(path.join(ROOT, "node_modules", ".prisma", "client", "index.js"))) run(NPX, ["prisma", "generate"], { cwd: API_DIR, env });
    run(NPX, ["tsc", "-p", "tsconfig.build.json"], { cwd: API_DIR, env });
    log("build web (copy under .e2e-stack)");
    syncWebCopy();
    run(NPX, ["next", "build"], { cwd: WEB_COPY, env: webEnv });
  } else if (!fs.existsSync(path.join(WEB_COPY, ".next"))) {
    throw new Error("E2E_SKIP_BUILD=1 but no previous web build exists in .e2e-stack/web");
  }
  if (prepareOnly) return;

  const children = [];
  const stop = () => children.forEach(killTree);
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });
  process.on("exit", stop);

  log(`start api on :${API_PORT}`);
  const api = spawn(process.execPath, ["dist/main.js"], { cwd: API_DIR, env, stdio: "inherit" });
  children.push(api);
  api.on("exit", (code) => {
    log(`api exited (${code})`);
    process.exit(1);
  });

  await waitForPort(API_PORT, 90_000, "api"); // Playwright polls the web URL: it must only come up once the API is reachable

  log(`start web on :${WEB_PORT}`);
  const nextBin = requireFrom(WEB_COPY).resolve("next/dist/bin/next");
  const web = spawn(process.execPath, [nextBin, "start", "-p", String(WEB_PORT)], { cwd: WEB_COPY, env: webEnv, stdio: "inherit" });
  children.push(web);
  web.on("exit", (code) => {
    log(`web exited (${code})`);
    process.exit(1);
  });

  await waitForPort(WEB_PORT, 60_000, "web");
  log(`ready: web ${WEB_ORIGIN}, api ${API_ORIGIN}`);
  await new Promise(() => {}); // run until signalled
}

main().catch((e) => {
  console.error(`[e2e-stack] ${e.message}`);
  process.exit(1);
});
