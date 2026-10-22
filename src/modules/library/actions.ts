'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, findTenantRole } from '@/modules/tenant';
import { canUploadBooks } from '@/modules/entitlements';
import { validateFileBasics, validateAndExtractEpubMetadata } from './validation';
import { insertBook, deleteBook, logAuditEvent } from './service';
import { createAdminClient } from '@/lib/supabase/server';

export interface BookActionResult {
  success?: boolean;
  error?: string;
  bookId?: string;
}

/**
 * Server action to process an EPUB upload:
 * - Validates tenant admin authorization
 * - Inspects EPUB container, verifies metadata & integrity
 * - Uploads EPUB and cover assets to private Supabase Storage
 * - Persists record in public.books and emits audit event
 */
export async function uploadBookAction(
  _prevState: BookActionResult | null,
  formData: FormData
): Promise<BookActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required to upload books.' };
    }

    const tenantId = (formData.get('tenantId') as string)?.trim();
    if (!tenantId) {
      return { error: 'Missing active tenant identifier.' };
    }

    // Verify role authorization
    const memberships = await getUserTenants(user.id);
    const userRole = findTenantRole(memberships, tenantId);
    if (!canUploadBooks(userRole)) {
      return { error: 'Access denied: Only tenant admins are permitted to upload books.' };
    }

    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: 'Please select a valid EPUB file to upload.' };
    }

    // 1. Basic extension & size check
    const basicValidation = validateFileBasics(file.name, file.size, file.type);
    if (!basicValidation.isValid) {
      return { error: basicValidation.error };
    }

    // 2. Read file buffer & perform deep EPUB inspection
    const arrayBuffer = await file.arrayBuffer();
    const deepValidation = await validateAndExtractEpubMetadata(arrayBuffer);
    if (!deepValidation.isValid || !deepValidation.metadata) {
      return { error: deepValidation.error || 'EPUB validation failed.' };
    }

    const { metadata } = deepValidation;
    const manualTitle = (formData.get('title') as string)?.trim();
    const manualAuthor = (formData.get('author') as string)?.trim();
    const manualDescription = (formData.get('description') as string)?.trim();

    const title = manualTitle || metadata.title || 'Untitled Book';
    const author = manualAuthor || metadata.author || null;
    const description = manualDescription || metadata.description || null;

    const bookId = crypto.randomUUID();
    const storagePath = `${tenantId}/${bookId}.epub`;

    const admin = createAdminClient();

    // 3. Upload EPUB binary to private Supabase storage
    const { error: uploadError } = await admin.storage
      .from('books')
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType: 'application/epub+zip',
        upsert: true,
      });

    if (uploadError) {
      return { error: `Storage upload failed: ${uploadError.message}` };
    }

    // 4. Handle cover image if present
    let coverUrl: string | null = null;
    if (metadata.coverBuffer) {
      const coverPath = `${tenantId}/${bookId}-cover.jpg`;
      const { error: coverUploadError } = await admin.storage
        .from('books')
        .upload(coverPath, Buffer.from(metadata.coverBuffer), {
          contentType: metadata.coverMediaType || 'image/jpeg',
          upsert: true,
        });

      if (!coverUploadError) {
        coverUrl = coverPath;
      }
    } else if (metadata.coverDataUrl) {
      coverUrl = metadata.coverDataUrl;
    }

    // 5. Insert record into database
    await insertBook({
      tenantId,
      title,
      author,
      description,
      coverUrl,
      storagePath,
      fileSize: file.size,
      format: 'epub',
      processingStatus: 'ready',
    });

    // 6. Log Audit Event
    await logAuditEvent(tenantId, user.id, 'BOOK_UPLOADED', {
      bookId,
      title,
      author,
      fileSize: file.size,
    });

    revalidatePath('/dashboard');
    return { success: true, bookId };
  } catch (err) {
    return {
      error: `An unexpected error occurred during upload: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Server action to delete a book:
 * Restricted to tenant admins.
 */
export async function deleteBookAction(
  tenantId: string,
  bookId: string
): Promise<BookActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const memberships = await getUserTenants(user.id);
    const userRole = findTenantRole(memberships, tenantId);
    if (!canUploadBooks(userRole)) {
      return { error: 'Access denied: Only tenant admins can delete books.' };
    }

    await deleteBook(tenantId, bookId);

    await logAuditEvent(tenantId, user.id, 'BOOK_DELETED', { bookId });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return {
      error: `Failed to delete book: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
