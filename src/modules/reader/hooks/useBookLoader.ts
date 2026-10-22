'use client';

import { useState, useEffect } from 'react';
import { BookCacheService } from '../storage';
import { getAuthorizedBookDownloadUrl } from '../actions';

export interface UseBookLoaderResult {
  bookData: ArrayBuffer | null;
  isLoading: boolean;
  error: string | null;
  source: 'cache' | 'network' | null;
  progress: number;
}

/**
 * Custom React hook that resolves an EPUB binary:
 * 1. Checks local IndexedDB cache first for offline-first, instant loading.
 * 2. On cache miss, requests a short-lived signed URL, downloads the binary,
 *    and writes it to IndexedDB for subsequent instant access.
 */
export function useBookLoader(bookId: string, tenantId: string): UseBookLoaderResult {
  const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'cache' | 'network' | null>(null);
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    let isCancelled = false;

    async function loadBook() {
      setIsLoading(true);
      setError(null);
      setProgress(10);

      try {
        // Step 1: Check client IndexedDB cache
        const cachedBlob = await BookCacheService.getBookBlob(bookId);
        if (cachedBlob && !isCancelled) {
          setBookData(cachedBlob);
          setSource('cache');
          setProgress(100);
          setIsLoading(false);
          return;
        }

        // Step 2: Cache miss -> generate authorized signed URL
        setProgress(30);
        const authRes = await getAuthorizedBookDownloadUrl(bookId, tenantId);
        if (authRes.error || !authRes.data?.signedUrl) {
          throw new Error(authRes.error || 'Failed to authorize book download.');
        }

        if (isCancelled) return;
        setProgress(50);
        setSource('network');

        // Step 3: Fetch private EPUB binary from Supabase Storage
        const response = await fetch(authRes.data.signedUrl);
        if (!response.ok) {
          throw new Error(`Failed to stream book file (HTTP ${response.status})`);
        }

        setProgress(75);
        const arrayBuffer = await response.arrayBuffer();

        // Step 4: Persist in IndexedDB for subsequent instant reads
        try {
          await BookCacheService.saveBookBlob(bookId, arrayBuffer);
        } catch (cacheErr) {
          console.warn('Failed to cache book blob in IndexedDB:', cacheErr);
        }

        if (!isCancelled) {
          setBookData(arrayBuffer);
          setProgress(100);
          setIsLoading(false);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error loading book.');
          setIsLoading(false);
        }
      }
    }

    if (bookId && tenantId) {
      loadBook();
    }

    return () => {
      isCancelled = true;
    };
  }, [bookId, tenantId]);

  return { bookData, isLoading, error, source, progress };
}
