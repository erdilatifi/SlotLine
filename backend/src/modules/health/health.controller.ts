import { Controller, Get } from "@nestjs/common";
import { healthResponseSchema, type HealthResponse } from "./health.schema";

@Controller("health")
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  check(): HealthResponse {
    return healthResponseSchema.parse({
      status: "ok",
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  }
}
