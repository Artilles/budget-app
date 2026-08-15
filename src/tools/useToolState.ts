import { useCallback } from 'react';
import { useBudget } from '../store/useBudget';

/**
 * Read and write one tool's saved inputs.
 *
 * Reads are defensive by design: the document's `tools` blob is deliberately
 * untyped so tools can be added without a migration, which means a value may be
 * missing or the wrong type after a hand-edit. Every read falls back to the
 * supplied default rather than propagating a bad value into arithmetic.
 */
export function useToolState(toolId: string) {
  const state = useBudget((s) => s.doc?.tools?.[toolId]);
  const setToolState = useBudget((s) => s.setToolState);

  const number = useCallback(
    (key: string, fallback: number): number => {
      const value = state?.[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    },
    [state],
  );

  const text = useCallback(
    (key: string, fallback: string): string => {
      const value = state?.[key];
      return typeof value === 'string' && value ? value : fallback;
    },
    [state],
  );

  const set = useCallback(
    (patch: Record<string, unknown>) => setToolState(toolId, patch),
    [setToolState, toolId],
  );

  return { number, text, set };
}
