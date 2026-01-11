import 'dart:io';
import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path/path.dart' as p;  // Cross-platform path handling
import 'package:flutter/foundation.dart' show debugPrint;
import '../models/writing.dart';
import '../models/writing_metadata.dart';

/// Manages local storage using HTML files in a folder (native) or localStorage (web)
/// 
/// Optimization: Uses a metadata index for fast loading of the list view.
/// Full body content is loaded on-demand when user opens a writing.
class LocalStorageService {
  static const String _folderName = 'Defterim';
  static const String _webStorageKey = 'defterim_writings';
  static const String _metadataIndexFile = 'metadata_index.json';
  static const String _webMetadataKey = 'defterim_metadata_index';
  
  static LocalStorageService? _instance;
  Directory? _storageDir;
  SharedPreferences? _prefs;
  
  // In-memory cache of metadata index
  MetadataIndex? _metadataCache;

  LocalStorageService._();

  static LocalStorageService get instance {
    _instance ??= LocalStorageService._();
    return _instance!;
  }

  /// Initialize storage directory
  Future<void> initialize() async {
    if (kIsWeb) {
      // Web: use browser's localStorage via SharedPreferences
      _prefs = await SharedPreferences.getInstance();
      debugPrint('Local storage initialized (web mode - browser localStorage)');
      return;
    }
    
    final appDir = await getApplicationDocumentsDirectory();
    _storageDir = Directory(p.join(appDir.path, _folderName));
    
    // Create directory if it doesn't exist
    if (!await _storageDir!.exists()) {
      await _storageDir!.create(recursive: true);
    }
    
    debugPrint('Local storage initialized at: ${_storageDir!.path}');
  }

  // ========== METADATA INDEX OPERATIONS ==========

  /// Load metadata index (fast - single file read)
  /// Returns cached version if available
  Future<MetadataIndex> loadMetadataIndex() async {
    if (_metadataCache != null) {
      return _metadataCache!;
    }

    if (kIsWeb) {
      return _loadMetadataIndexWeb();
    }
    return _loadMetadataIndexNative();
  }

  Future<MetadataIndex> _loadMetadataIndexNative() async {
    if (_storageDir == null) {
      return MetadataIndex(writings: []);
    }

    final indexFile = File(p.join(_storageDir!.path, _metadataIndexFile));
    
    if (!await indexFile.exists()) {
      // First run or migration: build index from existing files
      debugPrint('Metadata index not found, building from existing files...');
      final index = await _rebuildMetadataIndex();
      _metadataCache = index;
      return index;
    }

    try {
      final jsonStr = await indexFile.readAsString();
      final json = jsonDecode(jsonStr) as Map<String, dynamic>;
      _metadataCache = MetadataIndex.fromJson(json);
      debugPrint('Loaded metadata index: ${_metadataCache!.writings.length} writings');
      return _metadataCache!;
    } catch (e) {
      debugPrint('Error loading metadata index, rebuilding: $e');
      final index = await _rebuildMetadataIndex();
      _metadataCache = index;
      return index;
    }
  }

  Future<MetadataIndex> _loadMetadataIndexWeb() async {
    if (_prefs == null) {
      return MetadataIndex(writings: []);
    }

    final jsonStr = _prefs!.getString(_webMetadataKey);
    if (jsonStr == null) {
      // Build from existing writings
      final index = await _rebuildMetadataIndexWeb();
      _metadataCache = index;
      return index;
    }

    try {
      final json = jsonDecode(jsonStr) as Map<String, dynamic>;
      _metadataCache = MetadataIndex.fromJson(json);
      return _metadataCache!;
    } catch (e) {
      debugPrint('Error loading web metadata index, rebuilding: $e');
      final index = await _rebuildMetadataIndexWeb();
      _metadataCache = index;
      return index;
    }
  }

  /// Save metadata index to disk
  Future<void> saveMetadataIndex(MetadataIndex index) async {
    _metadataCache = index;

    if (kIsWeb) {
      await _prefs?.setString(_webMetadataKey, jsonEncode(index.toJson()));
      return;
    }

    if (_storageDir == null) return;

    final indexFile = File(p.join(_storageDir!.path, _metadataIndexFile));
    await indexFile.writeAsString(jsonEncode(index.toJson()));
  }

  /// Rebuild metadata index from existing HTML files (migration/recovery)
  Future<MetadataIndex> _rebuildMetadataIndex() async {
    if (_storageDir == null) {
      return MetadataIndex(writings: []);
    }
    
    final files = await _storageDir!.list().where((entity) {
      return entity is File && entity.path.endsWith('.html');
    }).toList();
    
    final metadataList = <WritingMetadata>[];
    for (final file in files) {
      try {
        final writing = await _loadWritingFromFile(file as File);
        if (writing != null) {
          metadataList.add(WritingMetadata.fromWriting(writing));
        }
      } catch (e) {
        debugPrint('Error rebuilding metadata for ${file.path}: $e');
      }
    }

    final index = MetadataIndex(writings: metadataList);
    await saveMetadataIndex(index);
    debugPrint('Rebuilt metadata index: ${metadataList.length} writings');
    return index;
  }

  Future<MetadataIndex> _rebuildMetadataIndexWeb() async {
    final writings = await _getAllWritingsWebRaw();
    final metadataList = writings.map((w) => WritingMetadata.fromWriting(w)).toList();
    final index = MetadataIndex(writings: metadataList);
    await saveMetadataIndex(index);
    return index;
  }

  /// Update last sync time in metadata index
  Future<void> updateLastSyncTime(DateTime syncTime) async {
    final index = await loadMetadataIndex();
    final updated = index.copyWith(lastSyncTime: syncTime);
    await saveMetadataIndex(updated);
  }

  /// Get last sync time
  Future<DateTime?> getLastSyncTime() async {
    final index = await loadMetadataIndex();
    return index.lastSyncTime;
  }

  // ========== METADATA OPERATIONS (FAST) ==========

  /// Get all writings metadata (excluding soft-deleted), sorted by most recently updated
  /// This is FAST - uses the metadata index
  Future<List<WritingMetadata>> getAllWritingsMetadata() async {
    final index = await loadMetadataIndex();
    final activeWritings = index.writings.where((w) => !w.isDeleted).toList();
    activeWritings.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return activeWritings;
  }

  /// Get all writings metadata including soft-deleted (for sync purposes)
  Future<List<WritingMetadata>> getAllWritingsMetadataIncludingDeleted() async {
    final index = await loadMetadataIndex();
    return index.writings;
  }

  /// Get single writing metadata by ID
  Future<WritingMetadata?> getWritingMetadata(String id) async {
    final index = await loadMetadataIndex();
    try {
      return index.writings.firstWhere((w) => w.id == id);
      } catch (e) {
        return null;
      }
    }
    
  /// Update or add metadata for a writing
  Future<void> updateWritingMetadata(WritingMetadata metadata) async {
    final index = await loadMetadataIndex();
    final writings = List<WritingMetadata>.from(index.writings);
    
    // Remove old version if exists
    writings.removeWhere((w) => w.id == metadata.id);
    // Add new version
    writings.add(metadata);
    
    await saveMetadataIndex(index.copyWith(writings: writings));
  }

  /// Remove metadata for a writing
  Future<void> removeWritingMetadata(String id) async {
    final index = await loadMetadataIndex();
    final writings = List<WritingMetadata>.from(index.writings);
    writings.removeWhere((w) => w.id == id);
    await saveMetadataIndex(index.copyWith(writings: writings));
  }

  // ========== FULL WRITING OPERATIONS (ON-DEMAND) ==========

  /// Get a single FULL writing by ID (loads body from disk)
  /// Use this when user opens editor
  Future<Writing?> getFullWriting(String id) async {
    if (kIsWeb) {
      return _getFullWritingWeb(id);
    }
    return _getFullWritingNative(id);
  }

  Future<Writing?> _getFullWritingNative(String id) async {
    if (_storageDir == null) return null;
    
    // Find file by ID suffix (format: title__id.html)
    final file = await _findFileById(id);
    if (file != null) {
      return await _loadWritingFromFile(file);
    }
    
    return null;
  }
  
  /// Find a file by its ID (looks for files ending with __id.html or legacy formats)
  Future<File?> _findFileById(String id) async {
    if (_storageDir == null) return null;
    
    final files = await _storageDir!.list().where((entity) {
      return entity is File && entity.path.endsWith('.html');
    }).toList();
    
    for (final f in files) {
      final file = f as File;
      final fileName = p.basename(file.path);
      
      // New format: title__id.html
      if (fileName.endsWith('__$id.html')) {
        return file;
      }
      
      // Legacy format: id.html (just ID)
      if (fileName == '$id.html') {
        return file;
      }
    }
    
    // Last resort: scan file contents for ID (very old format)
    for (final f in files) {
      try {
        final content = await (f as File).readAsString();
        final idMatch = RegExp(r'<meta name="defterim:id" content="([^"]+)">').firstMatch(content);
        if (idMatch?.group(1) == id) {
          return f;
        }
      } catch (e) {
        // Ignore read errors
      }
    }
    
    return null;
  }
  
  /// Generate filename: "Title__id.html" (human-readable + unique)
  String _generateFilename(String title, String id) {
    final safeTitle = _sanitizeTitle(title.isEmpty ? 'Başlıksız Yazı' : title);
    return '${safeTitle}__$id.html';
  }
  
  /// Sanitize title for use in filename
  String _sanitizeTitle(String title) {
    var safe = title
        .replaceAll(RegExp(r'[<>:"/\\|?*]'), '') // Remove invalid chars
        .replaceAll(RegExp(r'\s+'), ' ')          // Normalize whitespace
        .trim();
    
    // Limit length to 50 chars for reasonable filename length
    if (safe.length > 50) {
      safe = safe.substring(0, 50).trim();
    }
    
    return safe;
  }

  Future<Writing?> _getFullWritingWeb(String id) async {
    final writings = await _getAllWritingsWebRaw();
    try {
      return writings.firstWhere((w) => w.id == id);
    } catch (e) {
      return null;
    }
  }

  /// Save or update a full writing (body to disk, metadata to index)
  Future<void> saveWriting(Writing writing) async {
    // Save full content
    if (kIsWeb) {
      await _saveWritingWeb(writing);
    } else {
      await _saveWritingNative(writing);
    }

    // Update metadata index
    final metadata = WritingMetadata.fromWriting(writing);
    await updateWritingMetadata(metadata);
  }

  Future<void> _saveWritingNative(Writing writing) async {
    if (_storageDir == null) return;
    
    // Find existing file (if any) - might have different title
    final existingFile = await _findFileById(writing.id);
    
    // Generate new filename: Title__id.html
    final newFileName = _generateFilename(writing.title, writing.id);
    final targetFile = File(p.join(_storageDir!.path, newFileName));
    final tempFile = File(p.join(_storageDir!.path, '$newFileName.tmp'));
    
    final htmlContent = _writingToHtml(writing);
    
    // ATOMIC WRITE: write to temp file, then rename
    // This ensures we never lose data if app crashes mid-write
    await tempFile.writeAsString(htmlContent);
    await tempFile.rename(targetFile.path);
    
    // SAFE CLEANUP: Delete old file AFTER new file is safely written
    // This handles title changes (old file has different name)
    if (existingFile != null && existingFile.path != targetFile.path) {
      try {
        await existingFile.delete();
        debugPrint('Renamed file: ${p.basename(existingFile.path)} → $newFileName');
      } catch (e) {
        debugPrint('Warning: Could not delete old file: $e');
        // Not critical - old file is just orphaned, data is safe in new file
      }
    }
  }
  
  Future<void> _saveWritingWeb(Writing writing) async {
    if (_prefs == null) return;

    final writings = await _getAllWritingsWebRaw();
    writings.removeWhere((w) => w.id == writing.id);
    writings.add(writing);

    final writingsJson = writings.map((w) => jsonEncode(_writingToWebJson(w))).toList();
    await _prefs!.setStringList(_webStorageKey, writingsJson);
  }

  Map<String, dynamic> _writingToWebJson(Writing w) {
    return {
      'id': w.id,
      'title': w.title,
      'body': w.body,
      'footer': w.footer,
      'createdAt': w.createdAt.toIso8601String(),
      'updatedAt': w.updatedAt.toIso8601String(),
      'isSynced': w.isSynced,
      'isBold': w.isBold,
      'textAlign': w.textAlign,
      'deletedAt': w.deletedAt?.toIso8601String(),
      'type': w.type.value,
    };
  }

  /// Soft-delete a writing (marks as deleted, keeps for sync)
  Future<void> deleteWriting(String id) async {
    final writing = await getFullWriting(id);
    if (writing == null) return;
    
    // Soft-delete: mark with timestamp and set as unsynced
    final deletedWriting = writing.copyWith(
      deletedAt: DateTime.now(),
      updatedAt: DateTime.now(),
      isSynced: false,
    );
    
    await saveWriting(deletedWriting);
  }

  /// Permanently delete a writing from storage (for cleanup after sync)
  Future<void> permanentlyDeleteWriting(String id) async {
    // Remove from metadata index
    await removeWritingMetadata(id);

    // Remove from disk
    if (kIsWeb) {
      await _permanentlyDeleteWritingWeb(id);
    } else {
      await _permanentlyDeleteWritingNative(id);
    }
  }

  Future<void> _permanentlyDeleteWritingNative(String id) async {
    if (_storageDir == null) return;
    
    // Find file by ID (handles all filename formats)
    final file = await _findFileById(id);
    if (file != null) {
      try {
        await file.delete();
      } catch (e) {
        debugPrint('Error deleting file: $e');
      }
    }
  }

  Future<void> _permanentlyDeleteWritingWeb(String id) async {
    if (_prefs == null) return;

    final writings = await _getAllWritingsWebRaw();
    writings.removeWhere((w) => w.id == id);

    final writingsJson = writings.map((w) => jsonEncode(_writingToWebJson(w))).toList();
    await _prefs!.setStringList(_webStorageKey, writingsJson);
  }

  // ========== LEGACY METHODS (for compatibility during migration) ==========

  /// Get all writings (excluding soft-deleted), sorted by most recently updated
  /// DEPRECATED: Use getAllWritingsMetadata() for list view, getFullWriting() for editor
  Future<List<Writing>> getAllWritings() async {
    final allWritings = await getAllWritingsIncludingDeleted();
    final activeWritings = allWritings.where((w) => !w.isDeleted).toList();
    activeWritings.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return activeWritings;
  }

  /// Get all writings including soft-deleted (for sync purposes)
  /// Note: This loads ALL full content - use sparingly
  Future<List<Writing>> getAllWritingsIncludingDeleted() async {
    if (kIsWeb) {
      return _getAllWritingsWebRaw();
    }
    return _getAllWritingsNative();
  }

  Future<List<Writing>> _getAllWritingsNative() async {
    if (_storageDir == null) return [];

    final files = await _storageDir!.list().where((entity) {
      return entity is File && entity.path.endsWith('.html');
    }).toList();

    final writings = <Writing>[];
    for (final file in files) {
      try {
        final writing = await _loadWritingFromFile(file as File);
        if (writing != null) {
          writings.add(writing);
        }
      } catch (e) {
        debugPrint('Error loading ${file.path}: $e');
      }
    }
    return writings;
  }

  Future<List<Writing>> _getAllWritingsWebRaw() async {
    if (_prefs == null) return [];

    final writingsJson = _prefs!.getStringList(_webStorageKey) ?? [];
    return writingsJson.map((json) {
      final data = jsonDecode(json) as Map<String, dynamic>;
      return Writing(
        id: data['id'],
        title: data['title'] ?? '',
        body: data['body'] ?? '',
        footer: data['footer'] ?? '',
        createdAt: DateTime.parse(data['createdAt']),
        updatedAt: DateTime.parse(data['updatedAt']),
        isSynced: data['isSynced'] ?? false,
        isBold: data['isBold'] ?? false,
        textAlign: data['textAlign'] ?? 'left',
        deletedAt: data['deletedAt'] != null ? DateTime.parse(data['deletedAt']) : null,
        type: WritingTypeExtension.fromString(data['type']),
      );
    }).toList();
  }

  /// Get a single writing by ID (includes soft-deleted for sync purposes)
  /// DEPRECATED: Use getFullWriting() instead
  Future<Writing?> getWriting(String id) async {
    return getFullWriting(id);
  }

  // ========== HELPER METHODS ==========

  /// Clear all data (for testing or reset)
  Future<void> clearAll() async {
    _metadataCache = null;

    if (kIsWeb) {
      if (_prefs == null) return;
      await _prefs!.remove(_webStorageKey);
      await _prefs!.remove(_webMetadataKey);
      return;
    }
    
    if (_storageDir == null) return;
    
    final files = await _storageDir!.list().toList();
    for (final file in files) {
      if (file is File) {
        await file.delete();
      }
    }
  }

  /// Force rebuild of metadata index
  Future<void> rebuildMetadataIndex() async {
    _metadataCache = null;
    if (kIsWeb) {
      await _rebuildMetadataIndexWeb();
    } else {
      await _rebuildMetadataIndex();
    }
  }

  /// Load writing from HTML file
  Future<Writing?> _loadWritingFromFile(File file) async {
    try {
      final htmlContent = await file.readAsString();
      return _writingFromHtml(htmlContent);
    } catch (e) {
      debugPrint('Error reading file ${file.path}: $e');
      return null;
    }
  }

  /// Convert Writing to HTML
  String _writingToHtml(Writing writing) {
    final bodyText = writing.body;
    final isBold = writing.isBold;
    final textAlign = writing.textAlign;
    final deletedAt = writing.deletedAt?.toIso8601String() ?? '';
    
    return '''<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Defterim Metadata -->
  <meta name="defterim:id" content="${writing.id}">
  <meta name="defterim:created" content="${writing.createdAt.toIso8601String()}">
  <meta name="defterim:updated" content="${writing.updatedAt.toIso8601String()}">
  <meta name="defterim:bold" content="$isBold">
  <meta name="defterim:align" content="$textAlign">
  <meta name="defterim:synced" content="${writing.isSynced}">
  <meta name="defterim:deleted" content="$deletedAt">
  <meta name="defterim:type" content="${writing.type.value}">
  
  <title>${writing.title.isEmpty ? 'Başlıksız Yazı' : _escapeHtml(writing.title)}</title>
  
  <style>
    body {
      font-family: Georgia, 'Times New Roman', serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background-color: #FFFFF8;
      color: #2C2C2C;
      line-height: 1.6;
    }
    h1 {
      font-size: 32px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 40px;
      color: #2C2C2C;
    }
    .content {
      font-size: 20px;
      white-space: pre-wrap;
      text-align: $textAlign;
      ${isBold ? 'font-weight: 600;' : ''}
    }
    pre {
      white-space: pre-wrap;
      font-family: inherit;
      margin: 0;
    }
    .footer {
      font-size: 16px;
      font-style: italic;
      color: #666;
      margin-top: 60px;
      text-align: right;
    }
  </style>
</head>
<body>
  <h1>${writing.title.isEmpty ? 'Başlıksız Yazı' : _escapeHtml(writing.title)}</h1>
  
  <pre class="content">${_escapeHtml(bodyText)}</pre>
  
  ${writing.footer.isNotEmpty ? '<div class="footer">${_escapeHtml(writing.footer)}</div>' : ''}
</body>
</html>''';
  }

  /// Parse Writing from HTML
  Writing? _writingFromHtml(String html) {
    try {
      final idMatch = RegExp(r'<meta name="defterim:id" content="([^"]+)">').firstMatch(html);
      final createdMatch = RegExp(r'<meta name="defterim:created" content="([^"]+)">').firstMatch(html);
      final updatedMatch = RegExp(r'<meta name="defterim:updated" content="([^"]+)">').firstMatch(html);
      final boldMatch = RegExp(r'<meta name="defterim:bold" content="([^"]+)">').firstMatch(html);
      final alignMatch = RegExp(r'<meta name="defterim:align" content="([^"]+)">').firstMatch(html);
      final syncedMatch = RegExp(r'<meta name="defterim:synced" content="([^"]+)">').firstMatch(html);
      final deletedMatch = RegExp(r'<meta name="defterim:deleted" content="([^"]*)">').firstMatch(html);
      final typeMatch = RegExp(r'<meta name="defterim:type" content="([^"]*)">').firstMatch(html);
      
      final titleMatch = RegExp(r'<title>([^<]+)</title>').firstMatch(html);
      final title = titleMatch != null ? _unescapeHtml(titleMatch.group(1)!) : '';
      
      final contentMatch = RegExp(r'<pre class="content">([^<]*)</pre>', dotAll: true).firstMatch(html);
      final bodyHtml = contentMatch?.group(1) ?? '';
      final body = _unescapeHtml(bodyHtml);
      
      final footerMatch = RegExp(r'<div class="footer">([^<]+)</div>').firstMatch(html);
      final footer = footerMatch != null ? _unescapeHtml(footerMatch.group(1)!) : '';
      
      final deletedAtStr = deletedMatch?.group(1);
      DateTime? deletedAt;
      if (deletedAtStr != null && deletedAtStr.isNotEmpty) {
        deletedAt = DateTime.parse(deletedAtStr);
      }
      
      return Writing(
        id: idMatch?.group(1) ?? DateTime.now().millisecondsSinceEpoch.toString(),
        title: title == 'Başlıksız Yazı' ? '' : title,
        body: body,
        footer: footer,
        createdAt: createdMatch != null ? DateTime.parse(createdMatch.group(1)!) : DateTime.now(),
        updatedAt: updatedMatch != null ? DateTime.parse(updatedMatch.group(1)!) : DateTime.now(),
        isSynced: syncedMatch?.group(1) == 'true',
        isBold: boldMatch?.group(1) == 'true',
        textAlign: alignMatch?.group(1) ?? 'left',
        deletedAt: deletedAt,
        type: WritingTypeExtension.fromString(typeMatch?.group(1)),
      );
    } catch (e) {
      debugPrint('Error parsing HTML: $e');
      return null;
    }
  }

  String _escapeHtml(String text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
  }

  String _unescapeHtml(String text) {
    return text
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&amp;', '&');
  }

  /// Get the storage directory path
  String? get storagePath => _storageDir?.path;
}
