'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { AuthUser } from '@/modules/auth/types';
import { ReadingRoom } from '../types';
import { useReadingRoom } from '../hooks/useReadingRoom';
import { RoomHeader } from './RoomHeader';
import { SyncController } from './SyncController';
import { ReaderContainer } from '@/modules/reader/components/ReaderContainer';

interface CollaborativeReaderProps {
  room: ReadingRoom;
  currentUser: AuthUser;
  isHost: boolean;
  tenantId: string;
}

export function CollaborativeReader({
  room,
  currentUser,
  isHost,
  tenantId,
}: CollaborativeReaderProps) {
  const [currentLocation, setCurrentLocation] = useState<string | null>(
    room.sessionState?.location || null
  );
  const [syncedLocation, setSyncedLocation] = useState<string | null>(
    room.sessionState?.location || null
  );

  const handleSyncLocation = useCallback((location: string) => {
    setSyncedLocation(location);
    setCurrentLocation(location);
  }, []);

  const {
    onlineUsers,
    sessionState,
    isFollowingHost,
    setIsFollowingHost,
    broadcastPosition,
    connectionStatus,
  } = useReadingRoom({
    roomId: room.id,
    tenantId,
    currentUser,
    isHost,
    initialSessionState: room.sessionState,
    currentLocation,
    onSyncLocation: handleSyncLocation,
  });

  const handleLocationChange = useCallback(
    (loc: string, pct: number) => {
      setCurrentLocation(loc);
      if (isHost) {
        broadcastPosition(loc, pct);
      }
    },
    [isHost, broadcastPosition]
  );

  const handleJumpToHost = useCallback(() => {
    if (sessionState?.location) {
      setSyncedLocation(sessionState.location);
      setCurrentLocation(sessionState.location);
      setIsFollowingHost(true);
    }
  }, [sessionState?.location, setIsFollowingHost]);

  // If room does not have an active book selected
  if (!room.activeBookId || !room.activeBook) {
    return (
      <div className="flex flex-col h-screen w-screen bg-gray-950 text-white overflow-hidden">
        <RoomHeader
          room={room}
          participants={onlineUsers}
          currentUserId={currentUser.id}
          isHost={isHost}
          connectionStatus={connectionStatus}
        />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-5 shadow-2xl">
            <div className="p-4 rounded-2xl bg-blue-950/60 border border-blue-800/50 w-fit mx-auto text-blue-400">
              <BookOpen className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">No Active Book Selected</h2>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                This reading room doesn&apos;t have a book loaded yet. {isHost ? 'Select a book from the room lobby or library to read together.' : 'Please ask the room host to assign a book to this room.'}
              </p>
            </div>
            <Link
              href="/room"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-xs text-white transition shadow-lg shadow-blue-600/20"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Room Lobby</span>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-950 overflow-hidden select-none">
      <RoomHeader
        room={room}
        participants={onlineUsers}
        currentUserId={currentUser.id}
        isHost={isHost}
        connectionStatus={connectionStatus}
      />

      <main className="relative flex-1 w-full h-full overflow-hidden">
        <ReaderContainer
          bookId={room.activeBook.id}
          tenantId={tenantId}
          bookTitle={room.activeBook.title}
          format={room.activeBook.format || 'epub'}
          initialCfi={room.sessionState?.location || null}
          externalLocation={isFollowingHost ? syncedLocation : null}
          onLocationChange={handleLocationChange}
          disableProgressSave={isFollowingHost && !isHost}
        />

        <SyncController
          isHost={isHost}
          isFollowingHost={isFollowingHost}
          onToggleFollow={setIsFollowingHost}
          sessionState={sessionState}
          currentLocation={currentLocation}
          onJumpToHost={handleJumpToHost}
        />
      </main>
    </div>
  );
}
