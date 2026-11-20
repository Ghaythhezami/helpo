/** Pure domain rules: no mocks needed. The sources import "./x.js" (NodeNext), mapped back to the .ts files here. */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testRegex: ".*\.test\.ts$",
  moduleNameMapper: { "^\./(domain|schemas|api-types)\.js$": "./$1" },
  transform: { "^.+\.ts$": ["ts-jest", { tsconfig: { module: "commonjs", target: "ES2022", esModuleInterop: true, strict: true }, diagnostics: false }] },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.test.ts", "!src/index.ts", "!src/api-types.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "lcov"],
};
