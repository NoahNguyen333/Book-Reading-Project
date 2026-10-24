'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/auth';
import { getUserTenants, findTenantRole } from '@/modules/tenant';
import { canManageRoom, canReadBooks } from '@/modules/entitlements';
import { verifyBookAccess } from '@/modules/reader/access';
import { isValidUuid, isValidMeetingUrl } from '@/lib/validation';
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

    const cleanTenantId = tenantId?.trim();
    if (!cleanTenantId || !isValidUuid(cleanTenantId)) {
      return { error: 'Missing or invalid tenant identifier.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, cleanTenantId);
    if (!canManageRoom(role)) {
      return { error: 'Access denied: Only tenant admins can create reading rooms.' };
    }

    const cleanTitle = title?.trim();
    if (!cleanTitle || cleanTitle.length > 100) {
      return { error: 'Room title must be between 1 and 100 characters.' };
    }

    // Validate meeting URL if provided
    let cleanMeetingUrl: string | null = null;
    if (meetingUrl && meetingUrl.trim()) {
      cleanMeetingUrl = meetingUrl.trim();
      if (!isValidMeetingUrl(cleanMeetingUrl)) {
        return { error: 'Invalid meeting URL: must be a valid HTTPS URL.' };
      }
    }

    // Validate active book access if provided
    let cleanBookId: string | null = null;
    if (activeBookId && activeBookId.trim()) {
      cleanBookId = activeBookId.trim();
      const bookAccess = await verifyBookAccess(user.id, user.email, cleanBookId);
      if (!bookAccess.authorized || !bookAccess.book) {
        return { error: 'Access denied to the selected book.' };
      }
    }

    const room = await createRoom(cleanTenantId, {
      title: cleanTitle,
      activeBookId: cleanBookId,
      meetingUrl: cleanMeetingUrl,
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

    const cleanTenantId = tenantId?.trim();
    const cleanRoomId = roomId?.trim();
    if (!cleanTenantId || !cleanRoomId || !isValidUuid(cleanTenantId) || !isValidUuid(cleanRoomId)) {
      return { error: 'Missing or invalid identifiers.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, cleanTenantId);
    if (!canManageRoom(role)) {
      return { error: 'Access denied: Only tenant admins can configure reading rooms.' };
    }

    // Validate updates
    if (updates.title !== undefined) {
      const cleanTitle = updates.title.trim();
      if (!cleanTitle || cleanTitle.length > 100) {
        return { error: 'Room title must be between 1 and 100 characters.' };
      }
    }

    if (updates.meetingUrl !== undefined && updates.meetingUrl !== null) {
      const cleanUrl = updates.meetingUrl.trim();
      if (cleanUrl.length > 0 && !isValidMeetingUrl(cleanUrl)) {
        return { error: 'Invalid meeting URL: must be a valid HTTPS URL.' };
      }
    }

    if (updates.activeBookId !== undefined && updates.activeBookId !== null) {
      const cleanBookId = updates.activeBookId.trim();
      if (cleanBookId.length > 0) {
        const bookAccess = await verifyBookAccess(user.id, user.email, cleanBookId);
        if (!bookAccess.authorized || !bookAccess.book) {
          return { error: 'Access denied to the selected book.' };
        }
      }
    }

    const updated = await updateRoom(cleanRoomId, cleanTenantId, updates);

    revalidatePath('/room');
    revalidatePath(`/room/${cleanRoomId}`);
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

    const cleanTenantId = tenantId?.trim();
    const cleanRoomId = roomId?.trim();
    if (!cleanTenantId || !cleanRoomId || !isValidUuid(cleanTenantId) || !isValidUuid(cleanRoomId)) {
      return { error: 'Missing or invalid identifiers.' };
    }

    const memberships = await getUserTenants(user.id);
    const role = findTenantRole(memberships, cleanTenantId);
    if (!canReadBooks(role)) {
      return { error: 'Access denied: Not a member of this reading space.' };
    }

    const cleanLocation = location?.trim();
    if (!cleanLocation || cleanLocation.length > 500) {
      return { error: 'Invalid location identifier.' };
    }

    const validPercentage =
      typeof percentage === 'number' && !isNaN(percentage)
        ? Math.min(100, Math.max(0, percentage))
        : 0;

    await updateRoomSyncState(cleanRoomId, cleanTenantId, {
      hostUserId: user.id,
      hostName: user.fullName || user.email?.split('@')[0] || 'Host',
      location: cleanLocation,
      percentage: validPercentage,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (err) {
    return {
      error: `Failed to synchronize room state: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
