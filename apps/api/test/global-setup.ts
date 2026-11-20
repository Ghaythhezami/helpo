import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import "dotenv/config";

const ROOT = path.resolve(__dirname, "..");
const PORT = 3111;

/**
 * Boots the real API (compiled) against a separate Postgres schema (helpo_e2e) in demo AI mode, then the tests
 * talk to it over HTTP with supertest. The schema is dropped and re-created from the migrations every run.
 */
export default async function globalSetup(): Promise<void> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is required for e2e tests (apps/api/.env)");
  const url = base.replace(/schema=[^&]*/, "schema=helpo_e2e");
  const env = {
    ...process.env,
    DATABASE_URL: url,
    PORT: String(PORT),
    AI_MODE: "demo",
    ANTHROPIC_API_KEY: "",
    RATE_LIMIT_DISABLED: "1",
    BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
    WEB_ORIGIN: `http://127.0.0.1:${PORT}`,
    WEB_URL: `http://127.0.0.1:${PORT}`,
    QUEUE_DRIVER: "inline",
    REALTIME: "poll",
    NODE_ENV: "test",
    BLOB_READ_WRITE_TOKEN: "",
  };
  const run = (cmd: string, args: string[]) => {
    const r = spawnSync(process.execPath, [require.resolve(cmd), ...args], { cwd: ROOT, env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
  };
  writeFileSync(path.join(ROOT, "test", ".drop.sql"), "DROP SCHEMA IF EXISTS helpo_e2e CASCADE;\n");
  run("prisma/build/index.js", ["db", "execute", "--file", "test/.drop.sql", "--schema", "prisma/schema"]);
  run("prisma/build/index.js", ["migrate", "deploy", "--schema", "prisma/schema"]);
  run("typescript/bin/tsc", ["-p", "tsconfig.build.json"]);

  const child: ChildProcess = spawn(process.execPath, ["dist/main.js"], { cwd: ROOT, env, stdio: "ignore" });
  (globalThis as { __E2E_SERVER__?: ChildProcess }).__E2E_SERVER__ = child;
  process.env.E2E_BASE_URL = `http://127.0.0.1:${PORT}`;

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${process.env.E2E_BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error("The API did not start for the e2e tests");
}
