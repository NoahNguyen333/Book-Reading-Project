'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createTenantWithAdmin } from '@/modules/tenant/service';
import { formatDefaultTenantName } from '@/modules/tenant/helpers';
import { AuthUser } from './types';

export interface AuthActionResult {
  error?: string;
  success?: boolean;
}

/**
 * Signs in a user using email and password, setting session cookies.
 */
export async function signIn(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

/**
 * Registers a new user, automatically provisions their initial family tenant space,
 * and assigns them as the tenant admin.
 */
export async function signUp(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const spaceName = (formData.get('spaceName') as string) || '';

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters long.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (data?.user) {
    try {
      const finalTenantName = spaceName.trim() || formatDefaultTenantName(email);
      await createTenantWithAdmin(data.user.id, finalTenantName);
    } catch (tenantErr) {
      // Log error but proceed if user is created
      console.error('Failed to auto-provision initial family tenant:', tenantErr);
    }
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

/**
 * Signs out the current user, clears auth cookies, and redirects to login.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * Retrieves the current authenticated user session and returns an AuthUser or null.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || user.email?.split('@')[0],
      avatarUrl: user.user_metadata?.avatar_url,
    };
  } catch {
    return null;
  }
}

/**
 * Checks if a given email is the designated Platform Super Admin.
 */
export async function isPlatformSuperAdmin(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const adminEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) return false;
  return email.trim().toLowerCase() === adminEmail;
}

/**
 * Updates the user's display name.
 */
export async function updateUserProfileNameAction(
  fullName: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Vui lòng đăng nhập.' };
    }

    const trimmed = fullName?.trim();
    if (!trimmed) {
      return { error: 'Tên không được để trống.' };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: trimmed },
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath('/dashboard');
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Lỗi cập nhật tên',
    };
  }
}
