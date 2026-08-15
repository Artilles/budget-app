import { useBudget } from '../store/useBudget';
import { TOOLS, findTool } from '../tools/registry';

export function ToolsView() {
  const selectedTool = useBudget((s) => s.selectedTool);
  const selectTool = useBudget((s) => s.selectTool);
  const tool = findTool(selectedTool);

  if (tool) {
    const { Component } = tool;
    return (
      <div className="overview-view">
        <div className="tool-header">
          <button className="link-btn" onClick={() => selectTool(null)}>
            ← All tools
          </button>
          <div>
            <h2 className="tool-title">{tool.name}</h2>
            <p className="tool-summary">{tool.summary}</p>
          </div>
        </div>
        <Component />
      </div>
    );
  }

  return (
    <div className="overview-view">
      <div className="tool-index">
        {TOOLS.map((t) => (
          <button key={t.id} className="tool-card" onClick={() => selectTool(t.id)}>
            <span className="tool-card-name">{t.name}</span>
            <span className="tool-card-summary">{t.summary}</span>
          </button>
        ))}
      </div>
      <p className="grid-hint">
        Small calculators that sit alongside the budget. Anything you type is saved with your
        budget file, and tools that need spending or income figures read them from your years
        rather than asking you to retype them.
      </p>
    </div>
  );
}
