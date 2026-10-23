'use client';

import React from 'react';
import Link from 'next/link';
import { BookMarked, Play, BookOpen, Clock } from 'lucide-react';
import { ActiveReadingItem } from '../types';

interface ContinueReadingSectionProps {
  items: ActiveReadingItem[];
}

function formatRelativeTime(dateString: string): string {
  try {
    const then = new Date(dateString).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

function formatLocationLabel(cfi?: string): string | null {
  if (!cfi) return null;
  if (cfi.toLowerCase().startsWith('page:')) {
    const pageNum = cfi.split(':')[1];
    return `Page ${pageNum}`;
  }
  return null;
}

export function ContinueReadingSection({ items }: ContinueReadingSectionProps) {
  if (!items || items.length === 0) return null;

  return (
    <section aria-labelledby="continue-reading-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60">
            <BookMarked className="w-5 h-5" />
          </div>
          <div>
            <h2 id="continue-reading-heading" className="text-lg font-bold text-gray-900 dark:text-white">
              Continue Reading
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pick up right where you left off in your family library.
            </p>
          </div>
        </div>

        <span className="text-xs font-semibold text-gray-400">
          {items.length} {items.length === 1 ? 'in progress' : 'books in progress'}
        </span>
      </div>

      {/* Books Carousel / Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(({ book, percentage, cfi, updatedAt }) => {
          const roundedPct = Math.round(percentage);
          const locationLabel = formatLocationLabel(cfi);
          const timeAgo = formatRelativeTime(updatedAt);

          return (
            <div
              key={book.id}
              className="group relative flex flex-col justify-between p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:border-blue-500/50 hover:shadow-md transition space-y-3.5"
            >
              <div className="flex items-start gap-3.5">
                {/* Book Thumbnail */}
                <div className="relative w-14 h-20 shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-gray-800 dark:to-gray-900 border border-gray-100 dark:border-gray-800 flex items-center justify-center">
                  {book.coverUrl && book.coverUrl.startsWith('data:') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={book.coverUrl}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <BookOpen className="w-6 h-6 text-blue-500/60" />
                  )}
                  <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[8px] font-bold uppercase bg-black/70 text-white">
                    {book.format}
                  </span>
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-500 transition">
                    {book.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {book.author ? `By ${book.author}` : 'Unknown Author'}
                  </p>

                  <div className="flex items-center gap-2 pt-1 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{timeAgo}</span>
                    </span>
                    {locationLabel && (
                      <>
                        <span>•</span>
                        <span className="font-medium text-gray-600 dark:text-gray-300">
                          {locationLabel}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar & Resume Button */}
              <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800/80">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                    <span>Reading progress</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {roundedPct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${roundedPct}%` }}
                    />
                  </div>
                </div>

                <Link
                  href={`/reader/${book.id}`}
                  className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-sm transition"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
