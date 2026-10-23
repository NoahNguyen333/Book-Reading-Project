'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, MessageSquare, Users, Lock, X, Loader2, Sparkles } from 'lucide-react';
import { HighlightColor, HIGHLIGHT_COLOR_CONFIGS } from '../annotations/types';

interface HighlightContextMenuProps {
  position: { x: number; y: number } | null;
  selectedText: string;
  onSave: (color: HighlightColor, note?: string, isShared?: boolean) => Promise<void>;
  onClose: () => void;
}

export function HighlightContextMenu({
  position,
  selectedText,
  onSave,
  onClose,
}: HighlightContextMenuProps) {
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!position) return null;

  // Clamp popover position to viewport
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
  const left = Math.min(Math.max(16, position.x - 140), viewportWidth - 300);
  const top = Math.max(16, position.y - (isNoteOpen ? 210 : 80));

  const handleQuickHighlight = async (color: HighlightColor) => {
    setSelectedColor(color);
    if (!isNoteOpen) {
      setIsSaving(true);
      try {
        await onSave(color, undefined, isShared);
        onClose();
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleFullSave = async () => {
    setIsSaving(true);
    try {
      await onSave(selectedColor, note.trim() || undefined, isShared);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      ref={menuRef}
      style={{ left: `${left}px`, top: `${top}px` }}
      role="dialog"
      aria-label="Highlight text context menu"
      className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl p-3 space-y-2.5 min-w-[270px] max-w-[320px] animate-in fade-in zoom-in-95 duration-150 select-none text-xs"
    >
      {/* Top Header: Swatches & Note toggle & Close */}
      <div className="flex items-center justify-between gap-2">
        {/* Color Swatches */}
        <div className="flex items-center gap-2">
          {(Object.keys(HIGHLIGHT_COLOR_CONFIGS) as HighlightColor[]).map((color) => {
            const config = HIGHLIGHT_COLOR_CONFIGS[color];
            const isSelected = selectedColor === color;

            return (
              <button
                key={color}
                type="button"
                onClick={() => handleQuickHighlight(color)}
                style={{ backgroundColor: config.hex }}
                aria-label={`Highlight with ${config.name}`}
                className={`w-6 h-6 rounded-full border border-black/10 dark:border-white/20 flex items-center justify-center transition hover:scale-110 ${
                  isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5 text-gray-900 stroke-[3]" />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsNoteOpen((v) => !v)}
            title="Attach Note"
            className={`p-1.5 rounded-lg transition ${
              isNoteOpen
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Cancel"
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Selected Quote Preview */}
      <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 line-clamp-2 italic text-[11px] text-gray-600 dark:text-gray-300">
        &ldquo;{selectedText}&rdquo;
      </div>

      {/* Note Attachment & Visibility Toggle (Expandable) */}
      {isNoteOpen && (
        <div className="space-y-2 pt-1 animate-in fade-in">
          <textarea
            autoFocus
            rows={2}
            placeholder="Add reflection or note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full p-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsShared((s) => !s)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border ${
                isShared
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                  : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}
            >
              {isShared ? (
                <>
                  <Users className="w-3.5 h-3.5" />
                  <span>Shared with Space</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Private Note</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleFullSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-sm transition disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Save Note</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
