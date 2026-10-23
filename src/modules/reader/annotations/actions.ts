'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, findTenantRole } from '@/modules/tenant';
import { canReadBooks, canUploadBooks } from '@/modules/entitlements';
import { createAnnotation, deleteAnnotation } from './service';
import { Annotation, CreateAnnotationInput } from './types';

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
