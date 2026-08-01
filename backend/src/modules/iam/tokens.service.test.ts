import "../../config/load-dotenv";
import { randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../platform/prisma.service";
import { TokensService } from "./tokens.service";

describe("TokensService — refresh rotation and reuse detection", () => {
  const config = new ConfigService();
  const prisma = new PrismaService(config);
  const tokens = new TokensService(prisma, new JwtService({ secret: config.env.JWT_SECRET }));

  let userId: string;

  beforeAll(async () => {
    const user = await prisma.client.user.create({
      data: { email: `tokens-test-${randomUUID()}@example.com`, passwordHash: "unused" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.client.refreshToken.deleteMany({ where: { userId } });
    await prisma.client.user.delete({ where: { id: userId } });
    await prisma.client.$disconnect();
  });

  it("rotates a valid token and issues a new one for the same user", async () => {
    const first = await tokens.issueRefreshFamily(userId);
    const { userId: rotatedUserId, refreshToken: second } = await tokens.rotate(first);
    expect(rotatedUserId).toBe(userId);
    expect(second).not.toBe(first);
  });

  it("replaying a consumed token revokes the whole family, killing the legitimate one too", async () => {
    const first = await tokens.issueRefreshFamily(userId);
    const { refreshToken: second } = await tokens.rotate(first);

    // Replay the already-consumed token.
    await expect(tokens.rotate(first)).rejects.toThrow(/reuse detected/);

    // The legitimate, currently-valid rotated token is now dead too.
    await expect(tokens.rotate(second)).rejects.toThrow(/reuse detected/);
  });
});
