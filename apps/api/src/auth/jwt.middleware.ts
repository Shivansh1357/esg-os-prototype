import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { isPublicPath } from './publicPaths';

type JwtClaims = {
  tenantId?: string;
  tid?: string;
  sub?: string;
  userId?: string;
  role?: string;
};

@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    if (isPublicPath(req)) {
      next();
      return;
    }

    const mode = (process.env.AUTH_MODE || 'hybrid').toLowerCase();
    const auth = String(req.headers?.authorization || '');
    const hasBearer = auth.startsWith('Bearer ');

    if (mode === 'header') {
      next();
      return;
    }

    if (!hasBearer) {
      if (mode === 'jwt') {
        throw new UnauthorizedException('Missing bearer token');
      }
      next();
      return;
    }

    const token = auth.slice('Bearer '.length).trim();
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException('JWT_SECRET missing');
    }

    try {
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtClaims;
      const tenantId = decoded.tenantId || decoded.tid;
      const userId = decoded.sub || decoded.userId;
      const role = String(decoded.role || 'MEMBER').toUpperCase();
      req.user = { tenantId, sub: userId, role };
      next();
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}
