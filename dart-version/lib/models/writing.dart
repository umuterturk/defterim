/// Writing types
enum WritingType {
  siir,   // Şiir (Poem)
  yazi,   // Yazı (Writing/Prose)
  diger,  // Diğer (Other)
}

/// Extension to convert WritingType to/from string
extension WritingTypeExtension on WritingType {
  String get displayName {
    switch (this) {
      case WritingType.siir:
        return 'Şiir';
      case WritingType.yazi:
        return 'Yazı';
      case WritingType.diger:
        return 'Diğer';
    }
  }

  String get value {
    switch (this) {
      case WritingType.siir:
        return 'siir';
      case WritingType.yazi:
        return 'yazi';
      case WritingType.diger:
        return 'diger';
    }
  }

  static WritingType fromString(String? value) {
    switch (value) {
      case 'siir':
        return WritingType.siir;
      case 'yazi':
        return WritingType.yazi;
      case 'diger':
        return WritingType.diger;
      default:
        return WritingType.siir; // Default to poem
    }
  }
}

/// Represents a single writing/poem/note
class Writing {
  final String id;
  String title;
  String body;
  String footer;
  final DateTime createdAt;
  DateTime updatedAt;
  bool isSynced;
  bool isBold;
  String textAlign; // 'left', 'center', 'right'
  DateTime? deletedAt; // Soft-delete timestamp (null = not deleted)
  WritingType type; // Type of writing (poem, story, other)

  Writing({
    required this.id,
    required this.title,
    this.body = '',
    this.footer = '',
    required this.createdAt,
    required this.updatedAt,
    this.isSynced = false,
    this.isBold = false,
    this.textAlign = 'left',
    this.deletedAt,
    this.type = WritingType.siir, // Default to poem
  });

  /// Whether this writing is soft-deleted
  bool get isDeleted => deletedAt != null;

  /// Create a new writing with generated ID and timestamps
  factory Writing.create({
    required String title,
    String body = '',
    String footer = '',
    bool isBold = false,
    String textAlign = 'left',
    WritingType type = WritingType.siir,
  }) {
    final now = DateTime.now();
    return Writing(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      title: title,
      body: body,
      footer: footer,
      createdAt: now,
      updatedAt: now,
      isSynced: false,
      isBold: isBold,
      textAlign: textAlign,
      deletedAt: null,
      type: type,
    );
  }

  /// Create a copy with updated fields
  Writing copyWith({
    String? title,
    String? body,
    String? footer,
    DateTime? updatedAt,
    bool? isSynced,
    bool? isBold,
    String? textAlign,
    DateTime? deletedAt,
    bool clearDeletedAt = false,
    WritingType? type,
  }) {
    return Writing(
      id: id,
      title: title ?? this.title,
      body: body ?? this.body,
      footer: footer ?? this.footer,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isSynced: isSynced ?? this.isSynced,
      isBold: isBold ?? this.isBold,
      textAlign: textAlign ?? this.textAlign,
      deletedAt: clearDeletedAt ? null : (deletedAt ?? this.deletedAt),
      type: type ?? this.type,
    );
  }

  /// Get a preview of the body (first 50 characters)
  /// Strips HTML tags if present
  String get bodyPreview {
    if (body.isEmpty) return '';
    
    // Strip HTML tags for preview
    String preview = body
        .replaceAll(RegExp(r'<[^>]*>'), '')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&amp;', '&')
        .trim();
    
    return preview.length > 50 ? '${preview.substring(0, 50)}...' : preview;
  }
}
