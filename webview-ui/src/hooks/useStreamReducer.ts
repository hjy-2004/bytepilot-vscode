import { useCallback, useRef } from 'react';

/**
 * Hook for managing incremental streaming text accumulation.
 * Returns a callback that appends text chunks and the accumulated result ref.
 */
export function useStreamAccumulator(onFlush?: (fullText: string) => void) {
  const bufferRef = useRef('');

  const append = useCallback((chunk: string) => {
    bufferRef.current += chunk;
  }, []);

  const flush = useCallback(() => {
    const text = bufferRef.current;
    bufferRef.current = '';
    if (text && onFlush) {
      onFlush(text);
    }
    return text;
  }, [onFlush]);

  const reset = useCallback(() => {
    bufferRef.current = '';
  }, []);

  return { append, flush, reset, getText: () => bufferRef.current };
}
