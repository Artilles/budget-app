import type { ComponentType } from 'react';

/**
 * A tool is a small self-contained calculator.
 *
 * Adding one means writing a component and appending it to the registry in
 * `registry.ts` — no schema change, no migration, no routing. Saved inputs live
 * under `doc.tools[id]`, so pick an `id` once and never change it.
 */
export interface ToolDefinition {
  /** Stable key; also the document key for this tool's saved inputs. */
  id: string;
  name: string;
  /** One line shown on the index card. Say what question it answers. */
  summary: string;
  Component: ComponentType;
}
