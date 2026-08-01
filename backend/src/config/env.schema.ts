import { z } from "zod";

/**
 * Every environment variable the app depends on, in one place. Booting with a
 * missing or malformed value throws here, before anything starts serving
 * traffic — a process that starts and only fails on the first request that
 * touches an unset variable is strictly worse than one that never started.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  FRONTEND_URL: z.string().min(1).default("http://localhost:5173"),

  // Calendar sync is optional: leaving these unset disables the feature
  // rather than stopping the app from booting. A partial config is still
  // rejected below, because half-configured OAuth fails at the worst
  // possible moment — mid-redirect, in front of a user.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default("http://localhost:3000/calendar/callback"),

  /** 32 bytes, base64. Required only when calendar sync is configured. */
  ENCRYPTION_KEY: z.string().optional(),

  // Email is optional in the same way: unset means every message is logged
  // instead of sent, which is what you want in development and what the
  // app has done until now. Resend's free tier covers this app's volume
  // many times over (ADR-0002).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Slotline <onboarding@resend.dev>"),
});

export type Env = z.infer<typeof envSchema>;

/** True only when every piece needed to complete an OAuth round trip is present. */
export function isCalendarSyncEnabled(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.ENCRYPTION_KEY);
}

export function validateEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = result.data;
  const googleVars = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.ENCRYPTION_KEY];
  if (googleVars.some(Boolean) && !googleVars.every(Boolean)) {
    throw new Error(
      "Calendar sync is half-configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and " +
        "ENCRYPTION_KEY together, or leave all three unset to disable it.",
    );
  }
  if (env.ENCRYPTION_KEY && Buffer.from(env.ENCRYPTION_KEY, "base64").length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes, base64-encoded");
  }

  return env;
}
