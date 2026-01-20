import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Writing,
  WritingMetadata,
  MetadataIndex,
} from '../types/writing';
import {
  METADATA_INDEX_VERSION,
  metadataFromWriting,
  isDeleted,
} from '../types/writing';
import type {
  Book,
  BookMetadata,
  BookIndex,
} from '../types/book';
import {
  BOOK_INDEX_VERSION,
  metadataFromBook,
  isBookDeleted,
} from '../types/book';

// IndexedDB schema
interface DefterimDB extends DBSchema {
  writings: {
    key: string;
    value: Writing;
    indexes: { 'by-updated': string };
  };
  metadata: {
    key: string;
    value: MetadataIndex;
  };
  books: {
    key: string;
    value: Book;
    indexes: { 'by-updated': string };
  };
  bookMetadata: {
    key: string;
    value: BookIndex;
  };
}

const DB_NAME = 'defterim-db';
const DB_VERSION = 2; // Incremented for books support
const METADATA_KEY = 'index';
const BOOK_METADATA_KEY = 'book-index';

class LocalStorageService {
  private db: IDBPDatabase<DefterimDB> | null = null;
  private metadataCache: MetadataIndex | null = null;
  private bookMetadataCache: BookIndex | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.db) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    this.db = await openDB<DefterimDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create writings object store
        if (!db.objectStoreNames.contains('writings')) {
          const writingsStore = db.createObjectStore('writings', { keyPath: 'id' });
          writingsStore.createIndex('by-updated', 'updatedAt');
        }
        
        // Create metadata object store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata');
        }

        // Create books object store
        if (!db.objectStoreNames.contains('books')) {
          const booksStore = db.createObjectStore('books', { keyPath: 'id' });
          booksStore.createIndex('by-updated', 'updatedAt');
        }

        // Create book metadata object store
        if (!db.objectStoreNames.contains('bookMetadata')) {
          db.createObjectStore('bookMetadata');
        }
      },
    });
    
    console.log('LocalStorageService initialized (IndexedDB)');
  }

  // ========== METADATA INDEX OPERATIONS ==========

  async loadMetadataIndex(): Promise<MetadataIndex> {
    if (this.metadataCache) {
      return this.metadataCache;
    }

    if (!this.db) {
      return { version: METADATA_INDEX_VERSION, writings: [] };
    }

    try {
      const index = await this.db.get('metadata', METADATA_KEY);
      
      if (!index) {
        // First run or migration: build index from existing writings
        console.log('Metadata index not found, building from existing writings...');
        const rebuilt = await this.rebuildMetadataIndex();
        this.metadataCache = rebuilt;
        return rebuilt;
      }

      // Check if metadata schema is outdated
      if (index.version < METADATA_INDEX_VERSION) {
        console.log(`Metadata index version ${index.version} is outdated, rebuilding...`);
        const rebuilt = await this.rebuildMetadataIndex();
        this.metadataCache = rebuilt;
        return rebuilt;
      }

      this.metadataCache = index;
      console.log(`Loaded metadata index: ${index.writings.length} writings`);
      return index;
    } catch (e) {
      console.error('Error loading metadata index, rebuilding:', e);
      const rebuilt = await this.rebuildMetadataIndex();
      this.metadataCache = rebuilt;
      return rebuilt;
    }
  }

  async saveMetadataIndex(index: MetadataIndex): Promise<void> {
    this.metadataCache = index;

    if (!this.db) return;
    await this.db.put('metadata', index, METADATA_KEY);
  }

  async rebuildMetadataIndex(): Promise<MetadataIndex> {
    if (!this.db) {
      return { version: METADATA_INDEX_VERSION, writings: [] };
    }

    const writings = await this.db.getAll('writings');
    const metadataList = writings.map(metadataFromWriting);

    const index: MetadataIndex = {
      version: METADATA_INDEX_VERSION,
      writings: metadataList,
    };

    await this.saveMetadataIndex(index);
    console.log(`Rebuilt metadata index: ${metadataList.length} writings`);
    return index;
  }

  async updateLastSyncTime(syncTime: Date): Promise<void> {
    const index = await this.loadMetadataIndex();
    await this.saveMetadataIndex({
      ...index,
      lastSyncTime: syncTime.toISOString(),
    });
  }

  async getLastSyncTime(): Promise<Date | null> {
    const index = await this.loadMetadataIndex();
    return index.lastSyncTime ? new Date(index.lastSyncTime) : null;
  }

  // ========== METADATA OPERATIONS (FAST) ==========

  async getAllWritingsMetadata(): Promise<WritingMetadata[]> {
    const index = await this.loadMetadataIndex();
    const activeWritings = index.writings.filter((w) => !isDeleted(w));
    activeWritings.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return activeWritings;
  }

  async getAllWritingsMetadataIncludingDeleted(): Promise<WritingMetadata[]> {
    const index = await this.loadMetadataIndex();
    return index.writings;
  }

  async getWritingMetadata(id: string): Promise<WritingMetadata | null> {
    const index = await this.loadMetadataIndex();
    return index.writings.find((w) => w.id === id) ?? null;
  }

  async updateWritingMetadata(metadata: WritingMetadata): Promise<void> {
    const index = await this.loadMetadataIndex();
    const writings = index.writings.filter((w) => w.id !== metadata.id);
    writings.push(metadata);
    await this.saveMetadataIndex({ ...index, writings });
  }

  async batchUpdateWritingsMetadata(metadataList: WritingMetadata[]): Promise<void> {
    if (metadataList.length === 0) return;
    
    const index = await this.loadMetadataIndex();
    const idsToUpdate = new Set(metadataList.map((m) => m.id));
    
    // Remove old versions
    const filteredWritings = index.writings.filter((w) => !idsToUpdate.has(w.id));
    
    // Add new versions
    const newWritings = [...filteredWritings, ...metadataList];
    
    await this.saveMetadataIndex({ ...index, writings: newWritings });
    console.log(`LocalStorage: Batch updated ${metadataList.length} metadata items`);
  }

  async removeWritingMetadata(id: string): Promise<void> {
    const index = await this.loadMetadataIndex();
    const writings = index.writings.filter((w) => w.id !== id);
    await this.saveMetadataIndex({ ...index, writings });
  }

  // ========== FULL WRITING OPERATIONS (ON-DEMAND) ==========

  async getFullWriting(id: string): Promise<Writing | null> {
    // Ensure DB is initialized before reading
    await this.initialize();
    
    if (!this.db) return null;
    
    const writing = await this.db.get('writings', id);
    return writing ?? null;
  }

  /**
   * Check if a writing's body is cached locally (available offline)
   */
  async hasLocalBody(id: string): Promise<boolean> {
    if (!this.db) return false;
    const writing = await this.db.get('writings', id);
    return writing !== undefined && writing.body !== undefined;
  }

  /**
   * Get IDs of all writings that have their body cached locally
   */
  async getLocallyAvailableIds(): Promise<Set<string>> {
    if (!this.db) return new Set();
    const writings = await this.db.getAll('writings');
    return new Set(writings.filter(w => w.body !== undefined).map(w => w.id));
  }

  async saveWriting(writing: Writing): Promise<void> {
    if (!this.db) return;

    // Save full content to IndexedDB
    await this.db.put('writings', writing);

    // Update metadata index
    const metadata = metadataFromWriting(writing);
    await this.updateWritingMetadata(metadata);
  }

  async deleteWriting(id: string): Promise<void> {
    const writing = await this.getFullWriting(id);
    if (!writing) return;

    // Soft-delete: mark with timestamp and set as unsynced
    const deletedWriting: Writing = {
      ...writing,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    await this.saveWriting(deletedWriting);
  }

  async permanentlyDeleteWriting(id: string): Promise<void> {
    // Remove from metadata index
    await this.removeWritingMetadata(id);

    // Remove from IndexedDB
    if (this.db) {
      await this.db.delete('writings', id);
    }
  }

  // ========== LEGACY METHODS (for sync) ==========

  async getAllWritings(): Promise<Writing[]> {
    const allWritings = await this.getAllWritingsIncludingDeleted();
    const activeWritings = allWritings.filter((w) => !isDeleted(w));
    activeWritings.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return activeWritings;
  }

  async getAllWritingsIncludingDeleted(): Promise<Writing[]> {
    if (!this.db) return [];
    return this.db.getAll('writings');
  }

  // ========== HELPER METHODS ==========

  async clearAll(): Promise<void> {
    this.metadataCache = null;
    this.bookMetadataCache = null;

    if (!this.db) return;
    
    const tx = this.db.transaction(['writings', 'metadata', 'books', 'bookMetadata'], 'readwrite');
    await tx.objectStore('writings').clear();
    await tx.objectStore('metadata').clear();
    await tx.objectStore('books').clear();
    await tx.objectStore('bookMetadata').clear();
    await tx.done;
  }

  // ========== BOOK METADATA INDEX OPERATIONS ==========

  async loadBookMetadataIndex(): Promise<BookIndex> {
    if (this.bookMetadataCache) {
      return this.bookMetadataCache;
    }

    if (!this.db) {
      return { version: BOOK_INDEX_VERSION, books: [] };
    }

    try {
      const index = await this.db.get('bookMetadata', BOOK_METADATA_KEY);
      
      if (!index) {
        // First run or migration: build index from existing books
        console.log('Book metadata index not found, building from existing books...');
        const rebuilt = await this.rebuildBookMetadataIndex();
        this.bookMetadataCache = rebuilt;
        return rebuilt;
      }

      // Check if metadata schema is outdated
      if (index.version < BOOK_INDEX_VERSION) {
        console.log(`Book metadata index version ${index.version} is outdated, rebuilding...`);
        const rebuilt = await this.rebuildBookMetadataIndex();
        this.bookMetadataCache = rebuilt;
        return rebuilt;
      }

      this.bookMetadataCache = index;
      console.log(`Loaded book metadata index: ${index.books.length} books`);
      return index;
    } catch (e) {
      console.error('Error loading book metadata index, rebuilding:', e);
      const rebuilt = await this.rebuildBookMetadataIndex();
      this.bookMetadataCache = rebuilt;
      return rebuilt;
    }
  }

  async saveBookMetadataIndex(index: BookIndex): Promise<void> {
    this.bookMetadataCache = index;

    if (!this.db) return;
    await this.db.put('bookMetadata', index, BOOK_METADATA_KEY);
  }

  async rebuildBookMetadataIndex(): Promise<BookIndex> {
    if (!this.db) {
      return { version: BOOK_INDEX_VERSION, books: [] };
    }

    const books = await this.db.getAll('books');
    const metadataList = books.map(metadataFromBook);

    const index: BookIndex = {
      version: BOOK_INDEX_VERSION,
      books: metadataList,
    };

    await this.saveBookMetadataIndex(index);
    console.log(`Rebuilt book metadata index: ${metadataList.length} books`);
    return index;
  }

  async updateBookLastSyncTime(syncTime: Date): Promise<void> {
    const index = await this.loadBookMetadataIndex();
    await this.saveBookMetadataIndex({
      ...index,
      lastSyncTime: syncTime.toISOString(),
    });
  }

  async getBookLastSyncTime(): Promise<Date | null> {
    const index = await this.loadBookMetadataIndex();
    return index.lastSyncTime ? new Date(index.lastSyncTime) : null;
  }

  // ========== BOOK METADATA OPERATIONS (FAST) ==========

  async getAllBooksMetadata(): Promise<BookMetadata[]> {
    const index = await this.loadBookMetadataIndex();
    const activeBooks = index.books.filter((b) => !isBookDeleted(b));
    activeBooks.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return activeBooks;
  }

  async getAllBooksMetadataIncludingDeleted(): Promise<BookMetadata[]> {
    const index = await this.loadBookMetadataIndex();
    return index.books;
  }

  async getBookMetadata(id: string): Promise<BookMetadata | null> {
    const index = await this.loadBookMetadataIndex();
    return index.books.find((b) => b.id === id) ?? null;
  }

  async updateBookMetadata(metadata: BookMetadata): Promise<void> {
    const index = await this.loadBookMetadataIndex();
    const books = index.books.filter((b) => b.id !== metadata.id);
    books.push(metadata);
    await this.saveBookMetadataIndex({ ...index, books });
  }

  async removeBookMetadata(id: string): Promise<void> {
    const index = await this.loadBookMetadataIndex();
    const books = index.books.filter((b) => b.id !== id);
    await this.saveBookMetadataIndex({ ...index, books });
  }

  // ========== FULL BOOK OPERATIONS ==========

  async getBook(id: string): Promise<Book | null> {
    // Ensure DB is initialized before reading
    await this.initialize();
    
    if (!this.db) return null;
    
    const book = await this.db.get('books', id);
    return book ?? null;
  }

  async saveBook(book: Book): Promise<void> {
    if (!this.db) return;

    // Save full book to IndexedDB
    await this.db.put('books', book);

    // Update metadata index
    const metadata = metadataFromBook(book);
    await this.updateBookMetadata(metadata);
  }

  async deleteBook(id: string): Promise<void> {
    const book = await this.getBook(id);
    if (!book) return;

    // Soft-delete: mark with timestamp and set as unsynced
    const deletedBook: Book = {
      ...book,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    await this.saveBook(deletedBook);
  }

  async permanentlyDeleteBook(id: string): Promise<void> {
    // Remove from metadata index
    await this.removeBookMetadata(id);

    // Remove from IndexedDB
    if (this.db) {
      await this.db.delete('books', id);
    }
  }

  async getAllBooks(): Promise<Book[]> {
    const allBooks = await this.getAllBooksIncludingDeleted();
    const activeBooks = allBooks.filter((b) => !isBookDeleted(b));
    activeBooks.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return activeBooks;
  }

  async getAllBooksIncludingDeleted(): Promise<Book[]> {
    if (!this.db) return [];
    return this.db.getAll('books');
  }
}

// Export singleton instance
export const localStorageService = new LocalStorageService();
