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
import { WritingCard } from '../components/WritingCard';
import { TypeFilterChips } from '../components/TypeFilterChips';
import { SortButtons, type SortType } from '../components/SortButtons';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { WritingMetadata, WritingType } from '../types/writing';

// Card height including margin
const CARD_HEIGHT = 140;

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
    <div style={{ ...style, paddingRight: 16, paddingLeft: 16 }}>
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

  // Use deferred value for search - allows typing to be responsive
  const deferredSearch = useDeferredValue(searchQuery);
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

    // Filter by search query
    if (deferredSearch) {
      const query = deferredSearch.toLowerCase();
      result = result.filter(
        (w) =>
          w.title.toLowerCase().includes(query) ||
          w.preview.toLowerCase().includes(query)
      );
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
        setContainerHeight(viewportHeight - rect.top - 20); // 20px for padding
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

  // Memoize row props to prevent unnecessary VirtualizedRow re-renders
  const rowProps = useMemo(() => ({
    writings: filteredWritings,
    onOpen: handleOpenWriting,
    isAvailableOffline,
    isOnline,
  }), [filteredWritings, handleOpenWriting, isAvailableOffline, isOnline]);

  // Stable key function for react-window - use writing ID instead of index
  const itemKey = useCallback((index: number) => {
    return filteredWritings[index]?.id ?? index;
  }, [filteredWritings]);

  // Loading state - initial load (wait until fully initialized)
  if (!state.isInitialized) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: '#F5F5F0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress sx={{ color: '#4A7C59' }} size={56} />
        <Typography variant="h5" sx={{ mt: 4, color: '#555', fontWeight: 500 }}>
          Yazılarınız yükleniyor...
        </Typography>
        <Typography variant="body1" sx={{ mt: 1, color: '#888' }}>
          Lütfen bekleyin
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F5F5F0', display: 'flex', flexDirection: 'column' }}>
      {/* Sync indicator */}
      {state.isSyncing && (
        <Box sx={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          zIndex: 1100,
          bgcolor: 'rgba(74, 124, 89, 0.1)',
          backdropFilter: 'blur(4px)',
        }}>
          <LinearProgress 
            variant={state.syncProgress > 0 ? 'determinate' : 'indeterminate'} 
            value={state.syncProgress}
            sx={{ 
              height: 3,
              bgcolor: 'transparent',
              '& .MuiLinearProgress-bar': { bgcolor: '#4A7C59' },
            }} 
          />
          <Stack 
            direction="row" 
            alignItems="center" 
            justifyContent="center" 
            spacing={1} 
            sx={{ py: 0.5 }}
          >
            <CloudSyncIcon sx={{ fontSize: 16, color: '#4A7C59' }} />
            <Typography variant="caption" sx={{ color: '#4A7C59', fontWeight: 500 }}>
              Senkronize ediliyor... {state.syncProgress > 0 ? `%${state.syncProgress}` : ''}
            </Typography>
          </Stack>
        </Box>
      )}

      {/* Header */}
      <Box sx={{ 
        bgcolor: '#F5F5F0', 
        borderBottom: '1px solid #e0e0e0', 
        py: 2,
        pt: state.isSyncing ? 6 : 2,
        transition: 'padding-top 0.3s ease',
      }}>
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" spacing={3} flexWrap="wrap" rowGap={1.5}>
            <Typography
              variant="h4"
              component="h1"
              sx={{ fontWeight: 600, color: '#2C2C2C' }}
            >
              Defterim
            </Typography>
            <TypeFilterChips
              selectedType={selectedType}
              onTypeChange={setSelectedType}
              writings={state.writings}
            />
            
            {/* New writing buttons */}
            <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
              <Button
                variant="contained"
                onClick={() => handleCreateWriting('siir')}
                startIcon={<AutoStoriesIcon />}
                sx={{
                  bgcolor: '#7B5EA7',
                  color: 'white',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '20px',
                  px: 2,
                  '&:hover': { bgcolor: '#6b4e97' },
                }}
              >
                Yeni Şiir
              </Button>
              <Button
                variant="contained"
                onClick={() => handleCreateWriting('yazi')}
                startIcon={<EditNoteIcon />}
                sx={{
                  bgcolor: '#4A7C59',
                  color: 'white',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '20px',
                  px: 2,
                  '&:hover': { bgcolor: '#3d6b4a' },
                }}
              >
                Yeni Yazı
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Search and Sort */}
      <Container maxWidth="lg" sx={{ py: 2, flexShrink: 0 }}>
        {/* Search */}
        <TextField
          fullWidth
          placeholder="Ara..."
          value={searchQuery}
          onChange={handleSearchChange}
          size="small"
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-root': {
              bgcolor: 'white',
              borderRadius: '12px',
              '& fieldset': { borderColor: '#ddd' },
              '&:hover fieldset': { borderColor: '#bbb' },
              '&.Mui-focused fieldset': { borderColor: '#4A7C59', borderWidth: 2 },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#666' }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {isSearching && (
                  <CircularProgress size={18} sx={{ color: '#4A7C59', mr: 1 }} />
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
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <SortButtons
            sortType={sortType}
            sortAscending={sortAscending}
            onSortChange={handleSortChange}
          />
          <Chip
            label={
              deferredSearch || deferredType
                ? `${filteredWritings.length}/${state.writings.length}`
                : `${state.writings.length}`
            }
            size="small"
            sx={{
              bgcolor: '#4A7C5915',
              color: '#4A7C59',
              fontWeight: 600,
              border: '1px solid #4A7C5930',
            }}
          />
        </Stack>
      </Container>

      {/* Content */}
      <Box 
        ref={containerRef}
        sx={{ 
          flex: 1, 
          minHeight: 0,
          pb: 2,
        }}
      >
        <Container maxWidth="lg" sx={{ height: '100%', px: 0 }}>
          {/* Empty state - no writings */}
          {state.writings.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <BookOutlinedIcon sx={{ fontSize: 120, color: '#ccc', mb: 3 }} />
              <Typography variant="h5" sx={{ color: '#666', mb: 1.5 }}>
                Defteriniz boş
              </Typography>
              <Typography variant="body1" sx={{ color: '#888', lineHeight: 1.8 }}>
                Yeni bir yazı eklemek için
                <br />
                yukarıdaki düğmelere tıklayın
              </Typography>
            </Box>
          )}

          {/* Empty state - no search results */}
          {state.writings.length > 0 && filteredWritings.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <SearchOffIcon sx={{ fontSize: 100, color: '#ccc', mb: 3 }} />
              <Typography variant="h5" sx={{ color: '#666', mb: 1.5 }}>
                Sonuç bulunamadı
              </Typography>
              <Typography variant="body1" sx={{ color: '#888' }}>
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
              itemKey={itemKey}
              style={{ height: containerHeight, width: '100%' }}
            />
          )}
        </Container>
      </Box>

      {/* Offline indicator - short message for list page */}
      <OfflineIndicator />
    </Box>
  );
}
