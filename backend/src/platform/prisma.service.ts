import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { ConfigService } from "../config/config.service";
import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(configService: ConfigService) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: configService.env.DATABASE_URL, max: 20 }),
      transactionOptions: { maxWait: 30_000, timeout: 30_000 },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
