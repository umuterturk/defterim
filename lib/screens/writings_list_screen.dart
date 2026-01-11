import 'dart:async';
import 'package:flutter/material.dart';
import '../models/writing.dart';
import '../models/writing_metadata.dart';
import '../services/local_storage_service.dart';
import '../services/firebase_sync_service.dart';
import '../widgets/writing_card.dart';
import 'editor_screen.dart';

/// Sort options for writings list
enum SortType {
  alphabetic,   // By title (default: A-Z)
  lastUpdated,  // By update date (default: newest first)
  created,      // By creation date (default: newest first)
}

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
  Timer? _debounceTimer;
  
  List<WritingMetadata> _writings = [];
  List<WritingMetadata> _filteredWritings = [];
  String _searchQuery = '';
  bool _isLoading = true;
  
  // Sorting state
  SortType _sortType = SortType.created;  // Default: by creation time
  bool _sortAscending = false;  // Default: descending for dates
  
  // Type filter state: null = show all (Hepsi), otherwise show specific type
  WritingType? _selectedTypeFilter;

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
    _debounceTimer?.cancel();
    _searchController.dispose();
    _syncSubscription?.cancel();
    super.dispose();
  }
  
  void _onSearchChanged() {
    // Debounce search to avoid excessive rebuilds on every keystroke
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      if (mounted) {
        setState(() {
          _searchQuery = _searchController.text;
          _filterWritings();
        });
      }
    });
  }
  
  void _filterWritings() {
    List<WritingMetadata> result;
    
    if (_searchQuery.isEmpty) {
      result = List.from(_writings);
    } else {
      final query = _searchQuery.toLowerCase();
      result = _writings.where((metadata) {
        // Search in title and preview (body preview from metadata)
        final title = metadata.title.toLowerCase();
        final preview = metadata.preview.toLowerCase();
        return title.contains(query) || preview.contains(query);
      }).toList();
    }
    
    // Apply type filter (null = show all)
    if (_selectedTypeFilter != null) {
      result = result.where((metadata) {
        return metadata.type == _selectedTypeFilter;
      }).toList();
    }
    
    // Apply sorting
    result.sort((a, b) {
      int comparison;
      switch (_sortType) {
        case SortType.alphabetic:
          // Turkish-aware comparison using lowercase
          final titleA = a.title.isEmpty ? 'başlıksız' : a.title.toLowerCase();
          final titleB = b.title.isEmpty ? 'başlıksız' : b.title.toLowerCase();
          comparison = titleA.compareTo(titleB);
          break;
        case SortType.lastUpdated:
          comparison = a.updatedAt.compareTo(b.updatedAt);
          break;
        case SortType.created:
          comparison = a.createdAt.compareTo(b.createdAt);
          break;
      }
      return _sortAscending ? comparison : -comparison;
    });
    
    _filteredWritings = result;
  }
  
  void _onSortChanged(SortType type) {
    setState(() {
      if (_sortType == type) {
        // Toggle direction if same sort type tapped
        _sortAscending = !_sortAscending;
      } else {
        // New sort type - set default direction
        _sortType = type;
        _sortAscending = type == SortType.alphabetic; // A-Z for alpha, newest first for dates
      }
      _filterWritings();
    });
  }
  
  void _onTypeFilterChanged(WritingType? type) {
    setState(() {
      _selectedTypeFilter = type;
      _filterWritings();
    });
  }
  
  /// Get count of writings for a specific type (null = all)
  int _getCountForType(WritingType? type) {
    if (type == null) {
      return _writings.length;
    }
    return _writings.where((w) => w.type == type).length;
  }
  
  Widget _buildTypeFilterButton({
    required WritingType? type,  // null = "Hepsi" (show all)
    required String label,
    required IconData icon,
    required Color color,
  }) {
    final isSelected = _selectedTypeFilter == type;
    final count = _getCountForType(type);
    
    return Material(
      color: isSelected ? color.withOpacity(0.15) : Colors.transparent,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: () => _onTypeFilterChanged(type),
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isSelected ? color : Colors.grey[400]!,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 18,
                color: isSelected ? color : Colors.grey[500],
              ),
              const SizedBox(width: 6),
              Text(
                '$label ($count)',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                  color: isSelected ? color : Colors.grey[600],
                ),
              ),
            ],
          ),
        ),
      ),
    );
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

  Future<void> _createNewWriting(WritingType type) async {
    // Clear search before navigating
    _clearSearch();
    
    // Create a new writing with empty title and specified type
    final newWriting = Writing.create(
      title: '',  // Empty title - placeholder will show in editor
      type: type,
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
        title: Row(
          children: [
            const Text(
              'Defterim',  // "My Notebook" in Turkish
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w600,
                color: Color(0xFF2C2C2C),
              ),
            ),
            const SizedBox(width: 20),
            // Type filter buttons (radio-style: only one selected at a time)
            _buildTypeFilterButton(
              type: null,  // null = show all
              label: 'Hepsi',
              icon: Icons.library_books,
              color: const Color(0xFF5A6A7A), // Neutral gray-blue for all
            ),
            const SizedBox(width: 8),
            _buildTypeFilterButton(
              type: WritingType.siir,
              label: 'Şiirler',
              icon: Icons.auto_stories,
              color: const Color(0xFF7B5EA7), // Purple for poems
            ),
            const SizedBox(width: 8),
            _buildTypeFilterButton(
              type: WritingType.yazi,
              label: 'Yazılar',
              icon: Icons.article,
              color: const Color(0xFF4A7C59), // Green for prose
            ),
          ],
        ),
        backgroundColor: const Color(0xFFF5F5F0),
        elevation: 0,
        centerTitle: false,
      ),
      body: Column(
        children: [
          // Search bar and sort options
          _buildSearchAndSortBar(),
          
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
      floatingActionButton: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Yeni Şiir button
            FloatingActionButton.extended(
              heroTag: 'newPoem',
              onPressed: () => _createNewWriting(WritingType.siir),
              backgroundColor: const Color(0xFF7C59A4), // Purple for poems
              icon: const Icon(Icons.auto_stories, size: 28, color: Colors.white),
              label: const Text(
                'Yeni Şiir',  // "New Poem"
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 16),
            // Yeni Yazı button
            FloatingActionButton.extended(
              heroTag: 'newWriting',
              onPressed: () => _createNewWriting(WritingType.yazi),
              backgroundColor: const Color(0xFF4A7C59), // Calming green for prose
              icon: const Icon(Icons.edit_note, size: 28, color: Colors.white),
              label: const Text(
                'Yeni Yazı',  // "New Writing/Prose"
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          ],
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

  Widget _buildSearchAndSortBar() {
    return Column(
      children: [
        // Search bar
        Container(
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
        ),
        
        // Sort buttons row with count
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(
            children: [
              Text(
                'Sırala:',  // "Sort:" in Turkish
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildSortButton(
                        label: 'Başlık',  // "Title"
                        type: SortType.alphabetic,
                        icon: Icons.sort_by_alpha,
                      ),
                      const SizedBox(width: 8),
                      _buildSortButton(
                        label: 'Güncelleme',  // "Update"
                        type: SortType.lastUpdated,
                        icon: Icons.update,
                      ),
                      const SizedBox(width: 8),
                      _buildSortButton(
                        label: 'Oluşturma',  // "Creation"
                        type: SortType.created,
                        icon: Icons.calendar_today,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Writings count badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF4A7C59).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: const Color(0xFF4A7C59).withOpacity(0.3),
                  ),
                ),
                child: Text(
                  _searchQuery.isNotEmpty
                      ? '${_filteredWritings.length}/${_writings.length}'
                      : '${_writings.length}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF4A7C59),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
  
  Widget _buildSortButton({
    required String label,
    required SortType type,
    required IconData icon,
  }) {
    final isSelected = _sortType == type;
    final Color bgColor = isSelected ? const Color(0xFF4A7C59) : Colors.white;
    final Color textColor = isSelected ? Colors.white : Colors.grey[700]!;
    
    // Determine arrow direction
    IconData? arrowIcon;
    if (isSelected) {
      if (type == SortType.alphabetic) {
        arrowIcon = _sortAscending ? Icons.arrow_upward : Icons.arrow_downward;
      } else {
        // For dates: ascending = oldest first, descending = newest first
        arrowIcon = _sortAscending ? Icons.arrow_upward : Icons.arrow_downward;
      }
    }
    
    return Material(
      color: bgColor,
      borderRadius: BorderRadius.circular(20),
      elevation: isSelected ? 2 : 0,
      child: InkWell(
        onTap: () => _onSortChanged(type),
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isSelected ? const Color(0xFF4A7C59) : Colors.grey[300]!,
              width: 1.5,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 20, color: textColor),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                  color: textColor,
                ),
              ),
              if (arrowIcon != null) ...[
                const SizedBox(width: 4),
                Icon(arrowIcon, size: 18, color: textColor),
              ],
            ],
          ),
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
          key: ValueKey(metadata.id), // Helps Flutter efficiently diff list items
          metadata: metadata,
          onTap: () => _openWriting(metadata.id),
        );
      },
    );
  }
}
