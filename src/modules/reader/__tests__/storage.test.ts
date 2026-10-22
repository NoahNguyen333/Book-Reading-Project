import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookCacheService } from '../storage';

describe('BookCacheService (IndexedDB Blob Engine)', () => {
  // In-memory mock store for simulating IDB operations in Node/jsdom
  let inMemoryStore: Map<string, { bookId: string; data: ArrayBuffer; timestamp: number }>;

  beforeEach(() => {
    inMemoryStore = new Map();

    // Reset cached connection
    // @ts-expect-error accessing private static property for test isolation
    BookCacheService.dbPromise = null;

    const mockObjectStore = {
      put: vi.fn((record: { bookId: string; data: ArrayBuffer; timestamp: number }) => {
        inMemoryStore.set(record.bookId, record);
        const req = { onsuccess: null as unknown, onerror: null as unknown };
        setTimeout(() => {
          if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
        }, 0);
        return req;
      }),
      get: vi.fn((bookId: string) => {
        const record = inMemoryStore.get(bookId);
        const req = {
          result: record,
          onsuccess: null as unknown,
          onerror: null as unknown,
        };
        setTimeout(() => {
          if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
        }, 0);
        return req;
      }),
      count: vi.fn(() => {
        const req = {
          result: inMemoryStore.size,
          onsuccess: null as unknown,
          onerror: null as unknown,
        };
        setTimeout(() => {
          if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
        }, 0);
        return req;
      }),
      delete: vi.fn((bookId: string) => {
        inMemoryStore.delete(bookId);
        const req = { onsuccess: null as unknown, onerror: null as unknown };
        setTimeout(() => {
          if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
        }, 0);
        return req;
      }),
      clear: vi.fn(() => {
        inMemoryStore.clear();
        const req = { onsuccess: null as unknown, onerror: null as unknown };
        setTimeout(() => {
          if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
        }, 0);
        return req;
      }),
    };

    const mockDb = {
      objectStoreNames: {
        contains: vi.fn(() => true),
      },
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => mockObjectStore),
      })),
    };

    // Mock global indexedDB
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        const req = {
          result: mockDb,
          onsuccess: null as unknown,
          onerror: null as unknown,
          onupgradeneeded: null as unknown,
        };
        setTimeout(() => {
          if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
        }, 0);
        return req;
      }),
    });

    vi.stubGlobal('IDBKeyRange', {
      only: vi.fn((val) => val),
    });
  });

  it('saves an ArrayBuffer and retrieves it by bookId', async () => {
    const bookId = 'book-uuid-123';
    const dummyBuffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;

    await BookCacheService.saveBookBlob(bookId, dummyBuffer);

    const retrieved = await BookCacheService.getBookBlob(bookId);
    expect(retrieved).not.toBeNull();
    expect(new Uint8Array(retrieved!)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('saves a Blob and retrieves it as an ArrayBuffer', async () => {
    const bookId = 'book-blob-456';
    const blob = new Blob(['sample epub text content'], { type: 'application/epub+zip' });

    await BookCacheService.saveBookBlob(bookId, blob);

    const retrieved = await BookCacheService.getBookBlob(bookId);
    expect(retrieved).not.toBeNull();
    const text = new TextDecoder().decode(retrieved!);
    expect(text).toBe('sample epub text content');
  });

  it('deletes a cached book blob', async () => {
    const bookId = 'book-delete-789';
    const dummyBuffer = new Uint8Array([9, 8, 7]).buffer;

    await BookCacheService.saveBookBlob(bookId, dummyBuffer);
    expect(await BookCacheService.hasBookBlob(bookId)).toBe(true);

    await BookCacheService.removeBookBlob(bookId);
    const retrieved = await BookCacheService.getBookBlob(bookId);
    expect(retrieved).toBeNull();
  });

  it('clears all cached records', async () => {
    await BookCacheService.saveBookBlob('b1', new Uint8Array([1]).buffer);
    await BookCacheService.saveBookBlob('b2', new Uint8Array([2]).buffer);

    await BookCacheService.clearCache();
    expect(await BookCacheService.getBookBlob('b1')).toBeNull();
    expect(await BookCacheService.getBookBlob('b2')).toBeNull();
  });
});
