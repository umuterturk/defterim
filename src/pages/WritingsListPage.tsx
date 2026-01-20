import React, { useState, useMemo, useCallback, useDeferredValue, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, useListRef, type RowComponentProps } from 'react-window';
import {
  Box,
  Container,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Stack,
  CircularProgress,
  Chip,
  LinearProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import EditNoteIcon from '@mui/icons-material/EditNote';
import BookOutlinedIcon from '@mui/icons-material/BookOutlined';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import { useWritings } from '../contexts/WritingsContext';
import { usePrefetchVisibleWritings } from '../hooks/usePrefetchVisibleWritings';
import { useBook } from '../contexts/BookContext';
import { WritingCard } from '../components/WritingCard';
import { TypeFilterChips } from '../components/TypeFilterChips';
import { SortButtons, type SortType } from '../components/SortButtons';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { BookMenuDropdown } from '../components/BookMenuDropdown';
import { CreateBookDialog } from '../components/CreateBookDialog';
import { PdfGeneratingDialog } from '../components/PdfGeneratingDialog';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useDebounce } from '../hooks/useDebounce';
import type { WritingMetadata, WritingType } from '../types/writing';
import { generateBookPdf } from '../components/BookPdfDocument';
import styles from './WritingsListPage.module.css';

// Configuration constants
const CARD_HEIGHT = 150;
const SCROLL_POSITION_KEY = 'writings-list-scroll-position';
const SEARCH_DEBOUNCE_MS = 300;
const SCROLL_RESTORE_MAX_ATTEMPTS = 10;
const VIRTUALIZED_OVERSCAN_COUNT = 5;
const CONTAINER_BOTTOM_GAP_PX = 5;

// Static MUI sx objects - hoisted to prevent recreation on every render
const LINEAR_PROGRESS_SX = {
  height: 3,
  bgcolor: 'transparent',
  '& .MuiLinearProgress-bar': { bgcolor: 'var(--color-primary)' },
} as const;

const SIIR_BUTTON_SX = {
  bgcolor: 'var(--color-secondary)',
  color: 'white',
  '&:hover': { bgcolor: 'var(--color-secondary-hover)' },
} as const;

const YAZI_BUTTON_SX = {
  bgcolor: 'var(--color-primary)',
  color: 'white',
  '&:hover': { bgcolor: 'var(--color-primary-hover)' },
} as const;

// Row props type for virtualized list
interface ListRowProps {
  writings: WritingMetadata[];
  onOpen: (id: string) => void;
  isAvailableOffline: (id: string) => boolean;
  isOnline: boolean;
}

// Type expected by react-window List component
type RowComponent<T extends object> = (props: RowComponentProps<T>) => React.ReactElement | null;

// Memoized virtualized row component - prevents unnecessary re-renders
const VirtualizedRow: RowComponent<ListRowProps> = memo(function VirtualizedRow({ 
  index, 
  style, 
  writings, 
  onOpen, 
  isAvailableOffline, 
  isOnline 
}: RowComponentProps<ListRowProps>) {
  const writing = writings[index];
  
  // Memoize the tap handler to prevent WritingCard re-renders
  const handleTap = useCallback(() => {
    onOpen(writing.id);
  }, [onOpen, writing.id]);

  const availableOffline = isAvailableOffline(writing.id);
  
  return (
    <div style={style} className={styles.listRow}>
      <WritingCard
        metadata={writing}
        onTap={handleTap}
        isAvailableOffline={availableOffline}
        isOnline={isOnline}
      />
    </div>
  );
}, (prev, next) => 
  // Simplified comparison - writings array is already memoized, so reference check is sufficient
  prev.writings === next.writings && 
  prev.index === next.index &&
  prev.isOnline === next.isOnline
) as RowComponent<ListRowProps>;

export function WritingsListPage() {
  const navigate = useNavigate();
  const { state, createNewWriting, isAvailableOffline, markAsOfflineAvailable, searchBodyContains, indexBodyForSearch } = useWritings();
  const { state: bookState, createNewBook, setActiveBook } = useBook();
  const isOnline = useOnlineStatus();
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(500);
  const hasRestoredScrollRef = useRef(false);
  const isInitialMountRef = useRef(true);

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<WritingType | null>(null);
  const [sortType, setSortType] = useState<SortType>('created');
  const [sortAscending, setSortAscending] = useState(false);

  // Book creation dialog state
  const [showBookDialog, setShowBookDialog] = useState(false);

  // PDF generation state
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Debounce search query
  const deferredSearch = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);
  // Use deferred value for other filters - allows UI to be responsive
  const deferredType = useDeferredValue(selectedType);
  const deferredSortType = useDeferredValue(sortType);
  const deferredSortAscending = useDeferredValue(sortAscending);

  // Check if we're still computing
  const isSearching = searchQuery !== deferredSearch || 
                      selectedType !== deferredType ||
                      sortType !== deferredSortType ||
                      sortAscending !== deferredSortAscending;

  // Lazy sort - only compute the active sort type (instead of pre-computing all 6)
  const sortedWritings = useMemo(() => {
    const writings = [...state.writings];
    
    const compareFns: Record<SortType, (a: WritingMetadata, b: WritingMetadata) => number> = {
      alphabetic: (a, b) => (a.title || 'başlıksız').localeCompare(b.title || 'başlıksız', 'tr'),
      lastUpdated: (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      created: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      stars: (a, b) => (a.stars ?? 0) - (b.stars ?? 0),
    };
    
    writings.sort(compareFns[deferredSortType]);
    return deferredSortAscending ? writings : writings.reverse();
  }, [state.writings, deferredSortType, deferredSortAscending]);

  // Filter writings using deferred values
  const filteredWritings = useMemo(() => {
    let result = sortedWritings;

    // Filter by type first (fast)
    if (deferredType) {
      result = result.filter((w) => w.type === deferredType);
    }

    // Filter and sort by search query - title matches first, then preview, then full body
    if (deferredSearch) {
      const query = deferredSearch.toLowerCase();
      const titleMatches: WritingMetadata[] = [];
      const previewOnlyMatches: WritingMetadata[] = [];
      const bodyOnlyMatches: WritingMetadata[] = [];
      
      for (const w of result) {
        const titleMatch = w.title.toLowerCase().includes(query);
        const previewMatch = w.preview.toLowerCase().includes(query);
        
        if (titleMatch) {
          titleMatches.push(w);
        } else if (previewMatch) {
          previewOnlyMatches.push(w);
        } else if (searchBodyContains(w.id, query)) {
          // Search in full body content (if downloaded)
          bodyOnlyMatches.push(w);
        }
      }
      
      result = [...titleMatches, ...previewOnlyMatches, ...bodyOnlyMatches];
    }

    return result;
  }, [sortedWritings, deferredSearch, deferredType, searchBodyContains]);

  // Reset scroll position when filter/sort changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    
    const element = listRef.current?.element;
    if (element) {
      element.scrollTop = 0;
      sessionStorage.removeItem(SCROLL_POSITION_KEY);
    }
  }, [deferredSearch, deferredType, deferredSortType, deferredSortAscending, listRef]);

  // Restore scroll position on mount (when coming back from editor)
  useEffect(() => {
    if (hasRestoredScrollRef.current) return;
    
    const savedScrollTop = sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (!savedScrollTop) return;
    
    const scrollTop = parseInt(savedScrollTop, 10);
    if (scrollTop === 0) return; // No need to restore if at top
    
    // Try to restore with retries (element might not be ready immediately)
    let attempts = 0;
    
    const tryRestore = () => {
      const element = listRef.current?.element;
      attempts++;
      
      if (element && element.scrollHeight > 0) {
        element.scrollTop = scrollTop;
        hasRestoredScrollRef.current = true;
        // Clear the saved position after restoring
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
      } else if (attempts < SCROLL_RESTORE_MAX_ATTEMPTS) {
        requestAnimationFrame(tryRestore);
      }
    };
    
    requestAnimationFrame(tryRestore);
  }, [listRef, filteredWritings.length]); // Also depend on filteredWritings to ensure list is ready

  // Measure container height
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        setContainerHeight(viewportHeight - rect.top - CONTAINER_BOTTOM_GAP_PX);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [state.isSyncing]);

  // Handlers
  const handleSortChange = useCallback((type: SortType) => {
    if (sortType === type) {
      setSortAscending(!sortAscending);
    } else {
      setSortType(type);
      // Alphabetic: A-Z first (ascending), Stars: highest first (descending), Dates: newest first (descending)
      setSortAscending(type === 'alphabetic');
    }
  }, [sortType, sortAscending]);

  const handleCreateWriting = useCallback((type: WritingType) => {
    // Save scroll position before navigating
    const element = listRef.current?.element;
    if (element) {
      sessionStorage.setItem(SCROLL_POSITION_KEY, String(element.scrollTop));
    }
    setSearchQuery('');
    // createNewWriting is now synchronous - returns immediately
    const writing = createNewWriting(type);
    navigate(`/editor/${writing.id}`);
  }, [createNewWriting, navigate, listRef]);

  const handleOpenWriting = useCallback((id: string) => {
    // Save scroll position before navigating
    const element = listRef.current?.element;
    if (element) {
      sessionStorage.setItem(SCROLL_POSITION_KEY, String(element.scrollTop));
    }
    setSearchQuery('');
    navigate(`/editor/${id}`);
  }, [navigate, listRef]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Book handlers
  const handleOpenBookDialog = useCallback(() => {
    setShowBookDialog(true);
  }, []);

  const handleCloseBookDialog = useCallback(() => {
    setShowBookDialog(false);
  }, []);

  const handleCreateBookFromDialog = useCallback(async (title: string) => {
    const book = await createNewBook(title);
    setShowBookDialog(false);
    navigate(`/book/${book.id}`);
  }, [createNewBook, navigate]);

  const handleNavigateToBook = useCallback(() => {
    if (bookState.activeBook) {
      navigate(`/book/${bookState.activeBook.id}`);
    }
  }, [bookState.activeBook, navigate]);

  const handleSelectBook = useCallback(async (bookId: string) => {
    await setActiveBook(bookId);
  }, [setActiveBook]);

  // Get writing metadata for items in active book (for PDF generation)
  const bookWritings = useMemo(() => {
    if (!bookState.activeBook) return [];
    
    return bookState.activeBook.writingIds
      .map((writingId) => state.writings.find((w) => w.id === writingId))
      .filter((w): w is WritingMetadata => w !== undefined);
  }, [bookState.activeBook, state.writings]);

  const handlePrintBook = useCallback(async () => {
    if (!bookState.activeBook) return;
    
    setIsGeneratingPdf(true);
    try {
      await generateBookPdf(
        bookState.activeBook,
        bookWritings,
        state.writings,
        'Mustafa Ertürk' // Author name - will be connected to user in the future
      );
    } catch (error) {
      console.error('Error generating PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'PDF oluşturulurken bir hata oluştu.';
      alert(errorMessage);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [bookState.activeBook, bookWritings, state.writings]);

  // Memoize row props to prevent unnecessary VirtualizedRow re-renders
  const rowProps = useMemo(() => ({
    writings: filteredWritings,
    onOpen: handleOpenWriting,
    isAvailableOffline,
    isOnline,
  }), [filteredWritings, handleOpenWriting, isAvailableOffline, isOnline]);

  // Extract writing IDs for prefetch hook
  const writingIds = useMemo(() => 
    filteredWritings.map(w => w.id), 
    [filteredWritings]
  );

  // Prefetch visible writings in background for offline availability and search
  const prefetchCallbacks = useMemo(() => ({
    onPrefetched: markAsOfflineAvailable,
    onBodyIndexed: indexBodyForSearch,
  }), [markAsOfflineAvailable, indexBodyForSearch]);

  // Hook into scroll events to prefetch visible writings
  usePrefetchVisibleWritings(
    listRef,
    writingIds,
    state.offlineAvailableIds,
    isOnline,
    CARD_HEIGHT,
    prefetchCallbacks
  );

  // Loading state - initial load (wait until fully initialized)
  if (!state.isInitialized) {
    return (
      <Box className={styles.loadingContainer}>
        <CircularProgress sx={{ color: 'var(--color-primary)' }} size={56} />
        <Typography className={styles.loadingTitle}>
          Yazılarınız yükleniyor...
        </Typography>
        <Typography className={styles.loadingSubtitle}>
          Lütfen bekleyin
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={styles.pageContainer}>
      {/* Sync indicator */}
      {state.isSyncing && (
        <Box className={styles.syncIndicator}>
          <LinearProgress 
            variant={state.syncProgress > 0 ? 'determinate' : 'indeterminate'} 
            value={state.syncProgress}
            sx={LINEAR_PROGRESS_SX} 
          />
          <Stack 
            direction="row" 
            alignItems="center" 
            justifyContent="center" 
            spacing={1} 
            sx={{ py: 0.5 }}
          >
            <CloudSyncIcon sx={{ fontSize: 16, color: 'var(--color-primary)' }} />
            <Typography className={styles.syncText}>
              Senkronize ediliyor... {state.syncProgress > 0 ? `%${state.syncProgress}` : ''}
            </Typography>
          </Stack>
        </Box>
      )}

      {/* Header */}
      <Box className={`${styles.header} ${state.isSyncing ? styles.headerSyncing : ''}`}>
        <Container maxWidth="lg">
          <Box className={styles.headerContent}>
            <Typography
              component="h1"
              className={styles.pageTitle}
            >
              Defterim
            </Typography>
            
            <Box className={styles.filterChipsWrapper}>
              <TypeFilterChips
                selectedType={selectedType}
                onTypeChange={setSelectedType}
                writings={state.writings}
              />
            </Box>
            
            {/* Book and new writing buttons */}
            <Box className={styles.headerActions}>
              {/* Book button with dropdown */}
              <Box className={styles.bookButtonWrapper}>
                <BookMenuDropdown
                  books={bookState.books}
                  activeBook={bookState.activeBook}
                  isGeneratingPdf={isGeneratingPdf}
                  bookWritingsCount={bookWritings.length}
                  onNavigateToBook={handleNavigateToBook}
                  onSelectBook={handleSelectBook}
                  onCreateNew={handleOpenBookDialog}
                  onPrintBook={handlePrintBook}
                />
              </Box>
              
              {/* New writing buttons */}
              <Stack direction="row" spacing={1} className={styles.newWritingButtons}>
                <Button
                  variant="contained"
                  onClick={() => handleCreateWriting('siir')}
                  startIcon={<AutoStoriesIcon />}
                  className={styles.actionButton}
                  sx={SIIR_BUTTON_SX}
                >
                  <span className={styles.buttonText}>Şiir Yaz</span>
                </Button>
                <Button
                  variant="contained"
                  onClick={() => handleCreateWriting('yazi')}
                  startIcon={<EditNoteIcon />}
                  className={styles.actionButton}
                  sx={YAZI_BUTTON_SX}
                >
                  <span className={styles.buttonText}>Yazı Yaz</span>
                </Button>
              </Stack>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Search and Sort */}
      <Container maxWidth="lg" className={styles.searchSortContainer}>
        {/* Search */}
        <TextField
          fullWidth
          placeholder="Ara..."
          value={searchQuery}
          onChange={handleSearchChange}
          size="small"
          className={styles.searchField}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'var(--color-text-secondary)' }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {isSearching && (
                  <CircularProgress size={18} sx={{ color: 'var(--color-primary)', mr: 1 }} />
                )}
                {searchQuery && (
                  <IconButton size="small" onClick={handleClearSearch}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
              </InputAdornment>
            ),
          }}
        />

        {/* Sort and count */}
        <Box className={styles.sortRow}>
          <Box className={styles.sortButtonsWrapper}>
            <SortButtons
              sortType={sortType}
              sortAscending={sortAscending}
              onSortChange={handleSortChange}
            />
          </Box>
          <Chip
            label={
              deferredSearch || deferredType
                ? `${filteredWritings.length}/${state.writings.length}`
                : `${state.writings.length}`
            }
            size="small"
            className={styles.countChip}
          />
        </Box>
      </Container>

      {/* Content */}
      <Box 
        ref={containerRef}
        className={styles.contentArea}
      >
        <Container maxWidth="lg" disableGutters className={styles.contentContainer}>
          {/* Empty state - no writings */}
          {state.writings.length === 0 && (
            <Box className={styles.emptyState}>
              <BookOutlinedIcon className={styles.emptyIcon} />
              <Typography className={styles.emptyTitle}>
                Defteriniz boş
              </Typography>
              <Typography className={styles.emptyText}>
                Yeni bir yazı eklemek için
                <br />
                yukarıdaki düğmelere tıklayın
              </Typography>
            </Box>
          )}

          {/* Empty state - no search results */}
          {state.writings.length > 0 && filteredWritings.length === 0 && (
            <Box className={styles.emptyState}>
              <SearchOffIcon className={styles.emptyIcon} />
              <Typography className={styles.emptyTitle}>
                Sonuç bulunamadı
              </Typography>
              <Typography className={styles.emptyText}>
                "{deferredSearch}" için yazı bulunamadı
              </Typography>
            </Box>
          )}

          {/* Virtualized writings list */}
          {filteredWritings.length > 0 && (
            <List
              listRef={listRef}
              rowCount={filteredWritings.length}
              rowHeight={CARD_HEIGHT}
              rowComponent={VirtualizedRow}
              rowProps={rowProps}
              overscanCount={VIRTUALIZED_OVERSCAN_COUNT}
              style={{ height: containerHeight, width: '100%' }}
            />
          )}
        </Container>
      </Box>

      {/* Offline indicator - short message for list page */}
      <OfflineIndicator />

      {/* Create Book Dialog */}
      <CreateBookDialog
        open={showBookDialog}
        onClose={handleCloseBookDialog}
        onCreate={handleCreateBookFromDialog}
      />

      {/* PDF Generation Notification Dialog */}
      <PdfGeneratingDialog open={isGeneratingPdf} />
    </Box>
  );
}
