import { describe, expect, it } from 'vitest';
import { FLOW, NODES, PHASES, edges } from './flowchart';
import { LAYOUT } from './flowchartLayout';

/**
 * The chart is a graph written by hand, so these check it is actually a graph:
 * a mistyped id in an edge would otherwise render as a branch that silently
 * shows nothing, which is the kind of thing nobody notices in a wall of text.
 */
describe('the spending flowchart graph', () => {
  it('has unique node ids', () => {
    const ids = FLOW.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every edge at a node that exists', () => {
    for (const edge of edges()) {
      expect(NODES[edge.to], `${edge.from} -> ${edge.to}`).toBeDefined();
    }
  });

  it('puts every node in a declared phase', () => {
    const known = new Set(PHASES.map((p) => p.id));
    for (const node of FLOW) {
      expect(known.has(node.phase), `${node.id} has phase "${node.phase}"`).toBe(true);
    }
  });

  it('gives every decision both answers', () => {
    for (const node of FLOW.filter((n) => n.kind === 'decision')) {
      expect(node.yes, `${node.id} has no yes`).toBeDefined();
      expect(node.no, `${node.id} has no no`).toBeDefined();
    }
  });

  it('gives no action a yes or no, and no decision a next', () => {
    for (const node of FLOW) {
      if (node.kind === 'action') {
        expect(node.yes, `${node.id}`).toBeUndefined();
        expect(node.no, `${node.id}`).toBeUndefined();
      } else {
        expect(node.next, `${node.id}`).toBeUndefined();
      }
    }
  });

  it('leaves no node stranded — every one is reachable from the start', () => {
    const byFrom = new Map<string, string[]>();
    for (const e of edges()) byFrom.set(e.from, [...(byFrom.get(e.from) ?? []), e.to]);

    const seen = new Set<string>(['create-budget']);
    const queue = ['create-budget'];
    while (queue.length) {
      for (const to of byFrom.get(queue.pop()!) ?? []) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }

    const stranded = FLOW.map((n) => n.id).filter((id) => !seen.has(id));
    expect(stranded).toEqual([]);
  });

  it('ends somewhere — at least one node has no way out', () => {
    const terminal = FLOW.filter((n) => !n.next?.length && !n.yes && !n.no);
    expect(terminal.length).toBeGreaterThan(0);
  });

  it('starts where the chart starts', () => {
    expect(FLOW[0].id).toBe('create-budget');
    // Nothing leads back to the beginning; it is the entry point.
    expect(edges().some((e) => e.to === 'create-budget')).toBe(false);
  });

  it('numbers the phases from zero without gaps', () => {
    expect(PHASES.map((p) => p.step)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('uses every declared phase, so the legend has no dead entries', () => {
    const used = new Set(FLOW.map((n) => n.phase));
    for (const phase of PHASES) {
      expect(used.has(phase.id), `phase "${phase.id}" has no nodes`).toBe(true);
    }
  });

  it('keeps the debt loops, which are what make it a chart and not a list', () => {
    // Paying down moderate debt returns to the question, so it repeats until clear.
    expect(NODES['attack-moderate-interest'].next).toContain('moderate-interest-debt');
    // Likewise saving less than 15% loops back after increasing contributions.
    expect(NODES['increase-contributions'].next).toContain('saving-fifteen');
  });
});

/**
 * The layout lives beside the graph rather than inside it, so these check the
 * two cannot drift: a node with no position would silently not render, and a
 * position with no node would leave a gap in the grid.
 */
describe('the flowchart layout', () => {
  it('places every node', () => {
    const missing = FLOW.map((n) => n.id).filter((id) => !LAYOUT[id]);
    expect(missing).toEqual([]);
  });

  it('places nothing that is not a node', () => {
    const extra = Object.keys(LAYOUT).filter((id) => !NODES[id]);
    expect(extra).toEqual([]);
  });

  it('never puts two nodes in the same cell', () => {
    const cells = Object.values(LAYOUT).map((p) => `${p.col},${p.row}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('uses rows from zero with no empty ones, so the grid has no gaps', () => {
    const rows = [...new Set(Object.values(LAYOUT).map((p) => p.row))].sort((a, b) => a - b);
    expect(rows).toEqual(rows.map((_, i) => i));
  });

  it('never draws an arrow upward, which the renderer cannot route', () => {
    // Every edge goes down the page or straight across; the loops are level
    // with the question they return to.
    for (const edge of edges()) {
      const from = LAYOUT[edge.from];
      const to = LAYOUT[edge.to];
      expect(to.row, `${edge.from} -> ${edge.to} goes up`).toBeGreaterThanOrEqual(from.row);
    }
  });

  it('keeps the loops level, so they render as a sideways hop', () => {
    for (const [from, to] of [
      ['attack-moderate-interest', 'moderate-interest-debt'],
      ['increase-contributions', 'saving-fifteen'],
    ]) {
      expect(LAYOUT[from].row).toBe(LAYOUT[to].row);
      expect(LAYOUT[from].col).not.toBe(LAYOUT[to].col);
    }
  });

  it('starts at the top of the spine', () => {
    expect(LAYOUT['create-budget']).toEqual({ col: 0, row: 0 });
  });
});
