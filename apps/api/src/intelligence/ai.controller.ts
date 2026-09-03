import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AiService } from './ai.service';

// Admin-only: unlike /health, this makes a real, billed API call, so it isn't something
// every authenticated user (or an unauthenticated monitor) should be able to trigger.
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('health')
  @Roles('admin')
  health() {
    return this.ai.health();
  }
}
