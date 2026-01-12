import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../errors/AppError.js';

interface ValidateOptions {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

const parseOrThrow = (schema: ZodType, data: unknown): unknown => {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  throw new ValidationError('Validation failed', details);
};

export const validate = (schemas: ValidateOptions): RequestHandler => {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = parseOrThrow(schemas.body, req.body);
      }
      if (schemas.query) {
        req.query = parseOrThrow(schemas.query, req.query) as typeof req.query;
      }
      if (schemas.params) {
        req.params = parseOrThrow(schemas.params, req.params) as typeof req.params;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
