import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../config/firebase';
import { localStorageService } from './localStorageService';
import type {
  Writing,
  WritingMetadata,
  WritingType,
} from '../types/writing';
import {
  generatePreview,
  isDeleted,
} from '../types/writing';

type SyncCallback = () => void;
type LoadingCallback = (isLoading: boolean, progress?: number) => void;

class FirebaseSyncService {
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private remoteListener: Unsubscribe | null = null;
  private authListener: Unsubscribe | null = null;
  
  private isSyncing = false;
  private isInitialized = false;
  private isOnline = navigator.onLine;
  private isFirstSync = true;
  
  private syncCallbacks: Set<SyncCallback> = new Set();
  private loadingCallbacks: Set<LoadingCallback> = new Set();

  constructor() {
    // Listen to online/offline status
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async initialize(): Promise<boolean> {
    // Check if this is first sync
    const lastSync = await localStorageService.getLastSyncTime();
    this.isFirstSync = lastSync === null;

    if (!this.isOnline) {
      console.log('Firebase: Starting offline - will sync when online');
      return false;
    }

    return this.initializeFirebase();
  }

  private async initializeFirebase(): Promise<boolean> {
    try {
      // Notify loading started
      this.notifyLoadingChanged(true, 0);

      // Sign in anonymously
      if (!auth.currentUser) {
        await signInAnonymously(auth);
        console.log('Firebase: Signed in anonymously');
      }

      // Listen for auth state changes
      this.authListener = onAuthStateChanged(auth, (user) => {
        if (user) {
          console.log('Firebase: Auth state changed - user:', user.uid);
        }
      });

      // Perform appropriate sync
      if (this.isFirstSync) {
        console.log('Firebase: First sync - downloading metadata only...');
        await this.performFullSync();
      } else {
        console.log('Firebase: Incremental sync - only fetching changes...');
        await this.performIncrementalSync();
      }

      // Start periodic sync every 30 seconds
      if (this.syncTimer) clearInterval(this.syncTimer);
      this.syncTimer = setInterval(() => {
        if (this.isOnline) {
          this.syncUnsyncedToCloud();
        }
      }, 30000);

      // Listen to remote metadata changes
      this.listenToRemoteMetadataChanges();

      this.isInitialized = true;
      this.notifyLoadingChanged(false);
      console.log('Firebase: Sync service initialized');
      return true;
    } catch (e) {
      console.error('Firebase initialization error:', e);
      this.notifyLoadingChanged(false);
      return false;
    }
  }

  private handleOnline(): void {
    const wasOnline = this.isOnline;
    this.isOnline = true;

    if (!wasOnline) {
      console.log('Firebase: Connectivity restored, attempting sync...');
      if (!this.isInitialized) {
        this.initializeFirebase();
      } else {
        this.performIncrementalSync();
      }
    }
  }

  private handleOffline(): void {
    this.isOnline = false;
    console.log('Firebase: Going offline, local storage will be used');
  }

  // ========== SYNC METHODS ==========

  async performFullSync(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;

    try {
      this.isSyncing = true;
      this.notifyLoadingChanged(true, 0);
      
      const metaCollection = collection(db, 'writings_meta');
      const syncStartTime = new Date();

      // Get all local metadata
      const localMetadata = await localStorageService.getAllWritingsMetadataIncludingDeleted();
      const localMap = new Map(localMetadata.map((w) => [w.id, w]));

      // Upload any unsynced local writings first
      const unsyncedWritings = localMetadata.filter((m) => !m.isSynced);
      if (unsyncedWritings.length > 0) {
        console.log(`Firebase: Uploading ${unsyncedWritings.length} unsynced local writings first...`);
        for (const meta of unsyncedWritings) {
          const localWriting = await localStorageService.getFullWriting(meta.id);
          if (localWriting) {
            await this.uploadWriting(localWriting);
            console.log(`Firebase: Uploaded unsynced "${localWriting.title}"`);
          }
        }
      }

      // Download ALL metadata
      const metaSnapshot = await getDocs(metaCollection);
      console.log(`Firebase: Downloaded ${metaSnapshot.docs.length} metadata documents`);

      const totalDocs = metaSnapshot.docs.length;
      const metadataToSave: WritingMetadata[] = [];

      // Collect all metadata first (no UI updates yet)
      for (let i = 0; i < metaSnapshot.docs.length; i++) {
        const docSnap = metaSnapshot.docs[i];
        const data = docSnap.data();
        const remoteMeta = this.parseRemoteMetadata(docSnap.id, data);
        const localMeta = localMap.get(docSnap.id);

        if (!localMeta) {
          // New from remote - save metadata only
          if (!isDeleted(remoteMeta)) {
            metadataToSave.push(remoteMeta);
          }
        } else if (!localMeta.isSynced) {
          // Local was just uploaded - skip
          continue;
        } else {
          // Check if remote is newer
          if (new Date(remoteMeta.updatedAt) > new Date(localMeta.updatedAt)) {
            metadataToSave.push(remoteMeta);
          }
        }

        // Update progress every 100 items
        if (i % 100 === 0) {
          this.notifyLoadingChanged(true, Math.round((i / totalDocs) * 100));
        }
      }

      // Batch save all metadata at once
      if (metadataToSave.length > 0) {
        console.log(`Firebase: Batch saving ${metadataToSave.length} metadata items...`);
        await localStorageService.batchUpdateWritingsMetadata(metadataToSave);
      }

      // Update last sync time
      await localStorageService.updateLastSyncTime(syncStartTime);
      this.isFirstSync = false;

      // Cleanup old deleted writings
      await this.cleanupSyncedDeletes();

      console.log('Firebase: Full sync complete');
      
      // Notify ONCE after all updates
      this.notifyLoadingChanged(false);
      this.notifySyncChanged();
    } catch (e) {
      console.error('Error in full sync:', e);
      this.notifyLoadingChanged(false);
    } finally {
      this.isSyncing = false;
    }
  }

  async performIncrementalSync(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;

    try {
      this.isSyncing = true;
      const metaCollection = collection(db, 'writings_meta');
      const lastSyncTime = await localStorageService.getLastSyncTime();
      const syncStartTime = new Date();

      if (!lastSyncTime) {
        this.isSyncing = false;
        await this.performFullSync();
        return;
      }

      // Upload any unsynced local writings first
      await this.uploadUnsyncedWritings();

      console.log(`Firebase: Incremental sync since ${lastSyncTime.toISOString()}`);

      // Query only metadata updated after lastSyncTime
      const q = query(
        metaCollection,
        where('updatedAt', '>', lastSyncTime.toISOString())
      );
      const metaSnapshot = await getDocs(q);

      console.log(`Firebase: Found ${metaSnapshot.docs.length} changed metadata documents`);

      const metadataToSave: WritingMetadata[] = [];

      for (const docSnap of metaSnapshot.docs) {
        const data = docSnap.data();
        const remoteMeta = this.parseRemoteMetadata(docSnap.id, data);
        const localMeta = await localStorageService.getWritingMetadata(docSnap.id);

        if (!localMeta) {
          // New from remote
          if (!isDeleted(remoteMeta)) {
            metadataToSave.push(remoteMeta);
          }
        } else if (!localMeta.isSynced) {
          // Local was just uploaded - skip
          continue;
        } else if (new Date(remoteMeta.updatedAt) > new Date(localMeta.updatedAt)) {
          // Remote is newer
          metadataToSave.push(remoteMeta);
        }
      }

      // Batch save metadata
      if (metadataToSave.length > 0) {
        await localStorageService.batchUpdateWritingsMetadata(metadataToSave);
        this.notifySyncChanged();
      }

      // Update last sync time
      await localStorageService.updateLastSyncTime(syncStartTime);

      console.log('Firebase: Incremental sync complete');
    } catch (e) {
      console.error('Error in incremental sync:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  async syncUnsyncedToCloud(): Promise<void> {
    if (this.isSyncing || !this.isInitialized || !this.isOnline) return;

    try {
      this.isSyncing = true;
      await this.uploadUnsyncedWritings();
      this.notifySyncChanged();
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  private async uploadUnsyncedWritings(): Promise<void> {
    const metadata = await localStorageService.getAllWritingsMetadataIncludingDeleted();
    const unsyncedCount = metadata.filter((m) => !m.isSynced).length;
    
    console.log(`Firebase: Found ${metadata.length} writings, ${unsyncedCount} unsynced`);

    for (const meta of metadata) {
      if (!meta.isSynced) {
        try {
          const writing = await localStorageService.getFullWriting(meta.id);
          if (writing) {
            console.log(`Firebase: Uploading "${writing.title}"...`);
            await this.uploadWriting(writing);
            console.log(`Firebase: Successfully uploaded "${writing.title}"`);
          }
        } catch (e) {
          console.error(`Firebase ERROR syncing writing ${meta.id}:`, e);
        }
      }
    }
  }

  private async uploadWriting(writing: Writing): Promise<void> {
    const writingsCollection = collection(db, 'writings');
    const metaCollection = collection(db, 'writings_meta');

    // Upload full writing
    await setDoc(doc(writingsCollection, writing.id), {
      title: writing.title,
      body: writing.body,
      footer: writing.footer,
      createdAt: writing.createdAt,
      updatedAt: writing.updatedAt,
      isBold: writing.isBold,
      textAlign: writing.textAlign,
      deletedAt: writing.deletedAt ?? null,
      type: writing.type,
    });

    // Upload metadata
    const preview = generatePreview(writing.body);
    await setDoc(doc(metaCollection, writing.id), {
      title: writing.title,
      preview,
      createdAt: writing.createdAt,
      updatedAt: writing.updatedAt,
      deletedAt: writing.deletedAt ?? null,
      type: writing.type,
    });

    // Mark as synced locally
    const syncedWriting: Writing = { ...writing, isSynced: true };
    await localStorageService.saveWriting(syncedWriting);
  }

  private async cleanupSyncedDeletes(): Promise<void> {
    const metadata = await localStorageService.getAllWritingsMetadataIncludingDeleted();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const meta of metadata) {
      if (isDeleted(meta) && meta.isSynced && meta.deletedAt) {
        const deletedAt = new Date(meta.deletedAt);
        if (deletedAt < sevenDaysAgo) {
          await localStorageService.permanentlyDeleteWriting(meta.id);
          console.log(`Firebase: Permanently deleted old "${meta.title}"`);
        }
      }
    }
  }

  // ========== ON-DEMAND BODY FETCHING ==========

  async fetchWritingBody(id: string): Promise<Writing | null> {
    if (!this.isOnline) {
      console.log('Firebase: Cannot fetch body - offline');
      return null;
    }

    try {
      const docRef = doc(db, 'writings', id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        console.log(`Firebase: Writing ${id} not found in Firestore`);
        return null;
      }

      const data = docSnap.data();
      const writing = this.parseRemoteWriting(id, data);

      // Save to local storage
      await localStorageService.saveWriting(writing);
      console.log(`Firebase: Fetched and cached body for "${writing.title}"`);

      return writing;
    } catch (e) {
      console.error(`Firebase: Error fetching body for ${id}:`, e);
      return null;
    }
  }

  // ========== REAL-TIME LISTENER ==========

  private listenToRemoteMetadataChanges(): void {
    if (this.remoteListener) {
      this.remoteListener();
    }

    const metaCollection = collection(db, 'writings_meta');
    let isInitialLoad = true;

    this.remoteListener = onSnapshot(metaCollection, async (snapshot) => {
      // Skip initial snapshot (we already handled it in performFullSync)
      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      const metadataToSave: WritingMetadata[] = [];
      const idsToRemove: string[] = [];

      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          const remoteMeta = this.parseRemoteMetadata(change.doc.id, data);
          const localMeta = await localStorageService.getWritingMetadata(change.doc.id);

          // Apply if remote is newer or local doesn't exist
          if (!localMeta || new Date(remoteMeta.updatedAt) > new Date(localMeta.updatedAt)) {
            metadataToSave.push(remoteMeta);
          }
        } else if (change.type === 'removed') {
          const localMeta = await localStorageService.getWritingMetadata(change.doc.id);
          if (localMeta && localMeta.isSynced) {
            idsToRemove.push(change.doc.id);
          }
        }
      }

      // Batch updates
      if (metadataToSave.length > 0) {
        await localStorageService.batchUpdateWritingsMetadata(metadataToSave);
      }

      for (const id of idsToRemove) {
        await localStorageService.permanentlyDeleteWriting(id);
      }

      if (metadataToSave.length > 0 || idsToRemove.length > 0) {
        this.notifySyncChanged();
      }
    });
  }

  // ========== PARSERS ==========

  private parseRemoteMetadata(id: string, data: Record<string, unknown>): WritingMetadata {
    return {
      id,
      title: (data.title as string) ?? '',
      preview: (data.preview as string) ?? '',
      createdAt: (data.createdAt as string) ?? new Date().toISOString(),
      updatedAt: (data.updatedAt as string) ?? new Date().toISOString(),
      isSynced: true,
      deletedAt: data.deletedAt ? (data.deletedAt as string) : undefined,
      type: (data.type as WritingType) ?? 'siir',
    };
  }

  private parseRemoteWriting(id: string, data: Record<string, unknown>): Writing {
    return {
      id,
      title: (data.title as string) ?? '',
      body: (data.body as string) ?? '',
      footer: (data.footer as string) ?? '',
      createdAt: (data.createdAt as string) ?? new Date().toISOString(),
      updatedAt: (data.updatedAt as string) ?? new Date().toISOString(),
      isSynced: true,
      isBold: (data.isBold as boolean) ?? false,
      textAlign: (data.textAlign as 'left' | 'center' | 'right') ?? 'left',
      deletedAt: data.deletedAt ? (data.deletedAt as string) : undefined,
      type: (data.type as WritingType) ?? 'siir',
    };
  }

  // ========== CALLBACKS ==========

  onSyncChanged(callback: SyncCallback): () => void {
    this.syncCallbacks.add(callback);
    return () => this.syncCallbacks.delete(callback);
  }

  onLoadingChanged(callback: LoadingCallback): () => void {
    this.loadingCallbacks.add(callback);
    return () => this.loadingCallbacks.delete(callback);
  }

  private notifySyncChanged(): void {
    this.syncCallbacks.forEach((callback) => callback());
  }

  private notifyLoadingChanged(isLoading: boolean, progress?: number): void {
    this.loadingCallbacks.forEach((callback) => callback(isLoading, progress));
  }

  // ========== GETTERS ==========

  get online(): boolean {
    return this.isOnline;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  get firstSync(): boolean {
    return this.isFirstSync;
  }

  // ========== CLEANUP ==========

  dispose(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.remoteListener) this.remoteListener();
    if (this.authListener) this.authListener();
  }
}

// Export singleton instance
export const firebaseSyncService = new FirebaseSyncService();
