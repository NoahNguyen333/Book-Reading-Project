import { TenantRole } from '@/modules/entitlements';
import type { UserTenantMembership } from './types';

export const ACTIVE_TENANT_COOKIE = 'frr_active_tenant_id';

/**
 * Resolves the active tenant and role based on the requested tenant ID
 * or defaults to the first available membership.
 */
export function resolveActiveMembership(
  memberships: UserTenantMembership[],
  requestedTenantId?: string | null
): UserTenantMembership | null {
  if (!memberships || memberships.length === 0) {
    return null;
  }

  if (requestedTenantId) {
    const matched = memberships.find((m) => m.tenant.id === requestedTenantId);
    if (matched) {
      return matched;
    }
  }

  return memberships[0];
}

/**
 * Extracts the user's role for a specific tenant from their memberships list.
 */
export function findTenantRole(
  memberships: UserTenantMembership[],
  tenantId: string
): TenantRole | null {
  const found = memberships.find((m) => m.tenant.id === tenantId);
  return found ? found.role : null;
}

/**
 * Derives a default family space name from user email or name.
 */
export function formatDefaultTenantName(nameOrEmail?: string | null): string {
  if (!nameOrEmail || !nameOrEmail.trim()) {
    return 'My Family Space';
  }

  const cleaned = nameOrEmail.trim();
  if (cleaned.includes('@')) {
    const prefix = cleaned.split('@')[0];
    const capitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    return `${capitalized}'s Family`;
  }

  return `${cleaned}'s Family`;
}
