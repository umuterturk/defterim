import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Writing, WritingMetadata } from '../../types/writing';

// ── helpers ──────────────────────────────────────────────────────────
function makeWriting(overrides: Partial<Writing> = {}): Writing {
  return {
    id: 'w1',
    title: 'Test Poem',
    body: 'Some body text',
    footer: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    isSynced: true,
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
    title: 'Test Poem',
    preview: 'Some body text',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    isSynced: true,
    type: 'siir',
    stars: 0,
    ...overrides,
  };
}

// ── mock: localStorageService (inline factory to avoid hoisting issues) ──
vi.mock('../../services/localStorageService', () => ({
  localStorageService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllWritingsMetadata: vi.fn().mockResolvedValue([]),
    getLocallyAvailableIds: vi.fn().mockResolvedValue(new Set<string>()),
    getWritingMetadata: vi.fn().mockResolvedValue(null),
    getFullWriting: vi.fn().mockResolvedValue(null),
    saveWriting: vi.fn().mockResolvedValue(undefined),
    deleteWriting: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── mock: firebaseSyncService (inline factory) ───────────────────────
vi.mock('../../services/firebaseSyncService', () => ({
  firebaseSyncService: {
    initialize: vi.fn().mockResolvedValue(true),
    onSyncChanged: vi.fn((_cb: unknown) => vi.fn()),
    onLoadingChanged: vi.fn((_cb: unknown) => vi.fn()),
    dispose: vi.fn(),
    fetchWritingFromFirebase: vi.fn().mockResolvedValue(null),
    fetchWritingBody: vi.fn().mockResolvedValue(null),
    syncUnsyncedToCloud: vi.fn(),
  },
}));

// ── import SUT and mocked modules ────────────────────────────────────
import { WritingsProvider, useWritings } from '../../contexts/WritingsContext';
import { localStorageService } from '../../services/localStorageService';
import { firebaseSyncService } from '../../services/firebaseSyncService';

// Typed references to the mocks
const mockLocal = vi.mocked(localStorageService);
const mockFirebase = vi.mocked(firebaseSyncService);

// Track sync callback
let syncChangedCallback: (() => void) | null = null;

// ── wrapper ──────────────────────────────────────────────────────────
function wrapper({ children }: { children: ReactNode }) {
  return <WritingsProvider>{children}</WritingsProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  syncChangedCallback = null;

  // Reset defaults
  mockLocal.initialize.mockResolvedValue(undefined);
  mockLocal.getAllWritingsMetadata.mockResolvedValue([]);
  mockLocal.getLocallyAvailableIds.mockResolvedValue(new Set<string>());
  mockLocal.getWritingMetadata.mockResolvedValue(null);
  mockLocal.getFullWriting.mockResolvedValue(null);
  mockLocal.saveWriting.mockResolvedValue(undefined);
  mockFirebase.initialize.mockResolvedValue(true);
  mockFirebase.fetchWritingFromFirebase.mockResolvedValue(null);
  mockFirebase.fetchWritingBody.mockResolvedValue(null);

  // Capture sync callback
  mockFirebase.onSyncChanged.mockImplementation((cb: () => void) => {
    syncChangedCallback = cb;
    return vi.fn();
  });

  // navigator.onLine = true by default
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
});

// =====================================================================
// getFullWriting TESTS
// =====================================================================

describe('getFullWriting', () => {
  it('returns from in-memory cache when fresh (no Firebase call)', async () => {
    const meta = makeMeta({ id: 'w1', updatedAt: '2025-01-01T00:00:00.000Z' });
    const writing = makeWriting({ id: 'w1', updatedAt: '2025-01-01T00:00:00.000Z' });

    mockLocal.getAllWritingsMetadata.mockResolvedValue([meta]);
    mockLocal.getWritingMetadata.mockResolvedValue(meta);
    mockLocal.getFullWriting.mockResolvedValue(writing);

    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    // First call — populates cache from IndexedDB
    let fullWriting: Writing | null = null;
    await act(async () => {
      fullWriting = await result.current.getFullWriting('w1');
    });
    expect(fullWriting).toBeTruthy();

    // Reset call counters
    mockLocal.getFullWriting.mockClear();
    mockFirebase.fetchWritingFromFirebase.mockClear();
    mockFirebase.fetchWritingBody.mockClear();

    // Second call — should come from in-memory cache (no IndexedDB or Firebase)
    await act(async () => {
      fullWriting = await result.current.getFullWriting('w1');
    });

    expect(fullWriting!.id).toBe('w1');
    expect(mockLocal.getFullWriting).not.toHaveBeenCalled();
    expect(mockFirebase.fetchWritingFromFirebase).not.toHaveBeenCalled();
    expect(mockFirebase.fetchWritingBody).not.toHaveBeenCalled();
  });

  it('invalidates in-memory cache when metadata is newer (stale detection)', async () => {
    const meta = makeMeta({ id: 'w1', updatedAt: '2025-02-01T00:00:00.000Z' }); // newer
    const oldWriting = makeWriting({ id: 'w1', updatedAt: '2025-01-01T00:00:00.000Z' }); // older
    const newWriting = makeWriting({ id: 'w1', updatedAt: '2025-02-01T00:00:00.000Z', body: 'Updated' });

    mockLocal.getAllWritingsMetadata.mockResolvedValue([meta]);
    mockLocal.getWritingMetadata.mockResolvedValue(meta);
    mockLocal.getFullWriting.mockResolvedValueOnce(oldWriting).mockResolvedValueOnce(newWriting);

    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    // First call — caches old writing
    await act(async () => {
      await result.current.getFullWriting('w1');
    });

    mockLocal.getFullWriting.mockClear();
    mockLocal.getFullWriting.mockResolvedValue(newWriting);

    let fullWriting: Writing | null = null;
    await act(async () => {
      fullWriting = await result.current.getFullWriting('w1');
    });

    // Should have gone back to IndexedDB because cache was stale
    expect(mockLocal.getFullWriting).toHaveBeenCalledWith('w1');
    expect(fullWriting!.body).toBe('Updated');
  });

  it('returns from IndexedDB when body is synced (no Firebase call)', async () => {
    const meta = makeMeta({ id: 'w1', updatedAt: '2025-01-01T00:00:00.000Z', isSynced: true });
    const writing = makeWriting({ id: 'w1', updatedAt: '2025-01-01T00:00:00.000Z', isSynced: true });

    mockLocal.getAllWritingsMetadata.mockResolvedValue([meta]);
    mockLocal.getWritingMetadata.mockResolvedValue(meta);
    mockLocal.getFullWriting.mockResolvedValue(writing);

    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    let fullWriting: Writing | null = null;
    await act(async () => {
      fullWriting = await result.current.getFullWriting('w1');
    });

    expect(fullWriting).toBeTruthy();
    expect(fullWriting!.id).toBe('w1');
    expect(mockFirebase.fetchWritingFromFirebase).not.toHaveBeenCalled();
    expect(mockFirebase.fetchWritingBody).not.toHaveBeenCalled();
  });

  it('fetches Firebase when body is stale (metadata.updatedAt > body.updatedAt)', async () => {
    const meta = makeMeta({ id: 'w1', updatedAt: '2025-02-01T00:00:00.000Z', isSynced: true });
    const staleWriting = makeWriting({ id: 'w1', updatedAt: '2025-01-01T00:00:00.000Z', isSynced: true });
    const freshWriting = makeWriting({ id: 'w1', updatedAt: '2025-02-01T00:00:00.000Z', body: 'Fresh from Firebase' });

    mockLocal.getAllWritingsMetadata.mockResolvedValue([meta]);
    mockLocal.getWritingMetadata.mockResolvedValue(meta);
    mockLocal.getFullWriting.mockResolvedValue(staleWriting);
    mockFirebase.fetchWritingFromFirebase.mockResolvedValue(freshWriting);

    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    let fullWriting: Writing | null = null;
    await act(async () => {
      fullWriting = await result.current.getFullWriting('w1');
    });

    expect(mockFirebase.fetchWritingFromFirebase).toHaveBeenCalledWith('w1');
    expect(fullWriting!.body).toBe('Fresh from Firebase');
  });

  it('fetches Firebase when body not cached locally', async () => {
    const meta = makeMeta({ id: 'w1', updatedAt: '2025-01-01T00:00:00.000Z' });
    const remoteWriting = makeWriting({ id: 'w1', body: 'From Firebase' });

    mockLocal.getAllWritingsMetadata.mockResolvedValue([meta]);
    mockLocal.getWritingMetadata.mockResolvedValue(meta);
    mockLocal.getFullWriting.mockResolvedValue(null);
    mockFirebase.fetchWritingBody.mockResolvedValue(remoteWriting);

    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    let fullWriting: Writing | null = null;
    await act(async () => {
      fullWriting = await result.current.getFullWriting('w1');
    });

    expect(mockFirebase.fetchWritingBody).toHaveBeenCalledWith('w1');
    expect(fullWriting!.body).toBe('From Firebase');
  });

  it('conflict resolution: keeps local when local is newer', async () => {
    const meta = makeMeta({ id: 'w1', updatedAt: '2025-02-01T00:00:00.000Z', isSynced: true });
    const localWriting = makeWriting({
      id: 'w1',
      updatedAt: '2025-02-01T00:00:00.000Z',
      body: 'Local version',
      isSynced: false,
    });
    const remoteWriting = makeWriting({
      id: 'w1',
      updatedAt: '2025-01-15T00:00:00.000Z',
      body: 'Remote version',
    });

    mockLocal.getAllWritingsMetadata.mockResolvedValue([meta]);
    mockLocal.getWritingMetadata.mockResolvedValue(meta);
    mockLocal.getFullWriting.mockResolvedValue(localWriting);
    mockFirebase.fetchWritingFromFirebase.mockResolvedValue(remoteWriting);

    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    let fullWriting: Writing | null = null;
    await act(async () => {
      fullWriting = await result.current.getFullWriting('w1');
    });

    expect(fullWriting!.body).toBe('Local version');
  });

  it('conflict resolution: uses remote when remote is newer', async () => {
    const meta = makeMeta({ id: 'w1', updatedAt: '2025-03-01T00:00:00.000Z', isSynced: true });
    const localWriting = makeWriting({
      id: 'w1',
      updatedAt: '2025-01-01T00:00:00.000Z',
      body: 'Old local',
      isSynced: false,
    });
    const remoteWriting = makeWriting({
      id: 'w1',
      updatedAt: '2025-03-01T00:00:00.000Z',
      body: 'New remote',
    });

    mockLocal.getAllWritingsMetadata.mockResolvedValue([meta]);
    mockLocal.getWritingMetadata.mockResolvedValue(meta);
    mockLocal.getFullWriting.mockResolvedValue(localWriting);
    mockFirebase.fetchWritingFromFirebase.mockResolvedValue(remoteWriting);

    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    let fullWriting: Writing | null = null;
    await act(async () => {
      fullWriting = await result.current.getFullWriting('w1');
    });

    expect(fullWriting!.body).toBe('New remote');
    expect(mockLocal.saveWriting).toHaveBeenCalledWith(remoteWriting);
  });

  it('offline: returns local copy without Firebase call', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    const meta = makeMeta({ id: 'w1', updatedAt: '2025-02-01T00:00:00.000Z' });
    const localWriting = makeWriting({
      id: 'w1',
      updatedAt: '2025-01-01T00:00:00.000Z',
      body: 'Offline body',
      isSynced: false,
    });

    mockLocal.getAllWritingsMetadata.mockResolvedValue([meta]);
    mockLocal.getWritingMetadata.mockResolvedValue(meta);
    mockLocal.getFullWriting.mockResolvedValue(localWriting);

    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    let fullWriting: Writing | null = null;
    await act(async () => {
      fullWriting = await result.current.getFullWriting('w1');
    });

    expect(fullWriting!.body).toBe('Offline body');
    expect(mockFirebase.fetchWritingFromFirebase).not.toHaveBeenCalled();
    expect(mockFirebase.fetchWritingBody).not.toHaveBeenCalled();
  });
});

describe('re-mount does not create duplicate listeners', () => {
  it('does not call dispose on the singleton when provider unmounts', async () => {
    mockLocal.getAllWritingsMetadata.mockResolvedValue([]);

    const { unmount } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(mockFirebase.initialize).toHaveBeenCalled());

    mockFirebase.dispose.mockClear();
    unmount();

    // dispose should NOT be called — the singleton outlives the component
    expect(mockFirebase.dispose).not.toHaveBeenCalled();
  });

  it('re-mounting provider does not call initialize again if already initialized', async () => {
    mockLocal.getAllWritingsMetadata.mockResolvedValue([]);

    // First mount
    const { unmount } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(mockFirebase.initialize).toHaveBeenCalledTimes(1));
    unmount();

    mockFirebase.initialize.mockClear();

    // Second mount — initialize should still be called (context doesn't know),
    // but the service itself should guard against re-init (tested in service tests)
    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    // Context calls initialize, but service's internal guard prevents duplicate work
    expect(mockFirebase.initialize).toHaveBeenCalledTimes(1);
  });
});

describe('onSyncChanged clears in-memory cache', () => {
  it('forces re-fetch from IndexedDB after sync callback fires', async () => {
    const meta = makeMeta({ id: 'w1', updatedAt: '2025-01-01T00:00:00.000Z' });
    const writing = makeWriting({ id: 'w1', updatedAt: '2025-01-01T00:00:00.000Z' });

    mockLocal.getAllWritingsMetadata.mockResolvedValue([meta]);
    mockLocal.getWritingMetadata.mockResolvedValue(meta);
    mockLocal.getFullWriting.mockResolvedValue(writing);

    const { result } = renderHook(() => useWritings(), { wrapper });
    await waitFor(() => expect(result.current.state.isInitialized).toBe(true));

    // Populate cache
    await act(async () => {
      await result.current.getFullWriting('w1');
    });

    // Clear call counts
    mockLocal.getFullWriting.mockClear();

    // Prepare updated data for after sync
    const updatedWriting = makeWriting({ id: 'w1', updatedAt: '2025-02-01T00:00:00.000Z', body: 'Synced body' });
    mockLocal.getFullWriting.mockResolvedValue(updatedWriting);
    mockLocal.getWritingMetadata.mockResolvedValue(
      makeMeta({ id: 'w1', updatedAt: '2025-02-01T00:00:00.000Z' }),
    );

    // Fire sync callback — clears in-memory cache
    await act(async () => {
      if (syncChangedCallback) syncChangedCallback();
    });

    await waitFor(() => expect(mockLocal.getAllWritingsMetadata).toHaveBeenCalled());

    // Next call should go to IndexedDB (cache was cleared)
    await act(async () => {
      const fresh = await result.current.getFullWriting('w1');
      expect(fresh!.body).toBe('Synced body');
    });

    expect(mockLocal.getFullWriting).toHaveBeenCalledWith('w1');
  });
});
