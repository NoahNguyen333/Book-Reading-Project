'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/auth';
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
    if (!trimmed) {
      return { error: 'Tên gia đình không được để trống.' };
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
    if (!trimmed) {
      return { error: 'Mã gia đình không được để trống.' };
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

    await addBookToFamilyBookshelf(familyId, bookId, user.id);
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
    if (!trimmedTitle) {
      return { error: 'Tiêu đề sách không được để trống.' };
    }

    const req = await createBookRequest(user.id, trimmedTitle, author, note);
    revalidatePath('/dashboard');
    return { success: true, data: req };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi gửi yêu cầu sách' };
  }
}
