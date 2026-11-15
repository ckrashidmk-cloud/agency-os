import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";


import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import ProposalDialog from "@/components/proposals/ProposalDialog";
import { StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Plus, FileText, ArrowRightCircle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";



export default function Proposals() {
  const lookups = useLookups();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setProposals(await db.entities.Proposal.list("-created_date", 200));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (p) => { setEditing(p); setDialogOpen(true); };

  const convertToProject = async (p) => {
    if (!confirm(`Convert "${p.title}" into an active project?`)) return;
    try {
      await db.entities.Project.create({
        name: p.title,
        client_id: p.client_id,
        description: p.scope || "",
        budget: p.value || 0,
        status: "active",
        start_date: new Date().toISOString().slice(0, 10),
      });
      await db.entities.Proposal.update(p.id, { status: "converted" });
      load();
    } catch (e) {
      console.error(e);
      alert("Failed to convert proposal");
    }
  };

  return (
    <div>
      <PageHeader
        title="Proposals"
        description="Build proposals and convert approved ones to projects"
        action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New Proposal</Button>}
      />

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proposals.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl border p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <StatusBadge status={p.status} />
              </div>
              <h3 className="mt-3 cursor-pointer font-heading font-semibold hover:text-primary" onClick={() => openEdit(p)}>{p.title}</h3>
              <p className="text-sm text-muted-foreground">{lookups.clientMap[p.client_id]?.company_name || "—"}</p>
              {p.scope && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.scope}</p>}
              <div className="mt-3 flex items-center justify-between">
                <span className="font-heading text-lg font-bold">{formatCurrency(p.value)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(p.created_date)}</span>
              </div>
              <div className="mt-4">
                {p.status === "approved" && (
                  <Button size="sm" className="w-full" onClick={() => convertToProject(p)}>
                    <ArrowRightCircle className="mr-2 h-4 w-4" /> Convert to Project
                  </Button>
                )}
                {p.status !== "approved" && p.status !== "converted" && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => openEdit(p)}>Edit</Button>
                )}
                {p.status === "converted" && (
                  <p className="text-center text-xs font-medium text-emerald-600">✓ Converted to project</p>
                )}
              </div>
            </div>
          ))}
          {proposals.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground col-span-full">No proposals yet</p>
          )}
        </div>
      )}

      <ProposalDialog open={dialogOpen} onOpenChange={setDialogOpen} proposal={editing} lookups={lookups} onSaved={load} />
    </div>
  );
}