'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Plus,
  BookOpen,
  Video,
  ArrowRight,
  Sparkles,
  Search,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { Book } from '@/modules/library/types';
import { ReadingRoom } from '../types';
import { identifyMeetingProvider } from '../utils';
import { CreateRoomModal } from './CreateRoomModal';

interface RoomLobbyProps {
  rooms: ReadingRoom[];
  tenantId: string;
  books: Book[];
  canCreateRoom: boolean;
  currentUserId: string;
}

export function RoomLobby({
  rooms,
  tenantId,
  books,
  canCreateRoom,
}: RoomLobbyProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRooms = rooms.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.activeBook?.title && r.activeBook.title.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            <span>Family Reading Rooms</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Join a live room to read together with page sync and integrated video calls.
          </p>
        </div>

        {canCreateRoom && (
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Room</span>
          </Button>
        )}
      </div>

      {/* Search & Stats Bar */}
      {rooms.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search rooms or books..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <span className="text-xs text-gray-400 font-medium">
            {filteredRooms.length} {filteredRooms.length === 1 ? 'room' : 'rooms'} active
          </span>
        </div>
      )}

      {/* Room Grid or Empty State */}
      {filteredRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
          <div className="p-3.5 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 mb-3">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white text-base">
            {searchQuery ? 'No rooms match your search' : 'No Reading Rooms Created Yet'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mt-1 mb-5">
            {searchQuery
              ? 'Try searching with a different term or clear the filter.'
              : 'Create a collaborative reading space for bedtime stories, study groups, or family book clubs.'}
          </p>
          {canCreateRoom && !searchQuery && (
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Room</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRooms.map((room) => {
            const meetingInfo = identifyMeetingProvider(room.meetingUrl);
            const hostLocation = room.sessionState?.location;
            const hostPct = room.sessionState?.percentage;

            return (
              <div
                key={room.id}
                className="group flex flex-col justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 hover:border-blue-500/50 hover:shadow-lg transition space-y-4"
              >
                <div className="space-y-3">
                  {/* Top: Title & Meeting Provider */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-gray-900 dark:text-white text-base leading-snug group-hover:text-blue-500 transition">
                      {room.title}
                    </h3>
                    {meetingInfo && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <Video className="w-3 h-3" />
                        <span>{meetingInfo.name}</span>
                      </span>
                    )}
                  </div>

                  {/* Active Book Info */}
                  {room.activeBook ? (
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                          {room.activeBook.title}
                        </div>
                        <div className="text-[10px] text-gray-400 capitalize">
                          {room.activeBook.format} format {room.activeBook.author ? `• ${room.activeBook.author}` : ''}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 border border-dashed border-gray-200 dark:border-gray-800 text-gray-400 text-xs">
                      <BookOpen className="w-4 h-4 opacity-50" />
                      <span className="italic">No active book loaded</span>
                    </div>
                  )}

                  {/* Sync Status Info */}
                  {room.sessionState?.hostName && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
                      <span className="truncate">
                        Host: <strong className="text-gray-700 dark:text-gray-300 font-medium">{room.sessionState.hostName}</strong>
                      </span>
                      {typeof hostPct === 'number' && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {hostPct}% read {hostLocation ? `(${hostLocation})` : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800/80 flex items-center justify-between gap-2">
                  {room.meetingUrl ? (
                    <a
                      href={room.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Join Call</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  ) : (
                    <span className="text-[11px] text-gray-400">Audio/video disabled</span>
                  )}

                  <Link
                    href={`/room/${room.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-sm"
                  >
                    <span>Enter Room</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <CreateRoomModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        tenantId={tenantId}
        books={books}
      />
    </div>
  );
}
