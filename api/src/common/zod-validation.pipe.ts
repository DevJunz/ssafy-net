import { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { AppError } from './app-error';

/**
 * 요청 본문 검증. 스키마는 packages/shared에 있고 프론트 폼도 같은 것을 쓴다
 * (design/20 §2 — 규칙이 갈라지지 않게).
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    const first = result.error.errors[0];
    throw new AppError(
      'VALIDATION_FAILED',
      { field: first?.path.join('.') },
      first?.message,
    );
  }
}
