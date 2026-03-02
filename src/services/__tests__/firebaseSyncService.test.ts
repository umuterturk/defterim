/* eslint-disable @typescript-eslint/no-explicit-any */
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
  onAuthStateChanged: vi.fn((_auth: any, cb: (u: any) => void) => {
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
const mockGetDocs = vi.fn().mockResolvedValue({ docs: [] });
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockOnSnapshot = vi.fn((_q: any, _cb: any) => vi.fn());
const mockWhere = vi.fn((...args: any[]) => ({ _type: 'where', args }));
const mockQuery = vi.fn((...args: any[]) => ({ _type: 'query', args }));
const mockCollection = vi.fn((_db: any, name: string) => ({ _col: name }));
const mockDoc = vi.fn((_col: any, id: string) => ({ _doc: id }));

function firestoreMockFactory() {
  return {
    collection: mockCollection,
    doc: mockDoc,
    setDoc: mockSetDoc,
    getDoc: mockGetDoc,
    getDocs: mockGetDocs,
    query: mockQuery,
    where: mockWhere,
    onSnapshot: mockOnSnapshot,
  };
}

vi.mock('firebase/firestore', firestoreMockFactory);

// ── import SUT (after mocks) ─────────────────────────────────────────
let firebaseSyncService: typeof import('../../services/firebaseSyncService')['firebaseSyncService'];

beforeEach(async () => {
  vi.clearAllMocks();

  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

  vi.resetModules();

  vi.doMock('../../services/localStorageService', () => ({
    localStorageService: mockLocalStorage,
  }));
  vi.doMock('firebase/auth', () => ({
    signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon' } }),
    onAuthStateChanged: vi.fn((_auth: any, cb: (u: any) => void) => {
      cb({ uid: 'anon' });
      return vi.fn();
    }),
  }));
  vi.doMock('../../config/firebase', () => ({
    db: {},
    auth: { currentUser: { uid: 'anon' } },
  }));
  vi.doMock('firebase/firestore', firestoreMockFactory);

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
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockLocalStorage.getAllWritingsMetadataIncludingDeleted.mockResolvedValue([]);

    await firebaseSyncService.performIncrementalSync();

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

    const whereCalls = mockWhere.mock.calls;
    const bookWhereCall = whereCalls.find(
      (call: any[]) => call[0] === 'updatedAt' && call[1] === '>' && call[2] === lastSync.toISOString(),
    );
    expect(bookWhereCall).toBeDefined();

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

    const remoteDocData = {
      title: 'Test',
      preview: 'Body text',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
      type: 'siir',
      stars: 0,
    };

    mockGetDocs.mockResolvedValue({ docs: [] });

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'w1',
      data: () => remoteDocData,
    });

    await firebaseSyncService.performIncrementalSync();

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

    const remoteDocData = {
      title: 'Test Updated',
      preview: 'Updated body',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-06-02T00:00:00.000Z',
      type: 'siir',
      stars: 0,
    };

    mockGetDocs.mockResolvedValue({ docs: [] });

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'w1',
      data: () => remoteDocData,
    });

    await firebaseSyncService.performIncrementalSync();

    expect(mockLocalStorage.batchUpdateWritingsMetadata).toHaveBeenCalled();
    const savedBatch = mockLocalStorage.batchUpdateWritingsMetadata.mock.calls[0][0] as WritingMetadata[];
    expect(savedBatch.some((m: WritingMetadata) => m.updatedAt === '2025-06-02T00:00:00.000Z')).toBe(true);

    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe('offline behavior', () => {
  it('skips Firebase sync when offline', async () => {
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
    vi.doMock('firebase/firestore', firestoreMockFactory);

    const mod = await import('../../services/firebaseSyncService');
    const offlineService = mod.firebaseSyncService;

    mockLocalStorage.getLastSyncTime.mockResolvedValue(null);
    vi.clearAllMocks();

    const result = await offlineService.initialize();

    expect(result).toBe(false);
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
    vi.doMock('firebase/firestore', firestoreMockFactory);

    const mod = await import('../../services/firebaseSyncService');
    const offlineService = mod.firebaseSyncService;
    vi.clearAllMocks();

    await offlineService.performIncrementalSync();

    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
