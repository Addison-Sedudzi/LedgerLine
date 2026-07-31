import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get()
  async check() {
    const start = process.uptime();
    let database: 'ok' | 'unreachable' = 'ok';
    try {
      await this.db.query('SELECT 1');
    } catch {
      database = 'unreachable';
    }
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      uptimeSeconds: start,
      database,
    };
  }
}
