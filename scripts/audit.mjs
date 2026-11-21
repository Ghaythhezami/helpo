#!/usr/bin/env node
/**
 * Dependency audit gate for CI. It fails on any high or critical advisory in production dependencies, except the
 * packages below. Each exception says why it is not reachable at runtime and when to review it again. Keep this list
 * short, and remove an entry as soon as an upstream fix allows it.
 */
import { execSync } from "node:child_process";

const ALLOW = {
  // Prisma CLI config loader (prisma generate / migrate), not loaded while the API serves requests.
  // The fix requires the Prisma 7 major upgrade. Review by 2027-01-31.
  prisma: "Prisma 7 major upgrade pending",
  "@prisma/config": "Prisma 7 major upgrade pending",
  "deepmerge-ts": "via @prisma/config (CLI only)",
  effect: "via @prisma/config (CLI only)",
  // pptxgenjs (latest 4.0.1 included) pins image-size 1.x. Nibras never adds images to slides, so the image parsers
  // are unreachable. Review by 2027-01-31.
  "image-size": "via pptxgenjs; no images are embedded",
};

let report;
try {
  report = JSON.parse(execSync("npm audit --omit=dev --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch (e) {
  // npm audit exits non-zero when it finds advisories; its JSON is still on stdout.
  report = JSON.parse(e.stdout?.toString() || "{}");
}

const blocking = Object.entries(report.vulnerabilities ?? {})
  .filter(([, v]) => v.severity === "high" || v.severity === "critical")
  .filter(([name]) => !(name in ALLOW));

for (const [name, reason] of Object.entries(ALLOW)) {
  if (report.vulnerabilities?.[name]) console.log(`allowed  ${name}: ${reason}`);
}
if (blocking.length) {
  for (const [name, v] of blocking) console.error(`BLOCKING ${v.severity} ${name}`);
  process.exit(1);
}
console.log(`audit ok: ${JSON.stringify(report.metadata?.vulnerabilities ?? {})}`);
