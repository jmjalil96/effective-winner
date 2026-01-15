import { ValidationError } from '../../../errors/AppError.js';
import type { EmailOptions } from './types.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_LENGTH = 998;
const MAX_BODY_LENGTH = 10 * 1024 * 1024;
const MAX_RECIPIENTS = 50;

/**
 * Email validation error - extends central ValidationError for proper error handling.
 */
export class EmailValidationError extends ValidationError {
  constructor(message: string, field: string) {
    super(message, { field });
  }
}

export const isValidEmail = (email: string): boolean => EMAIL_REGEX.test(email);

export const validateEmailOptions = (options: EmailOptions): void => {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  if (recipients.length === 0) {
    throw new EmailValidationError('At least one recipient required', 'to');
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new EmailValidationError(`Too many recipients (max ${String(MAX_RECIPIENTS)})`, 'to');
  }
  for (const email of recipients) {
    if (!isValidEmail(email)) {
      throw new EmailValidationError(`Invalid email format: ${email}`, 'to');
    }
  }
  if (!options.subject.trim()) {
    throw new EmailValidationError('Subject is required', 'subject');
  }
  if (options.subject.length > MAX_SUBJECT_LENGTH) {
    throw new EmailValidationError(
      `Subject too long (max ${String(MAX_SUBJECT_LENGTH)})`,
      'subject'
    );
  }
  if (!options.html.trim()) {
    throw new EmailValidationError('HTML body is required', 'html');
  }
  if (options.html.length > MAX_BODY_LENGTH) {
    throw new EmailValidationError('Body too large (max 10MB)', 'html');
  }
  if (options.replyTo && !isValidEmail(options.replyTo)) {
    throw new EmailValidationError(`Invalid replyTo: ${options.replyTo}`, 'replyTo');
  }
};
