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
/// Architecture:
/// - writings_meta: Lightweight metadata for fast list loading (~500 bytes/doc)
/// - writings: Full content including body (on-demand loading)
/// 
/// Optimizations:
/// - First sync: downloads only metadata (fast, ~5MB for 10k writings)
/// - Full body fetched on-demand when user opens a writing
/// - Incremental sync: only fetch documents where updatedAt > lastSyncTime
class FirebaseSyncService {
  static FirebaseSyncService? _instance;
  // Lazy access to Firebase instances - only accessed after Firebase.initializeApp()
  FirebaseFirestore get _firestore => FirebaseFirestore.instance;
  FirebaseAuth get _auth => FirebaseAuth.instance;
  final LocalStorageService _localStorage = LocalStorageService.instance;
  final Connectivity _connectivity = Connectivity();
  
  Timer? _syncTimer;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  StreamSubscription<QuerySnapshot>? _remoteMetaChangesSubscription;
  
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
        debugPrint('Firebase: First sync - downloading metadata only (fast)...');
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
      
      // Listen to remote metadata changes
      _listenToRemoteMetadataChanges();
      
      _isInitialized = true;
      debugPrint('Firebase: Sync service initialized');
      return true;
    } catch (e) {
      debugPrint('Firebase initialization error: $e');
      return false;
    }
  }

  /// Perform FULL sync (first time only) - downloads metadata only, bodies on-demand
  Future<void> performFullSync() async {
    if (_isSyncing || !_isOnline) return;

    try {
      _isSyncing = true;
      final metaCollection = _writingsMetaCollection;
      final writingsCollection = _writingsCollection;
      final syncStartTime = DateTime.now();

      // Get all local metadata
      final localMetadata = await _localStorage.getAllWritingsMetadataIncludingDeleted();
      final localMap = {for (var w in localMetadata) w.id: w};

      // FIRST: Upload any unsynced local writings before downloading
      // This ensures local changes made offline are not lost
      final unsyncedWritings = localMetadata.where((m) => !m.isSynced).toList();
      if (unsyncedWritings.isNotEmpty) {
        debugPrint('Firebase: Uploading ${unsyncedWritings.length} unsynced local writings first...');
        for (final meta in unsyncedWritings) {
          final localWriting = await _localStorage.getFullWriting(meta.id);
          if (localWriting != null) {
            await _uploadWriting(localWriting, writingsCollection, metaCollection);
            debugPrint('Firebase: Uploaded unsynced "${localWriting.title}"');
          }
        }
      }

      // THEN: Download ALL metadata (fast - small documents)
      final metaSnapshot = await metaCollection.get();
      debugPrint('Firebase: Downloaded ${metaSnapshot.docs.length} metadata documents');

      for (final doc in metaSnapshot.docs) {
        final data = doc.data();
        final remoteMeta = _parseRemoteMetadata(doc.id, data);
        final localMeta = localMap[doc.id];

        if (localMeta == null) {
          // New from remote - save metadata only (body fetched on-demand)
          if (!remoteMeta.isDeleted) {
            await _localStorage.updateWritingMetadata(remoteMeta);
            debugPrint('Firebase: Downloaded metadata "${remoteMeta.title}"');
          }
        } else if (!localMeta.isSynced) {
          // Local was just uploaded - skip
          continue;
        } else {
          // Exists locally and is synced - check if remote is newer
          if (remoteMeta.updatedAt.isAfter(localMeta.updatedAt)) {
            // Remote metadata is newer - update local metadata
            await _localStorage.updateWritingMetadata(remoteMeta);
            // Invalidate local body cache so it gets fetched fresh
            await _invalidateLocalBody(remoteMeta.id);
            debugPrint('Firebase: Updated metadata "${remoteMeta.title}" (remote was newer)');
          }
        }
      }

      // Update last sync time
      await _localStorage.updateLastSyncTime(syncStartTime);
      _isFirstSync = false;

      // Cleanup old deleted writings
      await _cleanupSyncedDeletes();

      debugPrint('Firebase: Full sync complete (metadata only - bodies loaded on-demand)');
      _notifySyncChanged();

    } catch (e) {
      debugPrint('Error in full sync: $e');
    } finally {
      _isSyncing = false;
    }
  }

  /// Perform INCREMENTAL sync - uploads unsynced first, then fetches metadata changes
  Future<void> performIncrementalSync() async {
    if (_isSyncing || !_isOnline) return;

    try {
      _isSyncing = true;
      final metaCollection = _writingsMetaCollection;
      final writingsCollection = _writingsCollection;
      final lastSyncTime = await _localStorage.getLastSyncTime();
      final syncStartTime = DateTime.now();

      if (lastSyncTime == null) {
        // No last sync time - do full sync instead
        _isSyncing = false;
        await performFullSync();
        return;
      }

      // FIRST: Upload any unsynced local writings
      await _uploadUnsyncedWritings();

      debugPrint('Firebase: Incremental sync since ${lastSyncTime.toIso8601String()}');

      // THEN: Query only metadata updated after lastSyncTime
      final metaSnapshot = await metaCollection
          .where('updatedAt', isGreaterThan: lastSyncTime.toIso8601String())
          .get();

      debugPrint('Firebase: Found ${metaSnapshot.docs.length} changed metadata documents');

      for (final doc in metaSnapshot.docs) {
        final data = doc.data();
        final remoteMeta = _parseRemoteMetadata(doc.id, data);
        final localMeta = await _localStorage.getWritingMetadata(doc.id);

        if (localMeta == null) {
          // New from remote - save metadata only
          if (!remoteMeta.isDeleted) {
            await _localStorage.updateWritingMetadata(remoteMeta);
            debugPrint('Firebase: Downloaded new metadata "${remoteMeta.title}"');
          }
        } else if (!localMeta.isSynced) {
          // Local was just uploaded - skip
          continue;
        } else {
          // Resolve conflict
          await _resolveMetadataConflict(localMeta, remoteMeta, writingsCollection, metaCollection);
        }
      }

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
  
  /// Parse WritingMetadata from remote Firestore data
  WritingMetadata _parseRemoteMetadata(String id, Map<String, dynamic> data) {
    DateTime? deletedAt;
    if (data['deletedAt'] != null && data['deletedAt'].toString().isNotEmpty) {
      deletedAt = DateTime.parse(data['deletedAt']);
    }
    
    return WritingMetadata(
      id: id,
      title: data['title'] ?? '',
      preview: data['preview'] ?? '',
      createdAt: DateTime.parse(data['createdAt'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(data['updatedAt'] ?? DateTime.now().toIso8601String()),
      isSynced: true,
      deletedAt: deletedAt,
    );
  }
  
  /// Parse a full Writing from remote Firestore data
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
  
  /// Resolve conflict between local metadata and remote metadata
  Future<void> _resolveMetadataConflict(
    WritingMetadata localMeta, 
    WritingMetadata remoteMeta,
    CollectionReference<Map<String, dynamic>> writingsCollection,
    CollectionReference<Map<String, dynamic>> metaCollection,
  ) async {
    final localNewer = localMeta.updatedAt.isAfter(remoteMeta.updatedAt);
    final remoteNewer = remoteMeta.updatedAt.isAfter(localMeta.updatedAt);
    
    if (remoteNewer) {
      // Remote is newer - use remote version
      if (remoteMeta.isDeleted) {
        // Remote was deleted - soft-delete locally too
        if (!localMeta.isDeleted) {
          await _localStorage.updateWritingMetadata(remoteMeta);
          // Mark local body for deletion
          await _invalidateLocalBody(remoteMeta.id);
          debugPrint('Firebase: Applied remote deletion for "${localMeta.title}"');
        }
      } else {
        // Remote has newer metadata
        await _localStorage.updateWritingMetadata(remoteMeta);
        // Invalidate local body so it gets fetched fresh when opened
        await _invalidateLocalBody(remoteMeta.id);
        debugPrint('Firebase: Updated local metadata "${remoteMeta.title}" (remote was newer)');
      }
    } else if (localNewer && !localMeta.isSynced) {
      // Local is newer and unsynced - upload local version
      final localWriting = await _localStorage.getFullWriting(localMeta.id);
      if (localWriting != null) {
        await _uploadWriting(localWriting, writingsCollection, metaCollection);
        debugPrint('Firebase: Uploaded "${localWriting.title}" (local was newer)');
      }
    }
    // If timestamps are equal, they're already in sync
  }
  
  /// Invalidate local body cache (mark that body needs to be re-fetched)
  Future<void> _invalidateLocalBody(String id) async {
    // For now, we don't store body cache separately
    // Body will be fetched on-demand when user opens the writing
    // This is a placeholder for potential future optimization
  }
  
  /// Upload a writing to BOTH Firestore collections
  Future<void> _uploadWriting(
    Writing writing, 
    CollectionReference<Map<String, dynamic>> writingsCollection,
    CollectionReference<Map<String, dynamic>> metaCollection,
  ) async {
    // Upload full writing
    await writingsCollection.doc(writing.id).set({
      'title': writing.title,
      'body': writing.body,
      'footer': writing.footer,
      'createdAt': writing.createdAt.toIso8601String(),
      'updatedAt': writing.updatedAt.toIso8601String(),
      'isBold': writing.isBold,
      'textAlign': writing.textAlign,
      'deletedAt': writing.deletedAt?.toIso8601String(),
    });
    
    // Upload metadata (lightweight version for fast listing)
    final preview = _generatePreview(writing.body);
    await metaCollection.doc(writing.id).set({
      'title': writing.title,
      'preview': preview,
      'createdAt': writing.createdAt.toIso8601String(),
      'updatedAt': writing.updatedAt.toIso8601String(),
      'deletedAt': writing.deletedAt?.toIso8601String(),
    });
    
    // Mark as synced locally
    final syncedWriting = writing.copyWith(isSynced: true);
    await _localStorage.saveWriting(syncedWriting);
  }
  
  /// Generate preview from body text (first 100 chars)
  String _generatePreview(String body) {
    if (body.isEmpty) return '';
    
    String preview = body
        .replaceAll(RegExp(r'<[^>]*>'), '')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&amp;', '&')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    
    return preview.length > 100 ? '${preview.substring(0, 100)}...' : preview;
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

  /// Get the writings collection (full content)
  CollectionReference<Map<String, dynamic>> get _writingsCollection {
    return _firestore.collection('writings');
  }
  
  /// Get the writings metadata collection (lightweight)
  CollectionReference<Map<String, dynamic>> get _writingsMetaCollection {
    return _firestore.collection('writings_meta');
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
    final writingsCollection = _writingsCollection;
    final metaCollection = _writingsMetaCollection;
    final metadata = await _localStorage.getAllWritingsMetadataIncludingDeleted();
    
    final unsyncedCount = metadata.where((m) => !m.isSynced).length;
    debugPrint('Firebase: Found ${metadata.length} writings, $unsyncedCount unsynced');

    for (final meta in metadata) {
      if (!meta.isSynced) {
        try {
          // Load full writing for upload
          final writing = await _localStorage.getFullWriting(meta.id);
          if (writing != null) {
            debugPrint('Firebase: Uploading "${writing.title}" (${writing.id})...');
            await _uploadWriting(writing, writingsCollection, metaCollection);
            debugPrint('Firebase: Successfully uploaded "${writing.title}"');
          }
        } catch (e) {
          debugPrint('Firebase ERROR syncing writing ${meta.id}: $e');
        }
      }
    }
  }

  /// Listen to remote metadata changes and apply them locally
  void _listenToRemoteMetadataChanges() {
    _remoteMetaChangesSubscription?.cancel();
    
    final metaCollection = _writingsMetaCollection;

    _remoteMetaChangesSubscription = metaCollection.snapshots().listen((snapshot) async {
      for (final change in snapshot.docChanges) {
        // Skip the initial load - we handle that in sync methods
        if (change.type == DocumentChangeType.added && !_isInitialized) {
          continue;
        }
        
        if (change.type == DocumentChangeType.added ||
            change.type == DocumentChangeType.modified) {
          final data = change.doc.data();
          if (data != null) {
            final remoteMeta = _parseRemoteMetadata(change.doc.id, data);
            final localMeta = await _localStorage.getWritingMetadata(change.doc.id);

            // Apply if remote is newer or local doesn't exist
            if (localMeta == null ||
                remoteMeta.updatedAt.isAfter(localMeta.updatedAt)) {
              await _localStorage.updateWritingMetadata(remoteMeta);
              // Invalidate local body cache
              await _invalidateLocalBody(remoteMeta.id);
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
  
  // ========== ON-DEMAND BODY FETCHING ==========
  
  /// Fetch full writing body from Firestore (for on-demand loading)
  /// Call this when user opens a writing and body is not cached locally
  Future<Writing?> fetchWritingBody(String id) async {
    if (!_isOnline) {
      debugPrint('Firebase: Cannot fetch body - offline');
      return null;
    }
    
    try {
      final doc = await _writingsCollection.doc(id).get();
      if (!doc.exists) {
        debugPrint('Firebase: Writing $id not found in Firestore');
        return null;
      }
      
      final data = doc.data();
      if (data == null) return null;
      
      final writing = _parseRemoteWriting(id, data);
      
      // Save to local storage for future access
      await _localStorage.saveWriting(writing);
      debugPrint('Firebase: Fetched and cached body for "${writing.title}"');
      
      return writing;
    } catch (e) {
      debugPrint('Firebase: Error fetching body for $id: $e');
      return null;
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
    _remoteMetaChangesSubscription?.cancel();
    _onSyncChangedController.close();
  }
}
