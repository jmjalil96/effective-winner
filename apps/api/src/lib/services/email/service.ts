import { createChildLogger } from '../../../config/logger.js';
import type {
  EmailOptions,
  EmailResult,
  EmailType,
  TemplateDataMap,
  TemplateEmailOptions,
} from './types.js';
import { validateEmailOptions } from './validation.js';
import { sendWithRetry, htmlToText } from './transport.js';
import { TEMPLATES, wrapWithLayout, escapeTemplateData } from './templates.js';

const serviceLogger = createChildLogger({ module: 'email:service' });

// =============================================================================
// Internal Send
// =============================================================================

const sendEmail = async (options: EmailOptions): Promise<EmailResult> => {
  validateEmailOptions(options);
  const text = options.text ?? htmlToText(options.html);
  return sendWithRetry({ ...options, text });
};

// =============================================================================
// Public API (Features 1 & 4)
// =============================================================================

/**
 * Fire-and-forget email send.
 * Never throws - errors are logged internally.
 */
export const send = (options: EmailOptions): void => {
  sendEmail(options).catch((err: unknown) => {
    serviceLogger.error({ err, to: options.to, subject: options.subject }, 'Failed to send email');
  });
};

/**
 * Awaitable email send.
 * Returns null on failure (never throws).
 */
export const sendAsync = async (options: EmailOptions): Promise<EmailResult | null> => {
  try {
    return await sendEmail(options);
  } catch (err: unknown) {
    serviceLogger.error({ err, to: options.to, subject: options.subject }, 'Failed to send email');
    return null;
  }
};

/**
 * Fire-and-forget template email.
 */
export const sendTemplate = <T extends EmailType>(
  type: T,
  options: TemplateEmailOptions<TemplateDataMap[T]>,
  orgName?: string
): void => {
  const tpl = TEMPLATES[type];
  const safeData = escapeTemplateData(options.data);
  send({
    to: options.to,
    subject: tpl.subject(safeData),
    html: wrapWithLayout(tpl.body(safeData), orgName),
    replyTo: options.replyTo,
  });
};

/**
 * Awaitable template email.
 */
export const sendTemplateAsync = async <T extends EmailType>(
  type: T,
  options: TemplateEmailOptions<TemplateDataMap[T]>,
  orgName?: string
): Promise<EmailResult | null> => {
  const tpl = TEMPLATES[type];
  const safeData = escapeTemplateData(options.data);
  return sendAsync({
    to: options.to,
    subject: tpl.subject(safeData),
    html: wrapWithLayout(tpl.body(safeData), orgName),
    replyTo: options.replyTo,
  });
};
