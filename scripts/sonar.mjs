#!/usr/bin/env node
/**
 * Runs a SonarQube scan of the monorepo with the official scanner Docker image.
 * Requires: Docker, a SonarQube server (SONAR_HOST_URL, default http://localhost:9000) and SONAR_TOKEN.
 * Run the tests with coverage first: `npm test`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const token = process.env.SONAR_TOKEN;
let host = process.env.SONAR_HOST_URL || "http://localhost:9000";

if (!token) {
  console.error("Set SONAR_TOKEN (a SonarQube user or project analysis token).");
  process.exit(1);
}
for (const p of ["packages/shared", "apps/api", "apps/web"]) {
  if (!existsSync(path.join(root, p, "coverage", "lcov.info"))) {
    console.warn(`No coverage for ${p} yet. Run "npm test" first for coverage in SonarQube.`);
  }
}
// Inside the scanner container, the host machine is reachable as host.docker.internal.
host = host.replace("://localhost", "://host.docker.internal").replace("://127.0.0.1", "://host.docker.internal");

const result = spawnSync(
  "docker",
  [
    "run", "--rm",
    "-e", `SONAR_HOST_URL=${host}`,
    "-e", `SONAR_TOKEN=${token}`,
    "-v", `${root}:/usr/src`,
    "sonarsource/sonar-scanner-cli:latest",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
