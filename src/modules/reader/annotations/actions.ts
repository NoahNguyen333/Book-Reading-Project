'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, findTenantRole } from '@/modules/tenant';
import { canReadBooks, canUploadBooks } from '@/modules/entitlements';
import { verifyBookAccess } from '@/modules/reader/access';
import {
  createAnnotation,
  deleteAnnotation,
  getAnnotationComments,
  createComment,
  deleteComment,
} from './service';
import { Annotation, AnnotationComment, CreateAnnotationInput } from './types';

export interface AnnotationActionResult<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
}

export async function createAnnotationAction(
  input: CreateAnnotationInput
): Promise<AnnotationActionResult<Annotation>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required to create annotations.' };
    }

    if (!input.bookId || typeof input.bookId !== 'string') {
      return { error: 'Missing book identifier.' };
    }

    // Verify user has legitimate access to read this book
    const access = await verifyBookAccess(user.id, user.email, input.bookId);
    if (!access.authorized || !access.book) {
      return { error: access.error || 'Access denied: You do not have permission to annotate this book.' };
    }

    const cleanHighlight = input.highlightedText?.trim();
    if (!cleanHighlight) {
      return { error: 'Highlighted text is required.' };
    }
    if (cleanHighlight.length > 5000) {
      return { error: 'Highlighted text exceeds maximum allowed length (5000 characters).' };
    }

    const cleanLocation = input.location?.trim();
    if (!cleanLocation || cleanLocation.length > 500) {
      return { error: 'Invalid location identifier.' };
    }

    const cleanNote = input.note?.trim() ? input.note.trim().slice(0, 2000) : null;
    const allowedColors = ['yellow', 'green', 'pink', 'blue'] as const;
    const color = input.color && allowedColors.includes(input.color) ? input.color : 'yellow';

    // Associate annotation with user's reading space if authorized, or default to book tenant
    let tenantId = access.book.tenantId;
    try {
      const memberships = await getUserTenants(user.id);
      if (input.tenantId && typeof input.tenantId === 'string') {
        const role = findTenantRole(memberships, input.tenantId);
        if (role) {
          tenantId = input.tenantId;
        }
      } else if (!findTenantRole(memberships, tenantId) && memberships.length > 0) {
        tenantId = memberships[0].tenant.id;
      }
    } catch {
      // If fetching user memberships fails, fall back to verified book tenant
    }

    const created = await createAnnotation({
      ...input,
      tenantId,
      location: cleanLocation,
      highlightedText: cleanHighlight,
      note: cleanNote,
      color,
      userId: user.id,
      format: access.book.format === 'pdf' ? 'pdf' : 'epub',
    });

    // Revalidate notebook so saved highlights appear in the Knowledge Notebook
    revalidatePath('/notebook');
    return { success: true, data: created };
  } catch (err) {
    return {
      error: `Failed to save highlight: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function deleteAnnotationAction(
  annotationId: string,
  tenantId: string,
  bookId?: string
): Promise<AnnotationActionResult> {
  void bookId;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, tenantId);
    if (!canReadBooks(role)) {
      return { error: 'Access denied.' };
    }

    const isAdmin = canUploadBooks(role);

    await deleteAnnotation(annotationId, tenantId, user.id, isAdmin);

    // Revalidate notebook so deleted highlights update in the Knowledge Notebook
    revalidatePath('/notebook');
    return { success: true };
  } catch (err) {
    return {
      error: `Failed to remove highlight: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function getAnnotationCommentsAction(
  annotationId: string,
  tenantId: string
): Promise<AnnotationActionResult<AnnotationComment[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, tenantId);
    if (!canReadBooks(role)) {
      return { error: 'Access denied.' };
    }

    const comments = await getAnnotationComments(annotationId, tenantId);
    return { success: true, data: comments };
  } catch (err) {
    return {
      error: `Failed to load discussion: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function createCommentAction(
  annotationId: string,
  tenantId: string,
  content: string,
  bookId?: string
): Promise<AnnotationActionResult<AnnotationComment>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required to post comments.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, tenantId);
    if (!canReadBooks(role)) {
      return { error: 'Access denied: You are not a member of this reading space.' };
    }

    const cleanContent = content?.trim();
    if (!cleanContent || cleanContent.length > 2000) {
      return { error: 'Comment must be between 1 and 2,000 characters.' };
    }

    const created = await createComment({
      annotationId,
      tenantId,
      content: cleanContent,
      userId: user.id,
      userName: user.fullName || user.email?.split('@')[0],
      userEmail: user.email,
    });

    if (bookId) {
      revalidatePath(`/reader/${bookId}`);
    }
    revalidatePath('/notebook');
    return { success: true, data: created };
  } catch (err) {
    return {
      error: `Failed to post reply: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function deleteCommentAction(
  commentId: string,
  tenantId: string,
  bookId?: string
): Promise<AnnotationActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, tenantId);
    if (!canReadBooks(role)) {
      return { error: 'Access denied.' };
    }

    const isAdmin = canUploadBooks(role);

    await deleteComment(commentId, tenantId, user.id, isAdmin);

    if (bookId) {
      revalidatePath(`/reader/${bookId}`);
    }
    revalidatePath('/notebook');
    return { success: true };
  } catch (err) {
    return {
      error: `Failed to remove comment: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
