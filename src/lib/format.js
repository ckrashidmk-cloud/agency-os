/** @typedef {Window & { __AGENCY_OS_SETTINGS__?: { default_currency?: string, default_language?: string, date_format?: string, timezone?: string } }} SettingsWindow */
/** @type {SettingsWindow | undefined} */
const settingsWindow = typeof window === "undefined" ? undefined : window;

export function formatCurrency(amount) {
  const value = amount == null || isNaN(amount) ? 0 : Number(amount);
  const settings = settingsWindow?.__AGENCY_OS_SETTINGS__;
  const currency = settings?.default_currency || "INR";
  const locale = settings?.default_language || (currency === "INR" ? "en-IN" : "en-US");
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
  }
}

export function formatDuration(minutes) {
  if (!minutes || minutes < 1) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = new Date(dateOnly ? `${dateStr}T12:00:00Z` : dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  const settings = settingsWindow?.__AGENCY_OS_SETTINGS__;
  const locale = settings?.default_language || "en-IN";
  const timezone = dateOnly ? "UTC" : (settings?.timezone || undefined);
  const format = settings?.date_format || "dd MMM yyyy";
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: format === "dd MMM yyyy" ? "short" : "2-digit",
      year: "numeric",
      timeZone: timezone,
    }).formatToParts(d);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    if (format === "MM/dd/yyyy") return `${values.month}/${values.day}/${values.year}`;
    if (format === "yyyy-MM-dd") return `${values.year}-${values.month}-${values.day}`;
    return `${Number(values.day)} ${values.month} ${values.year}`;
  } catch {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
  }
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}