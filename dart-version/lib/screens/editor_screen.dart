import 'dart:async';
import 'package:flutter/material.dart';
import '../models/writing.dart';
import '../services/local_storage_service.dart';
import '../services/firebase_sync_service.dart';

/// Editor screen for creating and editing writings
class EditorScreen extends StatefulWidget {
  final String writingId;

  const EditorScreen({
    super.key,
    required this.writingId,
  });

  @override
  State<EditorScreen> createState() => _EditorScreenState();
}

class _EditorScreenState extends State<EditorScreen> {
  final LocalStorageService _storage = LocalStorageService.instance;
  final FirebaseSyncService _firebase = FirebaseSyncService.instance;
  
  late TextEditingController _titleController;
  late TextEditingController _bodyController;
  late TextEditingController _footerController;
  
  Writing? _writing;
  Timer? _autoSaveTimer;
  bool _hasUnsavedChanges = false;
  bool _isLoadingBody = false;
  
  // Original content for change detection
  String _originalTitle = '';
  String _originalBody = '';
  String _originalFooter = '';
  bool _originalIsBold = false;
  String _originalTextAlign = 'left';
  WritingType _originalType = WritingType.siir;
  
  // Text formatting state (kept for data compatibility)
  bool _isBold = false;
  TextAlign _textAlign = TextAlign.left;
  WritingType _writingType = WritingType.siir;

  @override
  void initState() {
    super.initState();
    
    // Set up controllers first
    _titleController = TextEditingController();
    _bodyController = TextEditingController();
    _footerController = TextEditingController();
    
    // Listen to text changes for autosave
    _titleController.addListener(_onTextChanged);
    _bodyController.addListener(_onTextChanged);
    _footerController.addListener(_onTextChanged);
    
    // Then load writing (after listeners are set up)
    _loadWriting();
  }

  Future<void> _loadWriting() async {
    // First try to load from local storage
    Writing? writing = await _storage.getFullWriting(widget.writingId);
    
    // If not found locally (metadata-only sync), fetch body from Firestore
    if (writing == null) {
      // Check if we have metadata for this writing
      final metadata = await _storage.getWritingMetadata(widget.writingId);
      if (metadata != null && mounted) {
        // Show loading state with metadata while fetching body
        setState(() {
          _isLoadingBody = true;
          _titleController.text = metadata.title;
        });
        
        // Fetch full body from Firestore
        writing = await _firebase.fetchWritingBody(widget.writingId);
        
        if (mounted) {
          setState(() {
            _isLoadingBody = false;
          });
        }
      }
    }
    
    if (writing != null && mounted) {
      // Store original values for change detection
      _originalTitle = writing.title;
      _originalBody = writing.body;
      _originalFooter = writing.footer;
      _originalIsBold = writing.isBold;
      _originalTextAlign = writing.textAlign;
      _originalType = writing.type;
      
      setState(() {
        _writing = writing;
        _titleController.text = writing!.title;
        _footerController.text = writing.footer;
        _bodyController.text = writing.body;
        _isBold = writing.isBold;
        _textAlign = _parseTextAlign(writing.textAlign);
        _writingType = writing.type;
        _hasUnsavedChanges = false;
      });
    }
  }
  
  /// Check if content has actually changed from original
  bool _hasActualChanges() {
    if (_writing == null) return false;
    
    return _titleController.text != _originalTitle ||
           _bodyController.text != _originalBody ||
           _footerController.text != _originalFooter ||
           _isBold != _originalIsBold ||
           _textAlignToString(_textAlign) != _originalTextAlign ||
           _writingType != _originalType;
  }
  
  TextAlign _parseTextAlign(String align) {
    switch (align) {
      case 'center':
        return TextAlign.center;
      case 'right':
        return TextAlign.right;
      default:
        return TextAlign.left;
    }
  }
  
  String _textAlignToString(TextAlign align) {
    switch (align) {
      case TextAlign.center:
        return 'center';
      case TextAlign.right:
        return 'right';
      default:
        return 'left';
    }
  }

  void _onTextChanged() {
    // Check if content has actually changed from original
    final hasChanges = _hasActualChanges();
    
    // Update UI state if changed
    if (_hasUnsavedChanges != hasChanges) {
      setState(() {
        _hasUnsavedChanges = hasChanges;
      });
    }
    
    // Only schedule save if there are actual changes
    if (!hasChanges) {
      _autoSaveTimer?.cancel();
      return;
    }
    
    // Cancel existing timer
    _autoSaveTimer?.cancel();
    
    // Start new timer (save 2 seconds after user stops typing)
    _autoSaveTimer = Timer(const Duration(seconds: 2), () {
      _saveWriting();
    });
  }

  Future<void> _saveWriting() async {
    if (_writing == null) return;
    
    // Don't save if there are no actual changes
    if (!_hasActualChanges()) {
      setState(() {
        _hasUnsavedChanges = false;
      });
      return;
    }
    
    // Don't save if all fields are empty
    final hasContent = _titleController.text.trim().isNotEmpty ||
                      _bodyController.text.trim().isNotEmpty ||
                      _footerController.text.trim().isNotEmpty;
    
    if (!hasContent) {
      // Content is empty - delete the writing
      // If never synced, permanently delete (no need to sync deletion)
      // If was synced, soft-delete so deletion syncs to other devices
      if (_writing!.isSynced) {
        await _storage.deleteWriting(_writing!.id);
      } else {
        await _storage.permanentlyDeleteWriting(_writing!.id);
      }
      setState(() {
        _hasUnsavedChanges = false;
      });
      return;
    }
    
    final updatedWriting = _writing!.copyWith(
      title: _titleController.text,
      body: _bodyController.text, // Store as plain text
      footer: _footerController.text,
      updatedAt: DateTime.now(),
      isSynced: false,
      isBold: _isBold,
      textAlign: _textAlignToString(_textAlign),
      type: _writingType,
    );
    
    await _storage.saveWriting(updatedWriting);
    
    // Update original values after successful save
    _originalTitle = updatedWriting.title;
    _originalBody = updatedWriting.body;
    _originalFooter = updatedWriting.footer;
    _originalIsBold = updatedWriting.isBold;
    _originalTextAlign = updatedWriting.textAlign;
    _originalType = updatedWriting.type;
    
    setState(() {
      _writing = updatedWriting;
      _hasUnsavedChanges = false;
    });
    
    // Trigger Firebase sync in background
    _firebase.syncUnsyncedToCloud();
  }

  void _setWritingType(WritingType type) {
    setState(() {
      _writingType = type;
      _hasUnsavedChanges = _hasActualChanges();
    });
    // Save immediately when type changes (no debounce) - only if changed
    if (_hasUnsavedChanges) {
      _saveWriting();
    }
  }

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
  void dispose() {
    _autoSaveTimer?.cancel();
    _titleController.dispose();
    _bodyController.dispose();
    _footerController.dispose();
    super.dispose();
  }
  
  Future<void> _saveOrDeleteWriting() async {
    if (_writing == null) return;
    
    // Check if all fields are empty
    final hasContent = _titleController.text.trim().isNotEmpty ||
                      _bodyController.text.trim().isNotEmpty ||
                      _footerController.text.trim().isNotEmpty;
    
    if (!hasContent) {
      // Content is empty - delete the writing
      await _storage.deleteWriting(_writing!.id);
    } else if (_hasUnsavedChanges) {
      // Has content and unsaved changes - save it
      await _saveWriting();
    }
  }

  /// Navigate back to list (saves first)
  Future<void> _goBack() async {
    final navigator = Navigator.of(context);
    await _saveOrDeleteWriting();
    if (mounted) {
      navigator.pop();
    }
  }

  /// Show confirmation dialog and soft-delete if confirmed
  Future<void> _confirmAndDelete() async {
    if (_writing == null) return;
    
    final title = _titleController.text.trim().isEmpty 
        ? 'Başlıksız Yazı' 
        : _titleController.text.trim();
    
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(
          'Yazıyı Sil',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w600,
          ),
        ),
        content: Text(
          '"$title" yazısını silmek istediğinizden emin misiniz?',
          style: const TextStyle(fontSize: 18),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text(
              'İptal',
              style: TextStyle(fontSize: 18),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(
              foregroundColor: Colors.red,
            ),
            child: const Text(
              'Sil',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
    
    if (confirmed == true) {
      // Cancel any pending autosave
      _autoSaveTimer?.cancel();
      
      // Soft-delete the writing
      await _storage.deleteWriting(_writing!.id);
      
      // Trigger sync
      _firebase.syncUnsyncedToCloud();
      
      // Go back to list
      if (mounted) {
        Navigator.pop(context);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        // Always check if empty and delete, or save if has content
        await _goBack();
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFFFFFF8), // Slightly warm white, like paper
        body: Column(
          children: [
            // Simplified toolbar
            Container(
              padding: const EdgeInsets.only(top: 8, bottom: 8, left: 8, right: 16),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border(
                  bottom: BorderSide(
                    color: Colors.grey[300]!,
                    width: 1,
                  ),
                ),
              ),
              child: Row(
                children: [
                  // Back button (larger with label)
                  Material(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      onTap: _goBack,
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.arrow_back, size: 32, color: Color(0xFF4A7C59)),
                            const SizedBox(width: 10),
                            Text(
                              'Geri',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w600,
                                color: Colors.grey[700],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  
                  const SizedBox(width: 20),
                  
                  // Writing type selector
                  _WritingTypeSelector(
                    currentType: _writingType,
                    onTypeChanged: _setWritingType,
                    getTypeIcon: _getTypeIcon,
                    getTypeColor: _getTypeColor,
                  ),
                  
                  const Spacer(),
                  
                  // Delete button
                  IconButton(
                    icon: const Icon(Icons.delete_outline, size: 28),
                    color: Colors.grey[600],
                    tooltip: 'Sil',
                    onPressed: _confirmAndDelete,
                  ),
                  
                  const SizedBox(width: 8),
                  
                  // Status indicator
                  _hasUnsavedChanges
                      ? const Icon(
                          Icons.edit,
                          color: Colors.orange,
                          size: 24,
                        )
                      : const Icon(
                          Icons.check_circle,
                          color: Colors.green,
                          size: 24,
                        ),
                ],
              ),
            ),
            
            // Editor content - notebook style with fixed width
            Expanded(
              child: Container(
                color: const Color(0xFFE8E8E0), // Slightly darker background (desk)
                child: Center(
                  child: Container(
                    width: 800, // Fixed width like a real notebook page
                    margin: const EdgeInsets.symmetric(vertical: 32),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFFFF8), // Paper white
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.1),
                          blurRadius: 20,
                          offset: const Offset(0, 4),
                        ),
                      ],
                      border: Border.all(
                        color: Colors.grey[300]!,
                        width: 1,
                      ),
                    ),
                    child: _isLoadingBody
                        ? const Center(
                            child: Padding(
                              padding: EdgeInsets.all(60),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  CircularProgressIndicator(
                                    color: Color(0xFF4A7C59),
                                  ),
                                  SizedBox(height: 16),
                                  Text(
                                    'İçerik yükleniyor...',
                                    style: TextStyle(
                                      color: Color(0xFF666666),
                                      fontSize: 16,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          )
                        : SingleChildScrollView(
                      padding: const EdgeInsets.all(60), // Generous notebook margins
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                    // Title field
                    TextField(
                      controller: _titleController,
                      style: const TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF2C2C2C),
                        height: 1.3,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'Başlık',
                        hintStyle: TextStyle(
                          color: Color(0xFFBBBBBB),
                        ),
                        border: InputBorder.none,
                      ),
                      maxLines: null,
                      textCapitalization: TextCapitalization.sentences,
                    ),
                    
                    const SizedBox(height: 32),
                    
                    // Body field
                    TextField(
                      controller: _bodyController,
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: _isBold ? FontWeight.w600 : FontWeight.w400,
                        color: const Color(0xFF2C2C2C),
                        height: 1.6,
                      ),
                      textAlign: _textAlign,
                      decoration: const InputDecoration(
                        hintText: 'Yazmaya başlayın...',
                        hintStyle: TextStyle(
                          color: Color(0xFFBBBBBB),
                        ),
                        border: InputBorder.none,
                      ),
                      maxLines: null,
                      textCapitalization: TextCapitalization.sentences,
                    ),
                    
                    const SizedBox(height: 60),
                    
                    // Footer field
                    TextField(
                      controller: _footerController,
                      style: TextStyle(
                        fontSize: 16,
                        fontStyle: FontStyle.italic,
                        color: Colors.grey[600],
                        height: 1.5,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Notlar (tarih, yer, vb.)',
                        hintStyle: TextStyle(
                          color: Colors.grey[400],
                        ),
                        border: InputBorder.none,
                      ),
                      maxLines: null,
                      textCapitalization: TextCapitalization.sentences,
                    ),
                      ],
                      ),
                    ), // end of SingleChildScrollView
                  ), // end of ternary (Container child)
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Writing type selector dropdown widget
class _WritingTypeSelector extends StatelessWidget {
  final WritingType currentType;
  final ValueChanged<WritingType> onTypeChanged;
  final IconData Function(WritingType) getTypeIcon;
  final Color Function(WritingType) getTypeColor;

  const _WritingTypeSelector({
    required this.currentType,
    required this.onTypeChanged,
    required this.getTypeIcon,
    required this.getTypeColor,
  });

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<WritingType>(
      onSelected: onTypeChanged,
      offset: const Offset(0, 50),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      itemBuilder: (context) => WritingType.values.map((type) {
        final isSelected = type == currentType;
        return PopupMenuItem<WritingType>(
          value: type,
          child: Row(
            children: [
              Icon(
                getTypeIcon(type),
                size: 20,
                color: isSelected ? getTypeColor(type) : Colors.grey[600],
              ),
              const SizedBox(width: 12),
              Text(
                type.displayName,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                  color: isSelected ? getTypeColor(type) : Colors.grey[800],
                ),
              ),
              if (isSelected) ...[
                const Spacer(),
                Icon(
                  Icons.check,
                  size: 18,
                  color: getTypeColor(type),
                ),
              ],
            ],
          ),
        );
      }).toList(),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: getTypeColor(currentType).withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: getTypeColor(currentType).withOpacity(0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              getTypeIcon(currentType),
              size: 18,
              color: getTypeColor(currentType),
            ),
            const SizedBox(width: 8),
            Text(
              currentType.displayName,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: getTypeColor(currentType),
              ),
            ),
            const SizedBox(width: 6),
            Icon(
              Icons.arrow_drop_down,
              size: 20,
              color: getTypeColor(currentType),
            ),
          ],
        ),
      ),
    );
  }
}
