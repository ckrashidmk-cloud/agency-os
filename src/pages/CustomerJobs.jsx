import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FilePlus2, Paperclip, Plus, UploadCloud } from "lucide-react";
import { customerPortalService } from "@/lib/customerPortalService";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY_FORM = {
  title: "",
  service_id: "",
  service_type: "",
  description: "",
  budget_amount: "",
  deadline: "",
};

const STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  quoted: "Quote ready",
  quote_declined: "Quote declined",
  approved: "Approved",
  in_progress: "In progress",
  delivered: "Delivered",
  changes_requested: "Changes requested",
  completed: "Completed",
  reviewed: "Reviewed",
};

function statusStyle(status) {
  if (["completed", "reviewed"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (["in_progress", "approved"].includes(status)) return "bg-blue-100 text-blue-800";
  if (["quoted", "delivered", "changes_requested"].includes(status)) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function formatCurrency(value, currency) {
  if (value === "" || value === null || value === undefined) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "INR", maximumFractionDigits: 2 }).format(Number(value));
}

export default function CustomerJobs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [currency, setCurrency] = useState("INR");
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobRows, serviceRows, clientProfile] = await Promise.all([
        customerPortalService.listJobs(),
        customerPortalService.listServices(),
        customerPortalService.listClientProfile(user.client_record_id),
      ]);
      setJobs(jobRows);
      setServices(serviceRows);
      setCurrency(clientProfile?.currency || "INR");
    } catch (error) {
      toast({ title: "Could not load your jobs", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.client_record_id]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setFiles([]);
    setDialogOpen(true);
  };

  const openEdit = (job) => {
    setEditingJob(job);
    setForm({
      title: job.title || "",
      service_id: job.service_id || (job.service_type ? "__other__" : ""),
      service_type: job.service_type || "",
      description: job.description || "",
      budget_amount: job.budget_amount ?? "",
      deadline: job.deadline || "",
    });
    setFiles([]);
    setDialogOpen(true);
  };

  const updateService = (serviceId) => {
    if (serviceId === "__other__") {
      setForm((current) => ({ ...current, service_id: "", service_type: "other" }));
      return;
    }
    const service = services.find((item) => item.id === serviceId);
    setForm((current) => ({ ...current, service_id: serviceId, service_type: service?.name || "" }));
  };

  const save = async (event, submitRequest) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Add a job title", description: "A title is required to save a request." });
      return;
    }
    if (submitRequest && !form.service_type.trim()) {
      toast({ title: "Choose a service type", description: "Select a service before submitting your request." });
      return;
    }
    if (submitRequest && !form.description.trim()) {
      toast({ title: "Add a description", description: "Describe the work before submitting your request." });
      return;
    }
    if (files.some((file) => file.size > 20 * 1024 * 1024) || files.length > 10) {
      toast({ title: "Attachment limit exceeded", description: "Choose up to 10 files, each no larger than 20 MB." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        service_id: form.service_id === "__other__" ? "" : form.service_id || "",
        service_type: form.service_type.trim(),
        description: form.description.trim(),
        budget_amount: form.budget_amount === "" ? null : Number(form.budget_amount),
        deadline: form.deadline || "",
        ...(submitRequest ? { status: "submitted" } : { status: editingJob?.status || "draft" }),
      };
      let job = editingJob;
      if (job) {
        job = await customerPortalService.updateJob(job.id, payload);
      } else {
        job = await customerPortalService.createJob({
          ...payload,
          client_id: user.client_record_id,
          created_by: user.id,
          status: "draft",
          attachments: [],
          quote_decision: "pending",
        });
      }

      const addedFiles = [];
      for (const file of files) {
        addedFiles.push(await customerPortalService.uploadPrivateFile(file, job.id, user.id));
      }
      if (addedFiles.length || submitRequest) {
        job = await customerPortalService.updateJob(job.id, {
          attachments: [...(job.attachments || []), ...addedFiles],
          ...(submitRequest ? { status: "submitted" } : {}),
        });
      }
      toast({ title: submitRequest ? "Job request submitted" : "Draft saved" });
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast({
        title: "Could not save your job request",
        description: error.message || "Please retry. Your draft may already have been saved.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Submit requests and follow their progress.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />New job request</Button>
      </header>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground" role="status">Loading your jobs…</div>
      ) : jobs.length ? (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const budget = formatCurrency(job.budget_amount, job.currency);
            return (
              <article key={job.id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/portal/jobs/${encodeURIComponent(job.id)}`} className="text-lg font-semibold hover:text-primary hover:underline">{job.title || "Untitled job"}</Link>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(job.status)}`}>{job.status === "quoted" && job.quote_decision === "accepted" ? "Quote accepted" : STATUS_LABELS[job.status] || job.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{job.service_type || "Service not selected"}{job.deadline ? ` · Due ${new Date(`${job.deadline}T00:00:00`).toLocaleDateString()}` : ""}</p>
                  </div>
                  {job.status === "draft" || job.status === "submitted" ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => openEdit(job)}>Edit request</Button>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  {budget && <span>Budget: {budget}</span>}
                  <span>{(job.attachments || []).length} attachment{(job.attachments || []).length === 1 ? "" : "s"}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-white px-6 py-14 text-center">
          <FilePlus2 className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
          <h2 className="mt-4 font-semibold">No job requests yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create a draft or send your first request to the agency.</p>
          <Button className="mt-5" onClick={openNew}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Create request</Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingJob ? "Edit job request" : "New job request"}</DialogTitle></DialogHeader>
          <form onSubmit={(event) => save(event, false)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="job-title">Job title *</Label>
              <Input id="job-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={200} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Service type</Label>
                <Select value={form.service_id} onValueChange={updateService}>
                  <SelectTrigger><SelectValue placeholder="Choose a service" /></SelectTrigger>
                  <SelectContent>
                    {services.map((service) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}
                    <SelectItem value="__other__">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-budget">Optional budget ({currency})</Label>
                <Input id="job-budget" type="number" min="0" step="0.01" value={form.budget_amount} onChange={(event) => setForm({ ...form, budget_amount: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-description">Description</Label>
              <Textarea id="job-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={10000} rows={5} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-deadline">Desired deadline</Label>
              <Input id="job-deadline" type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-files">Attachments</Label>
              <label htmlFor="job-files" className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground hover:bg-slate-50">
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                Select files (up to 10, 20 MB each)
              </label>
              <Input id="job-files" type="file" multiple className="sr-only" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
              {files.length > 0 && <p className="text-xs text-muted-foreground">{files.map((file) => file.name).join(", ")}</p>}
              {editingJob?.attachments?.length > 0 && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3 w-3" aria-hidden="true" />Existing attachments will be kept.</p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="secondary" disabled={saving}>{saving ? "Saving..." : "Save draft"}</Button>
              <Button type="button" onClick={(event) => save(event, true)} disabled={saving}>{saving ? "Submitting..." : "Submit request"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
