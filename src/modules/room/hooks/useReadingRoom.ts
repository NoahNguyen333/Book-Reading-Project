'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AuthUser } from '@/modules/auth/types';
import { RoomParticipant, RoomSessionState } from '../types';
import {
  transformPresenceState,
  shouldFollowHost,
  mergeRoomSessionState,
} from '../utils';
import { updateRoomSyncStateAction } from '../actions';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface UseReadingRoomProps {
  roomId: string;
  tenantId: string;
  currentUser: AuthUser;
  isHost: boolean;
  initialSessionState?: RoomSessionState;
  currentLocation?: string | null;
  onSyncLocation?: (location: string) => void;
}

export interface UseReadingRoomResult {
  onlineUsers: RoomParticipant[];
  sessionState: RoomSessionState;
  isFollowingHost: boolean;
  setIsFollowingHost: (follow: boolean) => void;
  broadcastPosition: (location: string, percentage: number) => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

/**
 * Real-time hook orchestrating:
 * 1. Supabase Presence (who is currently in the room)
 * 2. Instant broadcast channel for host page flipping
 * 3. Postgres database fallback synchronization
 * 4. Decoupled follower state machine ensuring follower browsing doesn't pollute personal progress
 */
export function useReadingRoom({
  roomId,
  tenantId,
  currentUser,
  isHost,
  initialSessionState = {},
  currentLocation,
  onSyncLocation,
}: UseReadingRoomProps): UseReadingRoomResult {
  const [onlineUsers, setOnlineUsers] = useState<RoomParticipant[]>([]);
  const [sessionState, setSessionState] = useState<RoomSessionState>(initialSessionState);
  const [isFollowingHost, setIsFollowingHost] = useState<boolean>(!isHost);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting');

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isFollowingHostRef = useRef<boolean>(isFollowingHost);
  isFollowingHostRef.current = isFollowingHost;

  const currentLocationRef = useRef<string | null | undefined>(currentLocation);
  currentLocationRef.current = currentLocation;

  const onSyncLocationRef = useRef(onSyncLocation);
  onSyncLocationRef.current = onSyncLocation;

  // Handle incoming host position change
  const handleHostMovement = useCallback(
    (newLocation?: string, newPct?: number, hostId?: string, hostName?: string) => {
      if (!newLocation) return;

      const newState: RoomSessionState = {
        hostUserId: hostId,
        hostName: hostName || 'Host',
        location: newLocation,
        percentage: newPct || 0,
        updatedAt: new Date().toISOString(),
      };

      setSessionState((prev) => mergeRoomSessionState(prev, newState));

      // Follower sync condition
      if (
        shouldFollowHost(
          isFollowingHostRef.current,
          newLocation,
          currentLocationRef.current,
          isHost
        )
      ) {
        onSyncLocationRef.current?.(newLocation);
      }
    },
    [isHost]
  );

  // Setup Supabase Realtime Channel
  useEffect(() => {
    if (!roomId) return;

    const supabase = createClient();
    const channelName = `room:${roomId}`;

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    channelRef.current = channel;

    // Presence Handlers
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const participants = transformPresenceState(state, currentUser.id);
        setOnlineUsers(participants);
      })
      .on('presence', { event: 'join' }, () => {
        const state = channel.presenceState();
        setOnlineUsers(transformPresenceState(state, currentUser.id));
      })
      .on('presence', { event: 'leave' }, () => {
        const state = channel.presenceState();
        setOnlineUsers(transformPresenceState(state, currentUser.id));
      })
      // Broadcast Handler: Sub-millisecond peer-to-peer page turn synchronization
      .on('broadcast', { event: 'host-turn' }, ({ payload }) => {
        if (payload?.location) {
          handleHostMovement(
            payload.location,
            payload.percentage,
            payload.hostUserId,
            payload.hostName
          );
        }
      })
      // Postgres Changes Fallback: Listens to updates to reading_rooms table
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reading_rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const updatedState = (payload.new as Record<string, unknown>)?.session_state as RoomSessionState;
          if (updatedState?.location) {
            handleHostMovement(
              updatedState.location,
              updatedState.percentage,
              updatedState.hostUserId,
              updatedState.hostName
            );
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          try {
            await channel.track({
              userId: currentUser.id,
              userName:
                currentUser.fullName || currentUser.email?.split('@')[0] || 'Reader',
              email: currentUser.email,
              avatarUrl: currentUser.avatarUrl,
              joinedAt: new Date().toISOString(),
              isHost,
            });
          } catch (trackErr) {
            console.warn('Presence tracking error:', trackErr);
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnectionStatus('disconnected');
        }
      });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId, currentUser, isHost, handleHostMovement]);

  // Host broadcast action
  const broadcastPosition = useCallback(
    (location: string, percentage: number) => {
      if (!isHost) return;

      const payload = {
        hostUserId: currentUser.id,
        hostName: currentUser.fullName || currentUser.email?.split('@')[0] || 'Host',
        location,
        percentage,
        updatedAt: new Date().toISOString(),
      };

      // 1. Instant peer-to-peer broadcast
      channelRef.current?.send({
        type: 'broadcast',
        event: 'host-turn',
        payload,
      });

      // 2. Local state update
      setSessionState((prev) => mergeRoomSessionState(prev, payload));

      // 3. Database persistence for late joiners
      updateRoomSyncStateAction(roomId, tenantId, location, percentage).catch((err) =>
        console.warn('Sync state action error:', err)
      );
    },
    [isHost, currentUser, roomId, tenantId]
  );

  return {
    onlineUsers,
    sessionState,
    isFollowingHost,
    setIsFollowingHost,
    broadcastPosition,
    connectionStatus,
  };
}
