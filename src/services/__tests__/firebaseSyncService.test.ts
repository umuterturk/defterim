import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Writing, WritingMetadata } from '../../types/writing';

// ── helpers ──────────────────────────────────────────────────────────
function makeWriting(overrides: Partial<Writing> = {}): Writing {
  return {
    id: 'w1',
    title: 'Test',
    body: 'Body text',
    footer: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    isSynced: false,
    isBold: false,
    textAlign: 'left',
    type: 'siir',
    stars: 0,
    ...overrides,
  };
}

function makeMeta(overrides: Partial<WritingMetadata> = {}): WritingMetadata {
  return {
    id: 'w1',
    title: 'Test',
    preview: 'Body text',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    isSynced: false,
    type: 'siir',
    stars: 0,
    ...overrides,
  };
}

// ── mock: localStorageService ────────────────────────────────────────
const mockLocalStorage = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getLastSyncTime: vi.fn().mockResolvedValue(null),
  updateLastSyncTime: vi.fn().mockResolvedValue(undefined),
  getAllWritingsMetadata: vi.fn().mockResolvedValue([]),
  getAllWritingsMetadataIncludingDeleted: vi.fn().mockResolvedValue([]),
  getWritingMetadata: vi.fn().mockResolvedValue(null),
  getFullWriting: vi.fn().mockResolvedValue(null),
  saveWriting: vi.fn().mockResolvedValue(undefined),
  batchUpdateWritingsMetadata: vi.fn().mockResolvedValue(undefined),
  permanentlyDeleteWriting: vi.fn().mockResolvedValue(undefined),
  getAllBooksIncludingDeleted: vi.fn().mockResolvedValue([]),
  getBook: vi.fn().mockResolvedValue(null),
  saveBook: vi.fn().mockResolvedValue(undefined),
  permanentlyDeleteBook: vi.fn().mockResolvedValue(undefined),
  getLocallyAvailableIds: vi.fn().mockResolvedValue(new Set<string>()),
};

vi.mock('../../services/localStorageService', () => ({
  localStorageService: mockLocalStorage,
}));

// ── mock: firebase/auth ──────────────────────────────────────────────
vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon' } }),
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: unknown) => void) => {
    cb({ uid: 'anon' });
    return vi.fn(); // unsubscribe
  }),
}));

// ── mock: firebase config ────────────────────────────────────────────
vi.mock('../../config/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'anon' } },
}));

// ── mock: firebase/firestore ─────────────────────────────────────────
// We capture calls to `query`, `where`, `getDocs`, `getDoc`, `onSnapshot`
// so we can assert the filtering & data flow.
const mockGetDocs = vi.fn().mockResolvedValue({ docs: [] });
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockOnSnapshot = vi.fn((_q: unknown, _cb: unknown) => vi.fn());
const mockWhere = vi.fn((...args: unknown[]) => ({ _type: 'where', args }));
const mockQuery = vi.fn((...args: unknown[]) => ({ _type: 'query', args }));
const mockCollection = vi.fn((_db: unknown, name: string) => ({ _col: name }));
const mockDoc = vi.fn((_col: unknown, id: string) => ({ _doc: id }));

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

// ── import SUT (after mocks) ─────────────────────────────────────────
// The module exports a singleton; we re-import for each describe block.
// Because the class adds window event listeners & uses navigator.onLine
// we stub them here.
let firebaseSyncService: typeof import('../../services/firebaseSyncService')['firebaseSyncService'];

beforeEach(async () => {
  vi.clearAllMocks();

  // Reset navigator.onLine to true (happy-dom doesn't provide a setter by default)
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

  // Re-import to get a fresh singleton
  vi.resetModules();

  // Re-apply all mocks before re-importing
  vi.doMock('../../services/localStorageService', () => ({
    localStorageService: mockLocalStorage,
  }));
  vi.doMock('firebase/auth', () => ({
    signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon' } }),
    onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: unknown) => void) => {
      cb({ uid: 'anon' });
      return vi.fn();
    }),
  }));
  vi.doMock('../../config/firebase', () => ({
    db: {},
    auth: { currentUser: { uid: 'anon' } },
  }));
  vi.doMock('firebase/firestore', () => ({
    collection: (...args: unknown[]) => mockCollection(...args),
    doc: (...args: unknown[]) => mockDoc(...args),
    setDoc: (...args: unknown[]) => mockSetDoc(...args),
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
    query: (...args: unknown[]) => mockQuery(...args),
    where: (...args: unknown[]) => mockWhere(...args),
    onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  }));

  const mod = await import('../../services/firebaseSyncService');
  firebaseSyncService = mod.firebaseSyncService;
});

// =====================================================================
// TESTS
// =====================================================================

describe('performIncrementalSync', () => {
  it('only fetches docs updated since lastSyncTime', async () => {
    const lastSync = new Date('2025-06-01T00:00:00.000Z');
    mockLocalStorage.getLastSyncTime.mockResolvedValue(lastSync);
    mockLocalStorage.getAllWritingsMetadataIncludingDeleted.mockResolvedValue([]);
    mockGetDocs.mockResolvedValue({ docs: [] });

    await firebaseSyncService.performIncrementalSync();

    // where() should be called with the lastSyncTime ISO string
    expect(mockWhere).toHaveBeenCalledWith(
      'updatedAt',
      '>',
      lastSync.toISOString(),
    );
    expect(mockQuery).toHaveBeenCalled();
    expect(mockGetDocs).toHaveBeenCalled();
  });

  it('falls back to full sync when no lastSyncTime', async () => {
    mockLocalStorage.getLastSyncTime.mockResolvedValue(null);
    // performFullSync will be called internally — just verify getDocs is called
    // with the full collection (no where clause for full sync)
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockLocalStorage.getAllWritingsMetadataIncludingDeleted.mockResolvedValue([]);

    await firebaseSyncService.performIncrementalSync();

    // Full sync calls getDocs on the bare collection (no where filter)
    // The first getDocs call should use the bare collection reference
    expect(mockGetDocs).toHaveBeenCalled();
  });
});

describe('listenToRemoteMetadataChanges (via initialize)', () => {
  it('creates filtered query with where(updatedAt > lastSync)', async () => {
    const lastSync = new Date('2025-06-15T12:00:00.000Z');
    mockLocalStorage.getLastSyncTime.mockResolvedValue(lastSync);
    mockLocalStorage.getAllWritingsMetadataIncludingDeleted.mockResolvedValue([]);
    mockLocalStorage.getAllBooksIncludingDeleted.mockResolvedValue([]);
    mockGetDocs.mockResolvedValue({ docs: [] });

    await firebaseSyncService.initialize();

    // onSnapshot is called for both metadata and books listeners
    // The metadata listener should use a filtered query
    expect(mockWhere).toHaveBeenCalledWith(
      'updatedAt',
      '>',
      lastSync.toISOString(),
    );
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe('listenToRemoteBookChanges (via initialize)', () => {
  it('creates filtered query with where(updatedAt > lastSync)', async () => {
    const lastSync = new Date('2025-07-01T00:00:00.000Z');
    mockLocalStorage.getLastSyncTime.mockResolvedValue(lastSync);
    mockLocalStorage.getAllWritingsMetadataIncludingDeleted.mockResolvedValue([]);
    mockLocalStorage.getAllBooksIncludingDeleted.mockResolvedValue([]);
    mockGetDocs.mockResolvedValue({ docs: [] });

    await firebaseSyncService.initialize();

    // Both metadata and book listeners use where filters
    const whereCalls = mockWhere.mock.calls;
    const bookWhereCall = whereCalls.find(
      (call: unknown[]) => call[0] === 'updatedAt' && call[1] === '>' && call[2] === lastSync.toISOString(),
    );
    expect(bookWhereCall).toBeDefined();

    // onSnapshot should be called at least twice (metadata + books)
    expect(mockOnSnapshot.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('conflict resolution', () => {
  it('uploads local writing when local is newer', async () => {
    const localMeta = makeMeta({
      id: 'w1',
      isSynced: false,
      updatedAt: '2025-06-02T00:00:00.000Z',
    });
    const localWriting = makeWriting({
      id: 'w1',
      updatedAt: '2025-06-02T00:00:00.000Z',
      isSynced: false,
    });

    const lastSync = new Date('2025-06-01T00:00:00.000Z');
    mockLocalStorage.getLastSyncTime.mockResolvedValue(lastSync);
    mockLocalStorage.getAllWritingsMetadataIncludingDeleted.mockResolvedValue([localMeta]);
    mockLocalStorage.getFullWriting.mockResolvedValue(localWriting);

    // Remote version exists but is older
    const remoteDocData = {
      title: 'Test',
      preview: 'Body text',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z', // older
      type: 'siir',
      stars: 0,
    };

    // getDocs returns no changed docs (incremental returns nothing new)
    mockGetDocs.mockResolvedValue({ docs: [] });

    // getDoc returns the older remote version for conflict check
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'w1',
      data: () => remoteDocData,
    });

    await firebaseSyncService.performIncrementalSync();

    // setDoc should be called to upload local writing (it's newer)
    expect(mockSetDoc).toHaveBeenCalled();
  });

  it('downloads remote writing when remote is newer', async () => {
    const localMeta = makeMeta({
      id: 'w1',
      isSynced: false,
      updatedAt: '2025-06-01T00:00:00.000Z',
    });
    const localWriting = makeWriting({
      id: 'w1',
      updatedAt: '2025-06-01T00:00:00.000Z',
      isSynced: false,
    });

    const lastSync = new Date('2025-05-01T00:00:00.000Z');
    mockLocalStorage.getLastSyncTime.mockResolvedValue(lastSync);
    mockLocalStorage.getAllWritingsMetadataIncludingDeleted.mockResolvedValue([localMeta]);
    mockLocalStorage.getFullWriting.mockResolvedValue(localWriting);
    mockLocalStorage.getWritingMetadata.mockResolvedValue(localMeta);

    // Remote is newer
    const remoteDocData = {
      title: 'Test Updated',
      preview: 'Updated body',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-06-02T00:00:00.000Z', // newer
      type: 'siir',
      stars: 0,
    };

    // getDocs returns no incremental changes
    mockGetDocs.mockResolvedValue({ docs: [] });

    // getDoc returns the newer remote version
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'w1',
      data: () => remoteDocData,
    });

    await firebaseSyncService.performIncrementalSync();

    // batchUpdateWritingsMetadata should be called with the remote metadata
    expect(mockLocalStorage.batchUpdateWritingsMetadata).toHaveBeenCalled();
    const savedBatch = mockLocalStorage.batchUpdateWritingsMetadata.mock.calls[0][0] as WritingMetadata[];
    expect(savedBatch.some((m: WritingMetadata) => m.updatedAt === '2025-06-02T00:00:00.000Z')).toBe(true);

    // setDoc should NOT be called (remote is newer, so no upload)
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe('offline behavior', () => {
  it('skips Firebase sync when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    // Re-import to get a fresh singleton that sees onLine=false
    vi.resetModules();
    vi.doMock('../../services/localStorageService', () => ({
      localStorageService: mockLocalStorage,
    }));
    vi.doMock('firebase/auth', () => ({
      signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon' } }),
      onAuthStateChanged: vi.fn(() => vi.fn()),
    }));
    vi.doMock('../../config/firebase', () => ({
      db: {},
      auth: { currentUser: null },
    }));
    vi.doMock('firebase/firestore', () => ({
      collection: (...args: unknown[]) => mockCollection(...args),
      doc: (...args: unknown[]) => mockDoc(...args),
      setDoc: (...args: unknown[]) => mockSetDoc(...args),
      getDoc: (...args: unknown[]) => mockGetDoc(...args),
      getDocs: (...args: unknown[]) => mockGetDocs(...args),
      query: (...args: unknown[]) => mockQuery(...args),
      where: (...args: unknown[]) => mockWhere(...args),
      onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
    }));

    const mod = await import('../../services/firebaseSyncService');
    const offlineService = mod.firebaseSyncService;

    mockLocalStorage.getLastSyncTime.mockResolvedValue(null);
    vi.clearAllMocks();

    const result = await offlineService.initialize();

    expect(result).toBe(false);
    // Should NOT call getDocs or any Firestore read
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('skips performIncrementalSync when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    vi.resetModules();
    vi.doMock('../../services/localStorageService', () => ({
      localStorageService: mockLocalStorage,
    }));
    vi.doMock('firebase/auth', () => ({
      signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon' } }),
      onAuthStateChanged: vi.fn(() => vi.fn()),
    }));
    vi.doMock('../../config/firebase', () => ({
      db: {},
      auth: { currentUser: null },
    }));
    vi.doMock('firebase/firestore', () => ({
      collection: (...args: unknown[]) => mockCollection(...args),
      doc: (...args: unknown[]) => mockDoc(...args),
      setDoc: (...args: unknown[]) => mockSetDoc(...args),
      getDoc: (...args: unknown[]) => mockGetDoc(...args),
      getDocs: (...args: unknown[]) => mockGetDocs(...args),
      query: (...args: unknown[]) => mockQuery(...args),
      where: (...args: unknown[]) => mockWhere(...args),
      onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
    }));

    const mod = await import('../../services/firebaseSyncService');
    const offlineService = mod.firebaseSyncService;
    vi.clearAllMocks();

    await offlineService.performIncrementalSync();

    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
