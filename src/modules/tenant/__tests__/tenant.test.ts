import { describe, it, expect } from 'vitest';
import {
  resolveActiveMembership,
  findTenantRole,
  formatDefaultTenantName,
} from '../helpers';
import { UserTenantMembership } from '../types';
import { canUploadBooks, canManageRoom, canReadBooks } from '@/modules/entitlements';

describe('Tenant Helpers & Resolution', () => {
  const mockMemberships: UserTenantMembership[] = [
    {
      role: 'admin',
      tenant: {
        id: 'tenant-admin-1',
        name: 'The Parent Space',
        planTier: 'free',
        limits: {},
        createdAt: '2026-10-22T00:00:00Z',
      },
    },
    {
      role: 'reader',
      tenant: {
        id: 'tenant-reader-2',
        name: 'Grandparents Library',
        planTier: 'family_plus',
        limits: {},
        createdAt: '2026-10-22T01:00:00Z',
      },
    },
  ];

  describe('resolveActiveMembership', () => {
    it('returns null when memberships array is empty or null', () => {
      expect(resolveActiveMembership([])).toBeNull();
      expect(resolveActiveMembership([] as unknown as UserTenantMembership[], 'tenant-admin-1')).toBeNull();
    });

    it('resolves the specifically requested tenant ID if present', () => {
      const result = resolveActiveMembership(mockMemberships, 'tenant-reader-2');
      expect(result).not.toBeNull();
      expect(result?.tenant.id).toBe('tenant-reader-2');
      expect(result?.role).toBe('reader');
    });

    it('defaults to the first membership if requested tenant ID is not found', () => {
      const result = resolveActiveMembership(mockMemberships, 'unknown-tenant-id');
      expect(result).not.toBeNull();
      expect(result?.tenant.id).toBe('tenant-admin-1');
      expect(result?.role).toBe('admin');
    });

    it('defaults to the first membership if no tenant ID is requested', () => {
      const result = resolveActiveMembership(mockMemberships, null);
      expect(result).not.toBeNull();
      expect(result?.tenant.id).toBe('tenant-admin-1');
    });
  });

  describe('findTenantRole', () => {
    it('returns the user role for the specified tenant', () => {
      expect(findTenantRole(mockMemberships, 'tenant-admin-1')).toBe('admin');
      expect(findTenantRole(mockMemberships, 'tenant-reader-2')).toBe('reader');
    });

    it('returns null if the user is not a member of the tenant', () => {
      expect(findTenantRole(mockMemberships, 'unaffiliated-tenant')).toBeNull();
    });
  });

  describe('formatDefaultTenantName', () => {
    it('formats an email address into a personalized family space name', () => {
      expect(formatDefaultTenantName('jane.doe@example.com')).toBe("Jane.doe's Family");
      expect(formatDefaultTenantName('sarah@domain.org')).toBe("Sarah's Family");
    });

    it('formats a regular name string into a family space name', () => {
      expect(formatDefaultTenantName('Johnson')).toBe("Johnson's Family");
    });

    it('falls back to default family space name for empty or whitespace values', () => {
      expect(formatDefaultTenantName(null)).toBe('My Family Space');
      expect(formatDefaultTenantName(undefined)).toBe('My Family Space');
      expect(formatDefaultTenantName('')).toBe('My Family Space');
      expect(formatDefaultTenantName('   ')).toBe('My Family Space');
    });
  });

  describe('Tenant Role & Entitlement Integration', () => {
    it('grants admin capabilities when active membership is admin', () => {
      const active = resolveActiveMembership(mockMemberships, 'tenant-admin-1');
      expect(active?.role).toBe('admin');
      expect(canUploadBooks(active?.role)).toBe(true);
      expect(canManageRoom(active?.role)).toBe(true);
      expect(canReadBooks(active?.role)).toBe(true);
    });

    it('restricts reader capabilities when active membership is reader', () => {
      const active = resolveActiveMembership(mockMemberships, 'tenant-reader-2');
      expect(active?.role).toBe('reader');
      expect(canUploadBooks(active?.role)).toBe(false);
      expect(canManageRoom(active?.role)).toBe(false);
      expect(canReadBooks(active?.role)).toBe(true);
    });
  });
});
