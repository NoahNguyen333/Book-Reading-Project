'use client';

import React from 'react';
import Link from 'next/link';
import { Play, BookOpen, Clock, Bookmark } from 'lucide-react';
import { ActiveReadingItem } from '../types';

interface ContinueReadingSectionProps {
  items: ActiveReadingItem[];
}

function formatRelativeTime(dateString: string): string {
  try {
    const then = new Date(dateString).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return 'Vừa xong';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Hôm qua';
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return new Date(dateString).toLocaleDateString('vi-VN', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Gần đây';
  }
}

function formatLocationLabel(cfi?: string): string | null {
  if (!cfi) return null;
  if (cfi.toLowerCase().startsWith('page:')) {
    const pageNum = cfi.split(':')[1];
    return `Trang ${pageNum}`;
  }
  return null;
}

export function ContinueReadingSection({ items }: ContinueReadingSectionProps) {
  if (!items || items.length === 0) return null;

  const [leadItem, ...remainingItems] = items;
  const leadPct = Math.round(leadItem.percentage);
  const leadLoc = formatLocationLabel(leadItem.cfi);
  const leadTime = formatRelativeTime(leadItem.updatedAt);

  return (
    <section aria-labelledby="continue-reading-heading" className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-1 border-b border-[#E6E1D6] dark:border-[#2B2A26]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#FDF0EC] text-[#C25E38] dark:bg-[#281C18] dark:text-[#E08A6C] border border-[#F4D3C7] dark:border-[#3E2822]">
            <Bookmark className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="continue-reading-heading" className="font-serif text-xl sm:text-2xl font-bold text-[#23211E] dark:text-[#EDE9E1] tracking-tight">
                Tiếp tục đọc
              </h2>
              <span className="text-xs text-[#706B63] dark:text-[#999388] font-normal hidden sm:inline">
                Continue Reading
              </span>
            </div>
            <p className="text-xs text-[#706B63] dark:text-[#999388]">
              Mở lại đúng trang sách bạn đang đọc dở dang.
            </p>
          </div>
        </div>

        <span className="text-xs font-medium text-[#706B63] dark:text-[#999388] bg-[#EFECE4] dark:bg-[#20201C] px-2.5 py-1 rounded-full border border-[#E0DBD0] dark:border-[#2B2A26]">
          {items.length} {items.length === 1 ? 'cuốn đang đọc' : 'cuốn đang đọc'}
        </span>
      </div>

      {/* Hero Spotlight on Most Recent Book + Secondary Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Featured Hero Book (Lead item) */}
        <div className={`p-5 sm:p-6 rounded-2xl bg-[#FFFFFF] dark:bg-[#20201C] border border-[#E6E1D6] dark:border-[#2B2A26] shadow-xs flex flex-col justify-between space-y-4 ${
          remainingItems.length > 0 ? 'lg:col-span-7 xl:col-span-8' : 'lg:col-span-12'
        }`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Tangible Book Cover */}
            <div className="relative w-28 sm:w-36 aspect-[2/3] shrink-0 rounded-r-lg rounded-l-xs overflow-hidden bg-[#EFECE4] dark:bg-[#1E1D1A] border border-[#E0DBD0] dark:border-[#2E2D28] shadow-md flex items-center justify-center">
              {/* Simulated spine highlight on left edge */}
              <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-black/25 via-white/10 to-transparent z-10 pointer-events-none" />

              {leadItem.book.coverUrl && leadItem.book.coverUrl.startsWith('data:') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={leadItem.book.coverUrl}
                  alt={leadItem.book.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="p-3 text-center flex flex-col items-center justify-center h-full space-y-1 text-[#5B7065] dark:text-[#8FA196]">
                  <BookOpen className="w-8 h-8 opacity-60" />
                  <span className="font-serif font-bold text-[11px] leading-tight line-clamp-3 text-[#23211E] dark:text-[#EDE9E1]">
                    {leadItem.book.title}
                  </span>
                </div>
              )}

              {/* Format Badge */}
              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-[#23211E]/80 text-[#EDE9E1] backdrop-blur-xs">
                {leadItem.book.format}
              </span>
            </div>

            {/* Book Info */}
            <div className="flex-1 space-y-2.5 min-w-0">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[#C25E38] dark:text-[#D97750]">
                  Đang đọc gần nhất
                </span>
                <h3 className="font-serif text-lg sm:text-xl font-bold text-[#23211E] dark:text-[#EDE9E1] line-clamp-2 leading-snug">
                  {leadItem.book.title}
                </h3>
                <p className="text-xs text-[#706B63] dark:text-[#999388] line-clamp-1 italic mt-0.5">
                  {leadItem.book.author ? leadItem.book.author : 'Tác giả chưa cập nhật'}
                </p>
              </div>

              {/* Location & Time info */}
              <div className="flex items-center gap-3 text-xs text-[#706B63] dark:text-[#999388] flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{leadTime}</span>
                </span>
                {leadLoc && (
                  <>
                    <span>•</span>
                    <span className="font-medium text-[#23211E] dark:text-[#EDE9E1] bg-[#F7F4EE] dark:bg-[#161614] px-2 py-0.5 rounded border border-[#E6E1D6] dark:border-[#2B2A26]">
                      {leadLoc}
                    </span>
                  </>
                )}
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#706B63] dark:text-[#999388]">Tiến độ đọc</span>
                  <span className="font-serif font-bold text-[#C25E38] dark:text-[#D97750]">
                    {leadPct}%
                  </span>
                </div>
                <div className="w-full h-2 bg-[#EFECE4] dark:bg-[#2A2925] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C25E38] dark:bg-[#D97750] rounded-full transition-all duration-300"
                    style={{ width: `${leadPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2 border-t border-[#E6E1D6] dark:border-[#2B2A26]">
            <Link
              href={`/reader/${leadItem.book.id}`}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#C25E38] hover:bg-[#AF512E] text-white font-medium text-sm shadow-xs transition"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Đọc tiếp cuốn này</span>
            </Link>
          </div>
        </div>

        {/* Secondary In-Progress Books Queue (if any) */}
        {remainingItems.length > 0 && (
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col justify-between space-y-3">
            <span className="text-xs font-semibold text-[#706B63] dark:text-[#999388]">
              Các cuốn khác đang đọc ({remainingItems.length})
            </span>

            <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[290px] pr-1">
              {remainingItems.map(({ book, percentage, cfi, updatedAt }) => {
                const pct = Math.round(percentage);
                const loc = formatLocationLabel(cfi);
                const time = formatRelativeTime(updatedAt);

                return (
                  <div
                    key={book.id}
                    className="p-3 rounded-xl bg-[#FFFFFF] dark:bg-[#20201C] border border-[#E6E1D6] dark:border-[#2B2A26] shadow-xs hover:border-[#C25E38]/50 transition flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Mini Thumbnail */}
                      <div className="w-10 h-14 shrink-0 rounded bg-[#EFECE4] dark:bg-[#1E1D1A] border border-[#E0DBD0] dark:border-[#2E2D28] overflow-hidden flex items-center justify-center">
                        {book.coverUrl && book.coverUrl.startsWith('data:') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={book.coverUrl}
                            alt={book.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <BookOpen className="w-4 h-4 text-[#706B63]" />
                        )}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <h4 className="font-serif font-bold text-xs text-[#23211E] dark:text-[#EDE9E1] truncate">
                          {book.title}
                        </h4>
                        <div className="text-[11px] text-[#706B63] dark:text-[#999388] flex items-center gap-1.5 truncate">
                          <span>{pct}%</span>
                          {loc && (
                            <>
                              <span>•</span>
                              <span>{loc}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>{time}</span>
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/reader/${book.id}`}
                      className="px-3 py-1.5 rounded-lg bg-[#EFECE4] hover:bg-[#E5E1D6] dark:bg-[#2A2925] dark:hover:bg-[#34332E] text-[#23211E] dark:text-[#EDE9E1] text-xs font-semibold shrink-0 transition"
                      title={`Đọc tiếp ${book.title}`}
                    >
                      Tiếp tục
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
