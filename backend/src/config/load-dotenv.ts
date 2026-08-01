import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads this project's .env before anything else reads process.env. Walks up
 * from this file's location rather than assuming a fixed relative depth, so
 * it works the same whether running from source (tsx) or compiled (dist).
 */
function loadEnv(): void {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      config({ path: candidate, quiet: true });
      return;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  // No .env file found — fine in environments (CI, hosting platforms) that
  // inject real environment variables directly.
}

loadEnv();
