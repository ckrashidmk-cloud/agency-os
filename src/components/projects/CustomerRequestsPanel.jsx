import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, FilePlus2 } from "lucide-react";
import { db } from "@/lib/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

const LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  quoted: "Quoted",
  quote_declined: "Quote declined",
  approved: "Approved",
  in_progress: "In progress",
  delivered: "Delivered",
  changes_requested: "Changes requested",
  completed: "Completed",
  reviewed: "Reviewed",
};

function formatCurrency(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "Not set";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "INR", maximumFractionDigits: 2 }).format(Number(amount));
}

export default function CustomerRequestsPanel({ clients = [], onProjectCreated }) {
  const { toast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quoteJob, setQuoteJob] = useState(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [savingQuote, setSavingQuote] = useState(false);
  const [creatingProjectId, setCreatingProjectId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await db.entities.JobRequest.list("-created_date", 500));
    } catch (error) {
      toast({ title: "Could not load customer job requests", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openQuote = (job) => {
    setQuoteJob(job);
    setQuoteAmount(job.quote_amount ?? "");
    setQuoteNotes(job.quote_notes || "");
  };

  const sendQuote = async (event) => {
    event.preventDefault();
    const amount = Number(quoteAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Enter a valid quote", description: "The quote must be greater than zero." });
      return;
    }
    setSavingQuote(true);
    try {
      await db.entities.JobRequest.update(quoteJob.id, {
        status: "quoted",
        quote_amount: amount,
        quote_notes: quoteNotes.trim(),
        quote_decision: "pending",
        quote_sent_at: new Date().toISOString(),
      });
      toast({ title: "Quote sent", description: "The customer can now accept or decline the quote." });
      setQuoteJob(null);
      await load();
    } catch (error) {
      toast({ title: "Could not send quote", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setSavingQuote(false);
    }
  };

  const createProject = async (job) => {
    setCreatingProjectId(job.id);
    try {
      const existingProjects = await db.entities.Project.filter({ customer_job_id: job.id });
      const project = existingProjects.items[0] || await db.entities.Project.create({
          name: job.title,
          client_id: job.client_id,
          status: "planning",
          budget: job.quote_amount || job.budget_amount || undefined,
          start_date: "",
          end_date: job.deadline || "",
          description: job.description || "",
          customer_job_id: job.id,
        });
      await db.entities.JobRequest.update(job.id, {
        project_id: project.id,
        project_created_at: new Date().toISOString(),
      });
      toast({ title: "Project created", description: "The customer request is linked. Keep the project in planning until work is authorized." });
      await Promise.all([load(), onProjectCreated?.()]);
    } catch (error) {
      toast({
        title: "Could not create project",
        description: error.message || "The project or request link may have been saved; refresh and verify before retrying.",
        variant: "destructive",
      });
    } finally {
      setCreatingProjectId("");
    }
  };

  const visibleRequests = requests.filter((request) => request.status !== "draft");

  return (
    <section className="mb-6 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Customer job requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review submissions, send quotes and create linked projects after acceptance.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh requests"}</Button>
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading customer requests…</p>
      ) : visibleRequests.length ? (
        <div className="mt-4 grid gap-3">
          {visibleRequests.map((job) => {
            const client = clients.find((item) => item.id === job.client_id);
            return (
              <article key={job.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{job.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{client?.company_name || "Client"} · {job.service_type || "Service not specified"} · {job.status === "quoted" && job.quote_decision === "accepted" ? "Quote accepted" : LABELS[job.status] || job.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["submitted", "quote_declined"].includes(job.status) && <Button type="button" size="sm" onClick={() => openQuote(job)}>{job.status === "submitted" ? "Prepare quote" : "Revise quote"}</Button>}
                    {job.status === "quoted" && job.quote_decision === "accepted" && !job.project_id && (
                      <Button type="button" size="sm" variant="outline" onClick={() => createProject(job)} disabled={creatingProjectId === job.id}>
                        <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        {creatingProjectId === job.id ? "Creating..." : "Create project"}
                      </Button>
                    )}
                    {job.project_id && <Link to="/projects" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">Open projects <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>}
                  </div>
                </div>
                {job.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{job.description}</p>}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>Budget: {formatCurrency(job.budget_amount, job.currency)}</span>
                  {job.deadline && <span>Desired deadline: {new Date(`${job.deadline}T00:00:00`).toLocaleDateString()}</span>}
                  {job.quote_amount !== undefined && job.quote_amount !== null && <span>Quote: {formatCurrency(job.quote_amount, job.currency)}</span>}
                </div>
                {job.quote_decision === "declined" && job.quote_decline_reason && <p className="mt-2 text-sm text-amber-800">Decline reason: {job.quote_decline_reason}</p>}
              </article>
            );
          })}
        </div>
      ) : <p className="py-8 text-center text-sm text-muted-foreground">No submitted customer requests yet.</p>}

      <Dialog open={Boolean(quoteJob)} onOpenChange={(open) => { if (!open) setQuoteJob(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Prepare customer quote</DialogTitle></DialogHeader>
          {quoteJob && (
            <form onSubmit={sendQuote} className="space-y-4">
              <p className="text-sm text-muted-foreground">{quoteJob.title}</p>
              <div className="space-y-2">
                <Label htmlFor="customer-quote-amount">Quote amount ({quoteJob.currency || "INR"})</Label>
                <Input id="customer-quote-amount" type="number" min="0.01" step="0.01" value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-quote-notes">Customer-facing scope and terms</Label>
                <Textarea id="customer-quote-notes" value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} maxLength={5000} rows={5} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setQuoteJob(null)} disabled={savingQuote}>Cancel</Button>
                <Button type="submit" disabled={savingQuote}>{savingQuote ? "Sending..." : "Send quote"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
