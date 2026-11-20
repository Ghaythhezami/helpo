import type { ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

export default async function globalTeardown(): Promise<void> {
  const child = (globalThis as { __E2E_SERVER__?: ChildProcess }).__E2E_SERVER__;
  child?.kill();
  rmSync(path.resolve(__dirname, ".drop.sql"), { force: true });
}
