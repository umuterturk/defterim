import { useEffect, useRef, useCallback, useState, useMemo } from 'react';

interface UseAutoSaveOptions {
  data: unknown;
  onSave: () => Promise<void> | void;
  delay?: number;
  enabled?: boolean;
}

/**
 * Auto-save hook that triggers save after delay when data changes
 */
export function useAutoSave({
  data,
  onSave,
  delay = 2000,
  enabled = true,
}: UseAutoSaveOptions): {
  hasUnsavedChanges: boolean;
  saveNow: () => Promise<void>;
} {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  // Track the "saved" data state - when this matches current data, no unsaved changes
  const [savedDataSnapshot, setSavedDataSnapshot] = useState(() => JSON.stringify(data));

  // Keep onSave ref up to date
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Compute hasUnsavedChanges from current data vs saved snapshot
  const currentDataStr = useMemo(() => JSON.stringify(data), [data]);
  const hasUnsavedChanges = currentDataStr !== savedDataSnapshot;

  // Save function
  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    await onSaveRef.current();
    setSavedDataSnapshot(JSON.stringify(data));
  }, [data]);

  // Auto-save effect
  useEffect(() => {
    if (!enabled || !hasUnsavedChanges) {
      return;
    }

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(async () => {
      await onSaveRef.current();
      setSavedDataSnapshot(JSON.stringify(data));
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [currentDataStr, delay, enabled, hasUnsavedChanges, data]);

  return {
    hasUnsavedChanges,
    saveNow,
  };
}

/**
 * Reset the initial data reference (call after successful save from external source)
 */
export function useAutoSaveReset(data: unknown): void {
  const ref = useRef<string>(JSON.stringify(data));
  
  useEffect(() => {
    ref.current = JSON.stringify(data);
  }, [data]);
}
