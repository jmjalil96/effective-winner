import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';
import { convert } from 'html-to-text';
import { createChildLogger } from '../../../config/logger.js';
import { env } from '../../../config/env.js';
import type { EmailOptions, EmailResult } from './types.js';

// Nodemailer result type (subset we use)
interface SendMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

const transportLogger = createChildLogger({ module: 'email:transport' });

// =============================================================================
// Connection Pooling (Feature 10)
// =============================================================================

let transporter: Transporter | null = null;

export const getTransport = (): Transporter => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    ...(env.SMTP_USER && env.SMTP_PASS
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
  });

  transporter
    .verify()
    .then(() => {
      transportLogger.info('SMTP connection verified');
    })
    .catch((err: unknown) => {
      transportLogger.warn({ err }, 'SMTP verification failed (will retry on send)');
    });

  return transporter;
};

export const setTransporter = (t: Transporter): void => {
  transporter = t;
};

export const closeTransport = (): void => {
  if (transporter) {
    transporter.close();
    transporter = null;
    transportLogger.info('SMTP transport closed');
  }
};

// =============================================================================
// Retry Logic (Feature 9)
// =============================================================================

const RETRY_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

// Network error codes that are transient
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ESOCKET',
  'ENOTFOUND',
]);

/**
 * Check if error is transient and worth retrying.
 * - Network errors (ECONNRESET, ETIMEDOUT, etc.)
 * - SMTP 4xx response codes (temporary failures)
 */
const isTransientError = (err: unknown): boolean => {
  if (err === null || typeof err !== 'object') return false;

  // Check for network error codes
  if ('code' in err && TRANSIENT_NETWORK_CODES.has((err as { code: string }).code)) {
    return true;
  }

  // Check for SMTP 4xx response codes (transient failures)
  // 5xx codes are permanent failures and should not be retried
  if ('responseCode' in err) {
    const code = (err as { responseCode: number }).responseCode;
    return code >= 400 && code < 500;
  }

  return false;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const sendWithRetry = async (options: EmailOptions): Promise<EmailResult> => {
  const transport = getTransport();
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const result = (await transport.sendMail({
        from: env.SMTP_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
      })) as SendMailResult;

      transportLogger.debug({ messageId: result.messageId, to: options.to }, 'Email sent');

      return {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      };
    } catch (err: unknown) {
      lastError = err;
      if (attempt < RETRY_ATTEMPTS && isTransientError(err)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        transportLogger.warn({ err, attempt, delay }, 'Transient error, retrying');
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  throw lastError;
};

// =============================================================================
// HTML to Text Conversion (Feature 7)
// =============================================================================

export const htmlToText = (html: string): string =>
  convert(html, {
    wordwrap: 80,
    selectors: [
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      { selector: 'img', format: 'skip' },
    ],
  });
