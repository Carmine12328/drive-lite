import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('Password Utility', () => {
  it('hashes a password and verifies it correctly', () => {
    const password = 'SuperSecretPassword123!';
    const { hash, salt } = hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash.length).toBe(64); // 32 bytes hex
    expect(salt).toBeDefined();
    expect(salt.length).toBe(32); // 16 bytes hex

    const isValid = verifyPassword(password, hash, salt);
    expect(isValid).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const password = 'CorrectPassword';
    const { hash, salt } = hashPassword(password);

    const isValid = verifyPassword('WrongPassword', hash, salt);
    expect(isValid).toBe(false);
  });

  it('handles corrupted hash or salt gracefully', () => {
    const isValid = verifyPassword('test', 'invalid-hex', 'invalid-hex');
    expect(isValid).toBe(false);
  });
});
