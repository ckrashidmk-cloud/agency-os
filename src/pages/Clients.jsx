import { db } from "@/lib/dataClient";
import React, { useEffect, useState, useCallback } from "react";

import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import ClientDialog from "@/components/clients/ClientDialog";
import { StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Plus, Search, Briefcase, Mail, Phone, MessageCircle, DollarSign,
  Globe, Trash2, Building2,
} from "lucide-react";
import { PLATFORM_MAP } from "@/components/content/platforms";
import { useToast } from "@/components/ui/use-toast";



const BUDGET_LABELS = { none: "", monthly: "Monthly", project: "Project", hourly: "Hourly" };

export default function Clients() {
  const { toast } = useToast();
  const lookups = useLookups();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const list = await db.entities.Client.list("-created_date", 200);
      setClients(Array.isArray(list) ? list : []);
    } catch (e) { console.error("Clients load:", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = clients.filter(c => {
    const name = (c.company_name || c.name || "").toLowerCase();
    const contact = (c.contact_person || "").toLowerCase();
    const term = search.toLowerCase();
    if (term && !name.includes(term) && !contact.includes(term)) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (c) => { setEditing(c); setDialogOpen(true); };

  const handleSave = async (formData) => {
    try {
      let saved;
      if (editing?.id) {
        saved = await db.entities.Client.update(editing.id, formData);
      } else {
        saved = await db.entities.Client.create(formData);
      }
      await load();
      return saved;
    } catch (e) {
      console.error("Client save error:", e);
      throw e;
    }
  };

  const handleDelete = async (e, clientId) => {
    e.stopPropagation();
    if (!confirm("Delete this client?")) return;
    try {
      await db.entities.Client.delete(clientId);
      await load();
    } catch (err) {
      toast({ title: "Could not delete client", description: err.message || "Please retry.", variant: "destructive" });
    }
  };

  const stats = {
    total: clients.length,
    active: clients.filter(c => c.status === "active").length,
    leads: clients.filter(c => c.status === "lead").length,
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage your client relationships"
        action={
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> New Client
          </Button>
        }
      />

      {/* Quick stats */}
      <div className="mb-6 flex gap-4">
        <div className="rounded-lg border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total:</span> <span className="font-semibold">{stats.total}</span>
        </div>
        <div className="rounded-lg border bg-card px-4 py-2 text-sm">
          <span className="text-emerald-500">Active:</span> <span className="font-semibold">{stats.active}</span>
        </div>
        <div className="rounded-lg border bg-card px-4 py-2 text-sm">
          <span className="text-blue-500">Leads:</span> <span className="font-semibold">{stats.leads}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="churned">Churned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Client cards */}
      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">Loading…</div>
      ) : filtered.length === 0 && clients.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-20">
          <Building2 className="h-10 w-10 text-muted-foreground/40" />
          <div className="text-center">
            <p className="font-medium">No clients yet</p>
            <p className="text-sm text-muted-foreground">Add your first client to get started</p>
          </div>
          <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />New Client</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => {
            const projectCount = (lookups.projects || []).filter(p => p.client_id === c.id).length;
            const budgetLabel = BUDGET_LABELS[c.budget_type] || "";
            return (
              <div
                key={c.id}
                className="group relative cursor-pointer rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
                onClick={() => openEdit(c)}
              >
                {/* Delete button on hover */}
                <button
                  onClick={(e) => handleDelete(e, c.id)}
                  className="absolute top-3 right-3 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950 transition-colors"
                  title="Delete client"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                {/* Header */}
                <div className="flex items-start justify-between">
                  {c.logo_url
                    ? <img src={c.logo_url} alt={`${c.company_name || c.name} logo`} className="h-10 w-10 rounded-lg object-cover" />
                    : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Briefcase className="h-5 w-5 text-primary" /></div>}
                  <StatusBadge status={c.status} />
                </div>

                {/* Name */}
                <h3 className="mt-3 font-heading font-semibold">{c.company_name || c.name || "Unnamed"}</h3>
                {c.contact_person && (
                  <p className="text-sm text-muted-foreground">{c.contact_person}</p>
                )}

                {/* Industry badge */}
                {c.industry && (
                  <span className="mt-2 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                    {c.industry}
                  </span>
                )}

                {/* Contact info */}
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {c.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {c.email}</p>}
                  {c.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {c.phone}</p>}
                  {c.whatsapp_number && <p className="flex items-center gap-1.5"><MessageCircle className="h-3 w-3" /> {c.whatsapp_number}</p>}
                  {c.website && <p className="flex items-center gap-1.5"><Globe className="h-3 w-3" /> {c.website}</p>}
                  {c.account_manager_id && <p>Account manager: {lookups.userMap[c.account_manager_id]?.full_name || lookups.userMap[c.account_manager_id]?.email || "Assigned"}</p>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Number(c.monthly_content_target) > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{c.monthly_content_target} posts / month</span>}
                  {(Array.isArray(c.supported_platforms) ? c.supported_platforms : []).map((platform) => (
                    <span key={platform} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{PLATFORM_MAP[platform]?.label || platform}</span>
                  ))}
                </div>

                {/* Footer — budget + projects */}
                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                  <span className="text-muted-foreground">{projectCount} project{projectCount !== 1 ? "s" : ""}</span>
                  {budgetLabel && c.budget_amount ? (
                    <span className="flex items-center gap-1 font-medium text-emerald-500">
                      <DollarSign className="h-3 w-3" />
                      {Number(c.budget_amount).toLocaleString()} {budgetLabel}
                    </span>
                  ) : budgetLabel ? (
                    <span className="text-muted-foreground">{budgetLabel}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground col-span-full">No clients match your search</p>
          )}
        </div>
      )}

      <ClientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        client={editing}
        users={lookups.users}
        onSave={handleSave}
        showCustomerInvitations
      />
    </div>
  );
}