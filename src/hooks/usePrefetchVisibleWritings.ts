import { useRef, useCallback, useEffect, type RefObject } from 'react';
import { firebaseSyncService } from '../services/firebaseSyncService';
import { localStorageService } from '../services/localStorageService';

// Configuration
const PREFETCH_DEBOUNCE_MS = 500; // Wait after scroll stops before prefetching
const PREFETCH_BATCH_SIZE = 3; // How many writings to prefetch at once
const PREFETCH_BATCH_DELAY_MS = 200; // Delay between batch items to avoid overwhelming

interface PrefetchCallbacks {
  onPrefetched?: (id: string) => void;
  onBodyIndexed?: (id: string, body: string) => void;
}

interface ListImperativeAPI {
  element: HTMLElement | null;
}

/**
 * Hook that prefetches full writing content for visible items in a virtualized list.
 * This makes writings available offline and instant to open when the user scrolls.
 * 
 * @param listRef - Reference to the virtualized list element
 * @param writingIds - Array of writing IDs in the current filtered list
 * @param offlineAvailableIds - Set of IDs that are already cached offline
 * @param isOnline - Whether the app is currently online
 * @param rowHeight - Height of each row in pixels
 * @param callbacks - Optional callbacks for prefetch events
 */
export function usePrefetchVisibleWritings(
  listRef: RefObject<ListImperativeAPI | null>,
  writingIds: string[],
  offlineAvailableIds: Set<string>,
  isOnline: boolean,
  rowHeight: number,
  callbacks?: PrefetchCallbacks
) {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPrefetchingRef = useRef(false);
  const prefetchedIdsRef = useRef<Set<string>>(new Set());

  // Calculate visible range from scroll position
  const getVisibleRange = useCallback((element: HTMLElement): { start: number; end: number } => {
    const scrollTop = element.scrollTop;
    const viewportHeight = element.clientHeight;
    
    const startIndex = Math.floor(scrollTop / rowHeight);
    const endIndex = Math.min(
      Math.ceil((scrollTop + viewportHeight) / rowHeight),
      writingIds.length - 1
    );
    
    return { start: startIndex, end: endIndex };
  }, [rowHeight, writingIds.length]);

  // Track IDs that need prefetching (visible but not cached)
  const getIdsToPrefetch = useCallback((startIndex: number, endIndex: number): string[] => {
    const ids: string[] = [];
    
    for (let i = startIndex; i <= endIndex && i < writingIds.length; i++) {
      const id = writingIds[i];
      // Skip if already cached locally or already prefetched in this session
      if (
        offlineAvailableIds.has(id) || 
        prefetchedIdsRef.current.has(id)
      ) {
        continue;
      }
      ids.push(id);
    }
    
    return ids;
  }, [writingIds, offlineAvailableIds]);

  // Prefetch a batch of writings
  const prefetchBatch = useCallback(async (ids: string[]) => {
    if (!isOnline || ids.length === 0) return;
    
    isPrefetchingRef.current = true;
    
    for (const id of ids) {
      // Check if already cached (might have been cached by user opening it)
      const hasLocal = await localStorageService.hasLocalBody(id);
      if (hasLocal) {
        prefetchedIdsRef.current.add(id);
        continue;
      }

      try {
        // Fetch from Firebase and save locally
        const writing = await firebaseSyncService.fetchWritingBody(id);
        
        if (writing) {
          prefetchedIdsRef.current.add(id);
          callbacks?.onPrefetched?.(id);
          // Index body for full-text search
          callbacks?.onBodyIndexed?.(id, writing.body);
          console.log(`Prefetched: "${writing.title}"`);
        }
        
        // Small delay between fetches to avoid overwhelming
        if (ids.indexOf(id) < ids.length - 1) {
          await new Promise(resolve => setTimeout(resolve, PREFETCH_BATCH_DELAY_MS));
        }
      } catch (error) {
        console.error(`Error prefetching writing ${id}:`, error);
      }
    }
    
    isPrefetchingRef.current = false;
  }, [isOnline, callbacks]);

  // Handle scroll - calculates visible range and triggers prefetch
  const handleScroll = useCallback(() => {
    const element = listRef.current?.element;
    if (!element || !isOnline || isPrefetchingRef.current) return;

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce prefetching - wait until scrolling stops
    debounceTimerRef.current = setTimeout(() => {
      const el = listRef.current?.element;
      if (!el) return;

      const { start, end } = getVisibleRange(el);
      const idsToPrefetch = getIdsToPrefetch(start, end);
      
      if (idsToPrefetch.length > 0) {
        // Only prefetch a limited batch at a time
        const batch = idsToPrefetch.slice(0, PREFETCH_BATCH_SIZE);
        prefetchBatch(batch);
      }
    }, PREFETCH_DEBOUNCE_MS);
  }, [listRef, isOnline, getVisibleRange, getIdsToPrefetch, prefetchBatch]);

  // Attach scroll listener to the list element
  useEffect(() => {
    const element = listRef.current?.element;
    if (!element) return;

    element.addEventListener('scroll', handleScroll, { passive: true });
    
    // Also trigger initial prefetch for visible items on mount
    handleScroll();

    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [listRef, handleScroll]);

  // Reset prefetched set when writings list changes significantly
  useEffect(() => {
    prefetchedIdsRef.current.clear();
  }, [writingIds.length]);
}
