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
    if (confirm(`Bạn có chắc chắn muốn xóa cuốn sách "${book.title}" khỏi thư viện không?`)) {
      startDeleteTransition(async () => {
        await deleteBookAction(tenantId, book.id);
      });
    }
  };

  const isPdf = book.format?.toLowerCase() === 'pdf';

  return (
    <div className="group relative flex flex-col bg-[#FFFFFF] dark:bg-[#20201C] rounded-2xl border border-[#E6E1D6] dark:border-[#2B2A26] shadow-xs overflow-hidden hover:border-[#C25E38]/50 hover:shadow-md transition duration-200">
      {/* Tangible Book Cover Area */}
      <div className="relative aspect-[3/4] w-full bg-[#EFECE4] dark:bg-[#1E1D1A] flex items-center justify-center overflow-hidden border-b border-[#E6E1D6] dark:border-[#2B2A26]">
        {/* Simulated spine highlight on left edge */}
        <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-black/20 via-white/10 to-transparent z-10 pointer-events-none" />

        {book.coverUrl && book.coverUrl.startsWith('data:') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover transition duration-300 group-hover:scale-103"
          />
        ) : (
          /* Editorial Bookcloth Cover Fallback */
          <div className="flex flex-col items-center justify-between p-4 h-full w-full text-center bg-gradient-to-br from-[#F4F0E8] to-[#EAE5DA] dark:from-[#252420] dark:to-[#1B1A17] border-4 border-dashed border-[#E0DBD0]/70 dark:border-[#32312B]/70 m-2 rounded-lg">
            <div className="pt-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5B7065] dark:text-[#8FA196]">
                {book.format}
              </span>
            </div>

            <div className="space-y-1 my-auto">
              <BookOpen className="w-6 h-6 text-[#706B63] dark:text-[#999388] mx-auto opacity-50 mb-1" />
              <h4 className="font-serif font-bold text-xs sm:text-sm text-[#23211E] dark:text-[#EDE9E1] line-clamp-3 leading-snug">
                {book.title}
              </h4>
            </div>

            <div className="pb-1">
              <span className="text-[11px] text-[#706B63] dark:text-[#999388] line-clamp-1 italic">
                {book.author || 'Tác giả'}
              </span>
            </div>
          </div>
        )}

        {/* Format Stamp */}
        <div className="absolute top-2.5 left-2.5 z-10">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-xs ${
              isPdf
                ? 'bg-[#FDF0EC] text-[#C25E38] border border-[#F4D3C7] dark:bg-[#281C18] dark:text-[#E08A6C] dark:border-[#3E2822]'
                : 'bg-[#EFECE4] text-[#5B7065] border border-[#D5D0C5] dark:bg-[#20201C] dark:text-[#8FA196] dark:border-[#2E2D28]'
            }`}
          >
            {book.format}
          </span>
        </div>

        {/* Delete Book Action (Admin only) */}
        {isAdmin && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            title="Xóa sách khỏi thư viện"
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
            {book.author ? book.author : 'Chưa rõ tác giả'}
          </p>
        </div>

        {/* Reading Progress Indicator */}
        {typeof progress === 'number' && progress > 0 && (
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-[11px] text-[#706B63] dark:text-[#999388]">
              <span>Tiến độ</span>
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

        {/* Read / Resume Button */}
        <div className="pt-1">
          {typeof progress === 'number' && progress > 0 ? (
            <Link
              href={`/reader/${book.id}`}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-xl text-xs font-semibold bg-[#C25E38] hover:bg-[#AF512E] text-white shadow-xs transition"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Đọc tiếp</span>
            </Link>
          ) : (
            <Link
              href={`/reader/${book.id}`}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-xl text-xs font-semibold bg-[#EFECE4] hover:bg-[#E5E1D6] dark:bg-[#2A2925] dark:hover:bg-[#34332E] text-[#23211E] dark:text-[#EDE9E1] transition"
            >
              <span>Mở sách</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
