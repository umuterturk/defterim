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
  
  // Text formatting state
  bool _isBold = false;
  TextAlign _textAlign = TextAlign.left;

  @override
  void initState() {
    super.initState();
    
    // Set up controllers first
    _titleController = TextEditingController();
    _bodyController = TextEditingController();
    _footerController = TextEditingController();
    
    // Then load writing
    _loadWriting();
    
    // Listen to text changes for autosave
    _titleController.addListener(_onTextChanged);
    _bodyController.addListener(_onTextChanged);
    _footerController.addListener(_onTextChanged);
  }

  Future<void> _loadWriting() async {
    // Load full body content on-demand (optimized: metadata loaded earlier)
    final writing = await _storage.getFullWriting(widget.writingId);
    if (writing != null && mounted) {
      setState(() {
        _writing = writing;
        _titleController.text = writing.title;
        _footerController.text = writing.footer;
        
        // Body is plain text (HTML parsing done by storage service)
        _bodyController.text = writing.body;
        _isBold = writing.isBold;
        _textAlign = _parseTextAlign(writing.textAlign);
      });
    }
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
    // Only mark as unsaved, don't trigger save yet
    if (!_hasUnsavedChanges) {
      setState(() {
        _hasUnsavedChanges = true;
      });
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
    );
    
    await _storage.saveWriting(updatedWriting);
    
    setState(() {
      _writing = updatedWriting;
      _hasUnsavedChanges = false;
    });
    
    // Trigger Firebase sync in background
    _firebase.syncUnsyncedToCloud();
  }

  void _toggleBold() {
    setState(() {
      _isBold = !_isBold;
    });
    // Save immediately when formatting changes (no debounce)
    _saveWriting();
  }

  void _setAlignment(TextAlign align) {
    setState(() {
      _textAlign = align;
    });
    // Save immediately when formatting changes (no debounce)
    _saveWriting();
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
    final navigator = Navigator.of(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        // Always check if empty and delete, or save if has content
        await _saveOrDeleteWriting();
        if (mounted) {
          navigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFFFFFF8), // Slightly warm white, like paper
        body: Column(
          children: [
            // Combined AppBar + Toolbar (saves vertical space)
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
                  // Back button
                  IconButton(
                    icon: const Icon(Icons.arrow_back, size: 28),
                    onPressed: () async {
                      final navigator = Navigator.of(context);
                      await _saveOrDeleteWriting();
                      if (mounted) {
                        navigator.pop();
                      }
                    },
                  ),
                  const SizedBox(width: 8),
                  
                  // Toolbar buttons
                  _ToolbarButton(
                    icon: Icons.format_bold,
                    label: 'Kalın',
                    isActive: _isBold,
                    onPressed: _toggleBold,
                  ),
                  const SizedBox(width: 4),
                  _ToolbarButton(
                    icon: Icons.format_align_left,
                    label: 'Sola',
                    isActive: _textAlign == TextAlign.left,
                    onPressed: () => _setAlignment(TextAlign.left),
                  ),
                  const SizedBox(width: 4),
                  _ToolbarButton(
                    icon: Icons.format_align_center,
                    label: 'Ortaya',
                    isActive: _textAlign == TextAlign.center,
                    onPressed: () => _setAlignment(TextAlign.center),
                  ),
                  const SizedBox(width: 4),
                  _ToolbarButton(
                    icon: Icons.format_align_right,
                    label: 'Sağa',
                    isActive: _textAlign == TextAlign.right,
                    onPressed: () => _setAlignment(TextAlign.right),
                  ),
                  
                  const Spacer(),
                  
                  // Delete button
                  IconButton(
                    icon: const Icon(Icons.delete_outline, size: 26),
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
                          size: 22,
                        )
                      : const Icon(
                          Icons.check_circle,
                          color: Colors.green,
                          size: 22,
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
                          color: Colors.black.withValues(alpha: 0.1),
                          blurRadius: 20,
                          offset: const Offset(0, 4),
                        ),
                      ],
                      border: Border.all(
                        color: Colors.grey[300]!,
                        width: 1,
                      ),
                    ),
                    child: SingleChildScrollView(
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
                    
                    // Body field (no divider, just space)
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
                    
                    // Footer field (no divider, just space)
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
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Inline toolbar button widget
class _ToolbarButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onPressed;

  const _ToolbarButton({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: isActive ? const Color(0xFF4A7C59).withValues(alpha: 0.1) : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 24,
                color: isActive ? const Color(0xFF4A7C59) : Colors.grey[700],
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  color: isActive ? const Color(0xFF4A7C59) : Colors.grey[700],
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

