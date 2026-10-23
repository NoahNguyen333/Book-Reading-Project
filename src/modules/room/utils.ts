import { RoomParticipant, RoomSessionState } from './types';

export interface RawPresenceRecord {
  userId?: string;
  userName?: string;
  email?: string;
  avatarUrl?: string;
  joinedAt?: string;
  isHost?: boolean;
  [key: string]: unknown;
}

/**
 * Transforms Supabase Realtime presence dictionary into a clean list of unique participants.
 */
export function transformPresenceState(
  presenceState: Record<string, RawPresenceRecord[]>,
  currentUserId?: string
): RoomParticipant[] {
  const participantsMap = new Map<string, RoomParticipant>();

  Object.entries(presenceState).forEach(([key, presences]) => {
    if (!presences || presences.length === 0) return;
    const latest = presences[presences.length - 1];

    const userId = latest.userId || key;
    participantsMap.set(userId, {
      userId,
      userName: latest.userName || latest.email?.split('@')[0] || 'Guest Reader',
      email: latest.email,
      avatarUrl: latest.avatarUrl,
      joinedAt: latest.joinedAt || new Date().toISOString(),
      isHost: latest.isHost || false,
    });
  });

  // Sort participants: host first, then current user, then alphabetical
  return Array.from(participantsMap.values()).sort((a, b) => {
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return a.userName.localeCompare(b.userName);
  });
}

/**
 * Evaluates whether the reader should smoothly follow the host's position.
 * Returns true only if:
 * 1. isFollowing is enabled
 * 2. user is NOT the host
 * 3. host has a valid location
 * 4. host location is different from the current location
 */
export function shouldFollowHost(
  isFollowing: boolean,
  hostLocation?: string | null,
  currentLocation?: string | null,
  isHost?: boolean
): boolean {
  if (!isFollowing || isHost) return false;
  if (!hostLocation) return false;
  return hostLocation !== currentLocation;
}

/**
 * Identifies the video meeting provider from meeting URL.
 */
export function identifyMeetingProvider(url?: string | null): {
  name: string;
  isSupported: boolean;
} {
  if (!url || !url.trim()) {
    return { name: 'Meeting', isSupported: false };
  }

  const lower = url.toLowerCase();
  if (lower.includes('meet.google.com')) {
    return { name: 'Google Meet', isSupported: true };
  }
  if (lower.includes('zoom.us')) {
    return { name: 'Zoom', isSupported: true };
  }
  if (lower.includes('teams.microsoft.com')) {
    return { name: 'MS Teams', isSupported: true };
  }
  if (lower.includes('meet.jit.si') || lower.includes('jitsi')) {
    return { name: 'Jitsi Meet', isSupported: true };
  }

  return { name: 'Video Call', isSupported: true };
}

/**
 * Merges local room state with incoming broadcast or postgres change.
 */
export function mergeRoomSessionState(
  currentState: RoomSessionState,
  incomingState: RoomSessionState
): RoomSessionState {
  if (!incomingState.updatedAt) {
    return { ...currentState, ...incomingState };
  }
  if (!currentState.updatedAt) {
    return { ...currentState, ...incomingState };
  }

  const currentTs = new Date(currentState.updatedAt).getTime();
  const incomingTs = new Date(incomingState.updatedAt).getTime();

  return incomingTs >= currentTs
    ? { ...currentState, ...incomingState }
    : currentState;
}
