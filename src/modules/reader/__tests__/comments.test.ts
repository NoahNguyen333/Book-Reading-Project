import { describe, it, expect } from 'vitest';
import {
  validateCommentContent,
  canDeleteComment,
  formatRelativeCommentTime,
  getUserInitials,
} from '../annotations/utils';

describe('Annotation Discussion Threads & Comments Utilities', () => {
  describe('validateCommentContent', () => {
    it('rejects empty or undefined content', () => {
      expect(validateCommentContent('')).toEqual({
        isValid: false,
        error: 'Comment cannot be empty.',
        cleanContent: '',
      });
      expect(validateCommentContent(null)).toEqual({
        isValid: false,
        error: 'Comment cannot be empty.',
        cleanContent: '',
      });
      expect(validateCommentContent(undefined)).toEqual({
        isValid: false,
        error: 'Comment cannot be empty.',
        cleanContent: '',
      });
    });

    it('rejects whitespace-only content', () => {
      const res = validateCommentContent('   \n\t  ');
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Comment cannot consist only of whitespace.');
      expect(res.cleanContent).toBe('');
    });

    it('rejects content exceeding 2,000 characters', () => {
      const longText = 'a'.repeat(2001);
      const res = validateCommentContent(longText);
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('Comment cannot exceed 2,000 characters.');
    });

    it('accepts valid comment and trims leading/trailing whitespace', () => {
      const input = '   I love this passage because it connects to chapter 2.   ';
      const res = validateCommentContent(input);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
      expect(res.cleanContent).toBe(
        'I love this passage because it connects to chapter 2.'
      );
    });

    it('accepts content at the exact 2,000 character limit', () => {
      const exactText = 'x'.repeat(2000);
      const res = validateCommentContent(exactText);
      expect(res.isValid).toBe(true);
      expect(res.cleanContent.length).toBe(2000);
    });
  });

  describe('canDeleteComment', () => {
    const authorId = 'user-author-123';
    const otherId = 'user-reader-456';

    it('disallows deletion when no user is logged in', () => {
      expect(canDeleteComment(authorId, null, false)).toBe(false);
      expect(canDeleteComment(authorId, undefined, false)).toBe(false);
    });

    it('allows author to delete their own comment', () => {
      expect(canDeleteComment(authorId, authorId, false)).toBe(true);
      expect(canDeleteComment(authorId, authorId, true)).toBe(true);
    });

    it('disallows regular members from deleting other users comments', () => {
      expect(canDeleteComment(authorId, otherId, false)).toBe(false);
    });

    it('allows space admins to delete other users comments for moderation', () => {
      expect(canDeleteComment(authorId, otherId, true)).toBe(true);
    });
  });

  describe('formatRelativeCommentTime', () => {
    it('returns empty string for invalid timestamp strings', () => {
      expect(formatRelativeCommentTime('invalid-date')).toBe('');
      expect(formatRelativeCommentTime('')).toBe('');
    });

    it('formats timestamps under 60 seconds as "Just now"', () => {
      const now = new Date(Date.now() - 15 * 1000).toISOString();
      expect(formatRelativeCommentTime(now)).toBe('Just now');
    });

    it('formats timestamps in minutes', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatRelativeCommentTime(fiveMinAgo)).toBe('5m ago');
    });

    it('formats timestamps in hours', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      expect(formatRelativeCommentTime(twoHoursAgo)).toBe('2h ago');
    });

    it('formats timestamps for yesterday and recent days', () => {
      const yesterday = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
      expect(formatRelativeCommentTime(yesterday)).toBe('Yesterday');

      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
      expect(formatRelativeCommentTime(fourDaysAgo)).toBe('4d ago');
    });

    it('formats older timestamps with month and day', () => {
      const date = new Date(2025, 0, 15).toISOString(); // Jan 15, 2025
      const formatted = formatRelativeCommentTime(date);
      expect(formatted).toMatch(/Jan\s+15/);
    });
  });

  describe('getUserInitials', () => {
    it('extracts two-letter initials from first and last name', () => {
      expect(getUserInitials('Jane Doe', 'jane@family.com')).toBe('JD');
      expect(getUserInitials('Alice Wonderland')).toBe('AW');
    });

    it('extracts first and last initials for multi-word names', () => {
      expect(getUserInitials('Mary Ann Smith')).toBe('MS');
    });

    it('extracts up to two letters for single word names', () => {
      expect(getUserInitials('Grandpa')).toBe('GR');
      expect(getUserInitials('A')).toBe('A');
    });

    it('falls back to email prefix when full name is missing', () => {
      expect(getUserInitials('', 'charlie@family.com')).toBe('CH');
      expect(getUserInitials(null, 'bob@example.com')).toBe('BO');
    });

    it('falls back to default initial when both name and email are empty', () => {
      expect(getUserInitials('', '')).toBe('U');
      expect(getUserInitials(null, null)).toBe('U');
    });
  });
});
