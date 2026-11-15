import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";


import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";
import WorkflowDialog from "@/components/workflows/WorkflowDialog";
import { Button } from "@/components/ui/button";
import { Plus, Layers, ArrowRight } from "lucide-react";



const MODULE_LABELS = {
  tasks: "Tasks", invoices: "Invoices", payroll: "Payroll", proposals: "Proposals",
};

export default function Workflows() {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState([]);
  const [stageCounts, setStageCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [wfs, allStages] = await Promise.all([
        db.entities.Workflow.list("-created_date", 200),
        db.entities.WorkflowStage.list("order_index", 500),
      ]);
      setWorkflows(wfs);
      const counts = {};
      allStages.forEach((s) => {
        counts[s.workflow_id] = (counts[s.workflow_id] || 0) + 1;
      });
      setStageCounts(counts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (wf, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await db.entities.Workflow.update(wf.id, { is_active: !wf.is_active });
      load();
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Custom pipelines, approval gates, and automated handoffs"
        action={<Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> New Workflow</Button>}
      />

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((wf) => (
            <Link
              key={wf.id}
              to={`/workflows/${wf.id}`}
              className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-heading font-semibold group-hover:text-primary">{wf.name}</h3>
                  <span className="text-xs capitalize text-muted-foreground">{MODULE_LABELS[wf.applies_to_module] || wf.applies_to_module}</span>
                </div>
                <button
                  onClick={(e) => toggleActive(wf, e)}
                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                    wf.is_active
                      ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {wf.is_active ? "Active" : "Inactive"}
                </button>
              </div>
              {wf.description && (
                <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{wf.description}</p>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  {stageCounts[wf.id] || 0} stages
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </div>
            </Link>
          ))}
          {workflows.length === 0 && (
            <div className="col-span-full rounded-xl border p-12 text-center text-muted-foreground">
              No workflows yet. Create your first pipeline to get started.
            </div>
          )}
        </div>
      )}

      <WorkflowDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} user={user} />
    </div>
  );
}