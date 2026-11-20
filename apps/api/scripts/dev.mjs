// Dev runner: tsx/esbuild cannot emit decorator metadata (Nest DI needs it), so compile with tsc and
// restart node on change. `npm run dev` = initial build, then tsc --watch + node --watch.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
const args = ["-p", "tsconfig.build.json"];

const first = spawnSync(process.execPath, [tsc, ...args], { stdio: "inherit" });
if (first.status !== 0) process.exit(first.status ?? 1);

const watcher = spawn(process.execPath, [tsc, ...args, "--watch", "--preserveWatchOutput"], { stdio: "inherit" });
const server = spawn(process.execPath, ["--watch", "--watch-preserve-output", "dist/main.js"], { stdio: "inherit" });

const stop = () => {
  watcher.kill();
  server.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => {
  watcher.kill();
  process.exit(code ?? 0);
});
