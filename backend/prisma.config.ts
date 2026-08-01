import { config } from "dotenv";
import { join } from "node:path";
import { defineConfig, env } from "prisma/config";

// prisma.config.ts is evaluated by the Prisma CLI directly, outside our own
// NestJS bootstrap — so it needs its own .env loading (see
// src/config/load-dotenv.ts for the equivalent in the app itself).
config({ path: join(__dirname, ".env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // ts-node, not tsx. tsx was dropped from this project because esbuild
    // can't emit the `design:paramtypes` metadata NestJS needs for
    // constructor injection, and nothing else referenced it — so this line
    // went stale and only broke in CI, which is the one place the seed runs.
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
