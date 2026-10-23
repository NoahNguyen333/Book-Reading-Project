'use client';

import React from 'react';
import { RoomParticipant } from '../types';
import { Users, Crown, X } from 'lucide-react';

interface ParticipantListProps {
  isOpen: boolean;
  onClose: () => void;
  participants: RoomParticipant[];
  currentUserId: string;
}

export function ParticipantList({
  isOpen,
  onClose,
  participants,
  currentUserId,
}: ParticipantListProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute top-14 right-4 w-72 max-w-[85vw] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <div className="flex items-center justify-between p-3.5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
            In Room ({participants.length})
          </h4>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto p-2 space-y-1">
        {participants.map((p) => {
          const isMe = p.userId === currentUserId;
          const initials = p.userName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

          return (
            <div
              key={p.userId}
              className={`flex items-center justify-between p-2 rounded-xl text-xs transition ${
                isMe
                  ? 'bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/40'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 shadow-sm">
                  {initials || 'U'}
                </div>
                <div className="truncate">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">
                    {p.userName} {isMe && <span className="opacity-60 font-normal">(You)</span>}
                  </p>
                  {p.email && <p className="text-[10px] text-gray-400 truncate">{p.email}</p>}
                </div>
              </div>

              {p.isHost && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 shrink-0">
                  <Crown className="w-3 h-3" />
                  <span>Host</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
