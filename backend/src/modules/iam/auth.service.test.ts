import "../../config/load-dotenv";
import { randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { afterAll, describe, expect, it } from "vitest";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../platform/prisma.service";
import { AuthService } from "./auth.service";
import { TokensService } from "./tokens.service";

describe("AuthService — registration", () => {
  const config = new ConfigService();
  const prisma = new PrismaService(config);
  const tokens = new TokensService(prisma, new JwtService({ secret: config.env.JWT_SECRET }));
  const auth = new AuthService(prisma, tokens);

  const email = `register-test-${randomUUID()}@example.com`;

  afterAll(async () => {
    const user = await prisma.client.user.findUnique({ where: { email } });
    if (user) {
      await prisma.client.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.client.verificationToken.deleteMany({ where: { userId: user.id } });
      await prisma.client.user.delete({ where: { id: user.id } });
    }
    await prisma.client.$disconnect();
  });

  it("signs the new account in, so nobody waits for an email that isn't sent", async () => {
    const { accessToken, refreshToken } = await auth.register(email, "CorrectHorse9!");

    expect(accessToken).toBeTruthy();
    const { userId } = await tokens.rotate(refreshToken);
    const user = await prisma.client.user.findUnique({ where: { email } });
    expect(userId).toBe(user?.id);
  });

  it("rejects a second account on the same email", async () => {
    await expect(auth.register(email, "CorrectHorse9!")).rejects.toThrow(/already exists/);
  });
});
