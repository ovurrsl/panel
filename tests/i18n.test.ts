import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/en';
import { tr } from '@/lib/i18n/tr';
import { dictionaryFor, resolveApiMessage } from '@/lib/i18n';

type Node = { [key: string]: string | Node };

function flatten(node: Node, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const enFlat = flatten(en as unknown as Node);
const trFlat = flatten(tr as unknown as Node);

const placeholders = (value: string) => new Set(value.match(/\{\w+\}/g) ?? []);

/**
 * The `Dictionary` type already makes a missing Turkish key a compile error.
 * What it cannot catch is the rest: an empty string, or a `{count}` that got
 * lost in translation and leaves the sentence with a hole where a number
 * belongs. That is what these check.
 */
describe('dictionary parity', () => {
  it('has the same keys on both sides', () => {
    expect([...trFlat.keys()].sort()).toEqual([...enFlat.keys()].sort());
  });

  it('has no blank strings', () => {
    const blank = [...enFlat, ...trFlat].filter(([, value]) => value.trim() === '').map(([key]) => key);
    expect(blank).toEqual([]);
  });

  it('carries the same placeholders through the translation', () => {
    const mismatched = [...enFlat]
      .filter(([key, value]) => {
        const other = placeholders(trFlat.get(key) ?? '');
        const mine = placeholders(value);
        return mine.size !== other.size || [...mine].some((token) => !other.has(token));
      })
      .map(([key]) => key);

    expect(mismatched).toEqual([]);
  });

  it('translates the bulk of the copy rather than copying it', () => {
    // Identical strings are legitimate — "Admin", "TOTP", "API". A large
    // identical share would mean whole sections were never translated.
    const identical = [...enFlat].filter(([key, value]) => trFlat.get(key) === value);
    expect(identical.length / enFlat.size).toBeLessThan(0.2);
  });
});

describe('resolveApiMessage', () => {
  it('maps an error code to translated copy in both languages', () => {
    const enText = resolveApiMessage(dictionaryFor('en'), 'err.credentials');
    const trText = resolveApiMessage(dictionaryFor('tr'), 'err.credentials');
    expect(enText).toBeTruthy();
    expect(trText).toBeTruthy();
    expect(trText).not.toBe(enText);
  });

  it('never renders a raw key at the user', () => {
    // An unmapped code must read as a server error, not as "err.somethingNew".
    for (const lang of ['en', 'tr'] as const) {
      const text = resolveApiMessage(dictionaryFor(lang), 'err.notMappedYet');
      expect(text).not.toContain('err.');
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });
});
