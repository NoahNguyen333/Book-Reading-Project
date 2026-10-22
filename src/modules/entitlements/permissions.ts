import { TenantRole } from './types';

/**
 * Role hierarchy levels for comparison.
 * Higher number indicates greater privilege.
 */
const ROLE_HIERARCHY: Record<TenantRole, number> = {
  reader: 1,
  admin: 2,
};

/**
 * Checks whether userRole meets or exceeds requiredRole in the hierarchy.
 * Returns false if userRole is undefined or invalid.
 */
export function hasTenantRole(userRole: TenantRole | null | undefined, requiredRole: TenantRole): boolean {
  if (!userRole || !(userRole in ROLE_HIERARCHY)) {
    return false;
  }
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Checks if a given tenant role is allowed to upload books.
 * Only 'admin' role is permitted.
 */
export function canUploadBooks(role: TenantRole | null | undefined): boolean {
  return hasTenantRole(role, 'admin');
}

/**
 * Checks if a given tenant role is allowed to manage reading rooms.
 * Only 'admin' role is permitted to create/update room state and manage active books.
 */
export function canManageRoom(role: TenantRole | null | undefined): boolean {
  return hasTenantRole(role, 'admin');
}

/**
 * Checks if a given tenant role can access/read books and participate in reading rooms.
 * Both 'admin' and 'reader' roles are permitted.
 */
export function canReadBooks(role: TenantRole | null | undefined): boolean {
  return hasTenantRole(role, 'reader');
}
