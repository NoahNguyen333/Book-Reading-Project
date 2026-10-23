'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  BookMarked,
  Search,
  Download,
  Copy,
  Check,
  Navigation,
  Trash2,
  Users,
  Lock,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { GroupedBookAnnotations, HighlightColor, HIGHLIGHT_COLOR_CONFIGS } from '../annotations/types';
import { filterAnnotations, formatAnnotationsToMarkdown, parseLocationDisplay } from '../annotations/utils';
import { deleteAnnotationAction } from '../annotations/actions';
import { Button } from '@/components/ui';
import { BookCover } from '@/modules/library/components/BookCover';

interface KnowledgeNotebookProps {
  groupedBooks: GroupedBookAnnotations[];
  tenantId: string;
  currentUserId: string;
  isAdmin: boolean;
}

export function KnowledgeNotebook({
  groupedBooks,
  tenantId,
  currentUserId,
  isAdmin,
}: KnowledgeNotebookProps) {
  const [selectedBookId, setSelectedBookId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColor, setSelectedColor] = useState<HighlightColor | 'all'>('all');
  const [selectedVisibility, setSelectedVisibility] = useState<'all' | 'shared' | 'private'>('all');
  const [isCopied, setIsCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Flatten all annotations across all books
  const allAnnotations = useMemo(() => {
    return groupedBooks.flatMap((g) => g.annotations);
  }, [groupedBooks]);

  // Selected book group if filtering by specific book
  const currentBookGroup = useMemo(() => {
    if (selectedBookId === 'all') return null;
    return groupedBooks.find((g) => g.book.id === selectedBookId) || null;
  }, [groupedBooks, selectedBookId]);

  // Target pool of annotations before text/color/visibility filtering
  const targetAnnotations = useMemo(() => {
    if (selectedBookId === 'all') {
      return allAnnotations;
    }
    return currentBookGroup?.annotations || [];
  }, [allAnnotations, currentBookGroup, selectedBookId]);

  // Filtered annotations
  const filteredAnnotations = useMemo(() => {
    return filterAnnotations(targetAnnotations, {
      query: searchQuery,
      color: selectedColor,
      visibility: selectedVisibility,
    });
  }, [targetAnnotations, searchQuery, selectedColor, selectedVisibility]);

  // Markdown export handler
  const handleExportMarkdown = (downloadFile = false) => {
    let md = '';
    if (currentBookGroup) {
      md = formatAnnotationsToMarkdown(currentBookGroup.book, filteredAnnotations);
    } else {
      // Export all books
      const sections = groupedBooks.map((g) => {
        const bookNotes = filteredAnnotations.filter((a) => a.bookId === g.book.id);
        return formatAnnotationsToMarkdown(g.book, bookNotes);
      });
      md = sections.join('\n\n========================================\n\n');
    }

    if (downloadFile) {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = currentBookGroup
        ? `${currentBookGroup.book.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_notes.md`
        : 'Family_Reading_Notebook.md';
      link.click();
      URL.revokeObjectURL(url);
    } else {
      navigator.clipboard.writeText(md);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleDelete = async (annId: string, bookId: string) => {
    if (confirm('Are you sure you want to delete this highlight?')) {
      setDeletingId(annId);
      try {
        await deleteAnnotationAction(annId, tenantId, bookId);
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2.5">
            <BookMarked className="w-7 h-7 text-amber-500" />
            <span>Knowledge Notebook</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Readwise-style book-first repository of your family quotes, reflections, and highlights.
          </p>
        </div>

        {allAnnotations.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExportMarkdown(false)}
              className="gap-1.5 text-xs"
              title="Copy Markdown to Clipboard"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'Copied MD' : 'Copy MD'}</span>
            </Button>

            <Button
              size="sm"
              onClick={() => handleExportMarkdown(true)}
              className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to Obsidian / Notion</span>
            </Button>
          </div>
        )}
      </div>

      {allAnnotations.length === 0 ? (
        /* Empty Notebook State */
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-4">
          <div className="p-4 rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <Sparkles className="w-10 h-10" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
              Your Knowledge Notebook is Empty
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              Select text in any EPUB or PDF book inside the reader to save highlights, reflections, and shared family notes.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-sm"
          >
            <BookOpen className="w-4 h-4" />
            <span>Open Library Bookshelf</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Left Column: Book Selector Cards */}
          <div className="lg:col-span-1 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 px-1">
              <span>Filter by Book</span>
              <span>{groupedBooks.length} books</span>
            </div>

            <div className="space-y-1.5">
              {/* All Books Button */}
              <button
                type="button"
                onClick={() => setSelectedBookId('all')}
                className={`w-full text-left p-3 rounded-xl transition flex items-center justify-between text-xs font-semibold ${
                  selectedBookId === 'all'
                    ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-200 dark:border-amber-900/60 shadow-sm'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60 border border-gray-200/60 dark:border-gray-800'
                }`}
              >
                <span>All Books</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/60 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                  {allAnnotations.length}
                </span>
              </button>

              {/* Book List */}
              {groupedBooks.map(({ book, totalCount }) => {
                const isSelected = selectedBookId === book.id;
                return (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => setSelectedBookId(book.id)}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-center gap-3 border ${
                      isSelected
                        ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200 border-blue-200 dark:border-blue-900/60 shadow-sm'
                        : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60 border-gray-200/60 dark:border-gray-800'
                    }`}
                  >
                    {/* Cover thumbnail */}
                    <div className="w-10 h-14 shrink-0 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                      <BookCover book={book} size="mini" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{book.title}</div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {book.author || 'Unknown'}
                      </div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium pt-0.5">
                        {totalCount} {totalCount === 1 ? 'highlight' : 'highlights'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Search, Filters & Highlight Stream */}
          <div className="lg:col-span-3 space-y-4">
            {/* Search and Filters Bar */}
            <div className="p-3.5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search quotes, reflections, or books..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Color Swatch Filters */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedColor('all')}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                      selectedColor === 'all'
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                        : 'text-gray-500 bg-gray-100 dark:bg-gray-800'
                    }`}
                  >
                    All
                  </button>
                  {(Object.keys(HIGHLIGHT_COLOR_CONFIGS) as HighlightColor[]).map((c) => {
                    const config = HIGHLIGHT_COLOR_CONFIGS[c];
                    const isSelected = selectedColor === c;

                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSelectedColor(c)}
                        style={{ backgroundColor: config.hex }}
                        aria-label={`Filter by ${config.name}`}
                        className={`w-6 h-6 rounded-full border border-black/10 transition hover:scale-110 flex items-center justify-center ${
                          isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-gray-900 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>

                {/* Visibility Filter */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedVisibility('all')}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                      selectedVisibility === 'all'
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-bold'
                        : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVisibility('shared')}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                      selectedVisibility === 'shared'
                        ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold'
                        : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    <span>Shared</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVisibility('private')}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                      selectedVisibility === 'private'
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-bold'
                        : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    <span>Private</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
                <span>
                  Showing {filteredAnnotations.length} of {targetAnnotations.length} highlights
                </span>
                {(searchQuery || selectedColor !== 'all' || selectedVisibility !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedColor('all');
                      setSelectedVisibility('all');
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>

            {/* Highlights Feed */}
            {filteredAnnotations.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 text-gray-400 text-xs">
                No highlights match your current search and filters.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAnnotations.map((ann) => {
                  const colorConfig = HIGHLIGHT_COLOR_CONFIGS[ann.color];
                  const locLabel = parseLocationDisplay(ann.location);
                  const isOwner = ann.userId === currentUserId || isAdmin;

                  return (
                    <div
                      key={ann.id}
                      className={`p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-3.5 transition hover:shadow-md ${
                        colorConfig.borderClass
                      } border-l-4`}
                    >
                      {/* Top Meta: Book & Location Citation */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          {ann.book && (
                            <span className="font-bold text-gray-900 dark:text-white truncate">
                              {ann.book.title}
                            </span>
                          )}
                          {ann.book?.author && (
                            <span className="text-gray-400 truncate">
                              • {ann.book.author}
                            </span>
                          )}
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                            {locLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                          {ann.isShared ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                              <Users className="w-3.5 h-3.5" />
                              <span>Shared</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                              <Lock className="w-3 h-3" />
                              <span>Private</span>
                            </span>
                          )}

                          <span className="text-[11px] text-gray-400">
                            {new Date(ann.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Quote Text */}
                      <div
                        style={{ backgroundColor: colorConfig.bgStyle }}
                        className="p-3.5 rounded-xl text-xs sm:text-sm italic text-gray-900 dark:text-gray-100 leading-relaxed"
                      >
                        &ldquo;{ann.highlightedText}&rdquo;
                      </div>

                      {/* Attached Reflection Note */}
                      {ann.note && (
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs text-gray-800 dark:text-gray-200 flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-bold text-[10px] uppercase text-gray-400">
                              Reflection Note
                            </span>
                            <p className="leading-snug">{ann.note}</p>
                          </div>
                        </div>
                      )}

                      {/* Bottom Actions: Jump to Context & Delete */}
                      <div className="pt-2 border-t border-gray-100 dark:border-gray-800/80 flex items-center justify-between gap-2">
                        <Link
                          href={`/reader/${ann.bookId}?loc=${encodeURIComponent(ann.location)}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-semibold text-xs transition"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Jump to Context in Book</span>
                        </Link>

                        {isOwner && (
                          <button
                            type="button"
                            disabled={deletingId === ann.id}
                            onClick={() => handleDelete(ann.id, ann.bookId)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                            title="Delete highlight"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
