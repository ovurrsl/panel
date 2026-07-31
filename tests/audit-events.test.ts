import { describe, expect, it } from 'vitest';
import { AUDIT_EVENT_FIELD, readAuditEvent } from '@/lib/audit-events';
import { auditText, dictionaryFor } from '@/lib/i18n';
import { en } from '@/lib/i18n/en';

const event = (k: string, p?: Record<string, string | number>) => ({ [AUDIT_EVENT_FIELD]: { k, p } });

/**
 * The audit trail stores English and renders per locale. Two things have to hold
 * for that to be honest rather than merely bilingual:
 *
 * - a row without a usable event still reads as what it stored, and
 * - no row ever renders a bare key or a leftover `{placeholder}`.
 */
describe('readAuditEvent', () => {
  it('reads a well-formed event', () => {
    expect(readAuditEvent(event('userDeleted', { email: 'a@b.c' }))).toEqual({
      k: 'userDeleted',
      p: { email: 'a@b.c' },
    });
  });

  it('reads an event with no parameters', () => {
    expect(readAuditEvent(event('signedIn'))).toEqual({ k: 'signedIn', p: undefined });
  });

  it('returns null for anything it cannot use', () => {
    // Every one of these is a row written by an older build, or a row whose meta
    // was hand-edited. None of them may throw.
    expect(readAuditEvent(null)).toBeNull();
    expect(readAuditEvent(undefined)).toBeNull();
    expect(readAuditEvent({})).toBeNull();
    expect(readAuditEvent({ role: 'Viewer' })).toBeNull();
    expect(readAuditEvent({ [AUDIT_EVENT_FIELD]: 'signedIn' })).toBeNull();
    expect(readAuditEvent({ [AUDIT_EVENT_FIELD]: { p: { a: 1 } } })).toBeNull();
  });

  it('drops parameters that are not an object', () => {
    expect(readAuditEvent({ [AUDIT_EVENT_FIELD]: { k: 'signedIn', p: 'nope' } })).toEqual({
      k: 'signedIn',
      p: undefined,
    });
  });
});

describe('auditText', () => {
  const row = (message: string, meta: Record<string, unknown> | null) => ({ message, meta });

  it('renders the event in the reader s language', () => {
    const entry = row('User deleted: a@b.c', event('userDeleted', { email: 'a@b.c' }));
    expect(auditText(dictionaryFor('en'), entry)).toBe('User deleted: a@b.c');
    expect(auditText(dictionaryFor('tr'), entry)).toBe('Kullanıcı silindi: a@b.c');
  });

  it('falls back to the stored sentence for a row with no event', () => {
    // Rows written before events existed. The fallback is permanent — stored
    // history is never rewritten.
    const legacy = row('Site archived: Gebze LM3', { name: 'Gebze LM3' });
    expect(auditText(dictionaryFor('tr'), legacy)).toBe('Site archived: Gebze LM3');
  });

  it('falls back for an event key the dictionary does not carry', () => {
    const unknown = row('Something new happened', event('somethingNew', { a: 1 }));
    expect(auditText(dictionaryFor('tr'), unknown)).toBe('Something new happened');
  });

  it('matches the stored English sentence when rendered in English', () => {
    // If these drift, an export and the screen disagree about the same row.
    for (const [message, meta] of [
      ['Signed in', event('signedIn')],
      ['Two-factor enrolled', event('mfaEnrolled')],
      ['Role created: Denetçi', event('roleCreated', { name: 'Denetçi' })],
      ['Job cancelled: 01ABC (report)', event('jobCancelled', { id: '01ABC', kind: 'report' })],
      [
        'Sign-in failed — wrong password (attempt 3)',
        event('signInWrongPassword', { attempt: 3 }),
      ],
    ] as Array<[string, Record<string, unknown>]>) {
      expect(auditText(dictionaryFor('en'), row(message, meta))).toBe(message);
    }
  });

  it('leaves no unfilled placeholder in either language', () => {
    // A missing parameter would ship a sentence with a visible {hole} in it.
    const params: Record<string, string | number> = {
      email: 'a@b.c',
      role: 'Viewer',
      name: 'X',
      changes: 'role: A → B',
      count: 2,
      attempt: 1,
      id: '01ABC',
      kind: 'report',
      template: 'racking',
      jobId: '01JOB',
      url: 'https://example.test/h',
      events: 'site.created',
      scope: 'read',
      site: 'all sites',
      prefix: 'dt_ab12',
      status: ' (HTTP 200)',
      removed: 7,
      department: 'Operations',
      message: 'boom',
    };

    for (const lang of ['en', 'tr'] as const) {
      const dict = dictionaryFor(lang);
      for (const key of Object.keys(en.audit)) {
        const text = auditText(dict, row('stored', event(key, params)));
        expect(text, `${lang}/${key}`).not.toMatch(/\{[a-zA-Z]+\}/);
        expect(text, `${lang}/${key}`).not.toBe('stored');
      }
    }
  });
});
