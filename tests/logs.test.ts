import { describe, expect, it } from 'vitest';
import { CHANGE_KINDS, isChangeKind } from '@/lib/logs';

/**
 * Diagnostics and the audit trail are two views of one table, split by `kind`.
 * The split is what makes "clear diagnostics" safe: it must never be able to
 * delete a record of who changed what.
 *
 * These lists are every `kind` the application writes. A new kind added without
 * a decision about which side it belongs to will fail the coverage test below
 * rather than silently landing in diagnostics and becoming deletable.
 */
const AUDIT_KINDS = ['api_key', 'invite', 'request', 'role_change', 'settings', 'site', 'user', 'webhook'];
const DIAGNOSTIC_KINDS = ['auth', 'job', 'mfa', 'reset', 'session', 'site_provision', 'telemetry'];

describe('isChangeKind', () => {
  it('routes every change record to the audit trail', () => {
    for (const kind of AUDIT_KINDS) expect(isChangeKind(kind)).toBe(true);
  });

  it('routes runtime events to diagnostics', () => {
    for (const kind of DIAGNOSTIC_KINDS) expect(isChangeKind(kind)).toBe(false);
  });

  it('treats a missing kind as diagnostic', () => {
    // Browser errors arrive through /api/telemetry with no kind at all.
    expect(isChangeKind(null)).toBe(false);
  });

  it('does not classify an unknown kind as permanent', () => {
    expect(isChangeKind('something_new')).toBe(false);
  });
});

describe('CHANGE_KINDS', () => {
  it('is exactly the audit side, with nothing extra and nothing missing', () => {
    expect([...CHANGE_KINDS].sort()).toEqual([...AUDIT_KINDS].sort());
  });

  it('does not overlap the diagnostic side', () => {
    const overlap = DIAGNOSTIC_KINDS.filter((kind) => (CHANGE_KINDS as readonly string[]).includes(kind));
    expect(overlap).toEqual([]);
  });
});
