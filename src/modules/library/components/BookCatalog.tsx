'use client';

import React, { useState } from 'react';
import { Book } from '../types';
import { BookCard } from './BookCard';
import { BookUploadModal } from './BookUploadModal';
import { Button } from '@/components/ui';
import { BookOpen, Plus, Sparkles } from 'lucide-react';

interface BookCatalogProps {
  books: Book[];
  isAdmin: boolean;
  tenantId: string;
}

export function BookCatalog({ books, isAdmin, tenantId }: BookCatalogProps) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Catalog Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Family Bookshelf
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {books.length} {books.length === 1 ? 'Book' : 'Books'}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Private, tenant-isolated EPUB storage with local IndexedDB device caching.
          </p>
        </div>

        {isAdmin && (
          <Button
            size="md"
            variant="primary"
            onClick={() => setIsUploadOpen(true)}
            className="gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Book</span>
          </Button>
        )}
      </div>

      {/* Catalog Grid or Empty State */}
      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 space-y-4">
          <div className="p-4 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <BookOpen className="w-10 h-10" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
              No Books in Library Yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isAdmin
                ? 'Upload your first EPUB book to share with readers in your family space.'
                : 'Your family admin has not uploaded any books yet. Check back soon!'}
            </p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsUploadOpen(true)}
              className="gap-2 mt-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Add First Book</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              isAdmin={isAdmin}
              tenantId={tenantId}
            />
          ))}
        </div>
      )}

      {/* Upload Modal (Admin Only) */}
      {isAdmin && (
        <BookUploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
