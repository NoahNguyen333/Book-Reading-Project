'use client';

import React, { useTransition } from 'react';
import Link from 'next/link';
import { Book } from '../types';
import { BookOpen, Trash2, Loader2, ArrowRight, Play } from 'lucide-react';
import { deleteBookAction } from '../actions';

interface BookCardProps {
  book: Book;
  isAdmin: boolean;
  tenantId: string;
  progress?: number;
}

export function BookCard({ book, isAdmin, tenantId, progress }: BookCardProps) {
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = () => {
    if (confirm(`Are you sure you want to remove "${book.title}" from the family library?`)) {
      startDeleteTransition(async () => {
        await deleteBookAction(tenantId, book.id);
      });
    }
  };

  const formattedSize = book.fileSize
    ? book.fileSize > 1024 * 1024
      ? `${(book.fileSize / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(book.fileSize / 1024)} KB`
    : 'Unknown size';

  return (
    <div className="group relative flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden hover:shadow-md transition">
      {/* Cover Area */}
      <div className="relative aspect-[3/4] w-full bg-gradient-to-br from-blue-100 to-indigo-50 dark:from-gray-800 dark:to-gray-950 flex items-center justify-center overflow-hidden border-b border-gray-100 dark:border-gray-800">
        {book.coverUrl && book.coverUrl.startsWith('data:') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center text-gray-400">
            <BookOpen className="w-12 h-12 text-blue-500/60 dark:text-blue-400/50 mb-2" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider line-clamp-2">
              {book.title}
            </span>
          </div>
        )}

        <div className="absolute top-3 left-3">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white shadow-sm ${
              book.format?.toLowerCase() === 'pdf' ? 'bg-rose-600' : 'bg-blue-600'
            }`}
          >
            {book.format}
          </span>
        </div>

        {isAdmin && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete Book"
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Book Metadata */}
      <div className="p-4 flex flex-col flex-1 justify-between space-y-3">
        <div className="space-y-1">
          <h3 className="font-bold text-gray-900 dark:text-white text-base line-clamp-1 leading-snug">
            {book.title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
            {book.author ? `By ${book.author}` : 'Unknown Author'}
          </p>
        </div>

        {/* Optional Reading Progress Bar */}
        {typeof progress === 'number' && progress > 0 && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">
              <span>Progress</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, Math.round(progress)))}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
          <span>{formattedSize}</span>
          <span className="capitalize">{book.processingStatus}</span>
        </div>

        {typeof progress === 'number' && progress > 0 ? (
          <Link
            href={`/reader/${book.id}`}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Resume</span>
          </Link>
        ) : (
          <Link
            href={`/reader/${book.id}`}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition"
          >
            <span>Read Book</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
