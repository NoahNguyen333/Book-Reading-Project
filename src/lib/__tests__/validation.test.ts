import { describe, it, expect } from 'vitest';
import { isValidUuid, sanitizeText, isValidMeetingUrl } from '../validation';

describe('Shared Validation Utilities', () => {
  describe('isValidUuid', () => {
    it('accepts valid UUIDv4 strings', () => {
      expect(isValidUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
      expect(isValidUuid('A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11')).toBe(true);
    });

    it('rejects invalid or malformed UUID strings', () => {
      expect(isValidUuid('not-a-uuid')).toBe(false);
      expect(isValidUuid('../etc/passwd')).toBe(false);
      expect(isValidUuid('')).toBe(false);
      expect(isValidUuid(null)).toBe(false);
      expect(isValidUuid(undefined)).toBe(false);
      expect(isValidUuid('123e4567-e89b-12d3-a456-42661417400')).toBe(false); // short
      expect(isValidUuid('123e4567-e89b-12d3-a456-4266141740000')).toBe(false); // long
    });
  });

  describe('sanitizeText', () => {
    it('trims whitespace and returns cleaned string', () => {
      expect(sanitizeText('  hello world  ')).toBe('hello world');
    });

    it('enforces required strings', () => {
      expect(sanitizeText('', { required: true })).toBe(null);
      expect(sanitizeText('   ', { required: true })).toBe(null);
      expect(sanitizeText(null, { required: true })).toBe(null);
    });

    it('enforces min and max bounds', () => {
      expect(sanitizeText('abc', { min: 5 })).toBe(null);
      expect(sanitizeText('abcdef', { min: 3, max: 10 })).toBe('abcdef');
      expect(sanitizeText('this is way too long', { max: 10 })).toBe(null);
    });
  });

  describe('isValidMeetingUrl', () => {
    it('accepts secure HTTPS URLs', () => {
      expect(isValidMeetingUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
      expect(isValidMeetingUrl('https://zoom.us/j/123456789')).toBe(true);
      expect(isValidMeetingUrl('https://teams.microsoft.com/l/meetup-join/123')).toBe(true);
    });

    it('accepts HTTP only for localhost development', () => {
      expect(isValidMeetingUrl('http://localhost:3000/room/123')).toBe(true);
      expect(isValidMeetingUrl('http://127.0.0.1:8080')).toBe(true);
    });

    it('rejects insecure HTTP URLs in production hosts', () => {
      expect(isValidMeetingUrl('http://insecure-meeting.com/room')).toBe(false);
      expect(isValidMeetingUrl('http://example.com')).toBe(false);
    });

    it('rejects javascript: and other dangerous pseudo-protocols', () => {
      expect(isValidMeetingUrl('javascript:alert(1)')).toBe(false);
      expect(isValidMeetingUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isValidMeetingUrl('ftp://ftp.example.com')).toBe(false);
      expect(isValidMeetingUrl('not a url')).toBe(false);
    });
  });
});
