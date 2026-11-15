import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";


import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import InvoiceDialog from "@/components/invoices/InvoiceDialog";
import { StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Plus, Receipt, CreditCard, FileDown, CheckCircle2, Clock, IndianRupee } from "lucide-react";
import { jsPDF } from "jspdf";
import { formatCurrency, formatDate } from "@/lib/format";



export default function Invoices() {
  const lookups = useLookups();
  const [invoices, setInvoices] = useState([]);
  const [invoiceTasks, setInvoiceTasks] = useState([]);
  const [createdClients, setCreatedClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [invoiceList, taskList] = await Promise.all([
        db.entities.Invoice.list("-created_date", 200),
        db.entities.Task.list("-created_date", 500),
      ]);
      setInvoices(invoiceList);
      setInvoiceTasks(taskList);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (inv) => { setEditing(inv); setDialogOpen(true); };

  const saveInvoice = async (invoiceData) => {
    if (editing?.id) {
      await db.entities.Invoice.update(editing.id, invoiceData);
    } else {
      await db.entities.Invoice.create(invoiceData);
    }
    await load();
  };

  const createClient = async (clientData) => {
    const client = await db.entities.Client.create(clientData);
    const savedClient = client.data || client;
    setCreatedClients((current) => [...current.filter((item) => item.id !== savedClient.id), savedClient]);
    return savedClient;
  };

  const clientMap = {
    ...lookups.clientMap,
    ...Object.fromEntries(createdClients.map((client) => [client.id, client])),
  };
  const invoiceLookups = {
    ...lookups,
    clients: [...(lookups.clients || []), ...createdClients.filter((client) => !lookups.clientMap[client.id])],
    clientMap,
    tasks: invoiceTasks,
  };

  const sendPaymentLink = async (inv) => {
    setPaying(inv.id);
    try {
      const isFramed = window.self !== window.top;
      const checkoutTab = isFramed ? window.open("", "_blank") : null;
      if (isFramed && !checkoutTab) throw new Error("Allow popups to continue to checkout.");
      if (checkoutTab) checkoutTab.opener = null;

      const res = await db.functions.invoke("createCheckoutSession", {
        invoice_id: inv.id,
        origin: window.location.origin,
      });
      const url = res.url;
      if (!url) throw new Error(res.error || "Failed to create checkout session");

      if (checkoutTab) {
        checkoutTab.location.replace(url);
      } else {
        window.location.assign(url);
      }
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to start checkout");
    } finally {
      setPaying(null);
    }
  };

  const markPaid = async (inv) => {
    try {
      await db.entities.Invoice.update(inv.id, {
        status: "paid",
        paid_date: new Date().toISOString().slice(0, 10),
      });
      load();
    } catch (e) { console.error(e); }
  };

  const exportPDF = (inv) => {
    const client = clientMap[inv.client_id];
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(20); doc.text("INVOICE", 20, y);
    doc.setFontSize(10);
    doc.text(inv.invoice_number, 20, (y += 8));
    doc.text(`Status: ${(inv.status || "").toUpperCase()}`, 20, (y += 6));
    doc.text(`Due: ${formatDate(inv.due_date)}`, 20, (y += 6));
    y += 6;
    doc.setFontSize(12); doc.text("Bill To:", 20, (y += 4));
    doc.setFontSize(10);
    doc.text(client?.company_name || "No client selected", 20, (y += 6));
    if (client?.contact_person) doc.text(client.contact_person, 20, (y += 5));
    if (client?.email) doc.text(client.email, 20, (y += 5));
    y += 6;
    doc.setFontSize(11);
    doc.text("Description", 20, y); doc.text("Qty", 130, y); doc.text("Rate", 150, y); doc.text("Amount", 175, y);
    y += 4;
    doc.setLineWidth(0.5); doc.line(20, y, 190, y); y += 6;
    doc.setFontSize(10);
    (inv.items || []).forEach((it) => {
      doc.text(String(it.description || "").slice(0, 50), 20, y);
      doc.text(String(it.quantity ?? ""), 130, y);
      doc.text(formatCurrency(it.rate), 150, y);
      doc.text(formatCurrency(it.amount), 175, y);
      y += 6;
    });
    y += 4;
    doc.setLineWidth(0.5); doc.line(140, y, 190, y); y += 6;
    doc.setFontSize(13); doc.text(`Total: ${formatCurrency(inv.total_amount)}`, 150, y);
    doc.save(`${inv.invoice_number}.pdf`);
  };

  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalPending = invoices.filter((i) => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalDraft = invoices.filter((i) => i.status === "draft").reduce((s, i) => s + (i.total_amount || 0), 0);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Bill clients and collect payments via Stripe"
        action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New Invoice</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Invoices" value={invoices.length} icon={Receipt} />
        <StatCard label="Collected" value={formatCurrency(totalPaid)} icon={IndianRupee} tone="success" />
        <StatCard label="Outstanding" value={formatCurrency(totalPending)} icon={Clock} tone="warning" />
        <StatCard label="Draft" value={formatCurrency(totalDraft)} icon={Receipt} />
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Invoice</th>
                <th className="px-4 py-3 text-left font-medium">Client</th>
                <th className="px-4 py-3 text-left font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Due</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t">
                  <td className="cursor-pointer px-4 py-3 font-medium hover:text-primary" onClick={() => openEdit(inv)}>{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{clientMap[inv.client_id]?.company_name || "No client"}</td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(inv.total_amount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.due_date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {inv.status !== "paid" && (
                        <Button size="sm" variant="outline" onClick={() => sendPaymentLink(inv)} disabled={paying === inv.id}>
                          <CreditCard className="mr-1 h-3 w-3" /> {paying === inv.id ? "…" : "Pay"}
                        </Button>
                      )}
                      {inv.status !== "paid" && (
                        <Button size="sm" variant="ghost" onClick={() => markPaid(inv)} title="Mark paid">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => exportPDF(inv)} title="Export PDF">
                        <FileDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No invoices yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <InvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        invoice={editing}
        lookups={invoiceLookups}
        onSave={saveInvoice}
        onCreateClient={createClient}
      />
    </div>
  );
}