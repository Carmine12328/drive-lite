import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;    // 256 bits
const DIGEST = 'sha256';
const SALT_LENGTH = 16;   // 128 bits

/**
 * Hash a password with a random salt.
 * @param password - Plain text password
 * @returns Hex-encoded hash and salt
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(SALT_LENGTH);
  const derived = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return { hash: derived.toString('hex'), salt: salt.toString('hex') };
}

/**
 * Verify a password against stored hash and salt.
 * Uses timingSafeEqual to prevent timing attacks.
 * @param password - Plain text password to verify
 * @param storedHash - Stored hex-encoded hash
 * @param storedSalt - Stored hex-encoded salt
 * @returns True if password matches, false otherwise
 */
export function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): boolean {
  try {
    const salt = Buffer.from(storedSalt, 'hex');
    const derived = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
    const expected = Buffer.from(storedHash, 'hex');
    if (derived.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
