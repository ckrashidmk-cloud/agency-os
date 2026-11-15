import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";


import { useAuth } from "@/lib/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import ExpenseDialog from "@/components/expenses/ExpenseDialog";
import { StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, IndianRupee, Plus, Paperclip, Check, X,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  formatExpenseCategory,
  loadCustomExpenseCategories,
} from "@/lib/expenseCategories";



export default function Financials() {
  const { user } = useAuth();
  const lookups = useLookups();
  const [expenses, setExpenses] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [paidInvoices, setPaidInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const isAdmin = user?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const [expList, invList] = await Promise.all([
        db.entities.Expense.list("-date_incurred", 200),
        db.entities.Invoice.list("-created_date", 200),
      ]);
      setExpenses(expList);
      setPaidInvoices(invList.filter((i) => i.status === "paid"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setCustomCategories(loadCustomExpenseCategories());
  }, []);

  const categories = [
    ...DEFAULT_EXPENSE_CATEGORIES,
    ...customCategories
      .filter((value) => !DEFAULT_EXPENSE_CATEGORIES.some((category) => category.value === value))
      .map((value) => ({ value, label: formatExpenseCategory(value) })),
    ...expenses
      .map((expense) => expense.category)
      .filter((value) => value && !DEFAULT_EXPENSE_CATEGORIES.some((category) => category.value === value) && !customCategories.includes(value))
      .filter((value, index, list) => list.indexOf(value) === index)
      .map((value) => ({ value, label: formatExpenseCategory(value) })),
  ];
  const categoryLabels = Object.fromEntries(categories.map((category) => [category.value, category.label]));

  // Build last 6 months for the P&L chart
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      income: 0,
      expenses: 0,
    });
  }

  paidInvoices.forEach((inv) => {
    if (inv.paid_date) {
      const key = inv.paid_date.slice(0, 7);
      const m = months.find((m) => m.key === key);
      if (m) m.income += inv.total_amount || 0;
    }
  });

  expenses.forEach((exp) => {
    if (exp.date_incurred) {
      const key = exp.date_incurred.slice(0, 7);
      const m = months.find((m) => m.key === key);
      if (m) m.expenses += exp.amount || 0;
    }
  });

  const currentMonth = months[months.length - 1];
  const monthIncome = currentMonth.income;
  const monthExpenses = expenses
    .filter((e) => e.date_incurred && e.date_incurred.slice(0, 7) === currentMonth.key)
    .reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = monthIncome - monthExpenses;

  // Category breakdown (all expenses)
  const categoryTotals = {};
  expenses.forEach((e) => {
    const cat = e.category || "other";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (e.amount || 0);
  });
  const maxCategory = Math.max(...Object.values(categoryTotals), 1);

  const visibleExpenses = categoryFilter === "all"
    ? expenses
    : expenses.filter((e) => e.category === categoryFilter);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (exp) => { setEditing(exp); setDialogOpen(true); };

  const updateStatus = async (id, status) => {
    try {
      await db.entities.Expense.update(id, { status });
      load();
    } catch (e) { console.error(e); }
  };

  const viewReceipt = async (uri) => {
    try {
      const { signed_url } = await db.integrations.Core.CreateFileSignedUrl({ file_uri: uri });
      window.open(signed_url, "_blank");
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      <PageHeader
        title="Financials"
        description="Track income, expenses, and profitability"
        action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Log Expense</Button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={`Income · ${currentMonth.label}`} value={formatCurrency(monthIncome)} icon={IndianRupee} tone="success" />
        <StatCard label={`Expenses · ${currentMonth.label}`} value={formatCurrency(monthExpenses)} icon={TrendingDown} tone="danger" />
        <StatCard label="Net Profit" value={formatCurrency(netProfit)} icon={TrendingUp} tone={netProfit >= 0 ? "primary" : "danger"} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h3 className="mb-4 font-heading text-sm font-semibold">Income vs Expenses</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", color: "hsl(var(--popover-foreground))" }}
                formatter={(v) => formatCurrency(v)}
              />
              <Legend />
              <Bar dataKey="income" name="Income" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-4 font-heading text-sm font-semibold">By Category</h3>
          <div className="space-y-3">
            {categories.map((cat) => {
              const total = categoryTotals[cat.value] || 0;
              return (
                <div key={cat.value}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{cat.label}</span>
                    <span className="font-medium">{formatCurrency(total)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(total / maxCategory) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold">Recent Expenses</h3>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-left font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Logged by</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Receipt</th>
                {isAdmin && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visibleExpenses.map((exp) => (
                <tr key={exp.id} className="border-t hover:bg-muted/30">
                  <td className="cursor-pointer px-4 py-3 font-medium hover:text-primary" onClick={() => isAdmin && openEdit(exp)}>
                    {categoryLabels[exp.category] || formatExpenseCategory(exp.category)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{exp.description || "—"}</td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(exp.amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(exp.date_incurred)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {lookups.userMap[exp.logged_by]?.full_name || lookups.userMap[exp.logged_by]?.email || "—"}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={exp.status} /></td>
                  <td className="px-4 py-3">
                    {exp.receipt_file_uri ? (
                      <Button size="sm" variant="ghost" onClick={() => viewReceipt(exp.receipt_file_uri)}>
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {exp.status === "pending" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(exp.id, "approved")} title="Approve">
                              <Check className="h-4 w-4 text-emerald-500" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(exp.id, "rejected")} title="Reject">
                              <X className="h-4 w-4 text-rose-500" />
                            </Button>
                          </>
                        )}
                        {exp.status === "approved" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(exp.id, "reimbursed")}>
                            <Check className="mr-1 h-3 w-3" /> Reimburse
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {visibleExpenses.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground">No expenses found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
        projects={lookups.projects}
        onSave={async (formData) => {
          const expenseData = { ...formData, logged_by: user?.id };
          if (editing?.id) {
            await db.entities.Expense.update(editing.id, expenseData);
          } else {
            await db.entities.Expense.create(expenseData);
          }
          await load();
        }}
        onCategoryAdded={setCustomCategories}
      />
    </div>
  );
}