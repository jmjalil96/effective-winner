export const EMAIL_TYPES = {
  WELCOME: 'welcome',
  PASSWORD_RESET: 'password_reset',
  PASSWORD_CHANGED: 'password_changed',
  INVITATION: 'invitation',
  INVITATION_ACCEPTED: 'invitation_accepted',
  EMAIL_VERIFICATION: 'email_verification',
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_DEACTIVATED: 'account_deactivated',
  LOGIN_FROM_NEW_DEVICE: 'login_from_new_device',
} as const;

export type EmailType = (typeof EMAIL_TYPES)[keyof typeof EMAIL_TYPES];

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html: string;
  replyTo?: string;
}

export interface TemplateEmailOptions<T> {
  to: string | string[];
  data: T;
  replyTo?: string;
}

export interface EmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

// Template data interfaces
export interface WelcomeTemplateData {
  firstName: string;
  organizationName: string;
  loginUrl: string;
}

export interface PasswordResetTemplateData {
  firstName: string;
  resetUrl: string;
  expiresInHours: number;
}

export interface PasswordChangedTemplateData {
  firstName: string;
  changedAt: string;
  ipAddress?: string;
}

export interface InvitationTemplateData {
  inviterName: string;
  organizationName: string;
  inviteUrl: string;
  expiresInDays: number;
  roleName: string;
}

export interface InvitationAcceptedTemplateData {
  inviterFirstName: string;
  inviteeEmail: string;
  inviteeName: string;
  organizationName: string;
}

export interface EmailVerificationTemplateData {
  firstName: string;
  verifyUrl: string;
  expiresInHours: number;
}

export interface AccountLockedTemplateData {
  firstName: string;
  lockReason: string;
  unlockAt?: string;
  supportEmail: string;
}

export interface AccountDeactivatedTemplateData {
  firstName: string;
  organizationName: string;
  supportEmail: string;
}

export interface LoginFromNewDeviceTemplateData {
  firstName: string;
  deviceInfo: string;
  ipAddress: string;
  loginTime: string;
  securityUrl: string;
}

export type TemplateDataMap = {
  [EMAIL_TYPES.WELCOME]: WelcomeTemplateData;
  [EMAIL_TYPES.PASSWORD_RESET]: PasswordResetTemplateData;
  [EMAIL_TYPES.PASSWORD_CHANGED]: PasswordChangedTemplateData;
  [EMAIL_TYPES.INVITATION]: InvitationTemplateData;
  [EMAIL_TYPES.INVITATION_ACCEPTED]: InvitationAcceptedTemplateData;
  [EMAIL_TYPES.EMAIL_VERIFICATION]: EmailVerificationTemplateData;
  [EMAIL_TYPES.ACCOUNT_LOCKED]: AccountLockedTemplateData;
  [EMAIL_TYPES.ACCOUNT_DEACTIVATED]: AccountDeactivatedTemplateData;
  [EMAIL_TYPES.LOGIN_FROM_NEW_DEVICE]: LoginFromNewDeviceTemplateData;
};
