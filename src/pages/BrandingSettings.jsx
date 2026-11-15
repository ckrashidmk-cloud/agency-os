import { db } from "@/lib/dataClient";

import React, { useState, useEffect, useCallback } from "react";

import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import LogoUploader from "@/components/branding/LogoUploader";
import ColorPicker from "@/components/branding/ColorPicker";
import TerminologyEditor from "@/components/branding/TerminologyEditor";
import CustomFieldsManager from "@/components/branding/CustomFieldsManager";
import { Save, Moon, Sun, Plus, Trash2, Download } from "lucide-react";
import { applyTheme, loadFont, updateFavicon, updateTitle } from "@/lib/themeUtils";



const FONTS = [
  { value: "system", label: "System Default" },
  { value: "Inter", label: "Inter" },
  { value: "Poppins", label: "Poppins" },
  { value: "Roboto", label: "Roboto" },
  { value: "Outfit", label: "Outfit" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Space Grotesk", label: "Space Grotesk" },
];

const RADII = [
  { value: "sharp", label: "Sharp (0px)" },
  { value: "rounded", label: "Rounded (8px)" },
  { value: "pill", label: "Pill (16px)" },
];

/* ─── Built-in presets ─── */
const BUILT_IN_PRESETS = [
  // Dark themes
  { id: "forest",     label: "Forest",         primary: "#22c55e", secondary: "#0a0a0a", accent: "#1a1a1a", text: "#e0e0e0", sidebar_text: "#d1d5db", mode: "dark"  },
  { id: "ocean",      label: "Ocean",          primary: "#0ea5e9", secondary: "#0f172a", accent: "#1e293b", text: "#e2e8f0", sidebar_text: "#94a3b8", mode: "dark"  },
  { id: "violet",     label: "Violet",         primary: "#8b5cf6", secondary: "#0f0720", accent: "#1e1040", text: "#ede9fe", sidebar_text: "#c4b5fd", mode: "dark"  },
  { id: "sunset",     label: "Sunset",         primary: "#f97316", secondary: "#1c1917", accent: "#292524", text: "#fef3c7", sidebar_text: "#fed7aa", mode: "dark"  },
  { id: "rose",       label: "Rose",           primary: "#f43f5e", secondary: "#1a0a0d", accent: "#2d1318", text: "#ffe4e6", sidebar_text: "#fda4af", mode: "dark"  },
  { id: "teal",       label: "Teal",           primary: "#14b8a6", secondary: "#042f2e", accent: "#134e4a", text: "#ccfbf1", sidebar_text: "#5eead4", mode: "dark"  },
  { id: "amber",      label: "Amber",          primary: "#f59e0b", secondary: "#1c1400", accent: "#292100", text: "#fef9c3", sidebar_text: "#fde68a", mode: "dark"  },
  { id: "midnight",   label: "Midnight",       primary: "#6366f1", secondary: "#020617", accent: "#0f172a", text: "#e2e8f0", sidebar_text: "#a5b4fc", mode: "dark"  },
  // Light themes
  { id: "clean",      label: "Clean White",    primary: "#2563eb", secondary: "#ffffff", accent: "#f1f5f9", text: "#0f172a", sidebar_text: "#334155", mode: "light" },
  { id: "warm",       label: "Warm Sand",      primary: "#d97706", secondary: "#fffbeb", accent: "#fef3c7", text: "#451a03", sidebar_text: "#78350f", mode: "light" },
  { id: "mint",       label: "Mint Fresh",     primary: "#059669", secondary: "#f0fdf4", accent: "#dcfce7", text: "#064e3b", sidebar_text: "#065f46", mode: "light" },
  { id: "lavender",   label: "Lavender",       primary: "#7c3aed", secondary: "#faf5ff", accent: "#f3e8ff", text: "#3b0764", sidebar_text: "#4c1d95", mode: "light" },
  { id: "rose-light", label: "Rose Light",     primary: "#e11d48", secondary: "#fff1f2", accent: "#ffe4e6", text: "#4c0519", sidebar_text: "#881337", mode: "light" },
  { id: "sky",        label: "Sky Blue",       primary: "#0284c7", secondary: "#f0f9ff", accent: "#e0f2fe", text: "#0c4a6e", sidebar_text: "#075985", mode: "light" },
  { id: "slate-pro",  label: "Slate Pro",      primary: "#334155", secondary: "#f8fafc", accent: "#f1f5f9", text: "#0f172a", sidebar_text: "#475569", mode: "light" },
  { id: "peach",      label: "Peach",          primary: "#ea580c", secondary: "#fff7ed", accent: "#ffedd5", text: "#431407", sidebar_text: "#7c2d12", mode: "light" },
];

const CUSTOM_PRESETS_KEY = "__agency_os_custom_presets__";
function loadCustomPresets() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || "[]"); } catch { return []; }
}
function saveCustomPresets(presets) {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

const DEFAULT_FORM = {
  workspace_name: "",
  logo_url: "",
  favicon_url: "",
  collapsed_logo_url: "",
  login_bg_url: "",
  primary_hex: "#22c55e",
  secondary_hex: "#0a0a0a",
  accent_hex: "#1a1a1a",
  text_hex: "#e0e0e0",
  sidebar_text_hex: "#d1d5db",
  font_family: "system",
  border_radius: "rounded",
  theme_mode: "dark",
};

export default function BrandingSettings() {
  const { toast } = useToast();
  const [settingsId, setSettingsId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customPresets, setCustomPresets] = useState([]);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Load saved settings on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await db.entities.WorkspaceSettings.filter({}, { limit: 1 });
        const s = result.items?.[0];
        if (s) {
          setSettingsId(s.id);
          const loaded = {
            workspace_name: s.workspace_name || "",
            logo_url: s.logo_url || "",
            favicon_url: s.favicon_url || "",
            collapsed_logo_url: s.collapsed_logo_url || "",
            login_bg_url: s.login_bg_url || "",
            primary_hex: s.primary_hex || DEFAULT_FORM.primary_hex,
            secondary_hex: s.secondary_hex || DEFAULT_FORM.secondary_hex,
            accent_hex: s.accent_hex || DEFAULT_FORM.accent_hex,
            text_hex: s.text_hex || DEFAULT_FORM.text_hex,
            sidebar_text_hex: s.sidebar_text_hex || DEFAULT_FORM.sidebar_text_hex,
            font_family: s.font_family || DEFAULT_FORM.font_family,
            border_radius: s.border_radius || DEFAULT_FORM.border_radius,
            theme_mode: s.theme_mode || DEFAULT_FORM.theme_mode,
          };
          setForm(loaded);
          // Theme already applied by Layout mount, but re-apply in case this is first load
          applyTheme(loaded);
        }
      } catch (e) {
        console.error("Load branding:", e);
      } finally {
        setLoading(false);
      }
    })();
    setCustomPresets(loadCustomPresets());
  }, []);

  const set = useCallback((k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      applyTheme(next);
      return next;
    });
  }, []);

  const applyPreset = (preset) => {
    const next = {
      ...form,
      primary_hex: preset.primary,
      secondary_hex: preset.secondary,
      accent_hex: preset.accent,
      text_hex: preset.text,
      sidebar_text_hex: preset.sidebar_text,
      theme_mode: preset.mode,
    };
    setForm(next);
    applyTheme(next);
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const newPreset = {
      id: "custom_" + Date.now(),
      label: presetName.trim(),
      primary: form.primary_hex,
      secondary: form.secondary_hex,
      accent: form.accent_hex,
      text: form.text_hex,
      sidebar_text: form.sidebar_text_hex,
      mode: form.theme_mode,
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setPresetName("");
    setSavePresetOpen(false);
    toast({ title: "Preset saved", description: `"${newPreset.label}" added to your presets.` });
  };

  const deleteCustomPreset = (id) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    toast({ title: "Preset deleted" });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let saved;
      if (settingsId) {
        saved = await db.entities.WorkspaceSettings.update(settingsId, form);
      } else {
        saved = await db.entities.WorkspaceSettings.create(form);
        setSettingsId(saved.id);
      }
      applyTheme(form);
      loadFont(form.font_family);
      updateFavicon(form.favicon_url);
      updateTitle(form.workspace_name);
      // Notify Layout to update sidebar brand
      window.dispatchEvent(new CustomEvent("branding-updated", { detail: form }));
      toast({ title: "✅ Branding saved", description: "All changes applied and persisted." });
    } catch (e) {
      console.error(e);
      toast({ title: "Error saving", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">Loading settings…</div>;
  }

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];
  const darkPresets = allPresets.filter(p => p.mode === "dark");
  const lightPresets = allPresets.filter(p => p.mode === "light");

  return (
    <div>
      <PageHeader
        title="Branding & Settings"
        description="White-label your workspace with custom logos, colors, and terminology"
        action={
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        }
      />

      <Tabs defaultValue="brand" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="brand">Brand Identity</TabsTrigger>
          <TabsTrigger value="theme">Theme & Colors</TabsTrigger>
          <TabsTrigger value="terminology">Terminology</TabsTrigger>
          <TabsTrigger value="fields">Custom Fields</TabsTrigger>
        </TabsList>

        {/* ── Brand Identity ── */}
        <TabsContent value="brand" className="space-y-6">
          <div className="space-y-6 rounded-xl border bg-card p-6">
            <div className="space-y-2">
              <Label>Workspace Name</Label>
              <Input
                value={form.workspace_name}
                onChange={(e) => set("workspace_name", e.target.value)}
                placeholder="Your Agency Name"
              />
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <LogoUploader label="Main Logo" value={form.logo_url} onChange={(v) => set("logo_url", v)} />
              <LogoUploader label="Favicon" value={form.favicon_url} onChange={(v) => set("favicon_url", v)} />
              <LogoUploader label="Collapsed Sidebar Logo" value={form.collapsed_logo_url} onChange={(v) => set("collapsed_logo_url", v)} />
              <LogoUploader label="Login Background Image" value={form.login_bg_url} onChange={(v) => set("login_bg_url", v)} aspect="wide" />
            </div>
          </div>
        </TabsContent>

        {/* ── Theme & Colors ── */}
        <TabsContent value="theme" className="space-y-6">

          {/* Theme Mode */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Label className="text-base font-semibold">Theme Mode</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => set("theme_mode", "dark")}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  form.theme_mode === "dark"
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border bg-background hover:bg-accent"
                }`}
              >
                <Moon className="h-4 w-4" /> Dark Mode
              </button>
              <button
                type="button"
                onClick={() => set("theme_mode", "light")}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  form.theme_mode === "light"
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border bg-background hover:bg-accent"
                }`}
              >
                <Sun className="h-4 w-4" /> Light Mode
              </button>
            </div>
          </div>

          {/* ── Dark Presets ── */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-semibold">Dark Presets</Label>
            </div>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
              {darkPresets.map((preset) => {
                const isActive = form.primary_hex.toLowerCase() === preset.primary.toLowerCase() && form.theme_mode === preset.mode;
                const isCustom = preset.id.startsWith("custom_");
                return (
                  <div key={preset.id} className="relative group">
                    <button
                      type="button"
                      title={preset.label}
                      onClick={() => applyPreset(preset)}
                      className={`w-full flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-all hover:scale-105 hover:shadow-md ${
                        isActive ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="relative h-8 w-8">
                        <span className="absolute inset-0 rounded-full border border-black/10" style={{ backgroundColor: preset.primary }} />
                        <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-card" style={{ backgroundColor: preset.secondary }} />
                      </div>
                      <span className="text-[10px] font-medium leading-tight text-center">{preset.label}</span>
                    </button>
                    {isCustom && (
                      <button
                        onClick={() => deleteCustomPreset(preset.id)}
                        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                        title="Delete preset"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Light Presets ── */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-500" />
              <Label className="text-base font-semibold">Light Presets</Label>
            </div>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
              {lightPresets.map((preset) => {
                const isActive = form.primary_hex.toLowerCase() === preset.primary.toLowerCase() && form.theme_mode === preset.mode;
                const isCustom = preset.id.startsWith("custom_");
                return (
                  <div key={preset.id} className="relative group">
                    <button
                      type="button"
                      title={preset.label}
                      onClick={() => applyPreset(preset)}
                      className={`w-full flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-all hover:scale-105 hover:shadow-md ${
                        isActive ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="relative h-8 w-8">
                        <span className="absolute inset-0 rounded-full border border-black/20" style={{ backgroundColor: preset.primary }} />
                        <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-card" style={{ backgroundColor: preset.secondary }} />
                      </div>
                      <span className="text-[10px] font-medium leading-tight text-center">{preset.label}</span>
                      <span className="text-[9px] text-amber-500">☀ Light</span>
                    </button>
                    {isCustom && (
                      <button
                        onClick={() => deleteCustomPreset(preset.id)}
                        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                        title="Delete preset"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save Custom Preset */}
          <div className="rounded-xl border border-dashed bg-card p-4">
            <button
              type="button"
              onClick={() => setSavePresetOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" /> Save Current Colors as Preset
            </button>
          </div>

          {/* Color Pickers */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Label className="text-base font-semibold">Custom Colors</Label>
            <p className="text-xs text-muted-foreground -mt-1">Changes preview instantly. Click "Save Changes" to persist.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorPicker label="Primary Color" value={form.primary_hex} onChange={(v) => set("primary_hex", v)} />
              <ColorPicker label="Secondary Color" value={form.secondary_hex} onChange={(v) => set("secondary_hex", v)} />
              <ColorPicker label="Accent Color" value={form.accent_hex} onChange={(v) => set("accent_hex", v)} />
              <ColorPicker label="Text / Font Color" value={form.text_hex} onChange={(v) => set("text_hex", v)} />
              <ColorPicker label="Sidebar Font Color" value={form.sidebar_text_hex} onChange={(v) => set("sidebar_text_hex", v)} />
            </div>
          </div>

          {/* Typography & Radius */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <Label className="text-base font-semibold">Typography & Shape</Label>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Font Family</Label>
                <Select value={form.font_family} onValueChange={(v) => { set("font_family", v); loadFont(v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Border Radius</Label>
                <Select value={form.border_radius} onValueChange={(v) => set("border_radius", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RADII.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Live preview strip */}
          <div className="rounded-xl border bg-card p-6 space-y-3">
            <Label className="text-base font-semibold">Live Preview</Label>
            <div className="flex flex-wrap gap-3 items-center">
              <button className="rounded-lg px-4 py-2 text-sm font-medium shadow-sm" style={{ backgroundColor: form.primary_hex, color: form.theme_mode === "dark" ? "#111" : "#fff" }}>Primary Button</button>
              <button className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: form.primary_hex, color: form.primary_hex }}>Outline Button</button>
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: form.accent_hex, color: form.text_hex }}>Badge</span>
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: form.secondary_hex, color: form.text_hex, border: "1px solid " + form.accent_hex }}>A</div>
              <span className="text-sm" style={{ color: form.text_hex, fontFamily: form.font_family !== "system" ? form.font_family : undefined }}>
                {form.workspace_name || "Agency OS"} — Sample Text
              </span>
            </div>
          </div>

        </TabsContent>

        {/* ── Terminology ── */}
        <TabsContent value="terminology">
          <TerminologyEditor />
        </TabsContent>

        {/* ── Custom Fields ── */}
        <TabsContent value="fields">
          <CustomFieldsManager />
        </TabsContent>
      </Tabs>

      {/* Save Preset Dialog */}
      <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Color Preset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Preset Name</Label>
              <Input
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                placeholder="My Custom Theme"
                autoFocus
                onKeyDown={e => e.key === "Enter" && handleSavePreset()}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Colors:</span>
              {[form.primary_hex, form.secondary_hex, form.accent_hex, form.text_hex, form.sidebar_text_hex].map((c, i) => (
                <span key={i} className="h-5 w-5 rounded-full border" style={{ backgroundColor: c }} />
              ))}
              <span className="ml-auto">{form.theme_mode === "light" ? "☀ Light" : "🌙 Dark"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSavePresetOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()} className="gap-2">
              <Download className="h-4 w-4" /> Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}