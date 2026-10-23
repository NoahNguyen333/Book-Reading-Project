'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, findTenantRole } from '@/modules/tenant';
import { canManageRoom, canReadBooks } from '@/modules/entitlements';
import { createRoom, updateRoom, updateRoomSyncState } from './service';
import { ReadingRoom, UpdateRoomInput } from './types';

export interface RoomActionResult<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
}

/**
 * Creates a new reading room in the tenant space.
 * Restricted to tenant admins via canManageRoom.
 */
export async function createRoomAction(
  tenantId: string,
  title: string,
  activeBookId?: string | null,
  meetingUrl?: string | null
): Promise<RoomActionResult<ReadingRoom>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required to create reading rooms.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, tenantId);
    if (!canManageRoom(role)) {
      return { error: 'Access denied: Only tenant admins can create reading rooms.' };
    }

    if (!title || !title.trim()) {
      return { error: 'Room title is required.' };
    }

    const room = await createRoom(tenantId, {
      title: title.trim(),
      activeBookId: activeBookId || null,
      meetingUrl: meetingUrl?.trim() || null,
    });

    revalidatePath('/room');
    revalidatePath('/dashboard');
    return { success: true, data: room };
  } catch (err) {
    return {
      error: `Failed to create reading room: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Updates room configuration (title, active book, meeting URL).
 * Restricted to tenant admins.
 */
export async function updateRoomAction(
  roomId: string,
  tenantId: string,
  updates: UpdateRoomInput
): Promise<RoomActionResult<ReadingRoom>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, tenantId);
    if (!canManageRoom(role)) {
      return { error: 'Access denied: Only tenant admins can configure reading rooms.' };
    }

    const updated = await updateRoom(roomId, tenantId, updates);

    revalidatePath('/room');
    revalidatePath(`/room/${roomId}`);
    revalidatePath('/dashboard');
    return { success: true, data: updated };
  } catch (err) {
    return {
      error: `Failed to update reading room: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Updates the host's synchronized reading location and percentage inside room session_state.
 * Validates tenant membership so any authorized room host can broadcast state.
 */
export async function updateRoomSyncStateAction(
  roomId: string,
  tenantId: string,
  location: string,
  percentage: number
): Promise<RoomActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, tenantId);
    if (!canReadBooks(role)) {
      return { error: 'Access denied: Not a member of this reading space.' };
    }

    await updateRoomSyncState(roomId, tenantId, {
      hostUserId: user.id,
      hostName: user.fullName || user.email?.split('@')[0] || 'Host',
      location,
      percentage: Math.min(100, Math.max(0, percentage)),
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (err) {
    return {
      error: `Failed to synchronize room state: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
