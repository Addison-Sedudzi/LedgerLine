import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';

// Not client-scoped itself — this is how the frontend discovers which clients the current
// user may select in the first place, before any X-Client-Id header is available.
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.clients.listForUser(user.id);
  }

  @Post()
  @Roles('admin')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClientDto) {
    return this.clients.create(user, dto);
  }
}
