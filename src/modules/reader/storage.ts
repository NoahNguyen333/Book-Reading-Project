/**
 * BookCacheService: Client-side IndexedDB engine for caching EPUB blobs/ArrayBuffers.
 * Provides offline-first performance, instant chapter rendering, and bandwidth savings.
 */

const DB_NAME = 'family-reading-room-cache';
const DB_VERSION = 1;
const STORE_NAME = 'books';

export interface CachedBookRecord {
  bookId: string;
  data: ArrayBuffer;
  timestamp: number;
}

export class BookCacheService {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initializes or returns the cached IndexedDB database connection.
   */
  private static getDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not supported or not available in this environment.'));
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'bookId' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Stores an EPUB binary (ArrayBuffer or Blob) in the local IndexedDB cache.
   */
  static async saveBookBlob(bookId: string, data: ArrayBuffer | Blob): Promise<void> {
    const db = await this.getDB();

    let arrayBuffer: ArrayBuffer;
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      if (typeof data.arrayBuffer === 'function') {
        arrayBuffer = await data.arrayBuffer();
      } else {
        arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(data);
        });
      }
    } else {
      arrayBuffer = data as ArrayBuffer;
    }

    const record: CachedBookRecord = {
      bookId,
      data: arrayBuffer,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves an EPUB ArrayBuffer from the local IndexedDB cache by bookId.
   */
  static async getBookBlob(bookId: string): Promise<ArrayBuffer | null> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(bookId);

      request.onsuccess = () => {
        const record = request.result as CachedBookRecord | undefined;
        if (record && record.data) {
          resolve(record.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Checks whether a book binary exists in the local IndexedDB cache.
   */
  static async hasBookBlob(bookId: string): Promise<boolean> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count(IDBKeyRange.only(bookId));

      request.onsuccess = () => {
        resolve(request.result > 0);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Removes a book binary from the local IndexedDB cache.
   */
  static async removeBookBlob(bookId: string): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(bookId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clears the entire book cache store.
   */
  static async clearCache(): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
