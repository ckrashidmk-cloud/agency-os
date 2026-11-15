import React from "react";
import { cn } from "@/lib/utils";

export default function StatCard({ label, value, icon: Icon, hint, tone = "default" }) {
  const toneClasses = {
    default: "bg-card text-card-foreground",
    primary: "bg-primary text-primary-foreground",
    success: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
    warning: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    danger: "bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
  };
  return (
    <div className={cn("rounded-xl border p-5 shadow-sm", toneClasses[tone])}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium opacity-80">{label}</p>
        {Icon && <Icon className="h-5 w-5 opacity-80" />}
      </div>
      <p className="mt-2 font-heading text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs opacity-70">{hint}</p>}
    </div>
  );
}