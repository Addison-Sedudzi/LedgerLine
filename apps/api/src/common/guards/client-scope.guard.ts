import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../database/database.service';
import { ForbiddenError, ValidationError } from '../errors/domain-errors';
import { AuthenticatedUser } from '../types/authenticated-user';

// Every table holding client data has a client_id column and every query filters on it.
// This guard is the boundary that keeps one client's books out of another's: it reads the
// client id the request claims to act on, confirms the current user is actually attached
// to that client, and only then lets the request through. Repositories still take the
// client id explicitly and filter on it themselves — this guard does not replace that, it
// is the first checkpoint before it.
@Injectable()
export class ClientScopeGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser; clientId?: string }>();

    // Express 5's types allow a route or header value to be a string[] (for wildcard
    // segments); this application never uses those, so any array is flattened to its first
    // element.
    const firstIfArray = (value: string | string[] | undefined): string | undefined =>
      Array.isArray(value) ? value[0] : value;

    const clientId = firstIfArray(request.headers['x-client-id']) ?? firstIfArray(request.params?.clientId);
    if (!clientId) {
      throw new ValidationError('X-Client-Id header is required');
    }

    const user = request.user;
    if (!user) {
      throw new ForbiddenError();
    }

    // Admins created outside a client_users row (e.g. the seed script) are still scoped by
    // this table; there is no role based bypass here, because access to a client's books is
    // about which practice engagement a user is on, not what they are allowed to do once on it.
    const rows = await this.db.query('SELECT 1 FROM client_users WHERE client_id = $1 AND user_id = $2', [
      clientId,
      user.id,
    ]);
    if (rows.length === 0) {
      throw new ForbiddenError('You do not have access to this client');
    }

    request.clientId = clientId;
    return true;
  }
}
