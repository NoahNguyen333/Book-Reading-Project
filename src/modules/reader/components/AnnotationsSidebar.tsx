'use client';

import React, { useState } from 'react';
import {
  X,
  Highlighter,
  Trash2,
  Navigation,
  MessageSquare,
  Users,
  Lock,
  Search,
} from 'lucide-react';
import { Annotation, HighlightColor, HIGHLIGHT_COLOR_CONFIGS } from '../annotations/types';
import { parseLocationDisplay } from '../annotations/utils';
import { AnnotationThread } from './AnnotationThread';

interface AnnotationsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: Annotation[];
  onJumpToLocation: (location: string) => void;
  onDeleteAnnotation?: (id: string) => Promise<void>;
  bookTitle?: string;
  currentUserId?: string;
  tenantId?: string;
  bookId?: string;
  isAdmin?: boolean;
}

export function AnnotationsSidebar({
  isOpen,
  onClose,
  annotations,
  onJumpToLocation,
  onDeleteAnnotation,
  bookTitle,
  currentUserId,
  tenantId,
  bookId,
  isAdmin = false,
}: AnnotationsSidebarProps) {
  const [selectedColor, setSelectedColor] = useState<HighlightColor | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filtered = annotations.filter((ann) => {
    if (selectedColor !== 'all' && ann.color !== selectedColor) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = ann.highlightedText.toLowerCase().includes(q);
      const matchNote = ann.note ? ann.note.toLowerCase().includes(q) : false;
      if (!matchText && !matchNote) return false;
    }
    return true;
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!onDeleteAnnotation) return;
    if (confirm('Delete this highlight and attached note?')) {
      setDeletingId(id);
      try {
        await onDeleteAnnotation(id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <aside
      aria-label="Book Annotations Sidebar"
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 max-h-screen"
    >
      {/* Top Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <Highlighter className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              Highlights & Notes
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
              {bookTitle || 'Current Book'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-3 border-b border-gray-100 dark:border-gray-800 space-y-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search notes or quotes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Color Swatch Tabs */}
        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={() => setSelectedColor('all')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition ${
              selectedColor === 'all'
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-gray-100 dark:bg-gray-800'
            }`}
          >
            All ({annotations.length})
          </button>
          {(Object.keys(HIGHLIGHT_COLOR_CONFIGS) as HighlightColor[]).map((c) => {
            const count = annotations.filter((a) => a.color === c).length;
            if (count === 0 && selectedColor !== c) return null;
            const config = HIGHLIGHT_COLOR_CONFIGS[c];
            const isSelected = selectedColor === c;

            return (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition border ${
                  isSelected
                    ? `${config.badgeClass} ring-1 ${config.activeRingClass}`
                    : 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 border-gray-200/50 dark:border-gray-700/50'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: config.hex }}
                />
                <span>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Annotations List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400 space-y-2">
            <Highlighter className="w-8 h-8 opacity-40" />
            <p className="text-xs">
              {searchQuery || selectedColor !== 'all'
                ? 'No notes match your filters.'
                : 'Select text inside the reader to highlight or attach reflections.'}
            </p>
          </div>
        ) : (
          filtered.map((ann) => {
            const colorConfig = HIGHLIGHT_COLOR_CONFIGS[ann.color];
            const locLabel = parseLocationDisplay(ann.location);
            const isOwner = currentUserId ? ann.userId === currentUserId : true;

            return (
              <div
                key={ann.id}
                onClick={() => onJumpToLocation(ann.location)}
                className={`group relative p-3.5 rounded-2xl border transition cursor-pointer hover:shadow-md space-y-2 bg-white dark:bg-gray-900 ${
                  colorConfig.borderClass
                } border-l-4`}
              >
                {/* Location Header & Jump & Delete */}
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">
                    {locLabel}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {ann.isShared ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400">
                        <Users className="w-3 h-3" />
                        <span>Shared</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Private</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToLocation(ann.location);
                      }}
                      title="Jump to location"
                      className="p-1 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </button>

                    {isOwner && onDeleteAnnotation && (
                      <button
                        type="button"
                        disabled={deletingId === ann.id}
                        onClick={(e) => handleDelete(e, ann.id)}
                        title="Delete highlight"
                        className="p-1 rounded text-gray-400 hover:text-red-600 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Quote */}
                <div
                  style={{ backgroundColor: colorConfig.bgStyle }}
                  className="p-2 rounded-lg text-xs italic text-gray-800 dark:text-gray-200 line-clamp-3 leading-relaxed"
                >
                  &ldquo;{ann.highlightedText}&rdquo;
                </div>

                {/* Attached Reflection Note */}
                {ann.note && (
                  <div className="flex items-start gap-1.5 pt-1 text-xs text-gray-700 dark:text-gray-300">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="leading-snug">{ann.note}</p>
                  </div>
                )}

                {/* Nested Discussion Threads */}
                {tenantId && (
                  <AnnotationThread
                    annotationId={ann.id}
                    tenantId={tenantId}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    bookId={bookId}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
