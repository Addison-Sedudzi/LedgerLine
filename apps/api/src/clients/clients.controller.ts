import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DatabaseService } from '../database/database.service';

// Not client-scoped itself — this is how the frontend discovers which clients the current
// user may select in the first place, before any X-Client-Id header is available.
@Controller('clients')
export class ClientsController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.db.query(
      `SELECT c.id, c.name, c.business_type FROM clients c
       JOIN client_users cu ON cu.client_id = c.id
       WHERE cu.user_id = $1 ORDER BY c.name`,
      [user.id],
    );
  }
}
