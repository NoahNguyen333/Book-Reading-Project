'use server';

import { getCurrentUser } from '@/modules/auth';
import { getBookDetails, upsertReadingProgress, createBookmark, removeBookmark } from './service';
import { createAdminClient } from '@/lib/supabase/server';
import { Bookmark } from './types';

export interface ReaderActionResult<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
}

/**
 * Validates authentication and generates a short-lived (60-second)
 * signed download URL to stream the EPUB or PDF binary.
 * Supports cross-tenant reading of public catalog books.
 */
export async function getAuthorizedBookDownloadUrl(
  bookId: string,
  tenantId?: string
): Promise<ReaderActionResult<{ signedUrl: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required to access book.' };
    }

    const book = await getBookDetails(bookId, tenantId);
    if (!book || !book.storagePath) {
      return { error: 'Book file not found or storage path unassigned.' };
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from('books')
      .createSignedUrl(book.storagePath, 60);

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
 * Persists the user's latest reading progress (CFI and percentage).
 */
export async function saveReadingProgressAction(
  bookId: string,
  tenantId: string,
  cfi: string,
  percentage: number
): Promise<ReaderActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    await upsertReadingProgress(user.id, tenantId, bookId, cfi, percentage);
    return { success: true };
  } catch (err) {
    return {
      error: `Failed to save progress: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Saves a new bookmark location for the current user.
 */
export async function addBookmarkAction(
  bookId: string,
  tenantId: string,
  cfi: string,
  label?: string
): Promise<ReaderActionResult<Bookmark>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const bookmark = await createBookmark(user.id, tenantId, bookId, cfi, label);
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

    await removeBookmark(bookmarkId, user.id);
    return { success: true };
  } catch (err) {
    return {
      error: `Failed to delete bookmark: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
