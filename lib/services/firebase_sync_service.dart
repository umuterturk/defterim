import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import '../models/writing.dart';
import '../models/writing_metadata.dart';
import 'local_storage_service.dart';

/// Automatic Firebase sync with anonymous authentication
/// 
/// Optimizations:
/// - First sync: downloads everything (acceptable wait)
/// - Subsequent syncs: only fetch documents where updatedAt > lastSyncTime
/// - Uses metadata index for fast list loading
/// - Full body loaded on-demand
class FirebaseSyncService {
  static FirebaseSyncService? _instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final LocalStorageService _localStorage = LocalStorageService.instance;
  final Connectivity _connectivity = Connectivity();
  
  Timer? _syncTimer;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  StreamSubscription<QuerySnapshot>? _remoteChangesSubscription;
  
  bool _isSyncing = false;
  bool _isInitialized = false;
  bool _isOnline = false;
  bool _isFirstSync = true;
  
  // Stream controller for notifying UI of sync changes
  final _onSyncChangedController = StreamController<void>.broadcast();
  Stream<void> get onSyncChanged => _onSyncChangedController.stream;

  FirebaseSyncService._();

  static FirebaseSyncService get instance {
    _instance ??= FirebaseSyncService._();
    return _instance!;
  }

  /// Initialize and automatically sign in anonymously
  Future<bool> initialize() async {
    // Check if we have a lastSyncTime (not first sync)
    final lastSync = await _localStorage.getLastSyncTime();
    _isFirstSync = lastSync == null;
    
    // Start listening to connectivity changes immediately
    _startConnectivityMonitoring();
    
    // Check current connectivity
    final connectivityResult = await _connectivity.checkConnectivity();
    _isOnline = !connectivityResult.contains(ConnectivityResult.none);
    
    if (_isOnline) {
      return await _initializeFirebase();
    } else {
      debugPrint('Firebase: Starting offline - will sync when online');
      return false;
    }
  }
  
  /// Start monitoring connectivity for retry
  void _startConnectivityMonitoring() {
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((results) async {
      final wasOnline = _isOnline;
      _isOnline = !results.contains(ConnectivityResult.none);
      
      if (!wasOnline && _isOnline) {
        // Just came online - try to initialize/sync
        debugPrint('Firebase: Connectivity restored, attempting sync...');
        if (!_isInitialized) {
          await _initializeFirebase();
        } else {
          await performIncrementalSync();
        }
      } else if (wasOnline && !_isOnline) {
        debugPrint('Firebase: Going offline, local storage will be used');
      }
    });
  }
  
  /// Initialize Firebase connection
  Future<bool> _initializeFirebase() async {
    try {
      // Automatically sign in anonymously (no user interaction)
      if (_auth.currentUser == null) {
        await _auth.signInAnonymously();
        debugPrint('Firebase: Signed in anonymously');
      }
      
      // Perform appropriate sync based on whether it's first time
      if (_isFirstSync) {
        debugPrint('Firebase: First sync - downloading all data...');
        await performFullSync();
      } else {
        debugPrint('Firebase: Incremental sync - only fetching changes...');
        await performIncrementalSync();
      }
      
      // Start periodic sync every 30 seconds
      _syncTimer?.cancel();
      _syncTimer = Timer.periodic(const Duration(seconds: 30), (_) {
        if (_isOnline) {
          syncUnsyncedToCloud();
        }
      });
      
      // Listen to remote changes
      _listenToRemoteChanges();
      
      _isInitialized = true;
      debugPrint('Firebase: Sync service initialized');
      return true;
    } catch (e) {
      debugPrint('Firebase initialization error: $e');
      return false;
    }
  }

  /// Perform FULL sync (first time only) - downloads everything
  Future<void> performFullSync() async {
    if (_isSyncing || !_isOnline) return;

    try {
      _isSyncing = true;
      final collection = _writingsCollection;
      final syncStartTime = DateTime.now();

      // Get all local metadata
      final localMetadata = await _localStorage.getAllWritingsMetadataIncludingDeleted();
      final localMap = {for (var w in localMetadata) w.id: w};

      // Get ALL remote writings (first sync downloads everything)
      final snapshot = await collection.get();
      debugPrint('Firebase: Downloaded ${snapshot.docs.length} documents');

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final remoteWriting = _parseRemoteWriting(doc.id, data);
        final localMeta = localMap[doc.id];

        if (localMeta == null) {
          // New from remote - save locally
          if (!remoteWriting.isDeleted) {
            await _localStorage.saveWriting(remoteWriting);
            debugPrint('Firebase: Downloaded "${remoteWriting.title}"');
          }
        } else {
          // Exists locally - resolve conflict
          await _resolveConflict(localMeta, remoteWriting, collection);
        }
      }

      // Upload local writings that don't exist remotely
      for (final localMeta in localMetadata) {
        final existsRemote = snapshot.docs.any((doc) => doc.id == localMeta.id);
        if (!existsRemote) {
          final localWriting = await _localStorage.getFullWriting(localMeta.id);
          if (localWriting != null) {
            await _uploadWriting(localWriting, collection);
            debugPrint('Firebase: Uploaded new "${localWriting.title}"');
          }
        }
      }

      // Update last sync time
      await _localStorage.updateLastSyncTime(syncStartTime);
      _isFirstSync = false;

      // Cleanup old deleted writings
      await _cleanupSyncedDeletes();

      debugPrint('Firebase: Full sync complete');
      _notifySyncChanged();

    } catch (e) {
      debugPrint('Error in full sync: $e');
    } finally {
      _isSyncing = false;
    }
  }

  /// Perform INCREMENTAL sync - only fetch changes since lastSyncTime
  /// This is the FAST path for subsequent app opens
  Future<void> performIncrementalSync() async {
    if (_isSyncing || !_isOnline) return;

    try {
      _isSyncing = true;
      final collection = _writingsCollection;
      final lastSyncTime = await _localStorage.getLastSyncTime();
      final syncStartTime = DateTime.now();

      if (lastSyncTime == null) {
        // No last sync time - do full sync instead
        await performFullSync();
        return;
      }

      debugPrint('Firebase: Incremental sync since ${lastSyncTime.toIso8601String()}');

      // Query only documents updated after lastSyncTime
      // This is where the Firestore index on 'updatedAt' is used
      final snapshot = await collection
          .where('updatedAt', isGreaterThan: lastSyncTime.toIso8601String())
          .get();

      debugPrint('Firebase: Found ${snapshot.docs.length} changed documents');

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final remoteWriting = _parseRemoteWriting(doc.id, data);
        final localMeta = await _localStorage.getWritingMetadata(doc.id);

        if (localMeta == null) {
          // New from remote
          if (!remoteWriting.isDeleted) {
            await _localStorage.saveWriting(remoteWriting);
            debugPrint('Firebase: Downloaded new "${remoteWriting.title}"');
          }
        } else {
          // Resolve conflict
          await _resolveConflict(localMeta, remoteWriting, collection);
        }
      }

      // Upload any unsynced local changes (direct call, already inside sync)
      await _uploadUnsyncedWritings();

      // Update last sync time
      await _localStorage.updateLastSyncTime(syncStartTime);

      debugPrint('Firebase: Incremental sync complete');
      _notifySyncChanged();

    } catch (e) {
      debugPrint('Error in incremental sync: $e');
    } finally {
      _isSyncing = false;
    }
  }

  /// Legacy method - now calls incremental sync
  Future<void> performBidirectionalSync() async {
    if (_isFirstSync) {
      await performFullSync();
    } else {
      await performIncrementalSync();
    }
  }
  
  /// Parse a Writing from remote Firestore data
  Writing _parseRemoteWriting(String id, Map<String, dynamic> data) {
    DateTime? deletedAt;
    if (data['deletedAt'] != null && data['deletedAt'].toString().isNotEmpty) {
      deletedAt = DateTime.parse(data['deletedAt']);
    }
    
    return Writing(
      id: id,
      title: data['title'] ?? '',
      body: data['body'] ?? '',
      footer: data['footer'] ?? '',
      createdAt: DateTime.parse(data['createdAt'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(data['updatedAt'] ?? DateTime.now().toIso8601String()),
      isSynced: true,
      isBold: data['isBold'] ?? false,
      textAlign: data['textAlign'] ?? 'left',
      deletedAt: deletedAt,
    );
  }
  
  /// Resolve conflict between local metadata and remote writing using timestamps
  Future<void> _resolveConflict(
    WritingMetadata localMeta, 
    Writing remoteWriting,
    CollectionReference<Map<String, dynamic>> collection,
  ) async {
    // Compare updatedAt timestamps for conflict resolution
    final localNewer = localMeta.updatedAt.isAfter(remoteWriting.updatedAt);
    final remoteNewer = remoteWriting.updatedAt.isAfter(localMeta.updatedAt);
    
    if (remoteNewer) {
      // Remote is newer - use remote version
      if (remoteWriting.isDeleted) {
        // Remote was deleted - soft-delete locally too
        if (!localMeta.isDeleted) {
          await _localStorage.saveWriting(remoteWriting);
          debugPrint('Firebase: Applied remote deletion for "${localMeta.title}"');
        }
      } else {
        // Remote has newer content
        await _localStorage.saveWriting(remoteWriting);
        debugPrint('Firebase: Updated local "${remoteWriting.title}" (remote was newer)');
      }
    } else if (localNewer && !localMeta.isSynced) {
      // Local is newer and unsynced - upload local version
      final localWriting = await _localStorage.getFullWriting(localMeta.id);
      if (localWriting != null) {
        await _uploadWriting(localWriting, collection);
        debugPrint('Firebase: Uploaded "${localWriting.title}" (local was newer)');
      }
    }
    // If timestamps are equal, they're already in sync
  }
  
  /// Upload a writing to Firestore
  Future<void> _uploadWriting(
    Writing writing, 
    CollectionReference<Map<String, dynamic>> collection,
  ) async {
    await collection.doc(writing.id).set({
      'title': writing.title,
      'body': writing.body,
      'footer': writing.footer,
      'createdAt': writing.createdAt.toIso8601String(),
      'updatedAt': writing.updatedAt.toIso8601String(),
      'isBold': writing.isBold,
      'textAlign': writing.textAlign,
      'deletedAt': writing.deletedAt?.toIso8601String(),
    });
    
    // Mark as synced locally
    final syncedWriting = writing.copyWith(isSynced: true);
    await _localStorage.saveWriting(syncedWriting);
  }
  
  /// Cleanup: permanently delete writings that are soft-deleted and synced
  Future<void> _cleanupSyncedDeletes() async {
    final metadata = await _localStorage.getAllWritingsMetadataIncludingDeleted();
    for (final meta in metadata) {
      if (meta.isDeleted && meta.isSynced) {
        // This writing was deleted and synced - we can permanently remove it
        // Keep for 7 days after deletion for safety
        final sevenDaysAgo = DateTime.now().subtract(const Duration(days: 7));
        if (meta.deletedAt!.isBefore(sevenDaysAgo)) {
          await _localStorage.permanentlyDeleteWriting(meta.id);
          debugPrint('Firebase: Permanently deleted old "${meta.title}"');
        }
      }
    }
  }

  /// Get the writings collection
  CollectionReference<Map<String, dynamic>> get _writingsCollection {
    return _firestore.collection('writings');
  }

  /// Sync only unsynced local writings to Firebase (public, with guards)
  Future<void> syncUnsyncedToCloud() async {
    if (_isSyncing || !_isInitialized || !_isOnline) return;

    try {
      _isSyncing = true;
      await _uploadUnsyncedWritings();
      _notifySyncChanged();
    } catch (e) {
      debugPrint('Sync error: $e');
    } finally {
      _isSyncing = false;
    }
  }
  
  /// Internal: upload all unsynced writings (no guards - for use during sync)
  Future<void> _uploadUnsyncedWritings() async {
    final collection = _writingsCollection;
    final metadata = await _localStorage.getAllWritingsMetadataIncludingDeleted();

    for (final meta in metadata) {
      if (!meta.isSynced) {
        try {
          // Load full writing for upload
          final writing = await _localStorage.getFullWriting(meta.id);
          if (writing != null) {
            await _uploadWriting(writing, collection);
          }
        } catch (e) {
          debugPrint('Error syncing writing ${meta.id}: $e');
        }
      }
    }
  }

  /// Listen to remote changes and apply them locally
  void _listenToRemoteChanges() {
    _remoteChangesSubscription?.cancel();
    
    final collection = _writingsCollection;

    _remoteChangesSubscription = collection.snapshots().listen((snapshot) async {
      for (final change in snapshot.docChanges) {
        // Skip the initial load - we handle that in sync methods
        if (change.type == DocumentChangeType.added && !_isInitialized) {
          continue;
        }
        
        if (change.type == DocumentChangeType.added ||
            change.type == DocumentChangeType.modified) {
          final data = change.doc.data();
          if (data != null) {
            final remoteWriting = _parseRemoteWriting(change.doc.id, data);
            final localMeta = await _localStorage.getWritingMetadata(change.doc.id);

            // Apply if remote is newer or local doesn't exist
            if (localMeta == null ||
                remoteWriting.updatedAt.isAfter(localMeta.updatedAt)) {
              await _localStorage.saveWriting(remoteWriting);
              _notifySyncChanged();
            }
          }
        } else if (change.type == DocumentChangeType.removed) {
          // Document was removed from Firestore
          final localMeta = await _localStorage.getWritingMetadata(change.doc.id);
          if (localMeta != null && localMeta.isSynced) {
            await _localStorage.permanentlyDeleteWriting(change.doc.id);
            _notifySyncChanged();
          }
        }
      }
    });
  }
  
  /// Notify listeners that sync state changed
  void _notifySyncChanged() {
    if (!_onSyncChangedController.isClosed) {
      _onSyncChangedController.add(null);
    }
  }

  /// Force sync now
  Future<void> forceSyncNow() async {
    if (_isOnline && _isInitialized) {
      await performIncrementalSync();
    } else if (_isOnline && !_isInitialized) {
      await _initializeFirebase();
    }
  }
  
  /// Check if currently online
  bool get isOnline => _isOnline;
  
  /// Check if sync service is initialized
  bool get isInitialized => _isInitialized;
  
  /// Check if this is the first sync
  bool get isFirstSync => _isFirstSync;

  void dispose() {
    _syncTimer?.cancel();
    _connectivitySubscription?.cancel();
    _remoteChangesSubscription?.cancel();
    _onSyncChangedController.close();
  }
}
