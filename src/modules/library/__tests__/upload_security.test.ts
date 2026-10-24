import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerUploadedBookAction, deleteBookAction } from '../actions';
import { getCurrentUser, isPlatformSuperAdmin } from '@/modules/auth';
import { getUserTenants } from '@/modules/tenant';
import { insertBook, deleteBook, logAuditEvent } from '../service';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/modules/auth', () => ({
  getCurrentUser: vi.fn(),
  isPlatformSuperAdmin: vi.fn(),
}));

vi.mock('@/modules/tenant', () => ({
  getUserTenants: vi.fn(),
  findTenantRole: vi.fn((memberships: Array<{ tenant: { id: string }; role: string }>, tenantId: string) => {
    const m = memberships.find((item) => item.tenant.id === tenantId);
    return m ? m.role : null;
  }),
}));

vi.mock('../service', () => ({
  insertBook: vi.fn(),
  deleteBook: vi.fn(),
  logAuditEvent: vi.fn(),
}));

describe('Library Security & Storage Path Boundary Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const tenantId = '11111111-2222-4333-8444-555555555555';
  const otherTenantId = '99999999-8888-4777-8666-555555555555';

  describe('registerUploadedBookAction', () => {
    it('rejects path traversal attempts in storagePath', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-1',
        email: 'admin@tenant.com',
      });
      vi.mocked(isPlatformSuperAdmin).mockResolvedValue(false);
      vi.mocked(getUserTenants).mockResolvedValue([
        { tenant: { id: tenantId, name: 'Tenant 1' }, role: 'admin' },
      ] as never);

      const res = await registerUploadedBookAction({
        tenantId,
        bookId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        title: 'Malicious Book',
        format: 'epub',
        storagePath: `${tenantId}/../../etc/passwd`,
        fileSize: 1024,
      });

      expect(res.error).toBe('Invalid storage path: must reside within the tenant directory.');
      expect(insertBook).not.toHaveBeenCalled();
    });

    it('rejects storagePath targeting another tenant folder', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-1',
        email: 'admin@tenant.com',
      });
      vi.mocked(isPlatformSuperAdmin).mockResolvedValue(false);
      vi.mocked(getUserTenants).mockResolvedValue([
        { tenant: { id: tenantId, name: 'Tenant 1' }, role: 'admin' },
      ] as never);

      const res = await registerUploadedBookAction({
        tenantId,
        bookId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        title: 'Cross Tenant Attempt',
        format: 'epub',
        storagePath: `${otherTenantId}/secret-book.epub`,
        fileSize: 1024,
      });

      expect(res.error).toBe('Invalid storage path: must reside within the tenant directory.');
      expect(insertBook).not.toHaveBeenCalled();
    });

    it('rejects non-admin tenant reader from registering books', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-reader',
        email: 'reader@tenant.com',
      });
      vi.mocked(isPlatformSuperAdmin).mockResolvedValue(false);
      vi.mocked(getUserTenants).mockResolvedValue([
        { tenant: { id: tenantId, name: 'Tenant 1' }, role: 'reader' },
      ] as never);

      const res = await registerUploadedBookAction({
        tenantId,
        bookId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        title: 'Reader Upload Attempt',
        format: 'epub',
        storagePath: `${tenantId}/book.epub`,
        fileSize: 1024,
      });

      expect(res.error).toContain('Access denied');
      expect(insertBook).not.toHaveBeenCalled();
    });

    it('permits Platform Super Admin even without tenant admin membership', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'super-admin-user',
        email: 'superadmin@platform.com',
      });
      vi.mocked(isPlatformSuperAdmin).mockResolvedValue(true);
      vi.mocked(getUserTenants).mockResolvedValue([]); // No direct tenant membership

      vi.mocked(insertBook).mockResolvedValue({
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        title: 'Platform Book',
      } as never);

      const res = await registerUploadedBookAction({
        tenantId,
        bookId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        title: 'Platform Managed Book',
        format: 'epub',
        storagePath: `${tenantId}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.epub`,
        fileSize: 2048,
      });

      expect(res.success).toBe(true);
      expect(insertBook).toHaveBeenCalled();
      expect(logAuditEvent).toHaveBeenCalled();
    });
  });

  describe('deleteBookAction', () => {
    it('validates UUID format for tenantId and bookId', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-1',
        email: 'admin@tenant.com',
      });

      const res = await deleteBookAction('invalid-tenant', 'not-a-uuid');
      expect(res.error).toBe('Invalid tenant or book identifier.');
      expect(deleteBook).not.toHaveBeenCalled();
    });
  });
});
