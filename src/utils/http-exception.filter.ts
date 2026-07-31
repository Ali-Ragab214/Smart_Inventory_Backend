import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        error = exception.name;
      } else if (typeof res === 'object') {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        error = (obj.code as string) ?? (obj.error as string) ?? exception.name;
        if (Array.isArray(obj.message)) {
          message = (obj.message as string[]).join('; ');
          if (!obj.code && obj.error === 'Bad Request') {
            error = 'VALIDATION_ERROR';
          }
        }
      }
    } else if (exception instanceof Error) {
      console.error('Unhandled exception:', exception);
    }

    response.status(statusCode).json({
      success: false,
      data: null,
      meta: {
        statusCode,
        message,
        error,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }
}
