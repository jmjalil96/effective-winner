// Types & constants
export {
  EMAIL_TYPES,
  type EmailType,
  type EmailOptions,
  type EmailResult,
  type TemplateEmailOptions,
  type TemplateDataMap,
  type WelcomeTemplateData,
  type PasswordResetTemplateData,
  type PasswordChangedTemplateData,
  type InvitationTemplateData,
  type InvitationAcceptedTemplateData,
  type EmailVerificationTemplateData,
  type AccountLockedTemplateData,
  type AccountDeactivatedTemplateData,
  type LoginFromNewDeviceTemplateData,
} from './types.js';

// Validation
export { EmailValidationError, isValidEmail } from './validation.js';

// Transport
export { closeTransport, setTransporter } from './transport.js';

// Service (public API)
export { send, sendAsync, sendTemplate, sendTemplateAsync } from './service.js';

// Jobs (queue-based email sending)
export {
  emailQueue,
  initEmailWorker,
  queueAccountLockedEmail,
  queuePasswordResetEmail,
  queuePasswordChangedEmail,
  queueEmailVerificationEmail,
  queueInvitationEmail,
} from './jobs.js';
