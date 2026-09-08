import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ERROR_MESSAGES } from '@ssafy-net/shared';
import type { Response } from 'express';

/** 모든 오류를 { code, message, details? } 한 형태로 내보낸다(design/22 §1.2). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null && 'code' in body) {
        response.status(status).json(body);
        return;
      }

      response.status(status).json({
        code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED',
        message:
          typeof body === 'string'
            ? body
            : ((body as { message?: string }).message ??
              ERROR_MESSAGES.VALIDATION_FAILED),
      });
      return;
    }

    this.logger.error(exception);
    response
      .status(500)
      .json({ code: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL });
  }
}
