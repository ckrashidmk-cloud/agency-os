import { db } from "@/lib/dataClient";
import React, { useState, useEffect } from "react";


import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import ServiceDialog from "@/components/services/ServiceDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";



const CATEGORY_LABELS = {
  design: "Design", development: "Development", marketing: "Marketing",
  social_media: "Social Media", consulting: "Consulting", other: "Other",
};

export default function Services() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await db.entities.Service.list("-created_date", 200);
      setServices(res || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (s) => { setEditing(s); setDialogOpen(true); };

  const handleDelete = async (id) => {
    if (!confirm("Delete this service?")) return;
    try {
      await db.entities.Service.delete(id);
      load();
    } catch (e) { console.error(e); }
  };

  const active = services.filter((s) => s.is_active !== false);
  const hourly = services.filter((s) => s.pricing_type === "hourly");

  return (
    <div>
      <PageHeader
        title="Services"
        description="Manage your agency service catalog and default pricing"
        action={isAdmin ? <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New Service</Button> : null}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Services" value={services.length} icon={Package} />
        <StatCard label="Active" value={active.length} icon={Package} tone="success" />
        <StatCard label="Fixed Price" value={services.length - hourly.length} icon={Package} tone="primary" />
        <StatCard label="Hourly Rate" value={hourly.length} icon={Package} tone="primary" />
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="mb-3 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No services yet. Create your first service to standardize pricing across invoices and proposals.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Service Name</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Pricing Type</th>
                <th className="px-4 py-3 text-left font-medium">Default Amount</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                {isAdmin && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.name}</p>
                    {s.description && <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{CATEGORY_LABELS[s.category] || s.category}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{s.pricing_type}</td>
                  <td className="px-4 py-3 font-medium">
                    {formatCurrency(s.default_amount)}{s.pricing_type === "hourly" ? " /hr" : ""}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={s.is_active !== false ? "default" : "secondary"}>
                      {s.is_active !== false ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ServiceDialog open={dialogOpen} onOpenChange={setDialogOpen} service={editing} onSaved={load} />
    </div>
  );
}