import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

export default createJestConfig({
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^better-auth/react$": "<rootDir>/src/test/better-auth-react.ts",
    "^motion/react$": "<rootDir>/src/test/motion.tsx",
  },
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  collectCoverageFrom: ["src/lib/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "!src/**/*.d.ts", "!src/test/**"],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "lcov"],
});
