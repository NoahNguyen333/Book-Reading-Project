import { Book } from '@/modules/library/types';
import { Annotation, GroupedBookAnnotations, HighlightColor } from './types';

/**
 * Parses raw location string (e.g. 'page:12' or 'epubcfi(...)') into human-friendly reading label.
 */
export function parseLocationDisplay(location?: string | null): string {
  if (!location) return 'Unknown location';
  if (location.toLowerCase().startsWith('page:')) {
    const page = location.split(':')[1];
    return `Page ${page}`;
  }
  if (location.startsWith('epubcfi')) {
    return 'EPUB Location';
  }
  return location;
}

/**
 * Groups annotations by book, returning an array of GroupedBookAnnotations ordered by latest note.
 */
export function groupAnnotationsByBook(annotations: Annotation[]): GroupedBookAnnotations[] {
  const map = new Map<string, { book: Book; items: Annotation[] }>();

  for (const ann of annotations) {
    if (!ann.book) continue;
    const existing = map.get(ann.bookId);
    if (!existing) {
      map.set(ann.bookId, { book: ann.book, items: [ann] });
    } else {
      existing.items.push(ann);
    }
  }

  const grouped: GroupedBookAnnotations[] = [];
  for (const [, { book, items }] of map.entries()) {
    // Sort items newest first
    const sortedItems = [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    grouped.push({
      book,
      annotations: sortedItems,
      totalCount: sortedItems.length,
      lastAnnotatedAt: sortedItems[0]?.createdAt || book.updatedAt,
    });
  }

  // Sort books by most recently annotated
  return grouped.sort(
    (a, b) => new Date(b.lastAnnotatedAt).getTime() - new Date(a.lastAnnotatedAt).getTime()
  );
}

/**
 * Filters annotations by text query, color, or visibility.
 */
export function filterAnnotations(
  annotations: Annotation[],
  options: {
    query?: string;
    color?: HighlightColor | 'all';
    visibility?: 'all' | 'shared' | 'private';
  } = {}
): Annotation[] {
  const { query, color = 'all', visibility = 'all' } = options;
  const trimmed = query?.trim().toLowerCase();

  return annotations.filter((ann) => {
    // 1. Color filter
    if (color !== 'all' && ann.color !== color) {
      return false;
    }

    // 2. Visibility filter
    if (visibility === 'shared' && !ann.isShared) return false;
    if (visibility === 'private' && ann.isShared) return false;

    // 3. Search query
    if (trimmed) {
      const matchText = ann.highlightedText.toLowerCase().includes(trimmed);
      const matchNote = ann.note ? ann.note.toLowerCase().includes(trimmed) : false;
      const matchBook = ann.book ? ann.book.title.toLowerCase().includes(trimmed) : false;
      if (!matchText && !matchNote && !matchBook) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Exports a book's highlights and notes to clean Markdown format
 * following Readwise / Obsidian / Notion knowledge management conventions.
 */
export function formatAnnotationsToMarkdown(book: Book, annotations: Annotation[]): string {
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const lines: string[] = [
    `# ${book.title}`,
    `**Author:** ${book.author || 'Unknown Author'}`,
    `**Format:** ${book.format.toUpperCase()}`,
    `**Exported Date:** ${now}`,
    `**Total Highlights:** ${annotations.length}`,
    '',
    '---',
    '',
  ];

  if (annotations.length === 0) {
    lines.push('*No highlights or reflections found for this book.*');
    return lines.join('\n');
  }

  // Sort annotations by chronological order
  const sorted = [...annotations].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  sorted.forEach((ann, idx) => {
    const loc = parseLocationDisplay(ann.location);
    const colorLabel = ann.color.toUpperCase();
    const visibility = ann.isShared ? 'Shared' : 'Private';

    lines.push(`### Highlight ${idx + 1} (${loc})`);
    lines.push('');
    lines.push(`> "${ann.highlightedText.trim()}"`);
    lines.push('');

    if (ann.note && ann.note.trim()) {
      lines.push(`**Reflection:** ${ann.note.trim()}`);
      lines.push('');
    }

    lines.push(`*Color:* ${colorLabel} | *Visibility:* ${visibility} | *Saved:* ${new Date(ann.createdAt).toLocaleDateString()}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}
