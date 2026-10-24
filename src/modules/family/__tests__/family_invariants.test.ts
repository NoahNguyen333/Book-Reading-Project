import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateMemberRole, removeFamilyMember, leaveFamily } from '../service';
import { isPlatformSuperAdmin } from '@/modules/auth';

// Mock Supabase Server Admin Client
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/server';

type AdminClientMock = ReturnType<typeof createAdminClient>;

interface QueryChainMock extends Promise<{ data: Array<{ user_id: string; role?: string }> }> {
  eq: ReturnType<typeof vi.fn>;
}

describe('Family Role & Last-Admin Invariant Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateMemberRole', () => {
    it('throws error when attempting to demote the sole remaining admin', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation((col: string, val: string) => {
                    if (col === 'role' && val === 'admin') {
                      // Only 1 admin in family
                      return Promise.resolve({ data: [{ user_id: 'admin-1' }] });
                    }
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { role: 'admin' },
                      }),
                    };
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      await expect(
        updateMemberRole('family-1', 'admin-1', 'reader')
      ).rejects.toThrow('Không thể hạ quyền Quản trị viên duy nhất của gia đình');
    });

    it('allows demoting an admin if another admin remains', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation((col: string, val: string) => {
                    if (col === 'role' && val === 'admin') {
                      // 2 admins exist
                      return Promise.resolve({
                        data: [{ user_id: 'admin-1' }, { user_id: 'admin-2' }],
                      });
                    }
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { role: 'admin' },
                      }),
                    };
                  }),
                }),
              }),
              update: mockUpdate,
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      await expect(
        updateMemberRole('family-1', 'admin-1', 'moderator')
      ).resolves.not.toThrow();

      expect(mockUpdate).toHaveBeenCalledWith({ role: 'moderator' });
    });

    it('allows promoting a reader to moderator or admin without restriction', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'reader' },
                    }),
                  }),
                }),
              }),
              update: mockUpdate,
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      await expect(
        updateMemberRole('family-1', 'reader-1', 'admin')
      ).resolves.not.toThrow();
    });
  });

  describe('removeFamilyMember', () => {
    it('throws error when attempting to remove the sole remaining admin', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation((col: string, val: string) => {
                    if (col === 'role' && val === 'admin') {
                      return Promise.resolve({ data: [{ user_id: 'admin-1' }] });
                    }
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { role: 'admin' },
                      }),
                    };
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      await expect(
        removeFamilyMember('family-1', 'admin-1')
      ).rejects.toThrow('Không thể xóa Quản trị viên duy nhất của gia đình');
    });

    it('allows removing a non-admin reader', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'reader' },
                    }),
                  }),
                }),
              }),
              delete: mockDelete,
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      await expect(
        removeFamilyMember('family-1', 'reader-user')
      ).resolves.not.toThrow();

      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('leaveFamily', () => {
    it('throws error when sole admin attempts to leave while other members remain', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string) => {
                  if (col === 'family_id') {
                    const familyQuery = Promise.resolve({
                      data: [
                        { user_id: 'admin-1', role: 'admin' },
                        { user_id: 'reader-2', role: 'reader' },
                      ],
                    }) as unknown as QueryChainMock;
                    familyQuery.eq = vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { role: 'admin' },
                      }),
                    });
                    return familyQuery;
                  }
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'admin' },
                    }),
                  };
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      await expect(
        leaveFamily('admin-1', 'family-1')
      ).rejects.toThrow('Bạn là Quản trị viên duy nhất');
    });

    it('cleans up family when the sole member departs', async () => {
      const mockDeleteMembers = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });
      const mockDeleteFamilies = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string) => {
                  if (col === 'family_id') {
                    const familyQuery = Promise.resolve({
                      data: [{ user_id: 'admin-1', role: 'admin' }],
                    }) as unknown as QueryChainMock;
                    familyQuery.eq = vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { role: 'admin' },
                      }),
                    });
                    return familyQuery;
                  }
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'admin' },
                    }),
                  };
                }),
              }),
              delete: mockDeleteMembers,
            };
          }
          if (table === 'families') {
            return {
              delete: mockDeleteFamilies,
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      await expect(
        leaveFamily('admin-1', 'family-1')
      ).resolves.not.toThrow();

      expect(mockDeleteFamilies).toHaveBeenCalled();
    });
  });

  describe('isPlatformSuperAdmin configuration checks', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns true when email matches server-only SUPER_ADMIN_EMAIL', async () => {
      process.env.SUPER_ADMIN_EMAIL = 'serveradmin@domain.com';
      delete process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;

      expect(await isPlatformSuperAdmin('serveradmin@domain.com')).toBe(true);
      expect(await isPlatformSuperAdmin('SERVERADMIN@DOMAIN.COM')).toBe(true);
      expect(await isPlatformSuperAdmin('other@domain.com')).toBe(false);
    });

    it('returns true when falling back to NEXT_PUBLIC_SUPER_ADMIN_EMAIL', async () => {
      delete process.env.SUPER_ADMIN_EMAIL;
      process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL = 'publicadmin@domain.com';

      expect(await isPlatformSuperAdmin('publicadmin@domain.com')).toBe(true);
      expect(await isPlatformSuperAdmin('other@domain.com')).toBe(false);
    });

    it('returns false when no admin email is configured or email is undefined', async () => {
      delete process.env.SUPER_ADMIN_EMAIL;
      delete process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;

      expect(await isPlatformSuperAdmin('admin@domain.com')).toBe(false);
      expect(await isPlatformSuperAdmin(null)).toBe(false);
      expect(await isPlatformSuperAdmin(undefined)).toBe(false);
    });
  });
});
