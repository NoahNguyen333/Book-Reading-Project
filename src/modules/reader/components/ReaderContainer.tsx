'use client';

import React from 'react';
import { useBookLoader } from '../hooks/useBookLoader';
import { EpubReader } from './EpubReader';
import { Bookmark } from '../types';
import { Loader2, AlertCircle, HardDrive, CloudDownload } from 'lucide-react';
import { Button } from '@/components/ui';

interface ReaderContainerProps {
  bookId: string;
  tenantId: string;
  initialCfi?: string | null;
  initialBookmarks?: Bookmark[];
  bookTitle?: string;
}

export function ReaderContainer({
  bookId,
  tenantId,
  initialCfi,
  initialBookmarks = [],
  bookTitle,
}: ReaderContainerProps) {
  const { bookData, isLoading, error, source, progress } = useBookLoader(bookId, tenantId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-50 dark:bg-gray-950 p-6 space-y-4">
        <div className="relative flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-400" />
        </div>

        <div className="text-center space-y-1">
          <h3 className="font-bold text-gray-900 dark:text-white text-base">
            Loading {bookTitle ? `"${bookTitle}"` : 'Book'}
          </h3>
          <p className="text-xs text-gray-500">
            {source === 'cache' ? 'Hydrating from local IndexedDB cache...' : 'Retrieving from private family vault...'}
          </p>
        </div>

        <div className="w-64 max-w-full space-y-2">
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              {source === 'cache' ? (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Local Cache</span>
                </>
              ) : (
                <>
                  <CloudDownload className="w-3.5 h-3.5 text-blue-500" />
                  <span>Cloud Storage</span>
                </>
              )}
            </span>
            <span>{progress}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !bookData) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 p-6 rounded-2xl border border-red-200 dark:border-red-900 shadow-md text-center space-y-4">
          <div className="p-3 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 w-fit mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">Unable to Open Book</h3>
            <p className="text-xs text-gray-500 mt-1">{error || 'An unexpected error occurred.'}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
            className="w-full"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <EpubReader
      bookData={bookData}
      bookId={bookId}
      tenantId={tenantId}
      initialCfi={initialCfi}
      initialBookmarks={initialBookmarks}
    />
  );
}
