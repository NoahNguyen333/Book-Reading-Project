'use client';

import React, { useState, useEffect } from 'react';
import { Search, X, ArrowUpDown } from 'lucide-react';
import { FormatFilter, SortOption, SORT_OPTIONS } from '../search';

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

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5 pb-2">
      {/* Search Input & Format Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search books, authors, topics..."
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
          {localInput && (
            <button
              onClick={() => {
                setLocalInput('');
                onSearchChange('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md transition"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Format Selector Tabs */}
        <div className="inline-flex items-center p-1 rounded-xl bg-gray-100 dark:bg-gray-800/80 border border-gray-200/60 dark:border-gray-700/60 self-start sm:self-auto shrink-0">
          {(['all', 'epub', 'pdf'] as FormatFilter[]).map((fmt) => {
            const isActive = selectedFormat === fmt;
            return (
              <button
                key={fmt}
                onClick={() => onFormatChange(fmt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  isActive
                    ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {fmt === 'all' ? 'All Formats' : fmt.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sorting Dropdown & Filter Count */}
      <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium">
            {hasActiveFilters
              ? `${filteredCount} of ${totalCount} books`
              : `${totalCount} ${totalCount === 1 ? 'book' : 'books'}`}
          </span>
          {hasActiveFilters && (
            <>
              <span>•</span>
              <button
                onClick={onClearFilters}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
              >
                Reset filters
              </button>
            </>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative flex items-center">
          <ArrowUpDown className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-gray-400" />
          <select
            value={selectedSort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            aria-label="Sort books by"
            className="pl-8 pr-8 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm appearance-none cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
