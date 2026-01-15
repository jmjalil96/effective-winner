import type { EmailType, TemplateDataMap } from './types.js';
import { EMAIL_TYPES } from './types.js';

interface TemplateDefinition<T> {
  subject: (data: T) => string;
  body: (data: T) => string;
}

// =============================================================================
// HTML Escaping (Security)
// =============================================================================

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape HTML entities to prevent injection attacks */
export const escapeHtml = (str: string): string =>
  str.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);

/** Escape all string values in template data */
export const escapeTemplateData = <T>(data: T): T => {
  const escaped = { ...data } as Record<string, unknown>;
  for (const key of Object.keys(escaped)) {
    const value = escaped[key];
    if (typeof value === 'string') {
      escaped[key] = escapeHtml(value);
    }
  }
  return escaped as T;
};

// =============================================================================
// Base Layout (Feature 8)
// =============================================================================

export const wrapWithLayout = (content: string, orgName?: string): string => {
  const safeOrgName = escapeHtml(orgName ?? 'CRM');
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #2563eb; margin: 0; font-size: 24px; }
    .content { margin-bottom: 30px; }
    .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff !important; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 20px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header"><h1>${safeOrgName}</h1></div>
  <div class="content">${content}</div>
  <div class="footer">
    <p>This is an automated message. Please do not reply directly.</p>
    <p>&copy; ${String(new Date().getFullYear())} ${safeOrgName}. All rights reserved.</p>
  </div>
</body>
</html>`;
};

// =============================================================================
// Template Definitions (Feature 6)
// =============================================================================

export const TEMPLATES: { [K in EmailType]: TemplateDefinition<TemplateDataMap[K]> } = {
  [EMAIL_TYPES.WELCOME]: {
    subject: (d) => `Welcome to ${d.organizationName}!`,
    body: (d) => `
      <h2>Welcome, ${d.firstName}!</h2>
      <p>Your account at <strong>${d.organizationName}</strong> is ready.</p>
      <p style="margin:30px 0"><a href="${d.loginUrl}" class="button">Log In</a></p>
    `,
  },
  [EMAIL_TYPES.PASSWORD_RESET]: {
    subject: () => 'Reset Your Password',
    body: (d) => `
      <h2>Password Reset</h2>
      <p>Hi ${d.firstName},</p>
      <p>Click below to reset your password. Link expires in ${String(d.expiresInHours)} hours.</p>
      <p style="margin:30px 0"><a href="${d.resetUrl}" class="button">Reset Password</a></p>
      <p>If you didn't request this, ignore this email.</p>
    `,
  },
  [EMAIL_TYPES.PASSWORD_CHANGED]: {
    subject: () => 'Password Changed',
    body: (d) => `
      <h2>Password Changed</h2>
      <p>Hi ${d.firstName},</p>
      <p>Your password was changed on ${d.changedAt}${d.ipAddress ? ` from ${d.ipAddress}` : ''}.</p>
      <p>If this wasn't you, contact your administrator immediately.</p>
    `,
  },
  [EMAIL_TYPES.INVITATION]: {
    subject: (d) => `Join ${d.organizationName}`,
    body: (d) => `
      <h2>You're Invited!</h2>
      <p><strong>${d.inviterName}</strong> invited you to <strong>${d.organizationName}</strong> as <strong>${d.roleName}</strong>.</p>
      <p style="margin:30px 0"><a href="${d.inviteUrl}" class="button">Accept Invitation</a></p>
      <p>Expires in ${String(d.expiresInDays)} days.</p>
    `,
  },
  [EMAIL_TYPES.INVITATION_ACCEPTED]: {
    subject: (d) => `${d.inviteeName} joined ${d.organizationName}`,
    body: (d) => `
      <h2>Invitation Accepted</h2>
      <p>Hi ${d.inviterFirstName},</p>
      <p><strong>${d.inviteeEmail}</strong> (${d.inviteeName}) has joined <strong>${d.organizationName}</strong>.</p>
    `,
  },
  [EMAIL_TYPES.EMAIL_VERIFICATION]: {
    subject: () => 'Verify Your Email',
    body: (d) => `
      <h2>Verify Email</h2>
      <p>Hi ${d.firstName},</p>
      <p style="margin:30px 0"><a href="${d.verifyUrl}" class="button">Verify Email</a></p>
      <p>Link expires in ${String(d.expiresInHours)} hours.</p>
    `,
  },
  [EMAIL_TYPES.ACCOUNT_LOCKED]: {
    subject: () => 'Account Locked',
    body: (d) => `
      <h2>Account Locked</h2>
      <p>Hi ${d.firstName},</p>
      <p>Your account was locked: <strong>${d.lockReason}</strong></p>
      ${d.unlockAt ? `<p>Auto-unlock: ${d.unlockAt}</p>` : ''}
      <p>Contact <a href="mailto:${d.supportEmail}">${d.supportEmail}</a> for help.</p>
    `,
  },
  [EMAIL_TYPES.ACCOUNT_DEACTIVATED]: {
    subject: (d) => `${d.organizationName} account deactivated`,
    body: (d) => `
      <h2>Account Deactivated</h2>
      <p>Hi ${d.firstName},</p>
      <p>Your account at <strong>${d.organizationName}</strong> has been deactivated.</p>
      <p>Contact <a href="mailto:${d.supportEmail}">${d.supportEmail}</a> for help.</p>
    `,
  },
  [EMAIL_TYPES.LOGIN_FROM_NEW_DEVICE]: {
    subject: () => 'New Login Detected',
    body: (d) => `
      <h2>New Login</h2>
      <p>Hi ${d.firstName},</p>
      <p>New login detected:</p>
      <ul><li>Device: ${d.deviceInfo}</li><li>IP: ${d.ipAddress}</li><li>Time: ${d.loginTime}</li></ul>
      <p>If this wasn't you:</p>
      <p style="margin:30px 0"><a href="${d.securityUrl}" class="button">Secure Account</a></p>
    `,
  },
};
