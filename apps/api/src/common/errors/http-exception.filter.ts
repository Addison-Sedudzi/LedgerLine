import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import {
  DomainError,
  ForbiddenError,
  ImmutableEntryError,
  NotFoundError,
  PeriodClosedError,
  UnbalancedEntryError,
  ValidationError,
} from './domain-errors';

const STATUS_BY_ERROR = new Map<new (...args: never[]) => DomainError, number>([
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ValidationError, HttpStatus.BAD_REQUEST],
  [UnbalancedEntryError, HttpStatus.UNPROCESSABLE_ENTITY],
  [PeriodClosedError, HttpStatus.CONFLICT],
  [ImmutableEntryError, HttpStatus.CONFLICT],
  [ForbiddenError, HttpStatus.FORBIDDEN],
]);

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

// The one place in the codebase that translates an exception into an HTTP response.
// Controllers never build error responses themselves.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as Request & { id?: string }).id;

    if (exception instanceof DomainError) {
      const errorClass = exception.constructor as new (...args: never[]) => DomainError;
      const status = STATUS_BY_ERROR.get(errorClass) ?? HttpStatus.BAD_REQUEST;
      const body: ErrorBody = { code: exception.code, message: exception.message, requestId };
      if (exception.details !== undefined) body.details = exception.details;
      response.status(status).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const httpResponse = exception.getResponse();
      const message =
        typeof httpResponse === 'string'
          ? httpResponse
          : ((httpResponse as { message?: string | string[] }).message ?? exception.message);
      response.status(status).json({
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        message: Array.isArray(message) ? message.join('; ') : message,
        requestId,
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception, requestId);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      requestId,
    });
  }
}
