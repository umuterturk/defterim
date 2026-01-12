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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import EditNoteIcon from '@mui/icons-material/EditNote';
import BookOutlinedIcon from '@mui/icons-material/BookOutlined';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import CheckIcon from '@mui/icons-material/Check';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useWritings } from '../contexts/WritingsContext';
import { useBook } from '../contexts/BookContext';
import { WritingCard } from '../components/WritingCard';
import { TypeFilterChips } from '../components/TypeFilterChips';
import { SortButtons, type SortType } from '../components/SortButtons';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useDebounce } from '../hooks/useDebounce';
import type { WritingMetadata, WritingType } from '../types/writing';
import { generateBookPdf } from '../components/BookPdfDocument';
import styles from './WritingsListPage.module.css';

// Card height including margin
const CARD_HEIGHT = 150;

// Session storage key for scroll position
const SCROLL_POSITION_KEY = 'writings-list-scroll-position';

// Row props type for virtualized list
interface ListRowProps {
  writings: WritingMetadata[];
  onOpen: (id: string) => void;
  isAvailableOffline: (id: string) => boolean;
  isOnline: boolean;
}

// Memoized virtualized row component - prevents unnecessary re-renders
// eslint-disable-next-line react/display-name
const VirtualizedRow = memo<RowComponentProps<ListRowProps>>(({ index, style, writings, onOpen, isAvailableOffline, isOnline }) => {
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
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if this specific row's data changed
  const prevWriting = prevProps.writings[prevProps.index];
  const nextWriting = nextProps.writings[nextProps.index];
  
  return (
    prevProps.index === nextProps.index &&
    prevProps.onOpen === nextProps.onOpen &&
    prevProps.isOnline === nextProps.isOnline &&
    prevProps.isAvailableOffline === nextProps.isAvailableOffline &&
    prevWriting?.id === nextWriting?.id &&
    prevWriting?.title === nextWriting?.title &&
    prevWriting?.preview === nextWriting?.preview &&
    prevWriting?.updatedAt === nextWriting?.updatedAt &&
    prevWriting?.type === nextWriting?.type
  );
});

export function WritingsListPage() {
  const navigate = useNavigate();
  const { state, createNewWriting, isAvailableOffline } = useWritings();
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
  const [bookTitle, setBookTitle] = useState('');

  // Book menu state
  const [bookMenuAnchor, setBookMenuAnchor] = useState<null | HTMLElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Debounce search query with 300ms delay
  const deferredSearch = useDebounce(searchQuery, 300);
  // Use deferred value for other filters - allows UI to be responsive
  const deferredType = useDeferredValue(selectedType);
  const deferredSortType = useDeferredValue(sortType);
  const deferredSortAscending = useDeferredValue(sortAscending);

  // Check if we're still computing
  const isSearching = searchQuery !== deferredSearch || 
                      selectedType !== deferredType ||
                      sortType !== deferredSortType ||
                      sortAscending !== deferredSortAscending;

  // Pre-sort writings once when data changes
  const sortedWritingsCache = useMemo(() => {
    const cache: Record<string, WritingMetadata[]> = {};
    
    // Pre-compute sorted arrays for each sort type
    const writings = [...state.writings];
    
    // Alphabetic ascending
    const alphaAsc = [...writings].sort((a, b) => {
      const titleA = a.title || 'başlıksız';
      const titleB = b.title || 'başlıksız';
      return titleA.localeCompare(titleB, 'tr');
    });
    cache['alphabetic-asc'] = alphaAsc;
    cache['alphabetic-desc'] = [...alphaAsc].reverse();
    
    // Last updated
    const updatedAsc = [...writings].sort((a, b) => 
      new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );
    cache['lastUpdated-asc'] = updatedAsc;
    cache['lastUpdated-desc'] = [...updatedAsc].reverse();
    
    // Created
    const createdAsc = [...writings].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    cache['created-asc'] = createdAsc;
    cache['created-desc'] = [...createdAsc].reverse();
    
    return cache;
  }, [state.writings]);

  // Filter and get sorted writings using deferred values
  const filteredWritings = useMemo(() => {
    const sortKey = `${deferredSortType}-${deferredSortAscending ? 'asc' : 'desc'}`;
    let result = sortedWritingsCache[sortKey] || state.writings;

    // Filter by type first (fast)
    if (deferredType) {
      result = result.filter((w) => w.type === deferredType);
    }

    // Filter and sort by search query - title matches first, then preview matches
    if (deferredSearch) {
      const query = deferredSearch.toLowerCase();
      const titleMatches: WritingMetadata[] = [];
      const previewOnlyMatches: WritingMetadata[] = [];
      
      for (const w of result) {
        const titleMatch = w.title.toLowerCase().includes(query);
        const previewMatch = w.preview.toLowerCase().includes(query);
        
        if (titleMatch) {
          titleMatches.push(w);
        } else if (previewMatch) {
          previewOnlyMatches.push(w);
        }
      }
      
      result = [...titleMatches, ...previewOnlyMatches];
    }

    return result;
  }, [sortedWritingsCache, deferredSearch, deferredType, deferredSortType, deferredSortAscending, state.writings]);

  // Reset scroll position when filter/sort changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    
    const element = listRef.current?.element;
    if (element) {
      console.log('[ScrollReset] Resetting scroll due to filter/sort change');
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
    
    console.log('[ScrollRestore] Attempting to restore scrollTop:', scrollTop);
    
    // Try to restore with retries (element might not be ready immediately)
    let attempts = 0;
    const maxAttempts = 10;
    
    const tryRestore = () => {
      const element = listRef.current?.element;
      attempts++;
      
      if (element && element.scrollHeight > 0) {
        console.log('[ScrollRestore] Setting scrollTop to:', scrollTop, 'scrollHeight:', element.scrollHeight);
        element.scrollTop = scrollTop;
        hasRestoredScrollRef.current = true;
        // Clear the saved position after restoring
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
      } else if (attempts < maxAttempts) {
        console.log('[ScrollRestore] Element not ready, retry', attempts);
        requestAnimationFrame(tryRestore);
      } else {
        console.log('[ScrollRestore] Max attempts reached, giving up');
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
        setContainerHeight(viewportHeight - rect.top - 5); // 5px gap at bottom
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
      setSortAscending(type === 'alphabetic');
    }
  }, [sortType, sortAscending]);

  const handleCreateWriting = useCallback((type: WritingType) => {
    // Save scroll position before navigating
    const element = listRef.current?.element;
    if (element) {
      console.log('[ScrollSave] Saving scrollTop:', element.scrollTop);
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
      console.log('[ScrollSave] Saving scrollTop:', element.scrollTop);
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
    setBookTitle('');
    setShowBookDialog(true);
  }, []);

  const handleCloseBookDialog = useCallback(() => {
    setShowBookDialog(false);
    setBookTitle('');
  }, []);

  const handleCreateBook = useCallback(async () => {
    if (!bookTitle.trim()) return;
    const book = await createNewBook(bookTitle.trim());
    setShowBookDialog(false);
    setBookTitle('');
    navigate(`/book/${book.id}`);
  }, [bookTitle, createNewBook, navigate]);

  const handleNavigateToBook = useCallback(() => {
    if (bookState.activeBook) {
      navigate(`/book/${bookState.activeBook.id}`);
    }
  }, [bookState.activeBook, navigate]);

  // Book menu handlers
  const handleOpenBookMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setBookMenuAnchor(event.currentTarget);
  }, []);

  const handleCloseBookMenu = useCallback(() => {
    setBookMenuAnchor(null);
  }, []);

  const handleSelectBook = useCallback(async (bookId: string) => {
    await setActiveBook(bookId);
    setBookMenuAnchor(null);
  }, [setActiveBook]);

  const handleCreateNewBookFromMenu = useCallback(() => {
    setBookMenuAnchor(null);
    setBookTitle('');
    setShowBookDialog(true);
  }, []);

  // Get writing metadata for items in active book (for PDF generation)
  const bookWritings = useMemo(() => {
    if (!bookState.activeBook) return [];
    
    return bookState.activeBook.writingIds
      .map((writingId) => state.writings.find((w) => w.id === writingId))
      .filter((w): w is WritingMetadata => w !== undefined);
  }, [bookState.activeBook, state.writings]);

  const handlePrintBook = useCallback(async () => {
    if (!bookState.activeBook) return;
    
    setBookMenuAnchor(null);
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
            sx={{ 
              height: 3,
              bgcolor: 'transparent',
              '& .MuiLinearProgress-bar': { bgcolor: 'var(--color-primary)' },
            }} 
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
            <Stack direction="row" spacing={1} className={styles.headerActions}>
              {/* Book button with dropdown */}
              {bookState.books.length > 0 || bookState.activeBook ? (
                <>
                  <Button
                    variant="outlined"
                    onClick={handleOpenBookMenu}
                    startIcon={<MenuBookIcon />}
                    endIcon={<ArrowDropDownIcon />}
                    className={`${styles.actionButton} ${styles.bookButton} ${bookState.activeBook ? styles.bookButtonActive : ''}`}
                  >
                    {bookState.activeBook ? (
                      <>
                        {bookState.activeBook.title}
                        <Chip
                          label={bookState.activeBook.writingIds.length}
                          size="small"
                          sx={{
                            ml: 1,
                            height: 20,
                            minWidth: 20,
                            bgcolor: 'var(--color-secondary)',
                            color: 'white',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 600,
                          }}
                        />
                      </>
                    ) : (
                      'Kitap Seç'
                    )}
                  </Button>
                  <Menu
                    anchorEl={bookMenuAnchor}
                    open={Boolean(bookMenuAnchor)}
                    onClose={handleCloseBookMenu}
                    PaperProps={{
                      sx: {
                        borderRadius: 'var(--radius-md)',
                        minWidth: 200,
                        mt: 1,
                      },
                    }}
                  >
                    {/* Edit current book option */}
                    {bookState.activeBook && (
                      <MenuItem onClick={handleNavigateToBook}>
                        <ListItemIcon>
                          <MenuBookIcon fontSize="small" sx={{ color: 'var(--color-secondary)' }} />
                        </ListItemIcon>
                        <ListItemText primary="Kitabı Düzenle" />
                      </MenuItem>
                    )}
                    {/* Print current book option */}
                    {bookState.activeBook && (
                      <MenuItem 
                        onClick={handlePrintBook}
                        disabled={isGeneratingPdf || bookWritings.length === 0}
                      >
                        <ListItemIcon>
                          <PictureAsPdfIcon fontSize="small" sx={{ color: 'var(--color-secondary)' }} />
                        </ListItemIcon>
                        <ListItemText primary={isGeneratingPdf ? "PDF Oluşturuluyor..." : "Kitabı Yazdır"} />
                      </MenuItem>
                    )}
                    {bookState.activeBook && bookState.books.length > 0 && <Divider />}
                    
                    {/* List of books */}
                    {bookState.books
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((book) => (
                        <MenuItem
                          key={book.id}
                          onClick={() => handleSelectBook(book.id)}
                          selected={bookState.activeBook?.id === book.id}
                        >
                          <ListItemIcon>
                            {bookState.activeBook?.id === book.id ? (
                              <CheckIcon fontSize="small" sx={{ color: 'var(--color-secondary)' }} />
                            ) : (
                              <Box sx={{ width: 20 }} />
                            )}
                          </ListItemIcon>
                          <ListItemText 
                            primary={book.title} 
                            secondary={`${book.writingCount} yazı`}
                          />
                        </MenuItem>
                      ))}
                    
                    <Divider />
                    
                    {/* Create new book option */}
                    <MenuItem onClick={handleCreateNewBookFromMenu}>
                      <ListItemIcon>
                        <AddIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary="Yeni Kitap Oluştur" />
                    </MenuItem>
                  </Menu>
                </>
              ) : (
                <Button
                  variant="outlined"
                  onClick={handleOpenBookDialog}
                  startIcon={<MenuBookIcon />}
                  className={`${styles.actionButton} ${styles.bookButton}`}
                >
                  <span className={styles.buttonText}>Oluştur</span>
                </Button>
              )}
              <Button
                variant="contained"
                onClick={() => handleCreateWriting('siir')}
                startIcon={<AutoStoriesIcon />}
                className={styles.actionButton}
                sx={{
                  bgcolor: 'var(--color-secondary)',
                  color: 'white',
                  '&:hover': { bgcolor: 'var(--color-secondary-hover)' },
                }}
              >
                <span className={styles.buttonText}>Yeni Şiir</span>
              </Button>
              <Button
                variant="contained"
                onClick={() => handleCreateWriting('yazi')}
                startIcon={<EditNoteIcon />}
                className={styles.actionButton}
                sx={{
                  bgcolor: 'var(--color-primary)',
                  color: 'white',
                  '&:hover': { bgcolor: 'var(--color-primary-hover)' },
                }}
              >
                <span className={styles.buttonText}>Yeni Yazı</span>
              </Button>
            </Stack>
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
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'white',
              borderRadius: 'var(--radius-sm)',
              height: { xs: 36, sm: 40 },
              '& fieldset': { borderColor: 'var(--color-border-light)' },
              '&:hover fieldset': { borderColor: '#bbb' },
              '&.Mui-focused fieldset': { borderColor: 'var(--color-primary)', borderWidth: 2 },
            },
            '& .MuiOutlinedInput-input': {
              py: { xs: 0.75, sm: 1 },
            },
          }}
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
              // Type assertion needed due to memo() changing the component type
              rowComponent={VirtualizedRow as unknown as (props: RowComponentProps<ListRowProps>) => React.ReactElement | null}
              rowProps={rowProps}
              overscanCount={5}
              style={{ height: containerHeight, width: '100%' }}
            />
          )}
        </Container>
      </Box>

      {/* Offline indicator - short message for list page */}
      <OfflineIndicator />

      {/* Create Book Dialog */}
      <Dialog
        open={showBookDialog}
        onClose={handleCloseBookDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 'var(--radius-lg)' } }}
      >
        <DialogTitle className={styles.dialogTitle}>
          Yeni Kitap Oluştur
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Kitap Adı"
            placeholder="Kitabınıza bir isim verin..."
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && bookTitle.trim()) {
                handleCreateBook();
              }
            }}
            sx={{ mt: 1 }}
          />
          <Typography className={styles.dialogDescription}>
            Kitap oluşturduktan sonra yazılarınızı kitaba ekleyebilir, sıralayabilir ve PDF olarak indirebilirsiniz.
          </Typography>
        </DialogContent>
        <DialogActions className={styles.dialogActions}>
          <Button onClick={handleCloseBookDialog} className={styles.dialogButton}>
            İptal
          </Button>
          <Button
            onClick={handleCreateBook}
            variant="contained"
            disabled={!bookTitle.trim()}
            className={styles.dialogButton}
            sx={{
              bgcolor: 'var(--color-secondary)',
              fontWeight: 600,
              '&:hover': { bgcolor: 'var(--color-secondary-hover)' },
            }}
          >
            Oluştur
          </Button>
        </DialogActions>
      </Dialog>

      {/* PDF Generation Notification Dialog */}
      <Dialog
        open={isGeneratingPdf}
        PaperProps={{
          sx: {
            borderRadius: 'var(--radius-xl)',
            p: 4,
            textAlign: 'center',
            minWidth: 320,
            bgcolor: 'white',
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <CircularProgress 
            size={64} 
            thickness={4}
            sx={{ color: 'var(--color-secondary)' }} 
          />
          <Typography 
            variant="h5" 
            sx={{ 
              fontWeight: 700, 
              color: 'var(--color-text)',
              fontSize: '1.5rem',
            }}
          >
            Kitabınız Basılıyor
          </Typography>
          <Typography 
            sx={{ 
              color: 'var(--color-text-secondary)',
              fontSize: '1rem',
            }}
          >
            Lütfen bekleyin...
          </Typography>
        </Box>
      </Dialog>
    </Box>
  );
}
