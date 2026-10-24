'use server';

import { getCurrentUser } from '@/modules/auth';
import { verifyBookAccess } from '@/modules/reader/access';
import { upsertReadingProgress, createBookmark, removeBookmark } from './service';
import { createAdminClient } from '@/lib/supabase/server';
import { Bookmark } from './types';

export interface ReaderActionResult<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
}

/**
 * Validates authentication and server-side book access rights before generating
 * a short-lived (60-second) signed download URL to stream the EPUB or PDF binary.
 * Supports cross-tenant reading of public catalog books and family-shared books.
 */
export async function getAuthorizedBookDownloadUrl(
  bookId: string,
  tenantId?: string
): Promise<ReaderActionResult<{ signedUrl: string }>> {
  void tenantId;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required to access book.' };
    }

    const access = await verifyBookAccess(user.id, user.email, bookId);
    if (!access.authorized || !access.book) {
      return { error: access.error || 'Access denied: You do not have permission to download this book.' };
    }

    if (!access.book.storagePath) {
      return { error: 'Book file not found or storage path unassigned.' };
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from('books')
      .createSignedUrl(access.book.storagePath, 60);

    if (error || !data?.signedUrl) {
      return { error: `Failed to generate download token: ${error?.message || 'Error'}` };
    }

    return { success: true, data: { signedUrl: data.signedUrl } };
  } catch (err) {
    return {
      error: `Failed to authorize book download: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Persists the user's latest reading progress (CFI and percentage) after verifying book access.
 */
export async function saveReadingProgressAction(
  bookId: string,
  tenantId: string,
  cfi: string,
  percentage: number
): Promise<ReaderActionResult> {
  void tenantId;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const access = await verifyBookAccess(user.id, user.email, bookId);
    if (!access.authorized || !access.book) {
      return { error: access.error || 'Access denied: You do not have permission to access this book.' };
    }

    const cleanCfi = cfi?.trim();
    if (!cleanCfi || cleanCfi.length > 500) {
      return { error: 'Invalid reading position parameter.' };
    }

    const validPercentage =
      typeof percentage === 'number' && !isNaN(percentage)
        ? Math.min(100, Math.max(0, percentage))
        : 0;

    await upsertReadingProgress(
      user.id,
      access.book.tenantId,
      bookId,
      cleanCfi,
      validPercentage
    );
    return { success: true };
  } catch (err) {
    return {
      error: `Failed to save progress: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Saves a new bookmark location for the current user after verifying book access.
 */
export async function addBookmarkAction(
  bookId: string,
  tenantId: string,
  cfi: string,
  label?: string
): Promise<ReaderActionResult<Bookmark>> {
  void tenantId;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const access = await verifyBookAccess(user.id, user.email, bookId);
    if (!access.authorized || !access.book) {
      return { error: access.error || 'Access denied: You do not have permission to access this book.' };
    }

    const cleanCfi = cfi?.trim();
    if (!cleanCfi || cleanCfi.length > 500) {
      return { error: 'Invalid bookmark location.' };
    }

    const cleanLabel = label?.trim() || null;
    if (cleanLabel && cleanLabel.length > 200) {
      return { error: 'Bookmark label must not exceed 200 characters.' };
    }

    const bookmark = await createBookmark(
      user.id,
      access.book.tenantId,
      bookId,
      cleanCfi,
      cleanLabel
    );
    return { success: true, data: bookmark };
  } catch (err) {
    return {
      error: `Failed to create bookmark: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Deletes a user bookmark.
 */
export async function deleteBookmarkAction(
  bookmarkId: string
): Promise<ReaderActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    if (!bookmarkId || typeof bookmarkId !== 'string' || !bookmarkId.trim()) {
      return { error: 'Missing bookmark identifier.' };
    }

    await removeBookmark(bookmarkId.trim(), user.id);
    return { success: true };
  } catch (err) {
    return {
      error: `Failed to delete bookmark: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
