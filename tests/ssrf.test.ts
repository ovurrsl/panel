import { describe, expect, it } from 'vitest';
import { createWebhookSchema } from '@/lib/api-contract';
import { isPrivateOrReservedIp, validateWebhookUrl } from '@/lib/integrations';

describe('SSRF & IP Validation', () => {
  describe('isPrivateOrReservedIp', () => {
    it('detects IPv4 loopback (127.0.0.0/8)', () => {
      expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('127.255.255.255')).toBe(true);
    });

    it('detects RFC 1918 private subnets', () => {
      // 10.0.0.0/8
      expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('10.254.254.254')).toBe(true);
      // 172.16.0.0/12
      expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
      // 192.168.0.0/16
      expect(isPrivateOrReservedIp('192.168.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('192.168.1.100')).toBe(true);
    });

    it('detects Carrier-grade NAT (100.64.0.0/10)', () => {
      expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('100.127.255.254')).toBe(true);
      expect(isPrivateOrReservedIp('100.128.0.1')).toBe(false); // Outside CGNAT
    });

    it('detects Link-Local & Cloud Metadata (169.254.0.0/16)', () => {
      expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true); // AWS/GCP/Azure IMDS
      expect(isPrivateOrReservedIp('169.254.0.1')).toBe(true);
    });

    it('detects Multicast, Broadcast and Reserved IPv4', () => {
      expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
      expect(isPrivateOrReservedIp('224.0.0.1')).toBe(true); // Multicast
      expect(isPrivateOrReservedIp('240.0.0.1')).toBe(true); // Reserved
      expect(isPrivateOrReservedIp('255.255.255.255')).toBe(true); // Broadcast
    });

    it('detects IPv6 Loopback, Unspecified, ULA and Link-Local', () => {
      expect(isPrivateOrReservedIp('::1')).toBe(true); // Loopback
      expect(isPrivateOrReservedIp('::')).toBe(true); // Unspecified
      expect(isPrivateOrReservedIp('fc00::1')).toBe(true); // ULA
      expect(isPrivateOrReservedIp('fd12:3456:789a::1')).toBe(true); // ULA
      expect(isPrivateOrReservedIp('fe80::1')).toBe(true); // Link-Local
      expect(isPrivateOrReservedIp('febf::1')).toBe(true); // Link-Local
    });

    it('detects IPv4-mapped IPv6 literals', () => {
      expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:169.254.169.254')).toBe(true);
    });

    it('allows valid public routable IP addresses', () => {
      expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false); // example.com
      expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false); // Google DNS
      expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false); // Cloudflare DNS
      expect(isPrivateOrReservedIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false); // example.com IPv6
    });
  });

  describe('validateWebhookUrl', () => {
    it('rejects non-HTTPS URLs', async () => {
      expect(await validateWebhookUrl('http://example.com/webhook')).toBe(false);
      expect(await validateWebhookUrl('ftp://example.com/webhook')).toBe(false);
    });

    it('rejects localhost and private direct IPs', async () => {
      expect(await validateWebhookUrl('https://localhost/webhook')).toBe(false);
      expect(await validateWebhookUrl('https://127.0.0.1/webhook')).toBe(false);
      expect(await validateWebhookUrl('https://10.0.0.1/webhook')).toBe(false);
      expect(await validateWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
      expect(await validateWebhookUrl('https://[::1]/webhook')).toBe(false);
    });

    it('accepts valid public HTTPS domain', async () => {
      expect(await validateWebhookUrl('https://example.com/webhook')).toBe(true);
    });
  });

  describe('createWebhookSchema', () => {
    it('accepts valid https public domains', () => {
      const parsed = createWebhookSchema.safeParse({
        url: 'https://api.example.com/webhook',
        events: ['user.invited'],
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects http, localhost, raw IPs, and single-label hosts', () => {
      expect(
        createWebhookSchema.safeParse({
          url: 'http://example.com/webhook',
          events: ['user.invited'],
        }).success,
      ).toBe(false);

      expect(
        createWebhookSchema.safeParse({
          url: 'https://localhost/webhook',
          events: ['user.invited'],
        }).success,
      ).toBe(false);

      expect(
        createWebhookSchema.safeParse({
          url: 'https://127.0.0.1/webhook',
          events: ['user.invited'],
        }).success,
      ).toBe(false);

      expect(
        createWebhookSchema.safeParse({
          url: 'https://192.168.1.1/webhook',
          events: ['user.invited'],
        }).success,
      ).toBe(false);

      expect(
        createWebhookSchema.safeParse({
          url: 'https://[::1]/webhook',
          events: ['user.invited'],
        }).success,
      ).toBe(false);

      expect(
        createWebhookSchema.safeParse({
          url: 'https://internalservice/webhook',
          events: ['user.invited'],
        }).success,
      ).toBe(false);
    });
  });
});
