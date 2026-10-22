export type TenantRole = 'admin' | 'reader';

export interface UserSession {
  userId: string;
  tenantId: string;
  role: TenantRole;
}
