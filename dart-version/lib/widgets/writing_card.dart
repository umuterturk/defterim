import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/writing_metadata.dart';
import '../models/writing.dart';

/// Card widget for displaying a writing in the list
/// Uses lightweight WritingMetadata (no body content loaded)
class WritingCard extends StatelessWidget {
  // Static DateFormat - created once, reused across all cards
  static final DateFormat _dateFormat = DateFormat('d MMMM yyyy', 'tr_TR');
  
  final WritingMetadata metadata;
  final VoidCallback onTap;

  const WritingCard({
    super.key,
    required this.metadata,
    required this.onTap,
  });

  /// Get icon for writing type
  IconData _getTypeIcon(WritingType type) {
    switch (type) {
      case WritingType.siir:
        return Icons.auto_stories;
      case WritingType.yazi:
        return Icons.article;
      case WritingType.diger:
        return Icons.notes;
    }
  }

  /// Get color for writing type
  Color _getTypeColor(WritingType type) {
    switch (type) {
      case WritingType.siir:
        return const Color(0xFF7B5EA7); // Purple for poems
      case WritingType.yazi:
        return const Color(0xFF4A7C59); // Green for prose
      case WritingType.diger:
        return const Color(0xFF5A8AB5); // Blue for other
    }
  }

  @override
  Widget build(BuildContext context) {
    
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title
              Text(
                metadata.title.isEmpty ? 'Başlıksız Yazı' : metadata.title,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w600,
                  color: metadata.title.isEmpty ? Colors.grey[500] : const Color(0xFF2C2C2C),
                  height: 1.3,
                  fontStyle: metadata.title.isEmpty ? FontStyle.italic : FontStyle.normal,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              
              // Body preview (if exists)
              if (metadata.preview.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  metadata.preview,
                  style: TextStyle(
                    fontSize: 18,
                    color: Colors.grey[700],
                    height: 1.5,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              
              // Date and Type
              const SizedBox(height: 16),
              Row(
                children: [
                  Icon(
                    Icons.access_time,
                    size: 18,
                    color: Colors.grey[500],
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _dateFormat.format(metadata.updatedAt),
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(width: 16),
                  // Type label
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getTypeColor(metadata.type).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _getTypeColor(metadata.type).withOpacity(0.3),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _getTypeIcon(metadata.type),
                          size: 14,
                          color: _getTypeColor(metadata.type),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          metadata.type.displayName,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _getTypeColor(metadata.type),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  // Sync indicator
                  if (!metadata.isSynced)
                    Icon(
                      Icons.cloud_upload_outlined,
                      size: 20,
                      color: Colors.grey[400],
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
