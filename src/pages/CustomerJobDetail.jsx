import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { customerPortalService } from "@/lib/customerPortalService";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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

function FileList({ files = [], title }) {
  const { toast } = useToast();
  const [openingKey, setOpeningKey] = useState("");

  const openFile = async (file) => {
    if (!file?.key) {
      toast({ title: "File unavailable", description: "This file does not have a private storage key.", variant: "destructive" });
      return;
    }
    const fileWindow = window.open("about:blank", "_blank");
    if (!fileWindow) {
      toast({ title: "Allow pop-ups to open this file", description: "Your browser blocked the file tab. Allow pop-ups for this site and retry.", variant: "destructive" });
      return;
    }
    fileWindow.opener = null;
    setOpeningKey(file.key);
    try {
      const signedUrl = await customerPortalService.createPrivateFileSignedUrl(file.key);
      fileWindow.location.replace(signedUrl);
    } catch (error) {
      fileWindow.close();
      toast({ title: "Could not open file", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setOpeningKey("");
    }
  };

  if (!files.length) return null;
  return (
    <div className="space-y-2">
      {title && <p className="text-sm font-medium">{title}</p>}
      {files.map((file, index) => (
        <button key={`${file.key || file.name}-${index}`} type="button" className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => openFile(file)} disabled={openingKey === file.key}>
          <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{file.name || file.file_name || "Download file"}</span></span>
          <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function formatCurrency(value, currency) {
  if (value === null || value === undefined || value === "") return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "INR", maximumFractionDigits: 2 }).format(Number(value));
}

export default function CustomerJobDetail() {
  const { jobId } = useParams();
  const { toast } = useToast();
  const [job, setJob] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [hours, setHours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [declineReason, setDeclineReason] = useState("");
  const [responding, setResponding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobRecord, taskRows, deliveryRows, hourRows] = await Promise.all([
        customerPortalService.getJob(jobId),
        customerPortalService.listWorkItems(jobId),
        customerPortalService.listDeliveries(jobId),
        customerPortalService.listJobHours(jobId),
      ]);
      if (!jobRecord) throw new Error("This job was not found or is not available to your company.");
      setJob(jobRecord);
      setWorkItems(taskRows);
      setDeliveries(deliveryRows);
      setHours(hourRows);
    } catch (error) {
      setJob(null);
      toast({ title: "Could not load job details", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [jobId, toast]);

  useEffect(() => { load(); }, [load]);

  const respond = async (accept) => {
    if (!accept && !declineReason.trim()) {
      toast({ title: "Add a reason", description: "A reason is required to decline a quote." });
      return;
    }
    setResponding(true);
    try {
      await customerPortalService.respondToQuote(job.id, accept, declineReason);
      toast({ title: accept ? "Quote accepted" : "Quote declined" });
      await load();
    } catch (error) {
      toast({ title: "Could not respond to quote", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setResponding(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground" role="status">Loading job details…</div>;
  if (!job) return (
    <div className="rounded-xl border bg-white p-8 text-center">
      <h1 className="font-semibold">Job unavailable</h1>
      <Link to="/portal/jobs" className="mt-3 inline-block text-sm text-primary hover:underline">Return to my jobs</Link>
    </div>
  );

  const quoteAmount = formatCurrency(job.quote_amount, job.currency);
  const budgetAmount = formatCurrency(job.budget_amount, job.currency);

  return (
    <div className="space-y-6">
      <Link to="/portal/jobs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to my jobs</Link>
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{job.service_type || "Job request"}</p>
            <h1 className="mt-1 text-2xl font-semibold">{job.title}</h1>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">{job.status === "quoted" && job.quote_decision === "accepted" ? "Quote accepted" : STATUS_LABELS[job.status] || job.status}</span>
        </div>
        {job.description && <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{job.description}</p>}
        <div className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
          {budgetAmount && <div><p className="text-muted-foreground">Requested budget</p><p className="mt-1 font-medium">{budgetAmount}</p></div>}
          {job.deadline && <div><p className="text-muted-foreground">Desired deadline</p><p className="mt-1 font-medium">{new Date(`${job.deadline}T00:00:00`).toLocaleDateString()}</p></div>}
          {quoteAmount && <div><p className="text-muted-foreground">Quote</p><p className="mt-1 font-medium">{quoteAmount}</p></div>}
        </div>
        <div className="mt-5">
          <FileList files={job.attachments || []} title="Request attachments" />
        </div>
        {job.status === "quoted" && job.quote_decision === "pending" && (
          <div className="mt-6 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h2 className="font-semibold">Your quote is ready</h2>
            {job.quote_notes && <p className="whitespace-pre-wrap text-sm">{job.quote_notes}</p>}
            <div className="space-y-2">
              <Label htmlFor="decline-reason">Reason if declining</Label>
              <Textarea id="decline-reason" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} maxLength={1000} rows={2} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => respond(true)} disabled={responding}>{responding ? "Saving..." : "Accept quote"}</Button>
              <Button type="button" variant="outline" onClick={() => respond(false)} disabled={responding}>{responding ? "Saving..." : "Decline quote"}</Button>
            </div>
          </div>
        )}
        {job.quote_decision === "accepted" && <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Quote accepted. The agency can now schedule the work.</p>}
        {job.quote_decision === "declined" && <p className="mt-5 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Quote declined{job.quote_decline_reason ? `: ${job.quote_decline_reason}` : "."}</p>}
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Work details</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tasks and current stages for this job.</p>
        {workItems.length ? (
          <div className="mt-4 divide-y">
            {workItems.map((item) => (
              <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div>
                  <h3 className="font-medium">{item.title || "Work item"}</h3>
                  {item.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>}
                  {item.stage_label && <p className="mt-2 text-xs text-muted-foreground">Stage: {item.stage_label}</p>}
                </div>
                <div className="text-right text-sm">
                  {item.assignee_label && <p className="text-muted-foreground">{item.assignee_label}</p>}
                  <p className="mt-1 font-medium capitalize">{String(item.status || "pending").replace(/_/g, " ")}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-muted-foreground">Work items will appear here after the job is scheduled.</p>}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Deliveries</h2>
          {deliveries.length ? (
            <div className="mt-4 space-y-4">
              {deliveries.map((delivery) => (
                <article key={delivery.id} className="rounded-lg border p-4">
                  <h3 className="font-medium">{delivery.title || "Delivery"}</h3>
                  {delivery.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{delivery.description}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{delivery.created_date ? new Date(delivery.created_date).toLocaleDateString() : ""}</p>
                  <div className="mt-3"><FileList files={delivery.files || delivery.attachments || []} /></div>
                </article>
              ))}
            </div>
          ) : <p className="mt-2 text-sm text-muted-foreground">No deliveries yet.</p>}
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Billable hours</h2>
          <p className="mt-1 text-sm text-muted-foreground">Hours are shown only as monthly job totals.</p>
          {hours.length ? (
            <div className="mt-4 divide-y">
              {hours.map((row) => (
                <div key={row.id} className="flex justify-between gap-4 py-3 text-sm">
                  <span>{row.month_start ? new Date(`${row.month_start}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Monthly total"}</span>
                  <span className="font-medium">{Number(row.billable_hours || 0).toFixed(2)} hours</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-sm text-muted-foreground">Monthly totals will appear after billable hours are recorded.</p>}
        </div>
      </section>
    </div>
  );
}
