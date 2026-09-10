import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { StatsService } from './stats.service';

/**
 * 요청 로그. 어떤 요청이 실제로 서버까지 도달했는지 보기 위한 것이다.
 * 브라우저 콘솔의 404가 우리 서버 것인지 아닌지를 이 로그로 가른다.
 *
 * 운영에서는 쿼리스트링을 지운다. OAuth 콜백의 `code=`·`state=` 가 로그에 남기 때문이다(design/23 §8).
 * 개발에서는 디버깅에 필요해 그대로 둔다.
 *
 * 같은 자리에서 오류율·느린 요청을 메모리에 센다(StatsService). 운영자 대시보드가 읽는다(D-77).
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly hideQuery = process.env.NODE_ENV === 'production';

  constructor(private readonly stats: StatsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();

    response.on('finish', () => {
      const { method, originalUrl } = request;
      const { statusCode } = response;
      const location = response.getHeader('location');
      const took = Date.now() - startedAt;

      const url = this.hideQuery ? originalUrl.split('?')[0] : originalUrl;
      this.stats.recordHttp({
        method,
        path: originalUrl.split('?')[0],
        status: statusCode,
        ms: took,
      });
      const target = location ? String(location) : '';
      const shownTarget = this.hideQuery ? target.split('?')[0] : target;
      const suffix = shownTarget ? ` → ${shownTarget.slice(0, 80)}` : '';
      const line = `${method} ${url} ${statusCode} ${took}ms${suffix}`;

      if (statusCode >= 500) this.logger.error(line);
      else if (statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
