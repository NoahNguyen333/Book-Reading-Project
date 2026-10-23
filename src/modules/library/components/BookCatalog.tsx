'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Book } from '../types';
import { BookCard } from './BookCard';
import { BookUploadModal } from './BookUploadModal';
import { BookRequestModal } from './BookRequestModal';
import { LibraryToolbar } from './LibraryToolbar';
import { FormatFilter, SortOption, filterAndSortBooks } from '../search';
import { Button } from '@/components/ui';
import { BookOpen, Plus, Sparkles, SearchX, BookPlus } from 'lucide-react';

interface BookCatalogProps {
  books: Book[];
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  tenantId?: string;
  userProgressMap?: Record<string, number>;
}

export function BookCatalog({
  books,
  isAdmin = false,
  isSuperAdmin = false,
  tenantId = '',
  userProgressMap = {},
}: BookCatalogProps) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<FormatFilter>('all');
  const [selectedSort, setSelectedSort] = useState<SortOption>('recent');

  const canUpload = isSuperAdmin || isAdmin;

  const filteredBooks = useMemo(() => {
    return filterAndSortBooks(books, {
      query: searchQuery,
      format: selectedFormat,
      sortBy: selectedSort,
    });
  }, [books, searchQuery, selectedFormat, selectedSort]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedFormat('all');
    setSelectedSort('recent');
  }, []);

  return (
    <div className="space-y-6">
      {/* Catalog Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-100 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Thư viện sách (Library Catalog)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {books.length} {books.length === 1 ? 'Cuốn' : 'Cuốn'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Kho sách EPUB & PDF mở rộng cho mọi độc giả đọc độc lập với bộ nhớ đệm thiết bị và tiến độ cá nhân.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {canUpload ? (
            <Button
              size="md"
              variant="primary"
              onClick={() => setIsUploadOpen(true)}
              className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
            >
              <Plus className="w-4 h-4" />
              <span>Tải sách lên (Upload)</span>
            </Button>
          ) : (
            <Button
              size="md"
              variant="outline"
              onClick={() => setIsRequestOpen(true)}
              className="gap-2 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40"
            >
              <BookPlus className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Yêu cầu thêm sách</span>
            </Button>
          )}
        </div>
      </div>

      {/* Catalog Content */}
      {books.length === 0 ? (
        /* Empty State: No Books in Library */
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 space-y-4">
          <div className="p-4 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <BookOpen className="w-10 h-10" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
              Chưa có sách nào trong thư viện
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {canUpload
                ? 'Tải lên cuốn sách EPUB hoặc PDF đầu tiên để bắt đầu trải nghiệm đọc.'
                : 'Thư viện hiện đang trống. Hãy gửi yêu cầu thêm sách để Super Admin cập nhật!'}
            </p>
          </div>
          {canUpload ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsUploadOpen(true)}
              className="gap-2 mt-2 bg-blue-600 hover:bg-blue-500 text-white"
            >
              <Sparkles className="w-4 h-4" />
              <span>Thêm cuốn sách đầu tiên</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsRequestOpen(true)}
              className="gap-2 mt-2 bg-purple-600 hover:bg-purple-500 text-white"
            >
              <BookPlus className="w-4 h-4" />
              <span>Yêu cầu sách mới</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Interactive Toolbar */}
          <LibraryToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedFormat={selectedFormat}
            onFormatChange={setSelectedFormat}
            selectedSort={selectedSort}
            onSortChange={setSelectedSort}
            filteredCount={filteredBooks.length}
            totalCount={books.length}
            onClearFilters={handleClearFilters}
          />

          {/* Filtered Grid or Empty Search State */}
          {filteredBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-3">
              <div className="p-3.5 rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <SearchX className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="font-bold text-gray-900 dark:text-white text-base">
                  Không tìm thấy sách phù hợp
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Không có cuốn sách nào khớp với từ khóa tìm kiếm hoặc định dạng đã chọn.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearFilters}
                className="mt-2 text-xs"
              >
                Xóa bộ lọc
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {filteredBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  isAdmin={canUpload}
                  tenantId={tenantId}
                  progress={userProgressMap[book.id]}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Modal (Platform Super Admin Only) */}
      {canUpload && (
        <BookUploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          tenantId={tenantId}
        />
      )}

      {/* Book Request Modal (For Readers) */}
      <BookRequestModal
        isOpen={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
      />
    </div>
  );
}
