import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JWT_SECRET } from './jwt.constants';

const adminCookieExtractor = (req: Request): string | null => {
  if (!req) {
    return null;
  }

  const token = req.cookies?.admin_session;
  return typeof token === 'string' && token.length > 0 ? token : null;
};

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([adminCookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: any) {
    if (!payload || payload.role !== 'admin') {
      throw new UnauthorizedException('Access denied. Admins only.');
    }
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
