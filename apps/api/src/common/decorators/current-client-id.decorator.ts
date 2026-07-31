import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const CurrentClientId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request & { clientId?: string }>();
  if (!request.clientId) {
    throw new Error('CurrentClientId decorator used on a route with no ClientScopeGuard applied');
  }
  return request.clientId;
});
