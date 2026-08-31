import { beforeEach, describe, expect, it } from 'vitest';
import { telemetrySchema } from '@/lib/api-contract';
import { checkRateLimit, resetRateLimits } from '@/app/api/telemetry/route';

describe('Telemetry Rate Limiter & Schema', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('allows 10 requests per minute from the same IP, then rejects the 11th', () => {
    const clientIp = '203.0.113.42';

    // First 10 requests must pass
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(clientIp)).toBe(true);
    }

    // 11th request within same minute must be rate limited
    expect(checkRateLimit(clientIp)).toBe(false);
  });

  it('tracks rate limits independently across different client IPs', () => {
    const ip1 = '198.51.100.10';
    const ip2 = '198.51.100.20';

    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(ip1)).toBe(true);
    }
    expect(checkRateLimit(ip1)).toBe(false);

    // ip2 should still have full quota
    expect(checkRateLimit(ip2)).toBe(true);
  });

  it('clamps telemetrySchema stack trace to 2048 characters', () => {
    const validPayload = {
      message: 'Uncaught TypeError: test',
      stack: 'A'.repeat(2048),
    };
    expect(telemetrySchema.safeParse(validPayload).success).toBe(true);

    const oversizedPayload = {
      message: 'Uncaught TypeError: test',
      stack: 'A'.repeat(2049),
    };
    expect(telemetrySchema.safeParse(oversizedPayload).success).toBe(false);
  });
});
