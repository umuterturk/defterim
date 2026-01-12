import { useEffect, useRef, useCallback } from 'react';

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
  const hasUnsavedChangesRef = useRef(false);
  const initialDataRef = useRef<string>(JSON.stringify(data));

  // Track if data has changed from initial
  const currentData = JSON.stringify(data);
  const hasChanges = currentData !== initialDataRef.current;

  // Update unsaved changes flag
  hasUnsavedChangesRef.current = hasChanges;

  // Save function
  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    if (hasUnsavedChangesRef.current) {
      await onSave();
      initialDataRef.current = JSON.stringify(data);
      hasUnsavedChangesRef.current = false;
    }
  }, [onSave, data]);

  // Auto-save effect
  useEffect(() => {
    if (!enabled || !hasChanges) {
      return;
    }

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(async () => {
      if (hasUnsavedChangesRef.current) {
        await onSave();
        initialDataRef.current = JSON.stringify(data);
        hasUnsavedChangesRef.current = false;
      }
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [currentData, delay, enabled, onSave, hasChanges, data]);

  return {
    hasUnsavedChanges: hasChanges,
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
