import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('me')
export class MeController {
  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
