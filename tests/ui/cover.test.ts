import { describe, expect, test } from 'vitest';
import { coverInitials, songLook } from '../../src/ui/cover';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `song-${i}`);

describe('songLook', () => {
  test('same id, same look', () => {
    expect(songLook('abc')).toEqual(songLook('abc'));
  });

  test('hue is always an integer from 1 to 6', () => {
    for (const id of [...ids(500), '', 'x', 'é♪']) {
      const { hue } = songLook(id);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(1);
      expect(hue).toBeLessThanOrEqual(6);
    }
  });

  test('motif is always one of the three', () => {
    for (const id of ids(200)) {
      expect(['waves', 'circles', 'lines']).toContain(songLook(id).motif);
    }
  });

  test('all six hues and three motifs appear', () => {
    const looks = Array.from({ length: 300 }, () => songLook(crypto.randomUUID()));
    expect(new Set(looks.map((l) => l.hue))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(new Set(looks.map((l) => l.motif))).toEqual(new Set(['waves', 'circles', 'lines']));
  });

  test('the whole id counts: ids differing only in the last or first char spread out', () => {
    const base = 'a1b2c3d4-0000-4000-8000-00000000000';
    const lastChars = '0123456789abcdef'.split('');
    const byLast = new Set(lastChars.map((c) => JSON.stringify(songLook(base + c))));
    expect(byLast.size).toBeGreaterThan(3);
    const tail = '-0000-4000-8000-000000000000';
    const byFirst = new Set(lastChars.map((c) => JSON.stringify(songLook(c + '1b2c3d4' + tail))));
    expect(byFirst.size).toBeGreaterThan(3);
  });

  test('deterministic ids cover every hue and motif roughly evenly', () => {
    const looks = ids(600).map(songLook);
    for (let h = 1; h <= 6; h++) {
      const n = looks.filter((l) => l.hue === h).length;
      expect(n).toBeGreaterThan(50);
    }
    for (const m of ['waves', 'circles', 'lines']) {
      expect(looks.filter((l) => l.motif === m).length).toBeGreaterThan(100);
    }
  });
});

describe('coverInitials', () => {
  test('initials from the first two words', () => {
    expect(coverInitials('Paper Lanterns')).toBe('PL');
    expect(coverInitials('salt')).toBe('S');
    expect(coverInitials("  don't   wait up ")).toBe('DW');
    expect(coverInitials('Élan vital')).toBe('ÉV');
  });

  test('never more than two letters', () => {
    expect(coverInitials('Paper Lanterns Fall')).toBe('PL');
    expect(coverInitials('a b c d e')).toBe('AB');
  });

  test('leading punctuation and digits inside a word are skipped', () => {
    expect(coverInitials("(I) won't")).toBe('IW');
    expect(coverInitials('"Quiet" ...Rain')).toBe('QR');
    expect(coverInitials('7up 3am')).toBe('UA');
  });

  test('a title with letters after a digit word still works', () => {
    expect(coverInitials('99 Red Lanterns')).toBe('RL');
    expect(coverInitials('1999 Blue')).toBe('B');
  });

  test('initials fall back to a note', () => {
    for (const t of ['', '   ', '1999', '!!!', '- 42 ?']) {
      expect(coverInitials(t)).toBe('♪');
    }
    expect(coverInitials('Senza titolo')).toBe('♪');
    expect(coverInitials('  senza titolo ')).toBe('♪');
  });
});
