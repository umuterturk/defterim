import 'writing.dart';

/// Lightweight metadata for list display (no body content)
/// Used for fast app loading - full body loaded on-demand
class WritingMetadata {
  final String id;
  final String title;
  final String preview; // First 100 chars of body
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool isSynced;
  final DateTime? deletedAt;
  final WritingType type; // Type of writing (poem, story, other)

  WritingMetadata({
    required this.id,
    required this.title,
    required this.preview,
    required this.createdAt,
    required this.updatedAt,
    this.isSynced = false,
    this.deletedAt,
    this.type = WritingType.siir, // Default to poem
  });

  /// Whether this writing is soft-deleted
  bool get isDeleted => deletedAt != null;

  /// Create from full Writing object
  factory WritingMetadata.fromWriting(dynamic writing) {
    return WritingMetadata(
      id: writing.id,
      title: writing.title,
      preview: _generatePreview(writing.body),
      createdAt: writing.createdAt,
      updatedAt: writing.updatedAt,
      isSynced: writing.isSynced,
      deletedAt: writing.deletedAt,
      type: writing.type ?? WritingType.siir,
    );
  }

  /// Create from JSON (for index file)
  factory WritingMetadata.fromJson(Map<String, dynamic> json) {
    return WritingMetadata(
      id: json['id'],
      title: json['title'] ?? '',
      preview: json['preview'] ?? '',
      createdAt: DateTime.parse(json['createdAt']),
      updatedAt: DateTime.parse(json['updatedAt']),
      isSynced: json['isSynced'] ?? false,
      deletedAt: json['deletedAt'] != null ? DateTime.parse(json['deletedAt']) : null,
      type: WritingTypeExtension.fromString(json['type']),
    );
  }

  /// Convert to JSON for index file
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'preview': preview,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
      'isSynced': isSynced,
      'deletedAt': deletedAt?.toIso8601String(),
      'type': type.value,
    };
  }

  /// Create a copy with updated fields
  WritingMetadata copyWith({
    String? title,
    String? preview,
    DateTime? updatedAt,
    bool? isSynced,
    DateTime? deletedAt,
    bool clearDeletedAt = false,
    WritingType? type,
  }) {
    return WritingMetadata(
      id: id,
      title: title ?? this.title,
      preview: preview ?? this.preview,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isSynced: isSynced ?? this.isSynced,
      deletedAt: clearDeletedAt ? null : (deletedAt ?? this.deletedAt),
      type: type ?? this.type,
    );
  }

  /// Generate preview from body text (first 100 chars)
  static String _generatePreview(String body) {
    if (body.isEmpty) return '';
    
    // Strip HTML tags and clean up
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
}

/// Container for metadata index file
class MetadataIndex {
  /// Version for schema migrations - increment when metadata structure changes
  /// Version 1: Initial
  /// Version 2: Added type field for WritingType support
  static const int currentVersion = 2;
  
  final int version;
  final DateTime? lastSyncTime;
  final List<WritingMetadata> writings;

  MetadataIndex({
    this.version = currentVersion,
    this.lastSyncTime,
    required this.writings,
  });

  /// Check if this index needs to be rebuilt (outdated version)
  bool get needsRebuild => version < currentVersion;

  factory MetadataIndex.fromJson(Map<String, dynamic> json) {
    final writingsList = (json['writings'] as List<dynamic>?)
        ?.map((w) => WritingMetadata.fromJson(w as Map<String, dynamic>))
        .toList() ?? [];
    
    return MetadataIndex(
      version: json['version'] ?? 1, // Default to version 1 for old data
      lastSyncTime: json['lastSyncTime'] != null 
          ? DateTime.parse(json['lastSyncTime']) 
          : null,
      writings: writingsList,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'version': version,
      'lastSyncTime': lastSyncTime?.toIso8601String(),
      'writings': writings.map((w) => w.toJson()).toList(),
    };
  }

  /// Create a copy with updated fields
  MetadataIndex copyWith({
    int? version,
    DateTime? lastSyncTime,
    List<WritingMetadata>? writings,
  }) {
    return MetadataIndex(
      version: version ?? this.version,
      lastSyncTime: lastSyncTime ?? this.lastSyncTime,
      writings: writings ?? this.writings,
    );
  }
}








