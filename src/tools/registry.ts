import type { ToolDefinition } from './types';
import { EMERGENCY_FUND_ID, EmergencyFund } from './EmergencyFund';
import { CONTRIBUTION_ROOM_ID, ContributionRoom } from './ContributionRoom';
import { AFFORDABLE_CONTRIBUTION_ID, AffordableContribution } from './AffordableContribution';

/**
 * Every tool the app offers, in the order they appear on the index.
 *
 * To add one: write the component, give it a stable id, and append it here.
 * Nothing else needs touching — not the schema, not the store, not routing.
 * Saved inputs land under `doc.tools[id]` automatically.
 */
export const TOOLS: ToolDefinition[] = [
  {
    id: EMERGENCY_FUND_ID,
    name: 'Emergency fund',
    summary: 'How long could you live on what you have set aside?',
    Component: EmergencyFund,
  },
  {
    id: AFFORDABLE_CONTRIBUTION_ID,
    name: 'Affordable contribution',
    summary: 'How much could go into savings this year, after living costs?',
    Component: AffordableContribution,
  },
  {
    id: CONTRIBUTION_ROOM_ID,
    name: 'Contribution room',
    summary: 'How much TFSA and RRSP room is left this year?',
    Component: ContributionRoom,
  },
];

export function findTool(id: string | null): ToolDefinition | undefined {
  return id === null ? undefined : TOOLS.find((t) => t.id === id);
}
