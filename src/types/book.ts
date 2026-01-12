// Book types for collecting writings into a book

export interface Book {
  id: string;
  title: string;
  writingIds: string[]; // References to writings - no content duplication
  createdAt: string; // ISO timestamp
  updatedAt: string;
  isSynced: boolean;
  deletedAt?: string; // Soft-delete timestamp
}

export interface BookMetadata {
  id: string;
  title: string;
  writingCount: number;
  createdAt: string;
  updatedAt: string;
  isSynced: boolean;
  deletedAt?: string;
}

export interface BookIndex {
  version: number;
  lastSyncTime?: string;
  books: BookMetadata[];
}

// Current book schema version
export const BOOK_INDEX_VERSION = 1;

// Helper functions
export function createBook(title: string): Book {
  const now = new Date().toISOString();
  return {
    id: Date.now().toString(),
    title,
    writingIds: [],
    createdAt: now,
    updatedAt: now,
    isSynced: false,
  };
}

export function metadataFromBook(book: Book): BookMetadata {
  return {
    id: book.id,
    title: book.title,
    writingCount: book.writingIds.length,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    isSynced: book.isSynced,
    deletedAt: book.deletedAt,
  };
}

export function isBookDeleted(book: Book | BookMetadata): boolean {
  return book.deletedAt !== undefined && book.deletedAt !== null;
}
