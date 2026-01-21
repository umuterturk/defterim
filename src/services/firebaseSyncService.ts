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
import type { Book } from '../types/book';

type SyncCallback = () => void;
type LoadingCallback = (isLoading: boolean, progress?: number) => void;

class FirebaseSyncService {
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private remoteListener: Unsubscribe | null = null;
  private bookRemoteListener: Unsubscribe | null = null;
  private authListener: Unsubscribe | null = null;
  
  private isSyncing = false;
  private isInitialized = false;
  private isOnline = navigator.onLine;
  private isFirstSync = true;
  
  private syncCallbacks: Set<SyncCallback> = new Set();
  private bookSyncCallbacks: Set<SyncCallback> = new Set();
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

      // Sync local stars to Firebase (one-time migration for existing local stars)
      await this.syncLocalStarsToFirebase();

      // Start periodic sync every 30 seconds
      if (this.syncTimer) clearInterval(this.syncTimer);
      this.syncTimer = setInterval(() => {
        if (this.isOnline) {
          this.syncUnsyncedToCloud();
          this.syncBooksToCloud();
        }
      }, 30000);

      // Listen to remote metadata changes
      this.listenToRemoteMetadataChanges();

      // Sync books from Firestore (download + upload)
      await this.performFullBooksSync();
      this.listenToRemoteBookChanges();

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

      // Download ALL metadata FIRST to know what's on remote
      const metaSnapshot = await getDocs(metaCollection);
      console.log(`Firebase: Downloaded ${metaSnapshot.docs.length} metadata documents`);

      // Build a map of remote metadata
      const remoteMap = new Map<string, WritingMetadata>();
      for (const docSnap of metaSnapshot.docs) {
        const data = docSnap.data();
        const remoteMeta = this.parseRemoteMetadata(docSnap.id, data);
        remoteMap.set(docSnap.id, remoteMeta);
      }

      const totalDocs = metaSnapshot.docs.length;
      const metadataToSave: WritingMetadata[] = [];

      // Process unsynced local writings with proper conflict resolution
      const unsyncedWritings = localMetadata.filter((m) => !m.isSynced);
      if (unsyncedWritings.length > 0) {
        console.log(`Firebase: Processing ${unsyncedWritings.length} unsynced local writings...`);
        for (const localMeta of unsyncedWritings) {
          const remoteMeta = remoteMap.get(localMeta.id);
          const localWriting = await localStorageService.getFullWriting(localMeta.id);
          
          if (!localWriting) continue;

          if (!remoteMeta) {
            // No remote version - safe to upload
            await this.uploadWriting(localWriting);
            console.log(`Firebase: Uploaded new writing "${localWriting.title}"`);
          } else {
            // Remote version exists - compare timestamps (last write wins)
            const localTime = new Date(localMeta.updatedAt).getTime();
            const remoteTime = new Date(remoteMeta.updatedAt).getTime();

            if (localTime > remoteTime) {
              // Local is newer - upload it
              await this.uploadWriting(localWriting);
              console.log(`Firebase: Uploaded writing "${localWriting.title}" (local is newer: ${localMeta.updatedAt} > ${remoteMeta.updatedAt})`);
            } else if (remoteTime > localTime) {
              // Remote is newer - queue for download (discard local changes)
              metadataToSave.push(remoteMeta);
              console.log(`Firebase: Will download writing "${remoteMeta.title}" (remote is newer: ${remoteMeta.updatedAt} > ${localMeta.updatedAt})`);
            } else {
              // Same timestamp - mark local as synced
              const syncedWriting: Writing = { ...localWriting, isSynced: true };
              await localStorageService.saveWriting(syncedWriting);
            }
          }
        }
      }

      // Process remote metadata - download new or newer items
      for (let i = 0; i < metaSnapshot.docs.length; i++) {
        const docSnap = metaSnapshot.docs[i];
        const remoteMeta = remoteMap.get(docSnap.id)!;
        const localMeta = localMap.get(docSnap.id);

        if (!localMeta) {
          // New from remote - save metadata only (unless deleted)
          if (!isDeleted(remoteMeta)) {
            metadataToSave.push(remoteMeta);
          }
        } else if (localMeta.isSynced) {
          // Local is already synced - check if remote is newer
          const localTime = new Date(localMeta.updatedAt).getTime();
          const remoteTime = new Date(remoteMeta.updatedAt).getTime();

          if (remoteTime > localTime) {
            metadataToSave.push(remoteMeta);
          }
        }
        // Note: Unsynced local writings were already handled above

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

      console.log(`Firebase: Incremental sync since ${lastSyncTime.toISOString()}`);

      // Query only metadata updated after lastSyncTime FIRST
      const q = query(
        metaCollection,
        where('updatedAt', '>', lastSyncTime.toISOString())
      );
      const metaSnapshot = await getDocs(q);
      console.log(`Firebase: Found ${metaSnapshot.docs.length} changed metadata documents`);

      // Build a map of remote changes
      const remoteChanges = new Map<string, WritingMetadata>();
      for (const docSnap of metaSnapshot.docs) {
        const data = docSnap.data();
        const remoteMeta = this.parseRemoteMetadata(docSnap.id, data);
        remoteChanges.set(docSnap.id, remoteMeta);
      }

      // Upload unsynced local writings with proper conflict resolution
      await this.uploadUnsyncedWritingsWithConflictResolution(remoteChanges);

      const metadataToSave: WritingMetadata[] = [];

      // Process remote changes
      for (const [id, remoteMeta] of remoteChanges) {
        const localMeta = await localStorageService.getWritingMetadata(id);

        if (!localMeta) {
          // New from remote
          if (!isDeleted(remoteMeta)) {
            metadataToSave.push(remoteMeta);
          }
        } else if (localMeta.isSynced) {
          // Local is synced - check if remote is newer
          const localTime = new Date(localMeta.updatedAt).getTime();
          const remoteTime = new Date(remoteMeta.updatedAt).getTime();

          if (remoteTime > localTime) {
            metadataToSave.push(remoteMeta);
          }
        }
        // Note: Unsynced local writings were already handled in uploadUnsyncedWritingsWithConflictResolution
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
      await this.uploadUnsyncedWritingsWithConflictResolution();
      this.notifySyncChanged();
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Upload unsynced writings with proper timestamp-based conflict resolution.
   * If a remote version exists and is newer, download it instead of uploading.
   * @param remoteChanges Optional map of already-fetched remote changes (for incremental sync)
   */
  private async uploadUnsyncedWritingsWithConflictResolution(
    remoteChanges?: Map<string, WritingMetadata>
  ): Promise<void> {
    const metaCollection = collection(db, 'writings_meta');
    const metadata = await localStorageService.getAllWritingsMetadataIncludingDeleted();
    const unsyncedMeta = metadata.filter((m) => !m.isSynced);
    
    console.log(`Firebase: Found ${metadata.length} writings, ${unsyncedMeta.length} unsynced`);

    const metadataToSave: WritingMetadata[] = [];

    for (const localMeta of unsyncedMeta) {
      try {
        const writing = await localStorageService.getFullWriting(localMeta.id);
        if (!writing) continue;

        // Check if we already have remote data from incremental sync
        let remoteMeta: WritingMetadata | null = null;
        if (remoteChanges?.has(localMeta.id)) {
          remoteMeta = remoteChanges.get(localMeta.id)!;
        } else {
          // Fetch remote version to compare timestamps
          const remoteDocRef = doc(metaCollection, localMeta.id);
          const remoteDocSnap = await getDoc(remoteDocRef);
          if (remoteDocSnap.exists()) {
            remoteMeta = this.parseRemoteMetadata(remoteDocSnap.id, remoteDocSnap.data());
          }
        }

        if (!remoteMeta) {
          // No remote version - safe to upload
          console.log(`Firebase: Uploading new "${writing.title}"...`);
          await this.uploadWriting(writing);
          console.log(`Firebase: Successfully uploaded "${writing.title}"`);
        } else {
          // Remote exists - compare timestamps (last write wins)
          const localTime = new Date(localMeta.updatedAt).getTime();
          const remoteTime = new Date(remoteMeta.updatedAt).getTime();

          if (localTime > remoteTime) {
            // Local is newer - upload it
            console.log(`Firebase: Uploading "${writing.title}" (local is newer: ${localMeta.updatedAt} > ${remoteMeta.updatedAt})...`);
            await this.uploadWriting(writing);
            console.log(`Firebase: Successfully uploaded "${writing.title}"`);
          } else if (remoteTime > localTime) {
            // Remote is newer - queue for download (discard local changes)
            console.log(`Firebase: Discarding local changes for "${writing.title}" (remote is newer: ${remoteMeta.updatedAt} > ${localMeta.updatedAt})`);
            metadataToSave.push(remoteMeta);
          } else {
            // Same timestamp - mark local as synced
            const syncedWriting: Writing = { ...writing, isSynced: true };
            await localStorageService.saveWriting(syncedWriting);
          }
        }
      } catch (e) {
        console.error(`Firebase ERROR syncing writing ${localMeta.id}:`, e);
      }
    }

    // Apply remote updates for writings where remote was newer
    if (metadataToSave.length > 0) {
      await localStorageService.batchUpdateWritingsMetadata(metadataToSave);
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
      stars: writing.stars ?? 0,
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
      stars: writing.stars ?? 0,
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

  // ========== LOCAL STARS SYNC ==========

  /**
   * Sync local stars to Firebase.
   * This handles the case where writings have stars stored locally but
   * Firebase might not have them (e.g., stars added while offline, or
   * legacy data before stars were properly synced).
   */
  private async syncLocalStarsToFirebase(): Promise<void> {
    if (!this.isOnline) return;

    try {
      const metaCollection = collection(db, 'writings_meta');
      const writingsCollection = collection(db, 'writings');

      // Get all local writings metadata
      const localMetadata = await localStorageService.getAllWritingsMetadataIncludingDeleted();
      
      // Filter to only synced writings that have stars
      const writingsWithStars = localMetadata.filter(
        (m) => m.isSynced && m.stars !== undefined && m.stars > 0
      );

      if (writingsWithStars.length === 0) {
        console.log('Firebase: No local stars to sync');
        return;
      }

      console.log(`Firebase: Checking ${writingsWithStars.length} writings with local stars...`);

      let syncedCount = 0;

      for (const localMeta of writingsWithStars) {
        try {
          // Fetch the current Firebase metadata to check if stars need syncing
          const metaDocRef = doc(metaCollection, localMeta.id);
          const metaDocSnap = await getDoc(metaDocRef);

          if (!metaDocSnap.exists()) {
            // Metadata doesn't exist in Firebase - skip (will be synced normally)
            continue;
          }

          const remoteData = metaDocSnap.data();
          const remoteStars = (remoteData.stars as number) ?? 0;

          // Only sync if local has stars but remote doesn't (or has fewer)
          if (localMeta.stars! > remoteStars) {
            console.log(`Firebase: Syncing stars for "${localMeta.title}" (local: ${localMeta.stars}, remote: ${remoteStars})`);

            // Update metadata with stars
            await setDoc(metaDocRef, {
              ...remoteData,
              stars: localMeta.stars,
              updatedAt: new Date().toISOString(),
            });

            // Also update full writing document if it exists
            const writingDocRef = doc(writingsCollection, localMeta.id);
            const writingDocSnap = await getDoc(writingDocRef);
            
            if (writingDocSnap.exists()) {
              const writingData = writingDocSnap.data();
              await setDoc(writingDocRef, {
                ...writingData,
                stars: localMeta.stars,
                updatedAt: new Date().toISOString(),
              });
            }

            syncedCount++;
          }
        } catch (e) {
          console.error(`Firebase: Error syncing stars for ${localMeta.id}:`, e);
        }
      }

      if (syncedCount > 0) {
        console.log(`Firebase: Synced stars for ${syncedCount} writings`);
      } else {
        console.log('Firebase: All local stars already synced');
      }
    } catch (e) {
      console.error('Firebase: Error syncing local stars:', e);
    }
  }

  // ========== BOOK SYNC METHODS ==========

  async performFullBooksSync(): Promise<void> {
    if (!this.isOnline) return;

    try {
      const booksCollection = collection(db, 'books');

      // Get all local books
      const localBooks = await localStorageService.getAllBooksIncludingDeleted();
      const localMap = new Map(localBooks.map((b) => [b.id, b]));

      // Download ALL books from Firestore FIRST to know what's on remote
      const booksSnapshot = await getDocs(booksCollection);
      console.log(`Firebase: Downloaded ${booksSnapshot.docs.length} books from Firestore`);

      // Build a map of remote books
      const remoteMap = new Map<string, Book>();
      for (const docSnap of booksSnapshot.docs) {
        const data = docSnap.data();
        const remoteBook = this.parseRemoteBook(docSnap.id, data);
        remoteMap.set(docSnap.id, remoteBook);
      }

      let hasChanges = false;

      // Process unsynced local books with proper conflict resolution
      const unsyncedBooks = localBooks.filter((b) => !b.isSynced);
      if (unsyncedBooks.length > 0) {
        console.log(`Firebase: Processing ${unsyncedBooks.length} unsynced local books...`);
        for (const localBook of unsyncedBooks) {
          const remoteBook = remoteMap.get(localBook.id);

          if (!remoteBook) {
            // No remote version - safe to upload
            await this.uploadBook(localBook);
            console.log(`Firebase: Uploaded new book "${localBook.title}"`);
          } else {
            // Remote version exists - compare timestamps (last write wins)
            const localTime = new Date(localBook.updatedAt).getTime();
            const remoteTime = new Date(remoteBook.updatedAt).getTime();

            if (localTime > remoteTime) {
              // Local is newer - upload it
              await this.uploadBook(localBook);
              console.log(`Firebase: Uploaded book "${localBook.title}" (local is newer: ${localBook.updatedAt} > ${remoteBook.updatedAt})`);
            } else if (remoteTime > localTime) {
              // Remote is newer - download it (discard local changes)
              await localStorageService.saveBook(remoteBook);
              console.log(`Firebase: Downloaded book "${remoteBook.title}" (remote is newer: ${remoteBook.updatedAt} > ${localBook.updatedAt})`);
              hasChanges = true;
            } else {
              // Same timestamp - mark local as synced (they should be identical)
              const syncedBook: Book = { ...localBook, isSynced: true };
              await localStorageService.saveBook(syncedBook);
              console.log(`Firebase: Book "${localBook.title}" already in sync`);
            }
          }
        }
      }

      // Process remote books that are new or newer than local
      for (const [remoteId, remoteBook] of remoteMap) {
        const localBook = localMap.get(remoteId);

        if (!localBook) {
          // New book from remote - save it (unless deleted)
          if (!remoteBook.deletedAt) {
            await localStorageService.saveBook(remoteBook);
            console.log(`Firebase: Downloaded new book "${remoteBook.title}"`);
            hasChanges = true;
          }
        } else if (localBook.isSynced) {
          // Local is already synced - check if remote is newer
          const localTime = new Date(localBook.updatedAt).getTime();
          const remoteTime = new Date(remoteBook.updatedAt).getTime();

          if (remoteTime > localTime) {
            // Remote is newer - update local
            await localStorageService.saveBook(remoteBook);
            console.log(`Firebase: Updated book "${remoteBook.title}" from remote`);
            hasChanges = true;
          }
        }
        // Note: Unsynced local books were already handled above
      }

      // Upload any local books that don't exist on remote at all
      for (const localBook of localBooks) {
        if (!localBook.isSynced && !remoteMap.has(localBook.id)) {
          // This case should already be handled above, but just in case
          await this.uploadBook(localBook);
          console.log(`Firebase: Uploaded orphan book "${localBook.title}"`);
        }
      }

      if (hasChanges) {
        this.notifyBookSyncChanged();
      }

      console.log('Firebase: Books sync complete');
    } catch (e) {
      console.error('Error syncing books from Firestore:', e);
    }
  }

  async syncBooksToCloud(): Promise<void> {
    if (!this.isOnline || !this.isInitialized) return;

    try {
      const booksCollection = collection(db, 'books');
      const books = await localStorageService.getAllBooksIncludingDeleted();
      const unsyncedBooks = books.filter((b) => !b.isSynced);

      console.log(`Firebase: Found ${unsyncedBooks.length} unsynced books`);

      for (const localBook of unsyncedBooks) {
        try {
          // Fetch remote version to compare timestamps
          const remoteDocRef = doc(booksCollection, localBook.id);
          const remoteDocSnap = await getDoc(remoteDocRef);

          if (!remoteDocSnap.exists()) {
            // No remote version - safe to upload
            await this.uploadBook(localBook);
            console.log(`Firebase: Uploaded book "${localBook.title}"`);
          } else {
            // Remote exists - compare timestamps (last write wins)
            const remoteData = remoteDocSnap.data();
            const remoteUpdatedAt = remoteData.updatedAt as string;
            const localTime = new Date(localBook.updatedAt).getTime();
            const remoteTime = new Date(remoteUpdatedAt).getTime();

            if (localTime > remoteTime) {
              // Local is newer - upload it
              await this.uploadBook(localBook);
              console.log(`Firebase: Uploaded book "${localBook.title}" (local is newer)`);
            } else if (remoteTime > localTime) {
              // Remote is newer - download it instead
              const remoteBook = this.parseRemoteBook(remoteDocSnap.id, remoteData);
              await localStorageService.saveBook(remoteBook);
              console.log(`Firebase: Downloaded book "${remoteBook.title}" (remote is newer)`);
            } else {
              // Same timestamp - just mark as synced
              const syncedBook: Book = { ...localBook, isSynced: true };
              await localStorageService.saveBook(syncedBook);
            }
          }
        } catch (e) {
          console.error(`Firebase ERROR syncing book ${localBook.id}:`, e);
        }
      }

      if (unsyncedBooks.length > 0) {
        this.notifyBookSyncChanged();
      }
    } catch (e) {
      console.error('Error syncing books:', e);
    }
  }

  private async uploadBook(book: Book): Promise<void> {
    const booksCollection = collection(db, 'books');

    await setDoc(doc(booksCollection, book.id), {
      title: book.title,
      writingIds: book.writingIds,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      deletedAt: book.deletedAt ?? null,
    });

    // Mark as synced locally
    const syncedBook: Book = { ...book, isSynced: true };
    await localStorageService.saveBook(syncedBook);
  }

  private listenToRemoteBookChanges(): void {
    if (this.bookRemoteListener) {
      this.bookRemoteListener();
    }

    const booksCollection = collection(db, 'books');
    let isInitialLoad = true;

    this.bookRemoteListener = onSnapshot(booksCollection, async (snapshot) => {
      // Skip initial snapshot
      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      let hasChanges = false;

      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          const remoteBook = this.parseRemoteBook(change.doc.id, data);
          const localBook = await localStorageService.getBook(change.doc.id);

          if (!localBook) {
            // New book from remote - save it
            await localStorageService.saveBook(remoteBook);
            hasChanges = true;
          } else {
            // Compare timestamps - last write wins
            const localTime = new Date(localBook.updatedAt).getTime();
            const remoteTime = new Date(remoteBook.updatedAt).getTime();

            if (remoteTime > localTime) {
              // Remote is newer - apply it (even if local is unsynced, remote wins)
              await localStorageService.saveBook(remoteBook);
              console.log(`Firebase: Real-time update - book "${remoteBook.title}" updated from remote (${remoteBook.updatedAt} > ${localBook.updatedAt})`);
              hasChanges = true;
            } else if (localTime > remoteTime && !localBook.isSynced) {
              // Local is newer and unsynced - upload it
              await this.uploadBook(localBook);
              console.log(`Firebase: Real-time update - book "${localBook.title}" uploaded (local is newer)`);
            }
            // If timestamps are equal or local is newer and synced, no action needed
          }
        } else if (change.type === 'removed') {
          const localBook = await localStorageService.getBook(change.doc.id);
          if (localBook) {
            // Only permanently delete if local is synced (not modified locally)
            if (localBook.isSynced) {
              await localStorageService.permanentlyDeleteBook(change.doc.id);
              console.log(`Firebase: Real-time update - book "${localBook.title}" permanently deleted`);
              hasChanges = true;
            } else {
              // Local has unsynced changes - this is a conflict
              // For now, we'll re-upload the local version
              console.log(`Firebase: Real-time update - conflict detected for book "${localBook.title}" (deleted on remote but modified locally). Re-uploading local version.`);
              await this.uploadBook(localBook);
            }
          }
        }
      }

      if (hasChanges) {
        this.notifyBookSyncChanged();
      }
    });
  }

  private parseRemoteBook(id: string, data: Record<string, unknown>): Book {
    return {
      id,
      title: (data.title as string) ?? '',
      writingIds: (data.writingIds as string[]) ?? [],
      createdAt: (data.createdAt as string) ?? new Date().toISOString(),
      updatedAt: (data.updatedAt as string) ?? new Date().toISOString(),
      isSynced: true,
      deletedAt: data.deletedAt ? (data.deletedAt as string) : undefined,
    };
  }

  // ========== ON-DEMAND BODY FETCHING ==========

  /**
   * Fetch a writing from Firebase without saving to local storage.
   * Used for comparison with local version before deciding which to use.
   */
  async fetchWritingFromFirebase(id: string): Promise<Writing | null> {
    if (!this.isOnline) {
      return null;
    }

    try {
      const docRef = doc(db, 'writings', id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();
      return this.parseRemoteWriting(id, data);
    } catch (e) {
      console.error(`Firebase: Error fetching ${id}:`, e);
      return null;
    }
  }

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

          if (!localMeta) {
            // New from remote - save it
            metadataToSave.push(remoteMeta);
          } else {
            // Compare timestamps - last write wins
            const localTime = new Date(localMeta.updatedAt).getTime();
            const remoteTime = new Date(remoteMeta.updatedAt).getTime();

            if (remoteTime > localTime) {
              // Remote is newer - apply it (even if local is unsynced, remote wins)
              metadataToSave.push(remoteMeta);
              console.log(`Firebase: Real-time update - writing "${remoteMeta.title}" updated from remote (${remoteMeta.updatedAt} > ${localMeta.updatedAt})`);
            } else if (localTime > remoteTime && !localMeta.isSynced) {
              // Local is newer and unsynced - upload it
              const localWriting = await localStorageService.getFullWriting(localMeta.id);
              if (localWriting) {
                await this.uploadWriting(localWriting);
                console.log(`Firebase: Real-time update - writing "${localWriting.title}" uploaded (local is newer)`);
              }
            }
            // If timestamps are equal or local is newer and synced, no action needed
          }
        } else if (change.type === 'removed') {
          const localMeta = await localStorageService.getWritingMetadata(change.doc.id);
          if (localMeta) {
            // Only permanently delete if local is synced (not modified locally)
            if (localMeta.isSynced) {
              idsToRemove.push(change.doc.id);
              console.log(`Firebase: Real-time update - writing "${localMeta.title}" permanently deleted`);
            } else {
              // Local has unsynced changes - this is a conflict
              // For now, we'll re-upload the local version
              const localWriting = await localStorageService.getFullWriting(localMeta.id);
              if (localWriting) {
                console.log(`Firebase: Real-time update - conflict detected for writing "${localMeta.title}" (deleted on remote but modified locally). Re-uploading local version.`);
                await this.uploadWriting(localWriting);
              }
            }
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
      stars: (data.stars as number) ?? 0,
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
      stars: (data.stars as number) ?? 0,
    };
  }

  // ========== CALLBACKS ==========

  onSyncChanged(callback: SyncCallback): () => void {
    this.syncCallbacks.add(callback);
    return () => this.syncCallbacks.delete(callback);
  }

  onBookSyncChanged(callback: SyncCallback): () => void {
    this.bookSyncCallbacks.add(callback);
    return () => this.bookSyncCallbacks.delete(callback);
  }

  onLoadingChanged(callback: LoadingCallback): () => void {
    this.loadingCallbacks.add(callback);
    return () => this.loadingCallbacks.delete(callback);
  }

  private notifySyncChanged(): void {
    this.syncCallbacks.forEach((callback) => callback());
  }

  private notifyBookSyncChanged(): void {
    this.bookSyncCallbacks.forEach((callback) => callback());
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
    if (this.bookRemoteListener) this.bookRemoteListener();
    if (this.authListener) this.authListener();
  }
}

// Export singleton instance
export const firebaseSyncService = new FirebaseSyncService();
