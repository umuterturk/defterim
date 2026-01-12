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
}

const DB_NAME = 'defterim-db';
const DB_VERSION = 1;
const METADATA_KEY = 'index';

class LocalStorageService {
  private db: IDBPDatabase<DefterimDB> | null = null;
  private metadataCache: MetadataIndex | null = null;

  async initialize(): Promise<void> {
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

    if (!this.db) return;
    
    const tx = this.db.transaction(['writings', 'metadata'], 'readwrite');
    await tx.objectStore('writings').clear();
    await tx.objectStore('metadata').clear();
    await tx.done;
  }
}

// Export singleton instance
export const localStorageService = new LocalStorageService();
