import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import type {
  Writing,
  WritingMetadata,
  WritingType,
} from '../types/writing';
import {
  createWriting,
  isDeleted,
  isValidForSave,
  metadataFromWriting,
} from '../types/writing';
import { localStorageService } from '../services/localStorageService';
import { firebaseSyncService } from '../services/firebaseSyncService';

// State type
interface WritingsState {
  writings: WritingMetadata[];
  isLoading: boolean;
  isInitialized: boolean;
  isSyncing: boolean;
  syncProgress: number;
  error: string | null;
  offlineAvailableIds: Set<string>;
}

// Action types
type WritingsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_WRITINGS'; payload: WritingMetadata[] }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'SET_SYNCING'; payload: { isSyncing: boolean; progress?: number } }
  | { type: 'ADD_WRITING'; payload: WritingMetadata }
  | { type: 'UPDATE_WRITING'; payload: WritingMetadata }
  | { type: 'REMOVE_WRITING'; payload: string }
  | { type: 'SET_OFFLINE_AVAILABLE'; payload: Set<string> }
  | { type: 'ADD_OFFLINE_AVAILABLE'; payload: string };

// Initial state
const initialState: WritingsState = {
  writings: [],
  isLoading: true,
  isInitialized: false,
  isSyncing: false,
  syncProgress: 0,
  error: null,
  offlineAvailableIds: new Set(),
};

// Reducer
function writingsReducer(state: WritingsState, action: WritingsAction): WritingsState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_WRITINGS':
      return { ...state, writings: action.payload, isLoading: false };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
    case 'SET_SYNCING':
      return { 
        ...state, 
        isSyncing: action.payload.isSyncing,
        syncProgress: action.payload.progress ?? state.syncProgress,
      };
    case 'ADD_WRITING':
      return { ...state, writings: [action.payload, ...state.writings] };
    case 'UPDATE_WRITING':
      return {
        ...state,
        writings: state.writings.map((w) =>
          w.id === action.payload.id ? action.payload : w
        ),
      };
    case 'REMOVE_WRITING':
      return {
        ...state,
        writings: state.writings.filter((w) => w.id !== action.payload),
      };
    case 'SET_OFFLINE_AVAILABLE':
      return { ...state, offlineAvailableIds: action.payload };
    case 'ADD_OFFLINE_AVAILABLE':
      return {
        ...state,
        offlineAvailableIds: new Set([...state.offlineAvailableIds, action.payload]),
      };
    default:
      return state;
  }
}

// Context type
interface WritingsContextType {
  state: WritingsState;
  loadWritings: () => Promise<void>;
  createNewWriting: (type: WritingType) => Writing;
  getFullWriting: (id: string) => Promise<Writing | null>;
  saveWriting: (writing: Writing) => Promise<void>;
  deleteWriting: (id: string) => Promise<void>;
  refreshFromStorage: () => Promise<void>;
  isPendingWriting: (id: string) => boolean;
  discardPendingWriting: (id: string) => void;
  isAvailableOffline: (id: string) => boolean;
  markAsOfflineAvailable: (id: string) => void;
  /** Check if the cached body content contains the search query */
  searchBodyContains: (id: string, query: string) => boolean;
  /** Index body content for search (called when prefetching) */
  indexBodyForSearch: (id: string, body: string) => void;
}

// Context
const WritingsContext = createContext<WritingsContextType | undefined>(undefined);

// Provider component
export function WritingsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(writingsReducer, initialState);
  const writingsCache = useRef<Map<string, Writing>>(new Map());
  // Track writings that are created but not yet saved to storage
  const pendingWritings = useRef<Set<string>>(new Set());
  // Index of body content for full-text search (id -> lowercase body)
  const bodySearchIndex = useRef<Map<string, string>>(new Map());

  // Initialize services
  useEffect(() => {
    const initialize = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });

        // Initialize local storage
        await localStorageService.initialize();

        // Load writings from local storage first (fast)
        const writings = await localStorageService.getAllWritingsMetadata();
        dispatch({ type: 'SET_WRITINGS', payload: writings });

        // Load which writings have body cached locally
        const offlineIds = await localStorageService.getLocallyAvailableIds();
        dispatch({ type: 'SET_OFFLINE_AVAILABLE', payload: offlineIds });

        dispatch({ type: 'SET_INITIALIZED', payload: true });

        // Then initialize Firebase sync (background)
        await firebaseSyncService.initialize();
      } catch (error) {
        console.error('Error initializing:', error);
        dispatch({
          type: 'SET_ERROR',
          payload: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    initialize();

    // Listen for sync changes
    const unsubscribeSync = firebaseSyncService.onSyncChanged(async () => {
      const writings = await localStorageService.getAllWritingsMetadata();
      dispatch({ type: 'SET_WRITINGS', payload: writings });
    });

    // Listen for loading state changes
    const unsubscribeLoading = firebaseSyncService.onLoadingChanged((isSyncing, progress) => {
      dispatch({ type: 'SET_SYNCING', payload: { isSyncing, progress } });
    });

    return () => {
      unsubscribeSync();
      unsubscribeLoading();
      firebaseSyncService.dispose();
    };
  }, []);

  // Load writings
  const loadWritings = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const writings = await localStorageService.getAllWritingsMetadata();
      dispatch({ type: 'SET_WRITINGS', payload: writings });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to load writings',
      });
    }
  }, []);

  // Refresh from storage without showing loading state
  const refreshFromStorage = useCallback(async () => {
    try {
      const writings = await localStorageService.getAllWritingsMetadata();
      dispatch({ type: 'SET_WRITINGS', payload: writings });
    } catch (error) {
      console.error('Error refreshing from storage:', error);
    }
  }, []);

  // Create a new writing - SYNCHRONOUS, but doesn't persist until valid
  // A writing needs both title AND body to be saved
  const createNewWriting = useCallback((type: WritingType): Writing => {
    const writing = createWriting({ type });
    
    // Cache the full writing (for editor to find)
    writingsCache.current.set(writing.id, writing);
    
    // Mark as pending (not yet saved to storage)
    pendingWritings.current.add(writing.id);

    // Don't save to storage or add to state until writing has content
    // The writing will be persisted when saveWriting is called with valid content

    return writing;
  }, []);

  // Get full writing (with body)
  const getFullWriting = useCallback(async (id: string): Promise<Writing | null> => {
    // Check cache first
    const cached = writingsCache.current.get(id);
    if (cached) {
      return cached;
    }

    // Try local first
    let writing = await localStorageService.getFullWriting(id);

    // If not found locally, try to fetch from Firebase
    if (!writing) {
      const metadata = await localStorageService.getWritingMetadata(id);
      if (metadata) {
        writing = await firebaseSyncService.fetchWritingBody(id);
      }
    }

    // Cache it and mark as offline available
    if (writing) {
      writingsCache.current.set(id, writing);
      // Index body for search
      bodySearchIndex.current.set(id, writing.body.toLowerCase());
      // Mark this writing as available offline (body is now cached)
      dispatch({ type: 'ADD_OFFLINE_AVAILABLE', payload: id });
    }

    return writing;
  }, []);

  // Save writing - only persists if valid (has title AND body)
  const saveWriting = useCallback(async (writing: Writing) => {
    const isPending = pendingWritings.current.has(writing.id);
    const isValid = isValidForSave(writing);

    // If writing is pending (never saved) and not valid, don't save
    if (isPending && !isValid) {
      // Just update the cache, but don't persist
      writingsCache.current.set(writing.id, writing);
      return;
    }

    // Mark as unsynced
    const updatedWriting: Writing = {
      ...writing,
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    // Update cache
    writingsCache.current.set(writing.id, updatedWriting);
    // Update search index with new body content
    bodySearchIndex.current.set(writing.id, updatedWriting.body.toLowerCase());

    await localStorageService.saveWriting(updatedWriting);

    // If this was a pending writing, it's now saved - remove from pending and add to state
    if (isPending) {
      pendingWritings.current.delete(writing.id);
      const metadata = metadataFromWriting(updatedWriting);
      dispatch({ type: 'ADD_WRITING', payload: metadata });
    } else {
      // Update state for existing writings
      const metadata = await localStorageService.getWritingMetadata(writing.id);
      if (metadata) {
        if (isDeleted(metadata)) {
          dispatch({ type: 'REMOVE_WRITING', payload: writing.id });
        } else {
          dispatch({ type: 'UPDATE_WRITING', payload: metadata });
        }
      }
    }

    // Trigger sync in background
    firebaseSyncService.syncUnsyncedToCloud();
  }, []);

  // Delete writing (soft delete)
  const deleteWriting = useCallback(async (id: string) => {
    // If it's a pending writing that was never saved, just discard it
    if (pendingWritings.current.has(id)) {
      pendingWritings.current.delete(id);
      writingsCache.current.delete(id);
      bodySearchIndex.current.delete(id);
      return;
    }

    // Remove from cache and search index
    writingsCache.current.delete(id);
    bodySearchIndex.current.delete(id);
    
    // Optimistic update
    dispatch({ type: 'REMOVE_WRITING', payload: id });

    await localStorageService.deleteWriting(id);

    // Trigger sync in background
    firebaseSyncService.syncUnsyncedToCloud();
  }, []);

  // Check if a writing is pending (not yet saved to storage)
  const isPendingWriting = useCallback((id: string): boolean => {
    return pendingWritings.current.has(id);
  }, []);

  // Discard a pending writing without saving
  const discardPendingWriting = useCallback((id: string): void => {
    pendingWritings.current.delete(id);
    writingsCache.current.delete(id);
  }, []);

  // Check if a writing is available offline (body is cached locally)
  const isAvailableOffline = useCallback((id: string): boolean => {
    // Pending writings are always available (they exist only locally)
    if (pendingWritings.current.has(id)) return true;
    // Check if body is cached
    return state.offlineAvailableIds.has(id);
  }, [state.offlineAvailableIds]);

  // Mark a writing as available offline (called after prefetching)
  const markAsOfflineAvailable = useCallback((id: string): void => {
    dispatch({ type: 'ADD_OFFLINE_AVAILABLE', payload: id });
  }, []);

  // Check if cached body content contains search query
  const searchBodyContains = useCallback((id: string, query: string): boolean => {
    const indexedBody = bodySearchIndex.current.get(id);
    if (!indexedBody) return false;
    return indexedBody.includes(query.toLowerCase());
  }, []);

  // Index body content for search (called when prefetching)
  const indexBodyForSearch = useCallback((id: string, body: string): void => {
    bodySearchIndex.current.set(id, body.toLowerCase());
  }, []);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo<WritingsContextType>(() => ({
    state,
    loadWritings,
    createNewWriting,
    getFullWriting,
    saveWriting,
    deleteWriting,
    refreshFromStorage,
    isPendingWriting,
    discardPendingWriting,
    isAvailableOffline,
    markAsOfflineAvailable,
    searchBodyContains,
    indexBodyForSearch,
  }), [
    state,
    loadWritings,
    createNewWriting,
    getFullWriting,
    saveWriting,
    deleteWriting,
    refreshFromStorage,
    isPendingWriting,
    discardPendingWriting,
    isAvailableOffline,
    markAsOfflineAvailable,
    searchBodyContains,
    indexBodyForSearch,
  ]);

  return (
    <WritingsContext.Provider value={value}>
      {children}
    </WritingsContext.Provider>
  );
}

// Hook
// eslint-disable-next-line react-refresh/only-export-components
export function useWritings(): WritingsContextType {
  const context = useContext(WritingsContext);
  if (context === undefined) {
    throw new Error('useWritings must be used within a WritingsProvider');
  }
  return context;
}
