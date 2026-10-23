'use client';

import React from 'react';
import { Crown, Radio, Navigation } from 'lucide-react';
import { RoomSessionState } from '../types';

interface SyncControllerProps {
  isHost: boolean;
  isFollowingHost: boolean;
  onToggleFollow: (following: boolean) => void;
  sessionState: RoomSessionState;
  currentLocation?: string | null;
  onJumpToHost: () => void;
}

export function SyncController({
  isHost,
  isFollowingHost,
  onToggleFollow,
  sessionState,
  currentLocation,
  onJumpToHost,
}: SyncControllerProps) {
  const hostLocation = sessionState.location;
  const isDrifted = hostLocation && hostLocation !== currentLocation;

  return (
    <aside
      aria-label="Room synchronization"
      className="fixed bottom-6 right-6 z-30 max-w-sm bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-3.5 space-y-2 animate-in fade-in duration-200"
    >
      {isHost ? (
        <div className="flex items-center gap-2.5 text-xs">
          <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <Crown className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>You are Room Host</span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Your page turns synchronize live across all family members.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Radio
                className={`w-4 h-4 ${
                  isFollowingHost ? 'text-emerald-500 animate-pulse' : 'text-gray-400'
                }`}
              />
              <span className="text-xs font-bold text-gray-900 dark:text-white">
                Follow Host
              </span>
            </div>

            <button
              onClick={() => onToggleFollow(!isFollowingHost)}
              role="switch"
              aria-checked={isFollowingHost}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isFollowingHost ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isFollowingHost ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
            <span>
              {sessionState.hostName ? `${sessionState.hostName}` : 'Host'}:{' '}
              <strong className="text-gray-700 dark:text-gray-300">
                {sessionState.location || 'Preparing'}
              </strong>
            </span>

            {isDrifted && (
              <button
                onClick={onJumpToHost}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-100 transition"
              >
                <Navigation className="w-3 h-3" />
                <span>Jump to Host</span>
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
