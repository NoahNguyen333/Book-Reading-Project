'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, findTenantRole } from '@/modules/tenant';
import { canReadBooks, canUploadBooks } from '@/modules/entitlements';
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

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, input.tenantId);
    if (!canReadBooks(role)) {
      return { error: 'Access denied: You are not a member of this reading space.' };
    }

    if (!input.highlightedText || !input.highlightedText.trim()) {
      return { error: 'Highlighted text is required.' };
    }

    const created = await createAnnotation({
      ...input,
      userId: user.id,
    });

    revalidatePath(`/reader/${input.bookId}`);
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
  bookId: string
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

    await deleteAnnotation(annotationId, tenantId, user.id, isAdmin);

    revalidatePath(`/reader/${bookId}`);
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

    const created = await createComment({
      annotationId,
      tenantId,
      content,
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
