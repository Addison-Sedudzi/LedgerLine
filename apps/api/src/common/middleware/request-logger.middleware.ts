import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

// Never log an Authorization header, an API key, or a raw body: both can contain a bearer
// token or a service key. Only structured, non-sensitive fields are logged here.
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    const start = Date.now();
    res.on('finish', () => {
      this.logger.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - start,
        }),
      );
    });

    next();
  }
}
