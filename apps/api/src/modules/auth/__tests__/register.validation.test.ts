import { describe, it, expect } from 'vitest';
import { registerSchema, verifyEmailSchema, resendVerificationSchema } from '@crm/shared';

// =============================================================================
// registerSchema Validation
// =============================================================================

describe('registerSchema', () => {
  const validInput = {
    organization: {
      name: 'Test Organization',
      slug: 'test-org',
    },
    email: 'test@example.com',
    password: 'securepassword123',
    firstName: 'John',
    lastName: 'Doe',
  };

  // ---------------------------------------------------------------------------
  // Organization Validation
  // ---------------------------------------------------------------------------

  describe('organization.name', () => {
    it('rejects missing organization', () => {
      const input = { ...validInput, organization: undefined };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects missing organization.name', () => {
      const input = {
        ...validInput,
        organization: { slug: 'test-org' },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty organization.name', () => {
      const input = {
        ...validInput,
        organization: { name: '', slug: 'test-org' },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts valid organization.name', () => {
      const result = registerSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });

  describe('organization.slug', () => {
    it('rejects missing organization.slug', () => {
      const input = {
        ...validInput,
        organization: { name: 'Test Org' },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects slug shorter than 3 characters', () => {
      const input = {
        ...validInput,
        organization: { name: 'Test Org', slug: 'ab' },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects slug longer than 50 characters', () => {
      const input = {
        ...validInput,
        organization: { name: 'Test Org', slug: 'a'.repeat(51) },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects slug with uppercase letters', () => {
      const input = {
        ...validInput,
        organization: { name: 'Test Org', slug: 'Test-Org' },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects slug with special characters', () => {
      const input = {
        ...validInput,
        organization: { name: 'Test Org', slug: 'test@org' },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects slug with spaces', () => {
      const input = {
        ...validInput,
        organization: { name: 'Test Org', slug: 'test org' },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts valid lowercase slug with hyphens', () => {
      const input = {
        ...validInput,
        organization: { name: 'Test Org', slug: 'my-test-org-123' },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts slug at minimum length (3 chars)', () => {
      const input = {
        ...validInput,
        organization: { name: 'Test Org', slug: 'abc' },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts slug at maximum length (50 chars)', () => {
      const input = {
        ...validInput,
        organization: { name: 'Test Org', slug: 'a'.repeat(50) },
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Email Validation
  // ---------------------------------------------------------------------------

  describe('email', () => {
    it('rejects missing email', () => {
      const { email: _, ...input } = validInput;
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid email format', () => {
      const input = { ...validInput, email: 'notanemail' };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects email without domain', () => {
      const input = { ...validInput, email: 'test@' };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('transforms email to lowercase', () => {
      const input = { ...validInput, email: 'USER@EXAMPLE.COM' };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@example.com');
      }
    });

    it('rejects email with leading/trailing whitespace', () => {
      // Zod email() validation happens before transform, so whitespace emails fail
      const input = { ...validInput, email: '  test@example.com  ' };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Password Validation
  // ---------------------------------------------------------------------------

  describe('password', () => {
    it('rejects missing password', () => {
      const { password: _, ...input } = validInput;
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects password shorter than 8 characters', () => {
      const input = { ...validInput, password: '1234567' };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects password longer than 72 characters', () => {
      const input = { ...validInput, password: 'a'.repeat(73) };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts password at minimum length (8 chars)', () => {
      const input = { ...validInput, password: '12345678' };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts password at maximum length (72 chars)', () => {
      const input = { ...validInput, password: 'a'.repeat(72) };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Name Validation
  // ---------------------------------------------------------------------------

  describe('firstName', () => {
    it('rejects missing firstName', () => {
      const { firstName: _, ...input } = validInput;
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty firstName', () => {
      const input = { ...validInput, firstName: '' };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts valid firstName', () => {
      const result = registerSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });

  describe('lastName', () => {
    it('rejects missing lastName', () => {
      const { lastName: _, ...input } = validInput;
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty lastName', () => {
      const input = { ...validInput, lastName: '' };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts valid lastName', () => {
      const result = registerSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Complete Valid Input
  // ---------------------------------------------------------------------------

  describe('valid input', () => {
    it('accepts complete valid input', () => {
      const result = registerSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });
  });
});

// =============================================================================
// verifyEmailSchema Validation
// =============================================================================

describe('verifyEmailSchema', () => {
  it('rejects missing token', () => {
    const result = verifyEmailSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty token', () => {
    const result = verifyEmailSchema.safeParse({ token: '' });
    expect(result.success).toBe(false);
  });

  it('accepts valid token', () => {
    const result = verifyEmailSchema.safeParse({ token: 'abc123' });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// resendVerificationSchema Validation
// =============================================================================

describe('resendVerificationSchema', () => {
  it('rejects missing email', () => {
    const result = resendVerificationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = resendVerificationSchema.safeParse({ email: 'notanemail' });
    expect(result.success).toBe(false);
  });

  it('transforms email to lowercase', () => {
    const result = resendVerificationSchema.safeParse({ email: 'USER@EXAMPLE.COM' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('accepts valid email', () => {
    const result = resendVerificationSchema.safeParse({ email: 'test@example.com' });
    expect(result.success).toBe(true);
  });
});
