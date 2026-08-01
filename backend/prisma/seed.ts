import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env"), quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: { slug: "riverside-barbers" },
    update: {},
    create: {
      slug: "riverside-barbers",
      name: "Riverside Barbers",
      timeZone: "Europe/Belgrade",
    },
  });

  // passwordHash is a placeholder — Argon2id hashing isn't wired up until
  // Phase 4. Never treat this value as a real credential.
  const owner = await prisma.user.upsert({
    where: { email: "owner@riversidebarbers.test" },
    update: {},
    create: {
      email: "owner@riversidebarbers.test",
      passwordHash: "placeholder-set-in-phase-4",
      emailVerifiedAt: new Date(),
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "ana@riversidebarbers.test" },
    update: {},
    create: {
      email: "ana@riversidebarbers.test",
      passwordHash: "placeholder-set-in-phase-4",
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: owner.id, organizationId: organization.id } },
    update: {},
    create: { userId: owner.id, organizationId: organization.id, role: "OWNER" },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: staff.id, organizationId: organization.id } },
    update: {},
    create: { userId: staff.id, organizationId: organization.id, role: "STAFF" },
  });

  console.log("Seeded:", {
    organization: organization.slug,
    users: [owner.email, staff.email],
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
