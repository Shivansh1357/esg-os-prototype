import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { incMetric } from './metrics';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const requestId = String(req.headers['x-request-id'] || randomUUID());
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const start = Date.now();
    res.once('finish', () => {
      const duration = Date.now() - start;
      incMetric('requests_total');
      const line = {
        level: 'info',
        msg: 'http_request',
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: duration,
        tenantId: req.user?.tenantId ?? req.headers['x-tenant-id'] ?? null,
        userId: req.user?.sub ?? req.headers['x-user-id'] ?? null,
        role: req.user?.role ?? req.headers['x-role'] ?? null,
      };
      const shouldLog = process.env.LOG_HTTP === 'true' || process.env.NODE_ENV !== 'test';
      if (shouldLog) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(line));
      }
    });
    next();
  }
}
