import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * 개발용 요청 로그. 어떤 요청이 실제로 서버까지 도달했는지 보기 위한 것이다.
 * 브라우저 콘솔의 404가 우리 서버 것인지 아닌지를 이 로그로 가른다.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();

    response.on('finish', () => {
      const { method, originalUrl } = request;
      const { statusCode } = response;
      const location = response.getHeader('location');
      const took = Date.now() - startedAt;

      const suffix = location ? ` → ${String(location).slice(0, 80)}` : '';
      const line = `${method} ${originalUrl} ${statusCode} ${took}ms${suffix}`;

      if (statusCode >= 500) this.logger.error(line);
      else if (statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
