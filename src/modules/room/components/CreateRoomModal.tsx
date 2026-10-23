'use client';

import React, { useState } from 'react';
import { X, Loader2, Sparkles, Video, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui';
import { Book } from '@/modules/library/types';
import { ReadingRoom } from '../types';
import { createRoomAction } from '../actions';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  books: Book[];
  onRoomCreated?: (room: ReadingRoom) => void;
}

export function CreateRoomModal({
  isOpen,
  onClose,
  tenantId,
  books,
  onRoomCreated,
}: CreateRoomModalProps) {
  const [title, setTitle] = useState('');
  const [activeBookId, setActiveBookId] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Room title is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await createRoomAction(
        tenantId,
        title.trim(),
        activeBookId || null,
        meetingUrl.trim() || null
      );

      if (res.error) {
        setError(res.error);
        setIsSubmitting(false);
        return;
      }

      if (res.data) {
        onRoomCreated?.(res.data);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl p-6 space-y-5">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-100 dark:border-blue-900">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 id="create-room-title" className="text-base font-bold text-gray-900 dark:text-white">
              Create Reading Room
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Set up a live space for synced family reading and calls.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Room Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Bedtime Stories, Weekend Book Club"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-gray-400" />
              <span>Select Active Book (Optional)</span>
            </label>
            <select
              value={activeBookId}
              onChange={(e) => setActiveBookId(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Choose a book later --</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.format.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-gray-400" />
              <span>Video Meeting Link (Optional)</span>
            </label>
            <input
              type="url"
              placeholder="Google Meet, Zoom, Teams, or Jitsi link"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Supports Google Meet, Zoom, Microsoft Teams, and Jitsi.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-500 text-white min-w-[100px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  <span>Creating...</span>
                </>
              ) : (
                'Create Room'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
