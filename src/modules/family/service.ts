import { createAdminClient } from '@/lib/supabase/server';
import { Book } from '@/modules/library/types';
import { verifyBookAccess } from '@/modules/reader/access';
import {
  Family,
  FamilyMember,
  FamilyRole,
  UserFamilyContext,
  BookRequest,
} from './types';
import { generateFamilyCode, normalizeFamilyCode } from './utils';

function mapDbBookToDomain(row: Record<string, unknown>): Book {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id || ''),
    title: String(row.title),
    author: row.author ? String(row.author) : null,
    description: row.description ? String(row.description) : null,
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    storagePath: row.storage_path ? String(row.storage_path) : null,
    fileSize: typeof row.file_size === 'number' ? row.file_size : null,
    format: String(row.format || 'epub'),
    processingStatus: String(row.processing_status || 'ready'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDbFamily(row: Record<string, unknown>, memberCount?: number): Family {
  return {
    id: String(row.id),
    familyCode: String(row.family_code),
    name: String(row.name),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    memberCount,
  };
}

/**
 * Resolves the active family for a user, if they have joined one.
 */
export async function getUserFamily(userId: string): Promise<UserFamilyContext | null> {
  const admin = createAdminClient();

  // Find family membership for user
  const { data: memberRow } = await admin
    .from('family_members')
    .select('family_id, role, joined_at, families(*)')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (!memberRow || !memberRow.families) {
    return null;
  }

  const rawFamily = Array.isArray(memberRow.families)
    ? memberRow.families[0]
    : memberRow.families;

  const familyId = String(memberRow.family_id);
  const role = memberRow.role as FamilyRole;

  // Retrieve members of the family
  const members = await getFamilyMembers(familyId);
  const family = mapDbFamily(rawFamily as Record<string, unknown>, members.length);

  return {
    family,
    memberRole: role,
    members,
  };
}

/**
 * Look up family by its unique human-friendly family code (e.g. FAM-7K9P).
 */
export async function getFamilyByCode(familyCode: string): Promise<Family | null> {
  const admin = createAdminClient();
  const normalized = normalizeFamilyCode(familyCode);

  const { data, error } = await admin
    .from('families')
    .select('*')
    .eq('family_code', normalized)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDbFamily(data);
}

/**
 * Retrieves members of a specific family space with user metadata.
 */
export async function getFamilyMembers(familyId: string): Promise<FamilyMember[]> {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from('family_members')
    .select('*')
    .eq('family_id', familyId)
    .order('joined_at', { ascending: true });

  if (error || !rows) {
    return [];
  }

  const userIds = rows.map((r) => String(r.user_id));
  const userMap = new Map<string, { name?: string; email?: string; avatarUrl?: string }>();

  try {
    const { data: usersData } = await admin.auth.admin.listUsers();
    if (usersData?.users) {
      for (const u of usersData.users) {
        if (userIds.includes(u.id)) {
          userMap.set(u.id, {
            name: u.user_metadata?.full_name || u.email?.split('@')[0],
            email: u.email,
            avatarUrl: u.user_metadata?.avatar_url,
          });
        }
      }
    }
  } catch {
    // Fallback if listUsers has permission limitations
  }

  return rows.map((r) => {
    const uInfo = userMap.get(String(r.user_id));
    return {
      familyId: String(r.family_id),
      userId: String(r.user_id),
      role: r.role as FamilyRole,
      joinedAt: String(r.joined_at),
      userName: uInfo?.name || 'Reader',
      userEmail: uInfo?.email,
      avatarUrl: uInfo?.avatarUrl,
    };
  });
}

/**
 * Retrieves the curated bookshelf of books featured in a family space.
 */
export async function getFamilyBookshelf(familyId: string): Promise<Book[]> {
  const admin = createAdminClient();

  const { data: familyBookRows, error } = await admin
    .from('family_books')
    .select('book_id, added_at, books(*)')
    .eq('family_id', familyId)
    .order('added_at', { ascending: false });

  if (error || !familyBookRows) {
    return [];
  }

  const books: Book[] = [];
  for (const row of familyBookRows) {
    const rawBook = Array.isArray(row.books) ? row.books[0] : row.books;
    if (rawBook && rawBook.id) {
      books.push(mapDbBookToDomain(rawBook as Record<string, unknown>));
    }
  }

  return books;
}

/**
 * Creates a new family, assigns creator as Admin, and generates unique family code.
 */
export async function createFamily(userId: string, name: string): Promise<Family> {
  const admin = createAdminClient();
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Family name cannot be empty.');
  }

  // Ensure unique code generation
  let familyCode = generateFamilyCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await admin
      .from('families')
      .select('id')
      .eq('family_code', familyCode)
      .maybeSingle();

    if (!existing) break;
    familyCode = generateFamilyCode();
    attempts++;
  }

  // 1. Insert Family
  const { data: familyData, error: familyError } = await admin
    .from('families')
    .insert({
      family_code: familyCode,
      name: trimmedName,
      created_by: userId,
    })
    .select('*')
    .single();

  if (familyError || !familyData) {
    throw new Error(`Failed to create family: ${familyError?.message}`);
  }

  // 2. Insert creator as Admin in family_members
  const { error: memberError } = await admin
    .from('family_members')
    .insert({
      family_id: familyData.id,
      user_id: userId,
      role: 'admin',
    });

  if (memberError) {
    throw new Error(`Failed to assign family administrator: ${memberError.message}`);
  }

  return mapDbFamily(familyData, 1);
}

/**
 * Joins a family space using a valid human-friendly family code.
 */
export async function joinFamily(userId: string, familyCode: string): Promise<Family> {
  const admin = createAdminClient();
  const normalized = normalizeFamilyCode(familyCode);

  const family = await getFamilyByCode(normalized);
  if (!family) {
    throw new Error(`Không tìm thấy gia đình với mã "${normalized}". Vui lòng kiểm tra lại.`);
  }

  // Check if user is already a member
  const { data: existingMember } = await admin
    .from('family_members')
    .select('role')
    .eq('family_id', family.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMember) {
    return family;
  }

  // Add user as Reader
  const { error: joinError } = await admin
    .from('family_members')
    .insert({
      family_id: family.id,
      user_id: userId,
      role: 'reader',
    });

  if (joinError) {
    throw new Error(`Failed to join family: ${joinError.message}`);
  }

  return family;
}

/**
 * User leaves a family space.
 * Enforces the last-admin invariant: a sole admin cannot abandon a family if other members remain.
 * If the sole member leaves, cleans up the orphaned family record.
 */
export async function leaveFamily(userId: string, familyId: string): Promise<void> {
  const admin = createAdminClient();

  // 1. Fetch current member record
  const { data: member } = await admin
    .from('family_members')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member) {
    return;
  }

  // 2. If user is an admin, check family composition
  if (member.role === 'admin') {
    const { data: members } = await admin
      .from('family_members')
      .select('user_id, role')
      .eq('family_id', familyId);

    const allMembers = members || [];
    const adminCount = allMembers.filter((m) => m.role === 'admin').length;

    if (adminCount <= 1 && allMembers.length > 1) {
      throw new Error(
        'Bạn là Quản trị viên duy nhất. Vui lòng chỉ định Quản trị viên khác trước khi rời gia đình.'
      );
    }

    // If the sole member leaves, remove membership and clean up family
    if (allMembers.length <= 1) {
      await admin
        .from('family_members')
        .delete()
        .eq('family_id', familyId)
        .eq('user_id', userId);

      await admin.from('families').delete().eq('id', familyId);
      return;
    }
  }

  const { error } = await admin
    .from('family_members')
    .delete()
    .eq('family_id', familyId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to leave family: ${error.message}`);
  }
}

/**
 * Family Admin updates member role (e.g. promoting reader to moderator or vice versa).
 * Enforces the last-admin invariant: cannot demote the sole admin in the family.
 */
export async function updateMemberRole(
  familyId: string,
  targetUserId: string,
  newRole: FamilyRole
): Promise<void> {
  const admin = createAdminClient();

  // 1. Verify target membership
  const { data: targetMember } = await admin
    .from('family_members')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetMember) {
    throw new Error('Thành viên không tồn tại trong gia đình.');
  }

  // 2. Prevent demoting the only remaining admin
  if (targetMember.role === 'admin' && newRole !== 'admin') {
    const { data: adminRows } = await admin
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId)
      .eq('role', 'admin');

    if (adminRows && adminRows.length <= 1) {
      throw new Error(
        'Không thể hạ quyền Quản trị viên duy nhất của gia đình. Gia đình phải có ít nhất một Quản trị viên.'
      );
    }
  }

  const { error } = await admin
    .from('family_members')
    .update({ role: newRole })
    .eq('family_id', familyId)
    .eq('user_id', targetUserId);

  if (error) {
    throw new Error(`Failed to update member role: ${error.message}`);
  }
}

/**
 * Family Admin removes a member from the family space.
 * Enforces the last-admin invariant: cannot remove the sole admin in the family.
 */
export async function removeFamilyMember(
  familyId: string,
  targetUserId: string
): Promise<void> {
  const admin = createAdminClient();

  // 1. Verify target membership
  const { data: targetMember } = await admin
    .from('family_members')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetMember) {
    throw new Error('Thành viên không tồn tại trong gia đình.');
  }

  // 2. Prevent removing the only remaining admin
  if (targetMember.role === 'admin') {
    const { data: adminRows } = await admin
      .from('family_members')
      .select('user_id')
      .eq('family_id', familyId)
      .eq('role', 'admin');

    if (adminRows && adminRows.length <= 1) {
      throw new Error(
        'Không thể xóa Quản trị viên duy nhất của gia đình. Vui lòng chỉ định Quản trị viên mới trước khi xóa.'
      );
    }
  }

  const { error } = await admin
    .from('family_members')
    .delete()
    .eq('family_id', familyId)
    .eq('user_id', targetUserId);

  if (error) {
    throw new Error(`Failed to remove member: ${error.message}`);
  }
}

/**
 * Adds an existing book from the central catalog to the Family Bookshelf.
 * Enforces member curation permissions and verified sharing entitlements.
 */
export async function addBookToFamilyBookshelf(
  familyId: string,
  bookId: string,
  addedBy: string,
  userEmail?: string | null
): Promise<void> {
  const admin = createAdminClient();

  // 1. Verify that addedBy is an active family member with admin or moderator role
  const { data: member } = await admin
    .from('family_members')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', addedBy)
    .maybeSingle();

  if (!member || !['admin', 'moderator'].includes(member.role)) {
    throw new Error('Chỉ Quản trị viên (Admin) hoặc Điều hành viên (Moderator) mới có quyền thêm sách vào tủ sách gia đình.');
  }

  // 2. Verify book access and shareability.
  // In accordance with product rules, only explicitly published books can be added to a family bookshelf.
  const bookAccess = await verifyBookAccess(addedBy, userEmail, bookId);
  if (!bookAccess.authorized || !bookAccess.book) {
    throw new Error('Bạn không có quyền truy cập cuốn sách này.');
  }

  if (!bookAccess.canShare || !bookAccess.book.isPublic) {
    throw new Error(
      'Chỉ sách đã xuất bản (công khai) mới có thể được thêm vào tủ sách gia đình. Sách riêng tư hoặc chưa xuất bản không được phép chia sẻ.'
    );
  }

  const { error } = await admin
    .from('family_books')
    .insert({
      family_id: familyId,
      book_id: bookId,
      added_by: addedBy,
    });

  if (error && error.code !== '23505') {
    // 23505 is unique_violation (already on bookshelf)
    throw new Error(`Failed to add book to family bookshelf: ${error.message}`);
  }
}

/**
 * Removes a book from the Family Bookshelf.
 */
export async function removeBookFromFamilyBookshelf(
  familyId: string,
  bookId: string
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('family_books')
    .delete()
    .eq('family_id', familyId)
    .eq('book_id', bookId);

  if (error) {
    throw new Error(`Failed to remove book from family bookshelf: ${error.message}`);
  }
}

/**
 * Submits a new book request to public.book_requests.
 */
export async function createBookRequest(
  userId: string,
  title: string,
  author?: string,
  note?: string
): Promise<BookRequest> {
  const admin = createAdminClient();
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Tiêu đề sách không được để trống.');
  }

  const { data, error } = await admin
    .from('book_requests')
    .insert({
      user_id: userId,
      title: trimmedTitle,
      author: author?.trim() || null,
      note: note?.trim() || null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to submit book request: ${error?.message}`);
  }

  return {
    id: String(data.id),
    userId: String(data.user_id),
    title: String(data.title),
    author: data.author ? String(data.author) : null,
    note: data.note ? String(data.note) : null,
    status: data.status as 'pending' | 'approved' | 'rejected',
    createdAt: String(data.created_at),
  };
}

/**
 * Retrieves book requests submitted by a user.
 */
export async function getUserBookRequests(userId: string): Promise<BookRequest[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('book_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((d) => ({
    id: String(d.id),
    userId: String(d.user_id),
    title: String(d.title),
    author: d.author ? String(d.author) : null,
    note: d.note ? String(d.note) : null,
    status: d.status as 'pending' | 'approved' | 'rejected',
    createdAt: String(d.created_at),
  }));
}
