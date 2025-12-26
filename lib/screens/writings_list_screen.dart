import 'dart:async';
import 'package:flutter/material.dart';
import '../models/writing.dart';
import '../models/writing_metadata.dart';
import '../services/local_storage_service.dart';
import '../services/firebase_sync_service.dart';
import '../widgets/writing_card.dart';
import 'editor_screen.dart';

/// Home screen showing list of all writings
/// 
/// Optimization: Uses lightweight WritingMetadata for fast loading.
/// Full body content is loaded on-demand when user opens a writing.
class WritingsListScreen extends StatefulWidget {
  const WritingsListScreen({super.key});

  @override
  State<WritingsListScreen> createState() => _WritingsListScreenState();
}

class _WritingsListScreenState extends State<WritingsListScreen> {
  final LocalStorageService _storage = LocalStorageService.instance;
  final FirebaseSyncService _syncService = FirebaseSyncService.instance;
  final TextEditingController _searchController = TextEditingController();
  StreamSubscription<void>? _syncSubscription;
  
  List<WritingMetadata> _writings = [];
  List<WritingMetadata> _filteredWritings = [];
  String _searchQuery = '';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadWritings();
    
    // Listen to search input
    _searchController.addListener(_onSearchChanged);
    
    // Listen to sync service for remote changes
    _syncSubscription = _syncService.onSyncChanged.listen((_) {
      _loadWritings();
    });
  }
  
  @override
  void dispose() {
    _searchController.dispose();
    _syncSubscription?.cancel();
    super.dispose();
  }
  
  void _onSearchChanged() {
    setState(() {
      _searchQuery = _searchController.text;
      _filterWritings();
    });
  }
  
  void _filterWritings() {
    if (_searchQuery.isEmpty) {
      _filteredWritings = _writings;
    } else {
      final query = _searchQuery.toLowerCase();
      _filteredWritings = _writings.where((metadata) {
        // Search in title and preview (body preview from metadata)
        final title = metadata.title.toLowerCase();
        final preview = metadata.preview.toLowerCase();
        return title.contains(query) || preview.contains(query);
      }).toList();
    }
  }

  Future<void> _loadWritings() async {
    setState(() {
      _isLoading = true;
    });
    
    // Use metadata for fast loading (no body content loaded)
    final writings = await _storage.getAllWritingsMetadata();
    if (mounted) {
      setState(() {
        _writings = writings;
        _filterWritings();
        _isLoading = false;
      });
    }
  }
  
  void _clearSearch() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
      _filterWritings();
    });
  }

  Future<void> _createNewWriting() async {
    // Clear search before navigating
    _clearSearch();
    
    // Create a new writing with empty title (will show placeholder in editor)
    final newWriting = Writing.create(
      title: '',  // Empty title - placeholder will show in editor
    );
    
    // Save the new writing (this also updates metadata index)
    await _storage.saveWriting(newWriting);
    
    if (mounted) {
      // Navigate to editor
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => EditorScreen(writingId: newWriting.id),
        ),
      );
      _loadWritings();
    }
  }

  Future<void> _openWriting(String writingId) async {
    // Clear search before navigating
    _clearSearch();
    
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => EditorScreen(writingId: writingId),
      ),
    );
    _loadWritings();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F0), // Warm, paper-like background
      appBar: AppBar(
        title: const Text(
          'Defterim',  // "My Notebook" in Turkish
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w600,
            color: Color(0xFF2C2C2C),
          ),
        ),
        backgroundColor: const Color(0xFFF5F5F0),
        elevation: 0,
        centerTitle: false,
      ),
      body: Column(
        children: [
          // Search bar
          _buildSearchBar(),
          
          // Writings list, empty state, or loading spinner
          Expanded(
            child: _isLoading
                ? _buildLoadingState()
                : _writings.isEmpty
                    ? _buildEmptyState()
                    : _buildWritingsList(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createNewWriting,
        backgroundColor: const Color(0xFF4A7C59), // Calming green
        icon: const Icon(Icons.add, size: 32, color: Colors.white),
        label: const Text(
          'Yeni Yazı',  // "New Writing"
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
    );
  }

  Widget _buildLoadingState() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(
            color: Color(0xFF4A7C59),
            strokeWidth: 3,
          ),
          SizedBox(height: 24),
          Text(
            'Yükleniyor...',
            style: TextStyle(
              fontSize: 20,
              color: Colors.grey,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: TextField(
        controller: _searchController,
        style: const TextStyle(fontSize: 18),
        decoration: InputDecoration(
          hintText: 'Ara...',  // "Search..." in Turkish
          hintStyle: TextStyle(
            fontSize: 18,
            color: Colors.grey[400],
          ),
          prefixIcon: Icon(
            Icons.search,
            size: 28,
            color: Colors.grey[600],
          ),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  icon: Icon(
                    Icons.clear,
                    size: 24,
                    color: Colors.grey[600],
                  ),
                  onPressed: _clearSearch,
                )
              : null,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey[300]!),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey[300]!),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF4A7C59), width: 2),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    // Show different message if searching
    if (_searchQuery.isNotEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.search_off,
                size: 100,
                color: Colors.grey[400],
              ),
              const SizedBox(height: 24),
              Text(
                'Sonuç bulunamadı',  // "No results found"
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w500,
                  color: Colors.grey[700],
                ),
              ),
              const SizedBox(height: 12),
              Text(
                '"$_searchQuery" için yazı bulunamadı',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 18,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ),
        ),
      );
    }
    
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.book_outlined,
              size: 120,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 24),
            Text(
              'Defteriniz boş',  // "Your notebook is empty"
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w500,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Yeni bir yazı eklemek için\naşağıdaki düğmeye dokunun',  // "Touch the button below to add a new writing"
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 20,
                color: Colors.grey[600],
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWritingsList() {
    // Show filtered writings
    final displayWritings = _filteredWritings;
    
    if (displayWritings.isEmpty && _searchQuery.isNotEmpty) {
      return _buildEmptyState();
    }
    
    return ListView.builder(
      padding: const EdgeInsets.only(
        left: 16,
        right: 16,
        top: 8,
        bottom: 100, // Space for FAB
      ),
      itemCount: displayWritings.length,
      itemBuilder: (context, index) {
        final metadata = displayWritings[index];
        return WritingCard(
          metadata: metadata,
          onTap: () => _openWriting(metadata.id),
        );
      },
    );
  }
}
