import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { ValidationError } from "./errors";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((issue) => issue.message).join("; "));
    }
    return result.data;
  }
}
