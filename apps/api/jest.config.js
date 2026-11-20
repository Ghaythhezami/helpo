/** Unit tests: services with mocked Prisma and AI. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/src"],
  testRegex: ".*\.spec\.ts$",
  transform: { "^.+\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: false }] },
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts", "!src/vercel.ts", "!src/**/*.module.ts", "!src/testing/**", "!src/**/*.controller.ts", "!src/bootstrap.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "lcov"],
};
