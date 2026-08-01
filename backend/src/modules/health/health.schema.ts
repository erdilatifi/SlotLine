import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
