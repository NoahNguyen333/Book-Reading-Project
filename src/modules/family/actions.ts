'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/auth';
import { verifyBookAccess } from '@/modules/reader/access';
import {
  createFamily,
  joinFamily,
  leaveFamily,
  updateMemberRole,
  removeFamilyMember,
  addBookToFamilyBookshelf,
  removeBookFromFamilyBookshelf,
  createBookRequest,
  getUserFamily,
} from './service';
import { canManageFamilyBooks, canManageFamilyMembers } from './utils';
import { FamilyRole } from './types';

export interface FamilyActionResult<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
}

export async function createFamilyAction(name: string): Promise<FamilyActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Vui lòng đăng nhập để tạo gia đình.' };
    }

    const trimmed = name?.trim();
    if (!trimmed || trimmed.length > 100) {
      return { error: 'Tên gia đình phải từ 1 đến 100 ký tự.' };
    }

    const family = await createFamily(user.id, trimmed);
    revalidatePath('/family');
    revalidatePath('/dashboard');
    return { success: true, data: family };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi tạo gia đình' };
  }
}

export async function joinFamilyAction(familyCode: string): Promise<FamilyActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Vui lòng đăng nhập để tham gia gia đình.' };
    }

    const trimmed = familyCode?.trim();
    if (!trimmed || trimmed.length > 30) {
      return { error: 'Mã gia đình không hợp lệ.' };
    }

    const family = await joinFamily(user.id, trimmed);
    revalidatePath('/family');
    revalidatePath('/dashboard');
    return { success: true, data: family };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi tham gia gia đình' };
  }
}

export async function leaveFamilyAction(familyId: string): Promise<FamilyActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Vui lòng đăng nhập.' };
    }

    await leaveFamily(user.id, familyId);
    revalidatePath('/family');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi rời gia đình' };
  }
}

export async function updateMemberRoleAction(
  familyId: string,
  targetUserId: string,
  newRole: FamilyRole
): Promise<FamilyActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Vui lòng đăng nhập.' };
    }

    if (!['admin', 'moderator', 'reader'].includes(newRole)) {
      return { error: 'Vai trò thành viên không hợp lệ.' };
    }

    const familyContext = await getUserFamily(user.id);
    if (!familyContext || familyContext.family.id !== familyId) {
      return { error: 'Bạn không thuộc không gian gia đình này.' };
    }

    if (!canManageFamilyMembers(familyContext.memberRole)) {
      return { error: 'Chỉ Family Admin mới có quyền phân quyền thành viên.' };
    }

    await updateMemberRole(familyId, targetUserId, newRole);
    revalidatePath('/family');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi cập nhật quyền' };
  }
}

export async function removeFamilyMemberAction(
  familyId: string,
  targetUserId: string
): Promise<FamilyActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Vui lòng đăng nhập.' };
    }

    const familyContext = await getUserFamily(user.id);
    if (!familyContext || familyContext.family.id !== familyId) {
      return { error: 'Bạn không thuộc không gian gia đình này.' };
    }

    if (!canManageFamilyMembers(familyContext.memberRole)) {
      return { error: 'Chỉ Family Admin mới có quyền xóa thành viên.' };
    }

    await removeFamilyMember(familyId, targetUserId);
    revalidatePath('/family');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi xóa thành viên' };
  }
}

export async function addBookToFamilyBookshelfAction(
  familyId: string,
  bookId: string
): Promise<FamilyActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Vui lòng đăng nhập.' };
    }

    const familyContext = await getUserFamily(user.id);
    if (!familyContext || familyContext.family.id !== familyId) {
      return { error: 'Bạn không thuộc không gian gia đình này.' };
    }

    if (!canManageFamilyBooks(familyContext.memberRole)) {
      return { error: 'Chỉ Admin hoặc Moderator mới có quyền thêm sách vào tủ sách gia đình.' };
    }

    // Verify user has legitimate direct access to share the book.
    // In accordance with product rules, only explicitly published books can be added to a family bookshelf.
    const bookAccess = await verifyBookAccess(user.id, user.email, bookId);
    if (!bookAccess.authorized || !bookAccess.book) {
      return { error: 'Bạn không có quyền truy cập cuốn sách này.' };
    }

    if (!bookAccess.canShare || !bookAccess.book.isPublic) {
      return {
        error:
          'Chỉ sách đã xuất bản (công khai) mới có thể được thêm vào tủ sách gia đình. Sách riêng tư hoặc chưa xuất bản không được phép chia sẻ.',
      };
    }

    await addBookToFamilyBookshelf(familyId, bookId, user.id, user.email);
    revalidatePath('/family');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi thêm sách vào tủ gia đình' };
  }
}

export async function removeBookFromFamilyBookshelfAction(
  familyId: string,
  bookId: string
): Promise<FamilyActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Vui lòng đăng nhập.' };
    }

    const familyContext = await getUserFamily(user.id);
    if (!familyContext || familyContext.family.id !== familyId) {
      return { error: 'Bạn không thuộc không gian gia đình này.' };
    }

    if (!canManageFamilyBooks(familyContext.memberRole)) {
      return { error: 'Chỉ Admin hoặc Moderator mới có quyền quản lý tủ sách gia đình.' };
    }

    await removeBookFromFamilyBookshelf(familyId, bookId);
    revalidatePath('/family');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi gỡ sách khỏi tủ gia đình' };
  }
}

export async function createBookRequestAction(
  title: string,
  author?: string,
  note?: string
): Promise<FamilyActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Vui lòng đăng nhập để gửi yêu cầu sách.' };
    }

    const trimmedTitle = title?.trim();
    if (!trimmedTitle || trimmedTitle.length > 200) {
      return { error: 'Tiêu đề sách phải từ 1 đến 200 ký tự.' };
    }

    const trimmedAuthor = author?.trim();
    if (trimmedAuthor && trimmedAuthor.length > 200) {
      return { error: 'Tên tác giả không được vượt quá 200 ký tự.' };
    }

    const trimmedNote = note?.trim();
    if (trimmedNote && trimmedNote.length > 2000) {
      return { error: 'Ghi chú không được vượt quá 2000 ký tự.' };
    }

    const req = await createBookRequest(user.id, trimmedTitle, trimmedAuthor, trimmedNote);
    revalidatePath('/dashboard');
    return { success: true, data: req };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi gửi yêu cầu sách' };
  }
}
