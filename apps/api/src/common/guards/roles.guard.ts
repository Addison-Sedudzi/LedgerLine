import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '@ledgerline/shared';
import { ForbiddenError } from '../errors/domain-errors';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';

// Rule of thumb applied throughout: preparer creates drafts, reviewer posts/reverses/
// approves, admin closes periods and manages the chart of accounts.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenError(`This action requires one of the following roles: ${required.join(', ')}`);
    }
    return true;
  }
}
