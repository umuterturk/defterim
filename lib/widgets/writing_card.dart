import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/writing_metadata.dart';

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
              
              // Date
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
