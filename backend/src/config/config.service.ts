import { Injectable } from "@nestjs/common";
import { type Env, validateEnv } from "./env.schema";

@Injectable()
export class ConfigService {
  readonly env: Env;

  constructor() {
    this.env = validateEnv(process.env);
  }
}
