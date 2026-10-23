import { Book } from './types';

export type FormatFilter = 'all' | 'pdf' | 'epub';
export type SortOption = 'recent' | 'title-asc' | 'title-desc' | 'size-desc' | 'size-asc';

export interface FilterSortOptions {
  query?: string;
  format?: FormatFilter;
  sortBy?: SortOption;
}

export const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'recent', label: 'Recently Added' },
  { value: 'title-asc', label: 'Title (A–Z)' },
  { value: 'title-desc', label: 'Title (Z–A)' },
  { value: 'size-desc', label: 'File Size (Largest)' },
  { value: 'size-asc', label: 'File Size (Smallest)' },
];

/**
 * Filters a book catalog by text query (title, author, description) and format.
 */
export function filterBooks(
  books: Book[],
  query?: string,
  format: FormatFilter = 'all'
): Book[] {
  const trimmedQuery = query?.trim().toLowerCase();

  return books.filter((book) => {
    // 1. Format Filter
    if (format && format !== 'all') {
      const bookFormat = book.format?.toLowerCase();
      if (bookFormat !== format.toLowerCase()) {
        return false;
      }
    }

    // 2. Query Search
    if (trimmedQuery) {
      const matchTitle = book.title.toLowerCase().includes(trimmedQuery);
      const matchAuthor = book.author ? book.author.toLowerCase().includes(trimmedQuery) : false;
      const matchDescription = book.description
        ? book.description.toLowerCase().includes(trimmedQuery)
        : false;

      if (!matchTitle && !matchAuthor && !matchDescription) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sorts a collection of books based on the selected sorting comparator.
 */
export function sortBooks(books: Book[], sortBy: SortOption = 'recent'): Book[] {
  const copy = [...books];

  switch (sortBy) {
    case 'title-asc':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'title-desc':
      return copy.sort((a, b) => b.title.localeCompare(a.title));
    case 'size-desc':
      return copy.sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0));
    case 'size-asc':
      return copy.sort((a, b) => (a.fileSize || 0) - (b.fileSize || 0));
    case 'recent':
    default:
      return copy.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeB - timeA;
      });
  }
}

/**
 * Unified pipeline applying both filtering and sorting to books.
 */
export function filterAndSortBooks(
  books: Book[],
  { query, format = 'all', sortBy = 'recent' }: FilterSortOptions = {}
): Book[] {
  const filtered = filterBooks(books, query, format);
  return sortBooks(filtered, sortBy);
}
