import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import ClientDialog from "@/components/clients/ClientDialog";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/format";

const STATUSES = ["draft", "sent", "viewed", "paid", "overdue", "cancelled"];
const BILLING_BASES = [
  { value: "project", label: "Project-based" },
  { value: "task", label: "Task-based" },
  { value: "hourly", label: "Hourly" },
  { value: "retainer", label: "Retainer" },
  { value: "other", label: "Other" },
];
const NO_SELECTION = "__none__";
const ADD_CLIENT = "__add_client__";

const makeItem = (item = {}) => ({
  description: item.description || "",
  quantity: item.quantity ?? 1,
  rate: item.rate ?? 0,
  amount: item.amount ?? (Number(item.quantity ?? 1) * Number(item.rate ?? 0)),
});

const makeInvoiceNumber = () => `INV-${Date.now().toString().slice(-6)}`;

export default function InvoiceDialog({
  open,
  onOpenChange,
  invoice,
  lookups = {},
  onSave,
  onCreateClient,
}) {
  const { toast } = useToast();
  const clients = lookups.clients || [];
  const projects = lookups.projects || [];
  const [localClients, setLocalClients] = useState(clients);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    invoice_number: makeInvoiceNumber(),
    client_id: "",
    project_id: "",
    task_id: "",
    billing_basis: "project",
    status: "draft",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    items: [makeItem()],
    notes: "",
  });

  useEffect(() => {
    setLocalClients(clients);
  }, [clients]);

  useEffect(() => {
    if (!open) return;
    setForm(invoice ? {
      invoice_number: invoice.invoice_number || makeInvoiceNumber(),
      client_id: invoice.client_id || "",
      project_id: invoice.project_id || "",
      task_id: invoice.task_id || "",
      billing_basis: invoice.billing_basis || "project",
      status: invoice.status || "draft",
      issue_date: invoice.issue_date || "",
      due_date: invoice.due_date || "",
      items: invoice.items?.length ? invoice.items.map(makeItem) : [makeItem({ description: invoice.notes, rate: invoice.total_amount })],
      notes: invoice.notes || "",
    } : {
      invoice_number: makeInvoiceNumber(),
      client_id: "",
      project_id: "",
      task_id: "",
      billing_basis: "project",
      status: "draft",
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      items: [makeItem()],
      notes: "",
    });
  }, [invoice, open]);

  const tasks = lookups.tasks || [];
  const availableTasks = useMemo(() => tasks.filter((task) => {
    if (form.project_id) return task.project_id === form.project_id;
    if (!form.client_id) return true;
    const project = projects.find((item) => item.id === task.project_id);
    return project?.client_id === form.client_id;
  }), [tasks, projects, form.project_id, form.client_id]);
  const totalAmount = form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index
        ? { ...item, [key]: value }
        : item),
    }));
  };

  const handleBillingBaseChange = (billingBasis) => {
    setForm((current) => ({
      ...current,
      billing_basis: billingBasis,
      project_id: "",
      task_id: "",
      items: [makeItem()],
    }));
  };

  const handleProjectChange = (projectId) => {
    const project = projects.find((item) => item.id === projectId);
    setForm((current) => ({
      ...current,
      project_id: projectId,
      task_id: "",
      client_id: project?.client_id || current.client_id,
      items: current.items.map((item, index) => index === 0 && !item.description && project
        ? { ...item, description: project.name }
        : item),
    }));
  };

  const handleTaskChange = (taskId) => {
    const task = tasks.find((item) => item.id === taskId);
    const project = projects.find((item) => item.id === task?.project_id);
    setForm((current) => ({
      ...current,
      task_id: taskId,
      project_id: task?.project_id || "",
      client_id: project?.client_id || current.client_id,
      items: current.items.map((item, index) => index === 0 && task
        ? { ...item, description: item.description || task.title }
        : item),
    }));
  };

  const handleClientChange = (clientId) => {
    if (clientId === ADD_CLIENT) {
      setClientDialogOpen(true);
      return;
    }
    const selectedClient = localClients.find((client) => client.id === clientId);
    setForm((current) => ({
      ...current,
      client_id: clientId === NO_SELECTION ? "" : clientId,
      project_id: current.project_id && projects.some((project) => project.id === current.project_id && project.client_id === selectedClient?.id)
        ? current.project_id
        : "",
      task_id: "",
    }));
  };

  const handleAddClient = async (clientData) => {
    if (!onCreateClient) throw new Error("Client creation is not available.");
    const client = await onCreateClient(clientData);
    setLocalClients((current) => [...current.filter((item) => item.id !== client.id), client]);
    set("client_id", client.id);
  };

  const handleSave = async () => {
    const items = form.items.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity || 0),
      rate: Number(item.rate || 0),
      amount: Number(item.quantity || 0) * Number(item.rate || 0),
    }));
    if (!form.invoice_number.trim() || !items.length || items.some((item) => !item.description) || totalAmount <= 0 || saving) return;

    setSaving(true);
    try {
      await onSave({
        invoice_number: form.invoice_number.trim(),
        client_id: form.client_id || undefined,
        project_id: form.project_id || undefined,
        task_id: form.task_id || undefined,
        billing_basis: form.billing_basis,
        status: form.status,
        issue_date: form.issue_date || undefined,
        due_date: form.due_date || undefined,
        items,
        total_amount: items.reduce((sum, item) => sum + item.amount, 0),
        notes: form.notes,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Invoice save error:", error);
      toast({ title: "Could not save invoice", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{invoice ? "Edit Invoice" : "New Invoice"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Invoice # *</Label><Input value={form.invoice_number} onChange={(event) => set("invoice_number", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => set("status", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((status) => <SelectItem key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5"><Label>Client <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Select value={form.client_id || NO_SELECTION} onValueChange={handleClientChange}>
                <SelectTrigger><SelectValue placeholder="No client selected" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>Create without a client</SelectItem>
                  {localClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.company_name || client.name || client.email}</SelectItem>
                  ))}
                  <SelectItem value={ADD_CLIENT}>+ Add a new client…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Billing basis</Label>
              <Select value={form.billing_basis} onValueChange={handleBillingBaseChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BILLING_BASES.map((basis) => <SelectItem key={basis.value} value={basis.value}>{basis.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.billing_basis === "project" && (
              <div className="grid gap-1.5"><Label>Project</Label>
                <Select value={form.project_id || NO_SELECTION} onValueChange={(value) => handleProjectChange(value === NO_SELECTION ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Select a project (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>No project</SelectItem>
                    {projects
                      .filter((project) => !form.client_id || project.client_id === form.client_id)
                      .map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.billing_basis === "task" && (
              <div className="grid gap-1.5"><Label>Task</Label>
                <Select value={form.task_id || NO_SELECTION} onValueChange={(value) => handleTaskChange(value === NO_SELECTION ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Select a task (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>No task</SelectItem>
                    {availableTasks.map((task) => <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.billing_basis === "hourly" && (
              <div className="grid gap-1.5"><Label>Project <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Select value={form.project_id || NO_SELECTION} onValueChange={(value) => handleProjectChange(value === NO_SELECTION ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>No project</SelectItem>
                    {projects
                      .filter((project) => !form.client_id || project.client_id === form.client_id)
                      .map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <div className="flex items-center justify-between"><Label>Line items</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setForm((current) => ({ ...current, items: [...current.items, makeItem()] }))}>
                  <Plus className="mr-1 h-3 w-3" /> Add item
                </Button>
              </div>
              {form.items.map((item, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_5rem_7rem_auto] items-end gap-2">
                  <div className="grid gap-1"><Label className="text-xs">Description</Label><Input value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} placeholder={form.billing_basis === "hourly" ? "Work performed" : "Item description"} /></div>
                  <div className="grid gap-1"><Label className="text-xs">{form.billing_basis === "hourly" ? "Hours" : "Qty"}</Label><Input type="number" min="0" step="0.25" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} /></div>
                  <div className="grid gap-1"><Label className="text-xs">Rate</Label><Input type="number" min="0" step="0.01" value={item.rate} onChange={(event) => updateItem(index, "rate", event.target.value)} /></div>
                  <Button type="button" size="icon" variant="ghost" aria-label="Remove line item" disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <p className="text-right text-sm font-semibold">Total: {formatCurrency(totalAmount)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={(event) => set("issue_date", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={(event) => set("due_date", event.target.value)} /></div>
            </div>
            <div className="grid gap-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.invoice_number.trim() || totalAmount <= 0 || form.items.some((item) => !item.description.trim())}>
              {saving ? "Saving…" : invoice ? "Save Changes" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ClientDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        onSave={handleAddClient}
      />
    </>
  );
}
