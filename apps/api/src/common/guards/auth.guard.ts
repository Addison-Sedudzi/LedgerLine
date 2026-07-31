import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { AppConfigService } from '../../config/config.service';
import { DatabaseService } from '../../database/database.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';
import { UserRole } from '@ledgerline/shared';

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  exp: number;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
}

// Verifies the Supabase access token on every request and attaches the matching application
// user to it. Global by default; endpoints opt out with @Public() (the health check only).
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);

    let payload: SupabaseJwtPayload;
    try {
      payload = jwt.verify(token, this.config.supabaseJwtSecret) as SupabaseJwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const rows = await this.db.query<UserRow>('SELECT id, email, full_name, role FROM users WHERE id = $1', [
      payload.sub,
    ]);
    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException('Token does not match a known user');
    }

    request.user = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
    };
    return true;
  }
}
