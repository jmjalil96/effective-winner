import argon2 from 'argon2';

/**
 * Standard test password used across all tests.
 */
export const VALID_PASSWORD = 'TestPassword123!';

/**
 * Cached password hash to avoid slow argon2 hashing in every test.
 * Initialized lazily on first call.
 */
let cachedHash: string | null = null;

/**
 * Get a cached argon2 hash of VALID_PASSWORD.
 * Hashing is slow (~300ms), so we cache it for test performance.
 */
export const getTestPasswordHash = async (): Promise<string> => {
  if (!cachedHash) {
    cachedHash = await argon2.hash(VALID_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }
  return cachedHash;
};

/**
 * Hash a password with test-compatible argon2 settings.
 * Use sparingly - prefer getTestPasswordHash() for VALID_PASSWORD.
 */
export const hashTestPassword = async (password: string): Promise<string> => {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
};
