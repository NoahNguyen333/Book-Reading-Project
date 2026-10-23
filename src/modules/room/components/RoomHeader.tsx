'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Video, Users, BookOpen, Crown } from 'lucide-react';
import { ReadingRoom, RoomParticipant } from '../types';
import { identifyMeetingProvider } from '../utils';
import { ParticipantList } from './ParticipantList';

interface RoomHeaderProps {
  room: ReadingRoom;
  participants: RoomParticipant[];
  currentUserId: string;
  isHost: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

export function RoomHeader({
  room,
  participants,
  currentUserId,
  isHost,
  connectionStatus,
}: RoomHeaderProps) {
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const meetingInfo = identifyMeetingProvider(room.meetingUrl);

  return (
    <header className="h-14 border-b border-gray-800 bg-gray-950 px-4 flex items-center justify-between shrink-0 z-30 select-none">
      {/* Left: Back Link & Title */}
      <div className="flex items-center gap-3">
        <Link
          href="/room"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Lobby</span>
        </Link>
        <div className="h-4 w-px bg-gray-800" />
        <div className="flex items-center gap-2 max-w-sm sm:max-w-md truncate">
          <h1 className="text-sm font-bold truncate text-white">{room.title}</h1>
          {room.activeBook && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-900/40 text-blue-300 border border-blue-800/50 truncate">
              <BookOpen className="w-3 h-3 shrink-0" />
              <span className="truncate">{room.activeBook.title}</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: Video Launcher, Presence & Host Indicator */}
      <div className="flex items-center gap-3">
        {/* Prominent External Video Meeting Launcher */}
        {room.meetingUrl && (
          <a
            href={room.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition animate-in fade-in"
            title={`Launch ${meetingInfo.name}`}
          >
            <Video className="w-4 h-4" />
            <span className="hidden xs:inline">Join {meetingInfo.name}</span>
          </a>
        )}

        {/* Presence Counter Button */}
        <div className="relative">
          <button
            onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-500'
              }`}
            />
            <Users className="w-3.5 h-3.5" />
            <span>{participants.length}</span>
          </button>

          <ParticipantList
            isOpen={isParticipantsOpen}
            onClose={() => setIsParticipantsOpen(false)}
            participants={participants}
            currentUserId={currentUserId}
          />
        </div>

        {/* Host Badge */}
        {isHost && (
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-amber-950/60 text-amber-300 border border-amber-800/40">
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>Host</span>
          </span>
        )}
      </div>
    </header>
  );
}
