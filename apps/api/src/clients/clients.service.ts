import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateClientDto } from './dto/create-client.dto';

export interface ClientSummaryRow {
  id: string;
  name: string;
  business_type: string | null;
}

@Injectable()
export class ClientsService {
  constructor(private readonly db: DatabaseService) {}

  async listForUser(userId: string): Promise<ClientSummaryRow[]> {
    return this.db.query<ClientSummaryRow>(
      `SELECT c.id, c.name, c.business_type FROM clients c
       JOIN client_users cu ON cu.client_id = c.id
       WHERE cu.user_id = $1 ORDER BY c.name`,
      [userId],
    );
  }

  // A new client starts with nothing: no chart of accounts, no periods. The creating user
  // is linked immediately so the client shows up in their own switcher without a second step.
  async create(user: AuthenticatedUser, dto: CreateClientDto): Promise<ClientSummaryRow> {
    return this.db.transaction(async (client) => {
      const result = await client.query<ClientSummaryRow>(
        'INSERT INTO clients (name, business_type) VALUES ($1, $2) RETURNING id, name, business_type',
        [dto.name, dto.businessType ?? null],
      );
      const created = result.rows[0];
      await client.query('INSERT INTO client_users (client_id, user_id) VALUES ($1, $2)', [created.id, user.id]);
      return created;
    });
  }
}
