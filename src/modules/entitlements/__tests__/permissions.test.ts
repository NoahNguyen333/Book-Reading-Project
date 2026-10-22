import { describe, it, expect } from 'vitest';
import {
  hasTenantRole,
  canUploadBooks,
  canManageRoom,
  canReadBooks,
} from '../permissions';
import { TenantRole } from '../types';

describe('Entitlements and Permissions', () => {
  describe('hasTenantRole', () => {
    it('returns true when user has the exact required role', () => {
      expect(hasTenantRole('admin', 'admin')).toBe(true);
      expect(hasTenantRole('reader', 'reader')).toBe(true);
    });

    it('returns true when user has a higher role than required', () => {
      expect(hasTenantRole('admin', 'reader')).toBe(true);
    });

    it('returns false when user has a lower role than required', () => {
      expect(hasTenantRole('reader', 'admin')).toBe(false);
    });

    it('returns false when user role is null, undefined, or invalid', () => {
      expect(hasTenantRole(null, 'reader')).toBe(false);
      expect(hasTenantRole(undefined, 'admin')).toBe(false);
      expect(hasTenantRole('invalid' as unknown as TenantRole, 'reader')).toBe(false);
    });
  });

  describe('canUploadBooks', () => {
    it('allows admin to upload books', () => {
      expect(canUploadBooks('admin')).toBe(true);
    });

    it('denies reader from uploading books', () => {
      expect(canUploadBooks('reader')).toBe(false);
    });

    it('denies unauthenticated or null roles', () => {
      expect(canUploadBooks(null)).toBe(false);
      expect(canUploadBooks(undefined)).toBe(false);
    });
  });

  describe('canManageRoom', () => {
    it('allows admin to manage reading rooms', () => {
      expect(canManageRoom('admin')).toBe(true);
    });

    it('denies reader from managing reading rooms', () => {
      expect(canManageRoom('reader')).toBe(false);
    });

    it('denies unauthenticated or null roles', () => {
      expect(canManageRoom(null)).toBe(false);
      expect(canManageRoom(undefined)).toBe(false);
    });
  });

  describe('canReadBooks', () => {
    it('allows reader to read books', () => {
      expect(canReadBooks('reader')).toBe(true);
    });

    it('allows admin to read books', () => {
      expect(canReadBooks('admin')).toBe(true);
    });

    it('denies unauthenticated or null roles', () => {
      expect(canReadBooks(null)).toBe(false);
      expect(canReadBooks(undefined)).toBe(false);
    });
  });
});
