import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { badgeColors, useChartTheme, type ChartTheme } from '../charts/palette';
import { FLOW, PHASES, edges, type FlowNode, type PhaseId } from './flowchart';
import { LAYOUT } from './flowchartLayout';

export const SPENDING_FLOWCHART_ID = 'spending-flowchart';

/**
 * Where each phase sits in the validated palette, so the chart is the same
 * colour system as everything else and stays distinguishable to a colourblind
 * reader. Step 0 takes neutral ink: it is the groundwork, not one of the
 * competing destinations for money.
 */
const PHASE_SLOT: Record<PhaseId, number | 'neutral'> = {
  budget: 'neutral',
  emergency: 7,
  match: 3,
  debt: 2,
  retirement: 0,
  'more-retirement': 4,
  goals: 6,
};

function phaseColor(phase: PhaseId, theme: ChartTheme): string {
  const slot = PHASE_SLOT[phase];
  return slot === 'neutral' ? theme.textSecondary : theme.series[slot];
}

interface DrawnEdge {
  key: string;
  points: string;
  label?: 'Yes' | 'No';
  labelAt?: { x: number; y: number };
}

/** How far below a box an elbow turns, in px. */
const ELBOW_INSET = 16;

/**
 * The spending flowchart: boxes on a grid, arrows drawn between them.
 *
 * The arrows are measured from the laid-out boxes rather than positioned by
 * hand, so they stay attached however the text wraps — which changes with the
 * window width, the font, and any wording edited later.
 */
export function SpendingFlowchart() {
  const theme = useChartTheme();
  const wrap = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, HTMLDivElement>());
  const [drawn, setDrawn] = useState<DrawnEdge[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const register = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) boxes.current.set(id, el);
    else boxes.current.delete(id);
  }, []);

  const measure = useCallback(() => {
    const container = wrap.current;
    if (!container) return;
    const origin = container.getBoundingClientRect();

    const rectOf = (id: string) => {
      const el = boxes.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left - origin.left,
        right: r.right - origin.left,
        top: r.top - origin.top,
        bottom: r.bottom - origin.top,
        cx: r.left - origin.left + r.width / 2,
        cy: r.top - origin.top + r.height / 2,
      };
    };

    const next: DrawnEdge[] = [];
    for (const edge of edges()) {
      const a = rectOf(edge.from);
      const b = rectOf(edge.to);
      const from = LAYOUT[edge.from];
      const to = LAYOUT[edge.to];
      if (!a || !b || !from || !to) continue;

      let points: string;
      let labelAt: { x: number; y: number };

      if (from.row === to.row) {
        // Level with each other: a straight horizontal hop. This is what the
        // loops back to a question become, rather than a curve up the page.
        const goingRight = to.col > from.col;
        const x1 = goingRight ? a.right : a.left;
        const x2 = goingRight ? b.left : b.right;
        points = `${x1},${a.cy} ${x2},${b.cy}`;
        labelAt = { x: (x1 + x2) / 2, y: a.cy - 7 };
      } else if (from.col === to.col) {
        points = `${a.cx},${a.bottom} ${b.cx},${b.top}`;
        labelAt = { x: a.cx + 14, y: (a.bottom + b.top) / 2 + 4 };
      } else {
        // Changing column: down out of the box, across, then down into the
        // target, so an arrow never cuts diagonally over a card.
        const turn = a.bottom + ELBOW_INSET;
        points = `${a.cx},${a.bottom} ${a.cx},${turn} ${b.cx},${turn} ${b.cx},${b.top}`;
        labelAt = { x: (a.cx + b.cx) / 2, y: turn - 7 };
      }

      next.push({ key: `${edge.from}->${edge.to}`, points, label: edge.label, labelAt });
    }

    setDrawn(next);
    setSize({ w: container.offsetWidth, h: container.offsetHeight });
  }, []);

  useLayoutEffect(() => {
    measure();
    const container = wrap.current;
    if (!container) return;
    // Every arrow is anchored to a box, and the boxes reflow with the window.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const el of boxes.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [measure, theme]);

  // One heading per phase, on the row its first node occupies.
  const phaseRows = useMemo(() => {
    const seen = new Set<PhaseId>();
    const out: { row: number; phase: PhaseId }[] = [];
    for (const node of FLOW) {
      if (seen.has(node.phase)) continue;
      seen.add(node.phase);
      const at = LAYOUT[node.id];
      if (at) out.push({ row: at.row, phase: node.phase });
    }
    return out;
  }, []);

  return (
    <div className="tool flowchart">
      <p className="tool-note">
        A general order of operations for money left after each payday. Work down it: everything
        above a step is worth doing before anything below it.
      </p>

      <div className="flow-scroll">
        <div className="flow-graph" ref={wrap}>
          <svg
            className="flow-edges"
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w} ${size.h}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="flow-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill={theme.axis} />
              </marker>
            </defs>
            {drawn.map((edge) => (
              <g key={edge.key}>
                <polyline
                  points={edge.points}
                  fill="none"
                  stroke={theme.axis}
                  strokeWidth="1.5"
                  markerEnd="url(#flow-arrow)"
                />
                {edge.label && edge.labelAt && (
                  <text
                    x={edge.labelAt.x}
                    y={edge.labelAt.y}
                    className="flow-edge-label"
                    fill={theme.textSecondary}
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            ))}
          </svg>

          {phaseRows.map(({ row, phase }) => {
            const meta = PHASES.find((p) => p.id === phase);
            if (!meta) return null;
            return (
              <h3
                key={phase}
                className="flow-phase"
                style={{ gridRow: row + 1, borderColor: phaseColor(phase, theme) }}
              >
                <span className="flow-chip" style={badgeColors(phaseColor(phase, theme))}>
                  {meta.step}
                </span>
                {meta.label}
              </h3>
            );
          })}

          {FLOW.map((node) => {
            const at = LAYOUT[node.id];
            if (!at) return null;
            return (
              <FlowBox
                key={node.id}
                node={node}
                color={phaseColor(node.phase, theme)}
                col={at.col}
                row={at.row}
                register={register}
              />
            );
          })}
        </div>
      </div>

      <p className="tool-note">
        A supplemental guide, not advice — there are circumstances where you should do something
        else. Snowball against avalanche, TFSA against RRSP: the point of each decision is that it
        depends on you. Based on a flowchart by <span className="flow-cite">/u/atlasvoid</span>,
        itself based on one by <span className="flow-cite">/u/beached89</span>.
      </p>
    </div>
  );
}

function FlowBox({
  node,
  color,
  col,
  row,
  register,
}: {
  node: FlowNode;
  color: string;
  col: 0 | 1;
  row: number;
  register: (id: string, el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={(el) => register(node.id, el)}
      className={`flow-node ${node.kind}`}
      style={
        {
          // +2: the first grid column is the phase gutter.
          gridColumn: col + 2,
          gridRow: row + 1,
          '--flow-color': color,
        } as React.CSSProperties
      }
    >
      <p className="flow-title">{node.title}</p>
      {node.detail && <p className="flow-detail">{node.detail}</p>}
    </div>
  );
}
