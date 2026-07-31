import { describe, expect, it } from 'vitest';
import { toCaps } from '@/lib/casing';

/**
 * The İ/ı trap, pinned.
 *
 * This is the bug that survived a full visual pass: `<html lang="tr">` is set,
 * CSS `text-transform: uppercase` is *specified* to follow the document
 * language, and Chromium still renders the dotless I. Every uppercase label in
 * the console therefore goes through `toCaps`, and these tests are what stop a
 * later refactor from quietly putting the CSS back.
 */
describe('toCaps', () => {
  it('keeps the dot on i when the language is Turkish', () => {
    expect(toCaps('izmir', 'tr')).toBe('İZMİR');
    expect(toCaps('işlemci', 'tr')).toBe('İŞLEMCİ');
    expect(toCaps('sonraki adımda geliyor', 'tr')).toBe('SONRAKİ ADIMDA GELİYOR');
  });

  it('leaves dotless ı dotless', () => {
    // 'ı' uppercases to 'I' — the pair 'ı/I' and 'i/İ' never cross.
    expect(toCaps('adım', 'tr')).toBe('ADIM');
    expect(toCaps('ışık', 'tr')).toBe('IŞIK');
  });

  it('uses the plain rule for English', () => {
    expect(toCaps('izmir', 'en')).toBe('IZMIR');
  });

  it('treats identifiers as invariant so role names survive', () => {
    // Without this the Turkish rule renames the roles: ADMİN, EDİTOR.
    for (const role of ['Admin', 'Editor', 'Viewer']) {
      expect(toCaps(role, 'tr', true)).toBe(role.toUpperCase());
    }
    expect(toCaps('admin_access', 'tr', true)).toBe('ADMIN_ACCESS');
  });

  it('shows what the invariant flag is protecting against', () => {
    // Same input, both paths — the assertion documents the difference rather
    // than just asserting the safe half.
    expect(toCaps('Admin', 'tr')).toBe('ADMİN');
    expect(toCaps('Admin', 'tr', true)).toBe('ADMIN');
  });

  it('passes non-cased characters through untouched', () => {
    expect(toCaps('12.480 · %', 'tr')).toBe('12.480 · %');
  });
});
