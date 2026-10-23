'use client';

import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

/**
 * Resolves any representation of a book cover URL into a browser-consumable format:
 * 1. Base64/data URLs: Returned as-is for instant zero-network rendering.
 * 2. Absolute HTTP/HTTPS URLs: Returned as-is.
 * 3. Supabase Storage object paths: Converted to the authorized proxy route `/api/books/${bookId}/cover`.
 * 4. Empty/null/undefined: Returned as null.
 */
export function resolveCoverUrl(coverUrl?: string | null, bookId?: string): string | null {
  if (!coverUrl) return null;
  const trimmed = coverUrl.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }

  if (bookId) {
    return `/api/books/${bookId}/cover`;
  }

  return null;
}

/**
 * Stable, pure string hash to select deterministic visual styling without random layout shifts.
 */
export function getDeterministicSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface EditorialVariant {
  containerBg: string;
  innerBorder: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  motif: 'terracotta-rule' | 'sage-lozenge' | 'espresso-bookcloth' | 'geometric-seal';
}

const EDITORIAL_VARIANTS: EditorialVariant[] = [
  // Variant 0: Terracotta Rule & Warm Linen
  {
    containerBg: 'from-[#FAF7F2] to-[#F1ECE3] dark:from-[#22211E] dark:to-[#181715]',
    innerBorder: 'border-[#E6E1D6]/90 dark:border-[#2E2D28]',
    accentColor: '#C25E38',
    badgeBg: 'bg-[#FDF0EC] dark:bg-[#281C18]',
    badgeText: 'text-[#C25E38] dark:text-[#E08A6C]',
    badgeBorder: 'border-[#F4D3C7] dark:border-[#3E2822]',
    motif: 'terracotta-rule',
  },
  // Variant 1: Sage Lozenge & Crisp Pressed Paper
  {
    containerBg: 'from-[#FAF9F5] to-[#EFECE4] dark:from-[#1E211E] dark:to-[#161816]',
    innerBorder: 'border-[#DCE2DE]/90 dark:border-[#282F2A]',
    accentColor: '#5B7065',
    badgeBg: 'bg-[#EFECE4] dark:bg-[#20201C]',
    badgeText: 'text-[#5B7065] dark:text-[#8FA196]',
    badgeBorder: 'border-[#D5D0C5] dark:border-[#2E2D28]',
    motif: 'sage-lozenge',
  },
  // Variant 2: Classic Bookcloth & Espresso Frame
  {
    containerBg: 'from-[#F6F3EC] to-[#EAE4D7] dark:from-[#201F1C] dark:to-[#171614]',
    innerBorder: 'border-[#E0DBD0] dark:border-[#32312B]',
    accentColor: '#23211E',
    badgeBg: 'bg-[#EFECE4] dark:bg-[#252420]',
    badgeText: 'text-[#706B63] dark:text-[#999388]',
    badgeBorder: 'border-[#E0DBD0] dark:border-[#2B2A26]',
    motif: 'espresso-bookcloth',
  },
  // Variant 3: Warm Parchment & Monogram Seal
  {
    containerBg: 'from-[#F8F5EF] to-[#EFE8DD] dark:from-[#23221E] dark:to-[#191816]',
    innerBorder: 'border-[#E6E1D6] dark:border-[#2B2A26]',
    accentColor: '#C25E38',
    badgeBg: 'bg-[#FDF0EC] dark:bg-[#281C18]',
    badgeText: 'text-[#C25E38] dark:text-[#E08A6C]',
    badgeBorder: 'border-[#F4D3C7] dark:border-[#3E2822]',
    motif: 'geometric-seal',
  },
];

export interface BookCoverProps {
  book: {
    id: string;
    title: string;
    author?: string | null;
    format?: string;
    coverUrl?: string | null;
  };
  size?: 'card' | 'hero' | 'mini';
  className?: string;
  showSpineShadow?: boolean;
}

export function BookCover({
  book,
  size = 'card',
  className = '',
  showSpineShadow = true,
}: BookCoverProps) {
  const [hasError, setHasError] = useState(false);
  const coverSrc = resolveCoverUrl(book.coverUrl, book.id);

  const seed = getDeterministicSeed(book.id || book.title || 'book');
  const variant = EDITORIAL_VARIANTS[seed % EDITORIAL_VARIANTS.length];
  const formatLabel = book.format?.toUpperCase() || 'EPUB';
  const isPdf = book.format?.toLowerCase() === 'pdf';

  // 1. Genuine / Authentic Cover rendering when available
  if (coverSrc && !hasError) {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className}`}>
        {showSpineShadow && (
          <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-black/20 via-white/10 to-transparent z-10 pointer-events-none" />
        )}

        {/* Format Stamp for authentic covers */}
        {size !== 'mini' && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-xs ${
                isPdf
                  ? 'bg-[#FDF0EC]/95 text-[#C25E38] border border-[#F4D3C7] dark:bg-[#281C18]/95 dark:text-[#E08A6C] dark:border-[#3E2822]'
                  : 'bg-[#EFECE4]/95 text-[#5B7065] border border-[#D5D0C5] dark:bg-[#20201C]/95 dark:text-[#8FA196] dark:border-[#2E2D28]'
              }`}
            >
              {formatLabel}
            </span>
          </div>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverSrc}
          alt={book.title}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover transition duration-300 group-hover:scale-103"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // 2. Deterministic Cozy Editorial Fallback
  if (size === 'mini') {
    // Compact 40x56 thumbnail fallback for queues & sidebar
    const initialLetter = (book.title.trim()[0] || 'B').toUpperCase();
    return (
      <div
        className={`relative w-full h-full bg-gradient-to-br ${variant.containerBg} flex flex-col items-center justify-between p-1 text-center select-none ${className}`}
      >
        {showSpineShadow && (
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-r from-black/20 to-transparent z-10 pointer-events-none" />
        )}
        <span className="text-[8px] font-bold uppercase tracking-wider text-[#706B63] dark:text-[#999388] pt-0.5">
          {formatLabel}
        </span>
        <span className="font-serif font-bold text-sm text-[#23211E] dark:text-[#EDE9E1] my-auto">
          {initialLetter}
        </span>
        <div className="w-4 h-0.5 bg-[#E6E1D6] dark:bg-[#32312B] rounded-full mb-0.5" />
      </div>
    );
  }

  // Full-size Card and Hero Fallbacks
  return (
    <div
      className={`relative w-full h-full bg-gradient-to-br ${variant.containerBg} flex flex-col justify-between p-3.5 sm:p-4 text-center select-none overflow-hidden ${className}`}
    >
      {showSpineShadow && (
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/20 via-white/10 to-transparent z-10 pointer-events-none" />
      )}

      {/* Top Header: Format Badge & Clean Subtle Motifs */}
      <div className="flex items-center justify-between w-full pt-1">
        <span
          className={`px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shadow-2xs border ${variant.badgeBg} ${variant.badgeText} ${variant.badgeBorder}`}
        >
          {formatLabel}
        </span>

        {/* Small subtle geometric icon */}
        <div className="opacity-40">
          <BookOpen className="w-3.5 h-3.5 text-[#706B63] dark:text-[#999388]" />
        </div>
      </div>

      {/* Centerpiece: Primary Book Title in Lora Serif with Geometric Dividers */}
      <div className="my-auto space-y-2 py-2 px-1">
        {/* Subtle decorative divider based on deterministic motif */}
        {variant.motif === 'terracotta-rule' && (
          <div className="flex items-center justify-center gap-1.5 opacity-60">
            <div className="w-5 h-px bg-[#C25E38]" />
            <div className="w-1 h-1 rounded-full bg-[#C25E38]" />
            <div className="w-5 h-px bg-[#C25E38]" />
          </div>
        )}

        {variant.motif === 'sage-lozenge' && (
          <div className="flex items-center justify-center gap-1 opacity-60">
            <div className="w-6 h-px bg-[#5B7065]" />
            <span className="text-[9px] text-[#5B7065] leading-none">◆</span>
            <div className="w-6 h-px bg-[#5B7065]" />
          </div>
        )}

        {variant.motif === 'espresso-bookcloth' && (
          <div className="w-10 h-0.5 bg-[#706B63]/30 mx-auto rounded-full" />
        )}

        {variant.motif === 'geometric-seal' && (
          <div className="w-6 h-6 rounded-full border border-[#C25E38]/30 mx-auto flex items-center justify-center">
            <span className="font-serif text-[10px] text-[#C25E38] font-bold">
              {(book.title.trim()[0] || 'B').toUpperCase()}
            </span>
          </div>
        )}

        {/* Book Title (Primary Visual Element, wrapped safely without overflow) */}
        <h4 className="font-serif font-bold text-xs sm:text-sm text-[#23211E] dark:text-[#EDE9E1] line-clamp-3 sm:line-clamp-4 leading-snug break-words px-1">
          {book.title}
        </h4>

        {variant.motif === 'terracotta-rule' && (
          <div className="w-6 h-px bg-[#C25E38]/30 mx-auto" />
        )}
      </div>

      {/* Bottom Area: Author Name as Secondary Information */}
      <div className="pb-1 border-t border-[#E6E1D6]/60 dark:border-[#2B2A26]/60 pt-2">
        <span className="text-[11px] text-[#706B63] dark:text-[#999388] line-clamp-1 italic font-sans break-words">
          {book.author ? book.author : 'Tác giả chưa cập nhật'}
        </span>
      </div>
    </div>
  );
}
