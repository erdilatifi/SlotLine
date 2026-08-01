import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // These tests run against a real, remote Postgres, and some of them
    // hash passwords with argon2id — which is slow on purpose. Vitest's
    // 5s default fails them for being correct.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
