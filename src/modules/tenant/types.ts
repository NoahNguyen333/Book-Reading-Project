import { TenantRole } from '@/modules/entitlements';

export interface Tenant {
  id: string;
  name: string;
  planTier: 'free' | 'family_plus' | 'enterprise' | string;
  limits: {
    maxBooks?: number;
    maxStorageBytes?: number;
    maxMembers?: number;
    [key: string]: unknown;
  };
  createdAt: string;
}

export interface TenantMember {
  tenantId: string;
  userId: string;
  role: TenantRole;
  createdAt: string;
}

export interface UserTenantMembership {
  tenant: Tenant;
  role: TenantRole;
}

export interface TenantContextValue {
  activeTenant: Tenant | null;
  activeRole: TenantRole | null;
  memberships: UserTenantMembership[];
  setActiveTenantId: (tenantId: string) => void;
  isLoading: boolean;
}
