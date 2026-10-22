'use client';

import React, { useTransition } from 'react';
import { Book } from '../types';
import { BookOpen, Trash2, Loader2 } from 'lucide-react';
import { deleteBookAction } from '../actions';

interface BookCardProps {
  book: Book;
  isAdmin: boolean;
  tenantId: string;
}

export function BookCard({ book, isAdmin, tenantId }: BookCardProps) {
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
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-600 text-white shadow-sm">
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

        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
          <span>{formattedSize}</span>
          <span className="capitalize">{book.processingStatus}</span>
        </div>
      </div>
    </div>
  );
}
