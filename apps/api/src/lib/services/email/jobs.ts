import { createQueue, createWorker, type Job } from '../queue/index.js';
import { sendTemplateAsync } from './service.js';
import {
  EMAIL_TYPES,
  type AccountLockedTemplateData,
  type PasswordResetTemplateData,
  type PasswordChangedTemplateData,
  type EmailVerificationTemplateData,
  type InvitationTemplateData,
} from './types.js';
import { createChildLogger } from '../../../config/logger.js';

const jobLogger = createChildLogger({ module: 'email:jobs' });

// =============================================================================
// Job Types
// =============================================================================

interface AccountLockedEmailJob {
  type: 'account_locked';
  to: string;
  data: AccountLockedTemplateData;
  orgName?: string;
}

interface PasswordResetEmailJob {
  type: 'password_reset';
  to: string;
  data: PasswordResetTemplateData;
  orgName?: string;
}

interface PasswordChangedEmailJob {
  type: 'password_changed';
  to: string;
  data: PasswordChangedTemplateData;
  orgName?: string;
}

interface EmailVerificationEmailJob {
  type: 'email_verification';
  to: string;
  data: EmailVerificationTemplateData;
  orgName?: string;
}

interface InvitationEmailJob {
  type: 'invitation';
  to: string;
  data: InvitationTemplateData;
  orgName?: string;
}

type EmailJob =
  | AccountLockedEmailJob
  | PasswordResetEmailJob
  | PasswordChangedEmailJob
  | EmailVerificationEmailJob
  | InvitationEmailJob;

// =============================================================================
// Queue
// =============================================================================

export const emailQueue = createQueue<EmailJob>('email');

// =============================================================================
// Handler
// =============================================================================

const handleEmailJob = async (job: Job<EmailJob>): Promise<void> => {
  const { type, to, data, orgName } = job.data;

  switch (type) {
    case 'account_locked':
      await sendTemplateAsync(EMAIL_TYPES.ACCOUNT_LOCKED, { to, data }, orgName);
      break;
    case 'password_reset':
      await sendTemplateAsync(EMAIL_TYPES.PASSWORD_RESET, { to, data }, orgName);
      break;
    case 'password_changed':
      await sendTemplateAsync(EMAIL_TYPES.PASSWORD_CHANGED, { to, data }, orgName);
      break;
    case 'email_verification':
      await sendTemplateAsync(EMAIL_TYPES.EMAIL_VERIFICATION, { to, data }, orgName);
      break;
    case 'invitation':
      await sendTemplateAsync(EMAIL_TYPES.INVITATION, { to, data }, orgName);
      break;
  }

  jobLogger.info({ jobId: job.id, type, to }, 'Email job completed');
};

// =============================================================================
// Worker Init
// =============================================================================

export const initEmailWorker = async (): Promise<void> => {
  await createWorker<EmailJob>('email', handleEmailJob, {
    concurrency: 5,
    onFailed: (job, err) => {
      jobLogger.error({ jobId: job?.id, type: job?.data.type, err }, 'Email job failed');
    },
  });
};

// =============================================================================
// Public API
// =============================================================================

export const queueAccountLockedEmail = async (params: {
  to: string;
  firstName: string;
  lockReason: string;
  unlockAt?: string;
  supportEmail: string;
  orgName?: string;
}): Promise<void> => {
  await emailQueue.addJob({
    type: 'account_locked',
    to: params.to,
    data: {
      firstName: params.firstName,
      lockReason: params.lockReason,
      unlockAt: params.unlockAt,
      supportEmail: params.supportEmail,
    },
    orgName: params.orgName,
  });
};

export const queuePasswordResetEmail = async (params: {
  to: string;
  firstName: string;
  resetUrl: string;
  expiresInHours: number;
  orgName?: string;
}): Promise<void> => {
  await emailQueue.addJob({
    type: 'password_reset',
    to: params.to,
    data: {
      firstName: params.firstName,
      resetUrl: params.resetUrl,
      expiresInHours: params.expiresInHours,
    },
    orgName: params.orgName,
  });
};

export const queuePasswordChangedEmail = async (params: {
  to: string;
  firstName: string;
  changedAt: string;
  ipAddress?: string;
  orgName?: string;
}): Promise<void> => {
  await emailQueue.addJob({
    type: 'password_changed',
    to: params.to,
    data: {
      firstName: params.firstName,
      changedAt: params.changedAt,
      ipAddress: params.ipAddress,
    },
    orgName: params.orgName,
  });
};

export const queueEmailVerificationEmail = async (params: {
  to: string;
  firstName: string;
  verifyUrl: string;
  expiresInHours: number;
  orgName?: string;
}): Promise<void> => {
  await emailQueue.addJob({
    type: 'email_verification',
    to: params.to,
    data: {
      firstName: params.firstName,
      verifyUrl: params.verifyUrl,
      expiresInHours: params.expiresInHours,
    },
    orgName: params.orgName,
  });
};

export const queueInvitationEmail = async (params: {
  to: string;
  inviterName: string;
  organizationName: string;
  inviteUrl: string;
  expiresInDays: number;
  roleName: string;
}): Promise<void> => {
  await emailQueue.addJob({
    type: 'invitation',
    to: params.to,
    data: {
      inviterName: params.inviterName,
      organizationName: params.organizationName,
      inviteUrl: params.inviteUrl,
      expiresInDays: params.expiresInDays,
      roleName: params.roleName,
    },
    orgName: params.organizationName,
  });
};
