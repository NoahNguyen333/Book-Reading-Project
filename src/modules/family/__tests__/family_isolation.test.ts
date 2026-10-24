import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getUserFamily,
  getFamilyByCode,
  createFamily,
  joinFamily,
  addBookToFamilyBookshelf,
} from '../service';
import { verifyBookAccess } from '@/modules/reader/access';

// Mock Supabase server clients
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@/modules/reader/access', () => ({
  verifyBookAccess: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/server';

type AdminClientMock = ReturnType<typeof createAdminClient>;

describe('Family Isolation & Code Lookup Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserFamily isolation', () => {
    it('returns null if the user does not belong to any family', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      const result = await getUserFamily('unaffiliated-user');
      expect(result).toBeNull();
    });

    it('returns only the user\'s own family context and members', async () => {
      const familyId = 'family-alpha-uuid';
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockImplementation((columns: string) => {
                if (columns.includes('families(*)')) {
                  return {
                    eq: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                          data: {
                            family_id: familyId,
                            role: 'admin',
                            joined_at: '2026-10-24T00:00:00Z',
                            families: {
                              id: familyId,
                              family_code: 'FAM-ALPHA',
                              name: 'Gia đình Alpha',
                              created_by: 'user-admin',
                              created_at: '2026-10-24T00:00:00Z',
                            },
                          },
                          error: null,
                        }),
                      }),
                    }),
                  };
                }
                // Members list query
                return {
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [
                        {
                          family_id: familyId,
                          user_id: 'user-admin',
                          role: 'admin',
                          joined_at: '2026-10-24T00:00:00Z',
                        },
                      ],
                      error: null,
                    }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: {
                users: [
                  {
                    id: 'user-admin',
                    email: 'admin@alpha.family',
                    user_metadata: { full_name: 'Alpha Admin' },
                  },
                ],
              },
            }),
          },
        },
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      const result = await getUserFamily('user-admin');
      expect(result).not.toBeNull();
      expect(result?.family.id).toBe(familyId);
      expect(result?.family.name).toBe('Gia đình Alpha');
      expect(result?.memberRole).toBe('admin');
      expect(result?.members).toHaveLength(1);
    });
  });

  describe('getFamilyByCode safe lookup', () => {
    it('retrieves family by exact normalized code via trusted admin client', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'families') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string, val: string) => {
                  expect(col).toBe('family_code');
                  expect(val).toBe('FAM-7K9P'); // Normalized uppercase
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'fam-1',
                        family_code: 'FAM-7K9P',
                        name: 'Nhà Mai An',
                        created_by: 'creator-1',
                        created_at: '2026-10-24T00:00:00Z',
                      },
                      error: null,
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

      const family = await getFamilyByCode('  fam-7k9p  ');
      expect(family).not.toBeNull();
      expect(family?.name).toBe('Nhà Mai An');
      expect(family?.familyCode).toBe('FAM-7K9P');
    });

    it('returns null and does not leak family details when code does not exist', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'families') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Not found' },
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      const family = await getFamilyByCode('NON-EXISTENT');
      expect(family).toBeNull();
    });
  });

  describe('joinFamily by code workflow', () => {
    it('safely adds user as reader when a valid family code is supplied', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'families') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'fam-target',
                      family_code: 'FAM-JOIN',
                      name: 'Target Family',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              insert: mockInsert,
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      const joined = await joinFamily('new-user', 'FAM-JOIN');
      expect(joined.id).toBe('fam-target');
      expect(mockInsert).toHaveBeenCalledWith({
        family_id: 'fam-target',
        user_id: 'new-user',
        role: 'reader',
      });
    });

    it('rejects joining when family code is invalid without disclosing other family codes', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'families') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      await expect(joinFamily('attacker', 'FAM-INVALID')).rejects.toThrow(
        'Không tìm thấy gia đình với mã "FAM-INVALID"'
      );
    });
  });

  describe('createFamily isolation & admin assignment', () => {
    it('creates new family and assigns creator as Admin', async () => {
      const mockMemberInsert = vi.fn().mockResolvedValue({ error: null });

      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'families') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'new-fam-id',
                      family_code: 'FAM-NEW1',
                      name: 'Tổ ấm yêu thương',
                      created_by: 'creator-uuid',
                      created_at: '2026-10-24T00:00:00Z',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'family_members') {
            return {
              insert: mockMemberInsert,
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);

      const created = await createFamily('creator-uuid', 'Tổ ấm yêu thương');
      expect(created.id).toBe('new-fam-id');
      expect(created.name).toBe('Tổ ấm yêu thương');
      expect(mockMemberInsert).toHaveBeenCalledWith({
        family_id: 'new-fam-id',
        user_id: 'creator-uuid',
        role: 'admin',
      });
    });

    it('rejects empty family name', async () => {
      await expect(createFamily('creator-uuid', '   ')).rejects.toThrow(
        'Family name cannot be empty.'
      );
    });
  });

  describe('direct service addBookToFamilyBookshelf authorization verification', () => {
    it('throws error if direct caller is not a family admin or moderator', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'reader' }, // Reader cannot curate
                      error: null,
                    }),
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
        addBookToFamilyBookshelf('fam-1', 'book-1', 'reader-user')
      ).rejects.toThrow('Chỉ Quản trị viên (Admin) hoặc Điều hành viên (Moderator) mới có quyền');
    });

    it('throws error if direct caller is not authorized to access the book', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'admin' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: false,
        statusCode: 403,
      });

      await expect(
        addBookToFamilyBookshelf('fam-1', 'book-secret', 'admin-user')
      ).rejects.toThrow('Bạn không có quyền truy cập cuốn sách này.');
    });

    it('throws error if book is accessible for reading but canShare is false (onward sharing block)', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'admin' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: true,
        canShare: false,
        accessSource: 'family',
        book: {
          id: 'book-other-fam',
          title: 'Private Book from Another Family',
          tenantId: 'other-tenant',
          isPublic: false,
          coverUrl: null,
          storagePath: null,
          author: null,
        },
      });

      await expect(
        addBookToFamilyBookshelf('fam-1', 'book-other-fam', 'admin-user')
      ).rejects.toThrow('Chỉ sách đã xuất bản');
    });

    it('throws error if private tenant book is attempted to be shared by tenant reader (canShare: false)', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'admin' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: true,
        canShare: false,
        accessSource: 'tenant',
        book: {
          id: 'tenant-private-book',
          title: 'Tenant Confidential Book',
          tenantId: 'org-tenant',
          isPublic: false,
          coverUrl: null,
          storagePath: null,
          author: null,
        },
      });

      await expect(
        addBookToFamilyBookshelf('fam-1', 'tenant-private-book', 'admin-user')
      ).rejects.toThrow('Chỉ sách đã xuất bản');
    });

    it('inserts book into family_books when member has curator role and canShare is true', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'moderator' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'family_books') {
            return {
              insert: mockInsert,
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: true,
        canShare: true,
        accessSource: 'public',
        book: {
          id: 'public-book-1',
          title: 'Public Book',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: null,
          storagePath: null,
          author: null,
        },
      });

      await expect(
        addBookToFamilyBookshelf('fam-1', 'public-book-1', 'moderator-user')
      ).resolves.not.toThrow();

      expect(mockInsert).toHaveBeenCalledWith({
        family_id: 'fam-1',
        book_id: 'public-book-1',
        added_by: 'moderator-user',
      });
    });

    it('strictly rejects private book sharing even when curator is a Platform Super Admin', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'family_members') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { role: 'admin' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'family_books') {
            return {
              insert: mockInsert,
            };
          }
          return {};
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as AdminClientMock);
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: true,
        canShare: false,
        accessSource: 'super_admin',
        book: {
          id: 'any-private-book',
          title: 'Private Book',
          tenantId: 'some-tenant',
          isPublic: false,
          coverUrl: null,
          storagePath: null,
          author: null,
        },
      });

      await expect(
        addBookToFamilyBookshelf('fam-1', 'any-private-book', 'superadmin-user', 'superadmin@internal.com')
      ).rejects.toThrow('Chỉ sách đã xuất bản');

      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
