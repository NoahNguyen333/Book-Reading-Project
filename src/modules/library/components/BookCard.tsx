'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { Book } from '../types';
import { Trash2, Loader2, ArrowRight, Play } from 'lucide-react';
import { deleteBookAction } from '../actions';
import { useLocale } from '@/lib/locale';
import { BookCover } from './BookCover';

interface BookCardProps {
  book: Book;
  isAdmin: boolean;
  tenantId: string;
  progress?: number;
}

export function BookCard({ book, isAdmin, tenantId, progress }: BookCardProps) {
  const { t } = useLocale();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleDelete = () => {
    const confirmMsg = t.bookCard.deleteConfirm.replace('{title}', book.title);
    if (confirm(confirmMsg)) {
      startDeleteTransition(async () => {
        await deleteBookAction(tenantId, book.id);
      });
    }
  };

  return (
    <div className="group relative flex flex-col bg-[#FFFFFF] dark:bg-[#20201C] rounded-2xl border border-[#E6E1D6] dark:border-[#2B2A26] shadow-xs overflow-hidden hover:border-[#C25E38]/50 hover:shadow-md transition duration-200">
      {/* Tangible Book Cover Area */}
      <div className="relative aspect-[3/4] w-full bg-[#EFECE4] dark:bg-[#1E1D1A] flex items-center justify-center overflow-hidden border-b border-[#E6E1D6] dark:border-[#2B2A26]">
        <BookCover book={book} size="card" />

        {/* Delete Book Action (Admin only) */}
        {isAdmin && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            title={t.bookCard.deleteTitle}
            className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition disabled:opacity-50 z-20 cursor-pointer"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Book Metadata & Actions */}
      <div className="p-3.5 sm:p-4 flex flex-col flex-1 justify-between space-y-3">
        <div className="space-y-1">
          <h3 className="font-serif font-bold text-[#23211E] dark:text-[#EDE9E1] text-sm sm:text-base line-clamp-2 leading-snug group-hover:text-[#C25E38] dark:group-hover:text-[#D97750] transition">
            {book.title}
          </h3>
          <p className="text-xs text-[#706B63] dark:text-[#999388] line-clamp-1 italic">
            {book.author ? book.author : t.bookCard.unknownAuthor}
          </p>
        </div>

        {/* Reading Progress Indicator */}
        {typeof progress === 'number' && progress > 0 && (
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-[11px] text-[#706B63] dark:text-[#999388]">
              <span>{t.bookCard.progress}</span>
              <span className="font-serif font-bold text-[#C25E38] dark:text-[#D97750]">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#EFECE4] dark:bg-[#2A2925] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C25E38] dark:bg-[#D97750] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, Math.round(progress)))}%` }}
              />
            </div>
          </div>
        )}

        {/* Read / Resume Button with Instant Visual Feedback */}
        <div className="pt-1">
          {typeof progress === 'number' && progress > 0 ? (
            <Link
              href={`/reader/${book.id}`}
              onClick={() => setIsNavigating(true)}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-xl text-xs font-semibold bg-[#C25E38] hover:bg-[#AF512E] text-white shadow-xs transition cursor-pointer"
            >
              {isNavigating ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{t.bookCard.openingBook}</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>{t.bookCard.continueBook}</span>
                </>
              )}
            </Link>
          ) : (
            <Link
              href={`/reader/${book.id}`}
              onClick={() => setIsNavigating(true)}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-xl text-xs font-semibold bg-[#EFECE4] hover:bg-[#E5E1D6] dark:bg-[#2A2925] dark:hover:bg-[#34332E] text-[#23211E] dark:text-[#EDE9E1] transition cursor-pointer"
            >
              {isNavigating ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{t.bookCard.openingBook}</span>
                </>
              ) : (
                <>
                  <span>{t.bookCard.readBook}</span>
                  <ArrowRight className="w-3 h-3" />
                </>
              )}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
