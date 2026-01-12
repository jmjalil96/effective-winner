import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from './AppError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    requestId?: string;
    details?: unknown;
    stack?: string;
  };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Get request ID from pino-http
  const requestId = req.id as string | undefined;

  // Convert Zod errors to ValidationError
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    err = new ValidationError('Validation failed', details);
  }

  // Handle AppError instances
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        message: err.message,
        code: err.code,
        statusCode: err.statusCode,
        requestId,
        details: err instanceof ValidationError ? err.details : undefined,
        stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
      },
    };

    logger.error({ err, requestId }, err.message);
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unknown errors
  const message =
    env.NODE_ENV === 'production'
      ? 'Internal server error'
      : (err as Error).message || 'Internal server error';

  const response: ErrorResponse = {
    error: {
      message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      requestId,
      stack: env.NODE_ENV !== 'production' ? (err as Error).stack : undefined,
    },
  };

  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json(response);
};
