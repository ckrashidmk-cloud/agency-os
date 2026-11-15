import React, { memo } from "react";
import { Handle, Position } from "reactflow";

const WorkflowStageNode = memo(({ data }) => {
  const stage = data.stage || data;

  return (
    <div className="w-52 rounded-xl border bg-card shadow-md">
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="rounded-t-xl px-3 py-2" style={{ backgroundColor: stage.color || "#6366f1" }}>
        <span className="text-xs font-bold uppercase tracking-wide text-white">{stage.stage_name || "Stage"}</span>
      </div>
      <div className="space-y-1 p-3">
        {stage.description && <p className="line-clamp-2 text-xs text-muted-foreground">{stage.description}</p>}
        {stage.requires_approval_from_role && stage.requires_approval_from_role !== "none" && (
          <p className="text-xs text-amber-500">Approval: {stage.requires_approval_from_role}</p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
});

WorkflowStageNode.displayName = "WorkflowStageNode";
export default WorkflowStageNode;
