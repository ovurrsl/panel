import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy } from '@/lib/password-policy';

/**
 * The policy is one pure function shared by the live meter and the server-side
 * check. These tests are the guarantee that the two cannot drift: if the meter
 * ever says "Strong" on something the API rejects, it will be because a rule
 * changed here first, and one of these fails.
 */
describe('checkPasswordPolicy', () => {
  it('accepts a password that satisfies all five rules', () => {
    const result = checkPasswordPolicy('Kavaklı-2026!', 'r.ovur');
    expect(result.ok).toBe(true);
    expect(result.strength).toBe(3);
  });

  it('names the rule that failed rather than just refusing', () => {
    const short = checkPasswordPolicy('Ab1!x', 'r.ovur');
    expect(short.minLength).toBe(false);
    expect(short.mixedCase).toBe(true);
    expect(short.digit).toBe(true);
    expect(short.symbol).toBe(true);
    expect(short.ok).toBe(false);
  });

  it('rejects a password containing the identity', () => {
    expect(checkPasswordPolicy('Ovur-2026!x', 'r.ovur').noIdentity).toBe(false);
    // Case-insensitively, and on the local part of an address too.
    expect(checkPasswordPolicy('COSKUN-2026!x', 'coskun.tuna@netlog.com.tr').noIdentity).toBe(false);
  });

  it('checks every segment of a dotted username, not just the first', () => {
    // The regression this pins: taking only the first segment reduced "r.ovur"
    // to "r", which is below the three-character floor, so rule 5 never ran for
    // any account using the product's own username format.
    expect(checkPasswordPolicy('R.ovur-2026!', 'r.ovur').noIdentity).toBe(false);
    expect(checkPasswordPolicy('Rovur-2026!x', 'r.ovur').noIdentity).toBe(false);
    expect(checkPasswordPolicy('Tuna-2026!xy', 'c.tuna').noIdentity).toBe(false);
    // An unrelated password with the same shape still passes.
    expect(checkPasswordPolicy('Kavaklı-2026!', 'r.ovur').noIdentity).toBe(true);
  });

  it('rejects the brand word regardless of identity', () => {
    expect(checkPasswordPolicy('Netlog-2026!', '').noIdentity).toBe(false);
    expect(checkPasswordPolicy('nETLOG-2026!', 'anyone').noIdentity).toBe(false);
  });

  it('does not let a two-character identity ban half the alphabet', () => {
    // An identity shorter than 3 characters is skipped — otherwise a user named
    // "ab" could not use any password containing "ab".
    expect(checkPasswordPolicy('Abracadabra-1!', 'ab').noIdentity).toBe(true);
  });

  it('reports an empty password as failing every rule', () => {
    const empty = checkPasswordPolicy('', 'r.ovur');
    expect(empty.ok).toBe(false);
    expect(empty.noIdentity).toBe(false);
    expect(empty.strength).toBe(0);
  });

  it('maps rule count to the four-step meter', () => {
    // ceil(passed * 4 / 5) - 1, clamped — the prototype's mapping exactly.
    expect(checkPasswordPolicy('', '').strength).toBe(0); // 0 rules
    expect(checkPasswordPolicy('abcdefghij', '').strength).toBe(1); // length + noIdentity
    expect(checkPasswordPolicy('Abcdefghij', '').strength).toBe(2); // + mixedCase
    expect(checkPasswordPolicy('Abcdefghi1', '').strength).toBe(3); // + digit
    expect(checkPasswordPolicy('Abcdefghi1!', '').strength).toBe(3); // all five, still 3
  });

  it('never reports a strength outside the meter it feeds', () => {
    for (const candidate of ['', 'a', 'Ab1!', 'Uzun-Bir-Şifre-2026!', 'netlog']) {
      const { strength } = checkPasswordPolicy(candidate, 'r.ovur');
      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(3);
    }
  });
});
