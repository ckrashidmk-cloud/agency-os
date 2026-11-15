import { db } from "@/lib/dataClient";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactFlow, {
  Background, Controls, MiniMap, ReactFlowProvider,
  useNodesState, useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";

import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import WorkflowStageNode from "@/components/workflows/WorkflowStageNode";
import { STAGE_TEMPLATES, STAGE_COLORS } from "@/components/workflows/StageTemplates";
import StageProgress from "@/components/workflows/StageProgress";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, ArrowLeft, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";



const nodeTypes = { stageNode: WorkflowStageNode };

function BuilderCanvas({ stages, setStages, lookups, workflow }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);

  useEffect(() => {
    const newNodes = stages.map((stage, i) => ({
      id: stage.id || `temp-${i}`,
      type: "stageNode",
      position: { x: 40 + i * 300, y: 100 },
      data: { stage: { ...stage, order_index: i } },
    }));
    const newEdges = newNodes.slice(0, -1).map((node, i) => ({
      id: `e-${node.id}-${newNodes[i + 1].id}`,
      source: node.id,
      target: newNodes[i + 1].id,
      type: "smoothstep",
      animated: true,
      style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
    }));
    setNodes(newNodes);
    setEdges(newEdges);
  }, [stages, setNodes, setEdges]);

  const onNodeClick = useCallback((_, node) => {
    const idx = stages.findIndex((s, i) => (s.id || `temp-${i}`) === node.id);
    if (idx >= 0) setSelectedIdx(idx);
  }, [stages]);

  const updateStage = (idx, field, value) => {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const deleteStage = (idx) => {
    setStages((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const addStage = (template) => {
    setStages((prev) => [...prev, {
      stage_name: template?.stage_name || "New Stage",
      description: template?.description || "",
      color: template?.color || STAGE_COLORS[prev.length % STAGE_COLORS.length],
      order_index: prev.length,
      requires_approval_from_role: "none",
      auto_assign_to: "",
    }]);
  };

  const moveStage = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= stages.length) return;
    setStages((prev) => {
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
    setSelectedIdx(newIdx);
  };

  return (
    <div className="space-y-4">
    <div className="flex flex-col gap-4 lg:flex-row">
      <div
        className="flex-1 rounded-xl border border-border bg-card/50"
        style={{ height: "calc(100vh - 280px)", minHeight: "400px" }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="hsl(var(--border))" gap={20} />
          <Controls showInteractive={false} className="!bg-card !border !border-border !rounded-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent" />
          <MiniMap
            className="!bg-card !border !border-border !rounded-lg"
            nodeColor={() => "hsl(var(--primary))"}
            maskColor="hsl(var(--background) / 0.7)"
          />
        </ReactFlow>
      </div>

      <div className="w-full space-y-4 lg:w-72">
        <Button onClick={() => addStage()} className="w-full">
          <Plus className="mr-2 h-4 w-4" /> Add Blank Stage
        </Button>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Quick Add:</p>
          <div className="flex flex-wrap gap-1.5">
            {STAGE_TEMPLATES.map((t) => (
              <button
                key={t.stage_name}
                onClick={() => addStage(t)}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors hover:bg-accent"
                style={{ borderLeftWidth: 3, borderLeftColor: t.color }}
              >
                {t.stage_name}
              </button>
            ))}
          </div>
        </div>

        {selectedIdx !== null && stages[selectedIdx] ? (
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <h4 className="font-heading text-sm font-semibold">Edit Stage {selectedIdx + 1}</h4>
            <div className="space-y-2">
              <Label>Stage Name</Label>
              <Input
                value={stages[selectedIdx].stage_name}
                onChange={(e) => updateStage(selectedIdx, "stage_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={stages[selectedIdx].description || ""}
                onChange={(e) => updateStage(selectedIdx, "description", e.target.value)}
                placeholder="What happens at this stage?"
              />
            </div>
            <div className="space-y-2">
              <Label>Stage Color</Label>
              <div className="flex flex-wrap gap-2">
                {STAGE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 ${(stages[selectedIdx].color || "#6366f1") === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => updateStage(selectedIdx, "color", c)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Approval Gate</Label>
              <Select
                value={stages[selectedIdx].requires_approval_from_role || "none"}
                onValueChange={(v) => updateStage(selectedIdx, "requires_approval_from_role", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No approval needed</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Auto-assign To</Label>
              <Select
                value={stages[selectedIdx].auto_assign_to || "none"}
                onValueChange={(v) => updateStage(selectedIdx, "auto_assign_to", v === "none" ? "" : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No auto-assign</SelectItem>
                  {lookups.users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => moveStage(selectedIdx, -1)} disabled={selectedIdx === 0}>
                <ArrowUp className="mr-1 h-3 w-3" /> Up
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => moveStage(selectedIdx, 1)} disabled={selectedIdx === stages.length - 1}>
                <ArrowDown className="mr-1 h-3 w-3" /> Down
              </Button>
            </div>
            <Button variant="destructive" size="sm" className="w-full" onClick={() => deleteStage(selectedIdx)}>
              <Trash2 className="mr-2 h-3 w-3" /> Delete Stage
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            Click a stage node to edit its properties, or add a new stage.
          </div>
        )}
      </div>
    </div>

      {workflow && <StageProgress stages={stages} />}
    </div>
  );
}

export default function WorkflowBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const lookups = useLookups();
  const { toast } = useToast();
  const [workflow, setWorkflow] = useState(null);
  const [stages, setStages] = useState([]);
  const [originalStageIds, setOriginalStageIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const wf = await db.entities.Workflow.get(id);
        setWorkflow(wf);
        const result = await db.entities.WorkflowStage.filter(
          { workflow_id: id },
          { sort: "order_index", limit: 200 }
        );
        const loadedStages = result.items || [];
        setStages(loadedStages);
        setOriginalStageIds(loadedStages.map((stage) => stage.id).filter(Boolean));
      } catch (e) {
        console.error(e);
        toast({ title: "Could not load workflow", description: e.message || "Please try again.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [id, toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const savedStages = [];
      for (const [index, stage] of stages.entries()) {
        const stageData = {
          workflow_id: id,
          stage_name: stage.stage_name?.trim() || `Stage ${index + 1}`,
          description: stage.description || "",
          color: stage.color || "#6366f1",
          order_index: index,
          requires_approval_from_role: stage.requires_approval_from_role || "none",
          auto_assign_to: stage.auto_assign_to || "",
        };
        if (stage.id) {
          await db.entities.WorkflowStage.update(stage.id, stageData);
          savedStages.push({ ...stage, ...stageData });
        } else {
          const created = await db.entities.WorkflowStage.create(stageData);
          savedStages.push({ ...stage, ...stageData, ...created });
        }
      }

      const retainedIds = new Set(savedStages.map((stage) => stage.id).filter(Boolean));
      const removedIds = originalStageIds.filter((stageId) => !retainedIds.has(stageId));
      if (removedIds.length) {
        await db.entities.Task.updateMany(
          { workflow_stage_id: { $in: removedIds } },
          { workflow_stage_id: "" },
        );
        for (const stageId of removedIds) {
          await db.entities.WorkflowStage.delete(stageId);
        }
      }

      setStages(savedStages);
      setOriginalStageIds(savedStages.map((stage) => stage.id).filter(Boolean));
      toast({ title: "Workflow saved", description: "Your pipeline stages have been updated." });
      navigate("/workflows");
    } catch (e) {
      console.error(e);
      toast({ title: "Could not save workflow", description: e.message || "Your changes were not fully saved. Please review and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!workflow) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Workflow not found</div>;
  }

  return (
    <div>
      <PageHeader
        title={workflow.name}
        description={`${workflow.applies_to_module} pipeline · ${stages.length} stages`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/workflows")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save Pipeline"}
            </Button>
          </div>
        }
      />
      <ReactFlowProvider>
        <BuilderCanvas stages={stages} setStages={setStages} lookups={lookups} workflow={workflow} />
      </ReactFlowProvider>
    </div>
  );
}