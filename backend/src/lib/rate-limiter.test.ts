import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({
  config: {
    TABLE_NAME: 'DriveLiteStack-MetadataTable',
    REGION: 'us-east-1',
  },
}));

vi.mock('./dynamo-client', () => ({
  docClient: {
    send: vi.fn(),
  },
}));

import { enforceRateLimit } from './rate-limiter';
import { docClient } from './dynamo-client';
import { ValidationError } from '../types';

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows requests within the limit', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Attributes: { attempts: 5 },
    });

    await expect(enforceRateLimit('1.2.3.4', 'test-action', 10)).resolves.toBeUndefined();
  });

  it('throws ValidationError with status 429 when limit is exceeded', async () => {
    vi.mocked(docClient.send).mockResolvedValue({
      Attributes: { attempts: 11 },
    });

    try {
      await enforceRateLimit('1.2.3.4', 'test-action', 10);
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).statusCode).toBe(429);
      expect((err as ValidationError).message).toBe('Too many requests. Try again later.');
    }
  });

});
