import { describe, it, expect } from 'vitest';
import {
  generateFamilyCode,
  normalizeFamilyCode,
  isValidFamilyCode,
  formatFamilyRoleDisplay,
  canManageFamilyBooks,
  canManageFamilyMembers,
} from '../utils';

describe('Family Domain Utilities', () => {
  describe('generateFamilyCode', () => {
    it('generates a code prefixed with FAM- and standard 4 characters', () => {
      const code = generateFamilyCode();
      expect(code.startsWith('FAM-')).toBe(true);
      expect(code.length).toBe(8); // 'FAM-' (4) + 4 chars
    });

    it('never contains ambiguous characters (0, O, 1, I)', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateFamilyCode(6);
        expect(code).not.toMatch(/[0O1I]/);
      }
    });

    it('supports custom suffix length', () => {
      const code6 = generateFamilyCode(6);
      expect(code6.startsWith('FAM-')).toBe(true);
      expect(code6.length).toBe(10); // 'FAM-' (4) + 6 chars
    });
  });

  describe('normalizeFamilyCode', () => {
    it('normalizes lowercase code without prefix to standard FAM- uppercase', () => {
      expect(normalizeFamilyCode('7k9p')).toBe('FAM-7K9P');
      expect(normalizeFamilyCode('  2h8x  ')).toBe('FAM-2H8X');
    });

    it('keeps existing FAM- prefix while cleaning whitespace and uppercase', () => {
      expect(normalizeFamilyCode('fam-7k9p')).toBe('FAM-7K9P');
      expect(normalizeFamilyCode('  FAM-abc9  ')).toBe('FAM-ABC9');
    });

    it('normalizes underscore delimiter to hyphen', () => {
      expect(normalizeFamilyCode('FAM_9XYZ')).toBe('FAM-9XYZ');
    });

    it('handles empty or null inputs gracefully', () => {
      expect(normalizeFamilyCode('')).toBe('');
      expect(normalizeFamilyCode(null)).toBe('');
      expect(normalizeFamilyCode(undefined)).toBe('');
    });
  });

  describe('isValidFamilyCode', () => {
    it('validates properly formatted family codes', () => {
      expect(isValidFamilyCode('FAM-7K9P')).toBe(true);
      expect(isValidFamilyCode('7k9p')).toBe(true); // Normalized to FAM-7K9P
      expect(isValidFamilyCode('FAM-234567')).toBe(true);
    });

    it('rejects codes with ambiguous characters (0, O, 1, I)', () => {
      expect(isValidFamilyCode('FAM-7O9P')).toBe(false); // contains 'O'
      expect(isValidFamilyCode('FAM-709P')).toBe(false); // contains '0'
      expect(isValidFamilyCode('FAM-7I9P')).toBe(false); // contains 'I'
      expect(isValidFamilyCode('FAM-719P')).toBe(false); // contains '1'
    });

    it('rejects codes that are too short or have invalid symbols', () => {
      expect(isValidFamilyCode('FAM-A')).toBe(false);
      expect(isValidFamilyCode('FAM-123456789999')).toBe(false);
      expect(isValidFamilyCode('FAM-AB@#')).toBe(false);
      expect(isValidFamilyCode('')).toBe(false);
      expect(isValidFamilyCode(null)).toBe(false);
    });
  });

  describe('formatFamilyRoleDisplay', () => {
    it('returns "Chưa tham gia gia đình" when role is missing', () => {
      expect(formatFamilyRoleDisplay(null)).toBe('Chưa tham gia gia đình');
      expect(formatFamilyRoleDisplay(undefined)).toBe('Chưa tham gia gia đình');
    });

    it('formats roles correctly without family name prefix', () => {
      expect(formatFamilyRoleDisplay('admin')).toBe('Admin');
      expect(formatFamilyRoleDisplay('moderator')).toBe('Nhóm phó (Moderator)');
      expect(formatFamilyRoleDisplay('reader')).toBe('Độc giả (Reader)');
    });

    it('formats roles correctly with family name prefix', () => {
      expect(formatFamilyRoleDisplay('admin', 'Gia đình Hùng')).toBe('Gia đình Hùng Admin');
      expect(formatFamilyRoleDisplay('moderator', 'Tủ sách An')).toBe('Tủ sách An Nhóm phó (Moderator)');
      expect(formatFamilyRoleDisplay('reader', 'Nhà Nguyễn')).toBe('Nhà Nguyễn Độc giả (Reader)');
    });
  });

  describe('canManageFamilyBooks', () => {
    it('grants bookshelf management to admin and moderator', () => {
      expect(canManageFamilyBooks('admin')).toBe(true);
      expect(canManageFamilyBooks('moderator')).toBe(true);
    });

    it('denies bookshelf management to readers and undefined roles', () => {
      expect(canManageFamilyBooks('reader')).toBe(false);
      expect(canManageFamilyBooks(null)).toBe(false);
      expect(canManageFamilyBooks(undefined)).toBe(false);
    });
  });

  describe('canManageFamilyMembers', () => {
    it('grants member management strictly to admin', () => {
      expect(canManageFamilyMembers('admin')).toBe(true);
    });

    it('denies member management to moderator and reader', () => {
      expect(canManageFamilyMembers('moderator')).toBe(false);
      expect(canManageFamilyMembers('reader')).toBe(false);
      expect(canManageFamilyMembers(null)).toBe(false);
      expect(canManageFamilyMembers(undefined)).toBe(false);
    });
  });
});
