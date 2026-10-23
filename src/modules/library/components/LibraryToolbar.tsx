'use client';

import React, { useState, useEffect } from 'react';
import { Search, X, ArrowUpDown } from 'lucide-react';
import { FormatFilter, SortOption, SORT_OPTIONS } from '../search';
import { useLocale } from '@/lib/locale';

interface LibraryToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedFormat: FormatFilter;
  onFormatChange: (format: FormatFilter) => void;
  selectedSort: SortOption;
  onSortChange: (sort: SortOption) => void;
  filteredCount: number;
  totalCount: number;
  onClearFilters?: () => void;
}

export function LibraryToolbar({
  searchQuery,
  onSearchChange,
  selectedFormat,
  onFormatChange,
  selectedSort,
  onSortChange,
  filteredCount,
  totalCount,
  onClearFilters,
}: LibraryToolbarProps) {
  const { t } = useLocale();
  const [localInput, setLocalInput] = useState(searchQuery);

  // Sync local input with external searchQuery
  useEffect(() => {
    setLocalInput(searchQuery);
  }, [searchQuery]);

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localInput !== searchQuery) {
        onSearchChange(localInput);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [localInput, searchQuery, onSearchChange]);

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedFormat !== 'all');

  const getSortLabel = (val: SortOption) => {
    switch (val) {
      case 'recent':
        return t.toolbar.sortRecent;
      case 'title-asc':
        return t.toolbar.sortTitleAsc;
      case 'title-desc':
        return t.toolbar.sortTitleDesc;
      case 'size-desc':
        return t.toolbar.sortSizeDesc;
      case 'size-asc':
        return t.toolbar.sortSizeAsc;
      default:
        return val;
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5 pb-2">
      {/* Search Input & Format Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#706B63] dark:text-[#999388]" />
          <input
            type="text"
            placeholder={t.toolbar.searchPlaceholder}
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm rounded-xl border border-[#E6E1D6] dark:border-[#2B2A26] bg-[#FFFFFF] dark:bg-[#20201C] text-[#23211E] dark:text-[#EDE9E1] placeholder:text-[#706B63]/60 focus:outline-none focus:ring-2 focus:ring-[#C25E38]/20 focus:border-[#C25E38] shadow-xs transition"
          />
          {localInput && (
            <button
              onClick={() => {
                setLocalInput('');
                onSearchChange('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#706B63] hover:text-[#23211E] dark:hover:text-[#EDE9E1] rounded-md transition"
              title={t.toolbar.clearSearch}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Format Selector Tabs */}
        <div className="inline-flex items-center p-1 rounded-xl bg-[#EFECE4] dark:bg-[#252420] border border-[#E0DBD0] dark:border-[#2B2A26] self-start sm:self-auto shrink-0">
          {(['all', 'epub', 'pdf'] as FormatFilter[]).map((fmt) => {
            const isActive = selectedFormat === fmt;
            return (
              <button
                key={fmt}
                onClick={() => onFormatChange(fmt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition cursor-pointer ${
                  isActive
                    ? 'bg-[#FFFFFF] dark:bg-[#1E1D1A] text-[#C25E38] dark:text-[#D97750] font-semibold shadow-xs'
                    : 'text-[#706B63] dark:text-[#999388] hover:text-[#23211E] dark:hover:text-[#EDE9E1]'
                }`}
              >
                {fmt === 'all' ? t.toolbar.allFormats : fmt.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sorting Dropdown & Filter Count */}
      <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-[#706B63] dark:text-[#999388]">
          <span className="font-medium">
            {hasActiveFilters
              ? `${filteredCount} / ${totalCount} ${t.toolbar.filteredCountSuffix}`
              : `${totalCount} ${t.toolbar.booksCount}`}
          </span>
          {hasActiveFilters && (
            <>
              <span>•</span>
              <button
                onClick={onClearFilters}
                className="text-[#C25E38] dark:text-[#D97750] hover:underline font-semibold cursor-pointer"
              >
                {t.toolbar.resetFilters}
              </button>
            </>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative flex items-center">
          <ArrowUpDown className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-[#706B63]" />
          <select
            value={selectedSort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            aria-label="Sắp xếp sách theo"
            className="pl-8 pr-8 py-2 text-xs rounded-xl border border-[#E6E1D6] dark:border-[#2B2A26] bg-[#FFFFFF] dark:bg-[#20201C] text-[#23211E] dark:text-[#EDE9E1] font-medium focus:outline-none focus:ring-2 focus:ring-[#C25E38]/20 focus:border-[#C25E38] shadow-xs appearance-none cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {getSortLabel(opt.value)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
