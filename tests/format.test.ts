import { describe, expect, it } from 'vitest';
import { collator, format, formatDate, formatDateOnly, formatNumber } from '@/lib/i18n';

/**
 * Section 09's K8: numbers and dates are locale-bound, and the separator flips
 * between the two languages. 12,480 in English, 12.480 in Turkish — the exact
 * pair the handover document names.
 *
 * These tests exist because the failure is silent. A hand-rolled separator, or a
 * value that skipped the formatter, renders a plausible-looking number that is
 * wrong by three orders of magnitude to a Turkish reader.
 */
describe('formatNumber', () => {
  it('flips the thousands separator between the two languages', () => {
    expect(formatNumber('en', 12480)).toBe('12,480');
    expect(formatNumber('tr', 12480)).toBe('12.480');
  });

  it('groups every triple, not just the first', () => {
    expect(formatNumber('en', 1234567)).toBe('1,234,567');
    expect(formatNumber('tr', 1234567)).toBe('1.234.567');
  });

  it('flips the decimal mark with it', () => {
    expect(formatNumber('en', 1234.5)).toBe('1,234.5');
    expect(formatNumber('tr', 1234.5)).toBe('1.234,5');
  });

  it('leaves values below the grouping threshold alone', () => {
    for (const lang of ['en', 'tr'] as const) {
      expect(formatNumber(lang, 0)).toBe('0');
      expect(formatNumber(lang, 999)).toBe('999');
    }
  });

  it('keeps the sign in front', () => {
    expect(formatNumber('en', -12480)).toBe('-12,480');
    expect(formatNumber('tr', -12480)).toBe('-12.480');
  });
});

describe('formatDate', () => {
  // 15 March 2026, 09:30 UTC. Day and month differ, so a day/month swap fails
  // the test rather than passing by coincidence.
  const at = '2026-03-15T09:30:00.000Z';

  it('separates date parts with slashes in English and dots in Turkish', () => {
    expect(formatDate('en', at)).toBe('15/03/2026, 09:30');
    expect(formatDate('tr', at)).toBe('15.03.2026 09:30');
  });

  it('reads a Date the same as its ISO string', () => {
    expect(formatDate('tr', new Date(at))).toBe(formatDate('tr', at));
  });

  it('drops the time in the date-only variant', () => {
    expect(formatDateOnly('en', at)).toBe('15/03/2026');
    expect(formatDateOnly('tr', at)).toBe('15.03.2026');
  });

  it('is day-first in both languages', () => {
    // The trap this guards: en-US would render 03/15/2026 and read as 3 March
    // to every Turkish user in the building.
    expect(formatDateOnly('en', '2026-01-02T00:00:00.000Z').startsWith('02')).toBe(true);
  });
});

describe('collator', () => {
  it('sorts Turkish letters into their own alphabet positions', () => {
    // ç follows c, ğ follows g, ı precedes i, ş follows s, ü follows u.
    const input = ['Zeytinburnu', 'Çorlu', 'İzmir', 'Ankara', 'Şile', 'Ümraniye', 'Gebze'];
    const sorted = [...input].sort(collator('tr').compare);
    expect(sorted).toEqual(['Ankara', 'Çorlu', 'Gebze', 'İzmir', 'Şile', 'Ümraniye', 'Zeytinburnu']);
  });

  it('puts dotless ı before i under the Turkish rule', () => {
    expect(collator('tr').compare('ısparta', 'istanbul')).toBeLessThan(0);
  });

  it('orders embedded numbers numerically, not lexically', () => {
    // Site names are "Gebze LM3", "Gebze LM10" — a lexical sort files 10 before 3.
    const sorted = ['LM10', 'LM3', 'LM1'].sort(collator('en').compare);
    expect(sorted).toEqual(['LM1', 'LM3', 'LM10']);
  });

  it('ignores case and accents when comparing', () => {
    expect(collator('tr').compare('AYDIN', 'aydın')).toBe(0);
  });
});

describe('format', () => {
  it('substitutes named placeholders', () => {
    expect(format('{count} events', { count: 12 })).toBe('12 events');
  });

  it('leaves an unmatched placeholder visible rather than blanking it', () => {
    // A silently-dropped placeholder ships a sentence with a hole in it. Leaving
    // the token in place makes the missing value obvious in review.
    expect(format('{a} and {b}', { a: 'one' })).toBe('one and {b}');
  });
});
