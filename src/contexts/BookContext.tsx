import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { Book, BookMetadata } from '../types/book';
import { createBook, metadataFromBook, isBookDeleted } from '../types/book';
import { localStorageService } from '../services/localStorageService';
import { firebaseSyncService } from '../services/firebaseSyncService';

// State type
interface BookState {
  books: BookMetadata[];
  activeBook: Book | null;
  isLoading: boolean;
  isInitialized: boolean;
}

// Action types
type BookAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_BOOKS'; payload: BookMetadata[] }
  | { type: 'SET_ACTIVE_BOOK'; payload: Book | null }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'ADD_BOOK'; payload: BookMetadata }
  | { type: 'UPDATE_BOOK'; payload: BookMetadata }
  | { type: 'REMOVE_BOOK'; payload: string };

// Initial state
const initialState: BookState = {
  books: [],
  activeBook: null,
  isLoading: true,
  isInitialized: false,
};

// Reducer
function bookReducer(state: BookState, action: BookAction): BookState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_BOOKS':
      return { ...state, books: action.payload, isLoading: false };
    case 'SET_ACTIVE_BOOK':
      return { ...state, activeBook: action.payload };
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
    case 'ADD_BOOK':
      return { ...state, books: [action.payload, ...state.books] };
    case 'UPDATE_BOOK':
      return {
        ...state,
        books: state.books.map((b) =>
          b.id === action.payload.id ? action.payload : b
        ),
      };
    case 'REMOVE_BOOK':
      return {
        ...state,
        books: state.books.filter((b) => b.id !== action.payload),
        activeBook: state.activeBook?.id === action.payload ? null : state.activeBook,
      };
    default:
      return state;
  }
}

// Context type
interface BookContextType {
  state: BookState;
  createNewBook: (title: string) => Promise<Book>;
  setActiveBook: (bookId: string | null) => Promise<void>;
  addWritingToBook: (writingId: string) => Promise<void>;
  removeWritingFromBook: (writingId: string) => Promise<void>;
  reorderWritings: (writingIds: string[]) => Promise<void>;
  updateBookTitle: (title: string) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  isWritingInActiveBook: (writingId: string) => boolean;
  getBook: (bookId: string) => Promise<Book | null>;
}

// Context
const BookContext = createContext<BookContextType | undefined>(undefined);

// Local storage key for active book ID
const ACTIVE_BOOK_ID_KEY = 'defterim-active-book-id';

// Provider component
export function BookProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(bookReducer, initialState);

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });

        // Ensure local storage service is initialized before loading books
        // This is important because BookContext may run its effect before WritingsContext finishes
        await localStorageService.initialize();

        // Load books from local storage
        const books = await localStorageService.getAllBooksMetadata();
        dispatch({ type: 'SET_BOOKS', payload: books });

        // Get active books (non-deleted)
        const activeBooks = books.filter((b) => !isBookDeleted(b));
        console.log(`BookContext: Found ${activeBooks.length} active books`);
        
        if (activeBooks.length > 0) {
          // Try to restore saved active book ID from localStorage
          const savedActiveBookId = localStorage.getItem(ACTIVE_BOOK_ID_KEY);
          console.log(`BookContext: Saved active book ID: ${savedActiveBookId}`);
          
          let bookToActivate: string | null = null;
          
          if (savedActiveBookId && activeBooks.some(b => b.id === savedActiveBookId)) {
            // Saved book still exists, use it
            bookToActivate = savedActiveBookId;
            console.log(`BookContext: Using saved book ID: ${savedActiveBookId}`);
          } else {
            // No saved book or it was deleted, use the latest created one
            const sortedBooks = [...activeBooks].sort((a, b) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            bookToActivate = sortedBooks[0].id;
            console.log(`BookContext: No saved book, selecting latest: ${sortedBooks[0].title}`);
          }
          
          if (bookToActivate) {
            const book = await localStorageService.getBook(bookToActivate);
            if (book) {
              dispatch({ type: 'SET_ACTIVE_BOOK', payload: book });
              localStorage.setItem(ACTIVE_BOOK_ID_KEY, book.id);
              console.log(`BookContext: Activated book "${book.title}"`);
            }
          }
        }

        dispatch({ type: 'SET_INITIALIZED', payload: true });
      } catch (error) {
        console.error('Error initializing books:', error);
      }
    };

    initialize();

    // Listen for sync changes from Firebase
    const unsubscribe = firebaseSyncService.onBookSyncChanged(async () => {
      const books = await localStorageService.getAllBooksMetadata();
      const activeBooks = books.filter((b) => !isBookDeleted(b));
      dispatch({ type: 'SET_BOOKS', payload: books });
      
      // Check if we need to select a book
      const savedActiveBookId = localStorage.getItem(ACTIVE_BOOK_ID_KEY);
      
      // Try to get the currently saved active book
      let hasValidActiveBook = false;
      if (savedActiveBookId) {
        const savedBook = await localStorageService.getBook(savedActiveBookId);
        if (savedBook && !isBookDeleted(savedBook)) {
          hasValidActiveBook = true;
          // Update the active book in case it was updated
          dispatch({ type: 'SET_ACTIVE_BOOK', payload: savedBook });
        }
      }
      
      // If no valid active book and we have books, select the latest one
      if (!hasValidActiveBook && activeBooks.length > 0) {
        // Select the most recently created book
        const sortedBooks = [...activeBooks].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const bookToActivate = sortedBooks[0];
        const book = await localStorageService.getBook(bookToActivate.id);
        if (book) {
          dispatch({ type: 'SET_ACTIVE_BOOK', payload: book });
          localStorage.setItem(ACTIVE_BOOK_ID_KEY, book.id);
          console.log(`BookContext: Auto-selected book "${book.title}" after sync`);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Create a new book
  const createNewBook = useCallback(async (title: string): Promise<Book> => {
    const book = createBook(title);

    // Save to storage
    await localStorageService.saveBook(book);

    // Add to state
    const metadata = metadataFromBook(book);
    dispatch({ type: 'ADD_BOOK', payload: metadata });

    // Set as active and save to localStorage
    dispatch({ type: 'SET_ACTIVE_BOOK', payload: book });
    localStorage.setItem(ACTIVE_BOOK_ID_KEY, book.id);

    // Trigger sync
    firebaseSyncService.syncBooksToCloud();

    return book;
  }, []);

  // Set active book by ID
  const setActiveBook = useCallback(async (bookId: string | null) => {
    if (!bookId) {
      dispatch({ type: 'SET_ACTIVE_BOOK', payload: null });
      localStorage.removeItem(ACTIVE_BOOK_ID_KEY);
      return;
    }

    const book = await localStorageService.getBook(bookId);
    dispatch({ type: 'SET_ACTIVE_BOOK', payload: book });
    
    // Save to localStorage
    if (book) {
      localStorage.setItem(ACTIVE_BOOK_ID_KEY, book.id);
    }
  }, []);

  // Add writing to active book
  const addWritingToBook = useCallback(async (writingId: string) => {
    if (!state.activeBook) return;

    // Check if already in book
    if (state.activeBook.writingIds.includes(writingId)) return;

    const updatedBook: Book = {
      ...state.activeBook,
      writingIds: [...state.activeBook.writingIds, writingId],
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    // Save
    await localStorageService.saveBook(updatedBook);

    // Update state
    dispatch({ type: 'SET_ACTIVE_BOOK', payload: updatedBook });
    dispatch({ type: 'UPDATE_BOOK', payload: metadataFromBook(updatedBook) });

    // Trigger sync
    firebaseSyncService.syncBooksToCloud();
  }, [state.activeBook]);

  // Remove writing from active book
  const removeWritingFromBook = useCallback(async (writingId: string) => {
    if (!state.activeBook) return;

    const updatedBook: Book = {
      ...state.activeBook,
      writingIds: state.activeBook.writingIds.filter((id) => id !== writingId),
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    // Save
    await localStorageService.saveBook(updatedBook);

    // Update state
    dispatch({ type: 'SET_ACTIVE_BOOK', payload: updatedBook });
    dispatch({ type: 'UPDATE_BOOK', payload: metadataFromBook(updatedBook) });

    // Trigger sync
    firebaseSyncService.syncBooksToCloud();
  }, [state.activeBook]);

  // Reorder writings in active book
  const reorderWritings = useCallback(async (writingIds: string[]) => {
    if (!state.activeBook) return;

    const updatedBook: Book = {
      ...state.activeBook,
      writingIds,
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    // Save
    await localStorageService.saveBook(updatedBook);

    // Update state
    dispatch({ type: 'SET_ACTIVE_BOOK', payload: updatedBook });
    dispatch({ type: 'UPDATE_BOOK', payload: metadataFromBook(updatedBook) });

    // Trigger sync
    firebaseSyncService.syncBooksToCloud();
  }, [state.activeBook]);

  // Update book title
  const updateBookTitle = useCallback(async (title: string) => {
    if (!state.activeBook) return;

    const updatedBook: Book = {
      ...state.activeBook,
      title,
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    // Save
    await localStorageService.saveBook(updatedBook);

    // Update state
    dispatch({ type: 'SET_ACTIVE_BOOK', payload: updatedBook });
    dispatch({ type: 'UPDATE_BOOK', payload: metadataFromBook(updatedBook) });

    // Trigger sync
    firebaseSyncService.syncBooksToCloud();
  }, [state.activeBook]);

  // Delete a book
  const deleteBook = useCallback(async (bookId: string) => {
    // Check if we're deleting the active book
    const wasActive = state.activeBook?.id === bookId;
    
    // Remove from state first (optimistic)
    dispatch({ type: 'REMOVE_BOOK', payload: bookId });

    // Soft delete
    await localStorageService.deleteBook(bookId);

    // If we deleted the active book, clear localStorage
    if (wasActive) {
      localStorage.removeItem(ACTIVE_BOOK_ID_KEY);
    }

    // Trigger sync
    firebaseSyncService.syncBooksToCloud();
  }, [state.activeBook?.id]);

  // Check if writing is in active book
  const isWritingInActiveBook = useCallback((writingId: string): boolean => {
    if (!state.activeBook) return false;
    return state.activeBook.writingIds.includes(writingId);
  }, [state.activeBook]);

  // Get book by ID
  const getBook = useCallback(async (bookId: string): Promise<Book | null> => {
    return localStorageService.getBook(bookId);
  }, []);

  // Memoize context value
  const value = useMemo<BookContextType>(() => ({
    state,
    createNewBook,
    setActiveBook,
    addWritingToBook,
    removeWritingFromBook,
    reorderWritings,
    updateBookTitle,
    deleteBook,
    isWritingInActiveBook,
    getBook,
  }), [
    state,
    createNewBook,
    setActiveBook,
    addWritingToBook,
    removeWritingFromBook,
    reorderWritings,
    updateBookTitle,
    deleteBook,
    isWritingInActiveBook,
    getBook,
  ]);

  return (
    <BookContext.Provider value={value}>
      {children}
    </BookContext.Provider>
  );
}

// Hook
// eslint-disable-next-line react-refresh/only-export-components
export function useBook(): BookContextType {
  const context = useContext(BookContext);
  if (context === undefined) {
    throw new Error('useBook must be used within a BookProvider');
  }
  return context;
}
