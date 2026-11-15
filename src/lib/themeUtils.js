export function hexToHsl(hex) {
  hex = (hex || "").replace("#", "");
  if (hex.length !== 6) return "135 100% 50%";
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Apply a full set of branding settings to CSS custom properties.
 * Also handles light/dark mode and background/card/popover/border/input/muted vars.
 */
export function applyTheme(settings) {
  const root = document.documentElement;
  const isDark = settings.theme_mode !== "light";

  // Apply dark/light class
  if (isDark) {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }

  if (settings.primary_hex) {
    const hsl = hexToHsl(settings.primary_hex);
    root.style.setProperty("--primary", hsl);
    root.style.setProperty("--ring", hsl);
    root.style.setProperty("--sidebar-primary", hsl);
    root.style.setProperty("--sidebar-ring", hsl);
    root.style.setProperty("--chart-1", hsl);
    root.style.setProperty("--primary-foreground", isDark ? "0 0% 7%" : "0 0% 100%");
    root.style.setProperty("--sidebar-primary-foreground", isDark ? "0 0% 7%" : "0 0% 100%");
  }
  if (settings.secondary_hex) {
    const secHsl = hexToHsl(settings.secondary_hex);
    root.style.setProperty("--secondary", secHsl);
    root.style.setProperty("--sidebar-background", secHsl);
    // For light mode, we also set background + card from secondary
    if (!isDark) {
      root.style.setProperty("--background", secHsl);
      root.style.setProperty("--card", secHsl);
      root.style.setProperty("--popover", secHsl);
    }
  }
  if (settings.accent_hex) {
    const accHsl = hexToHsl(settings.accent_hex);
    root.style.setProperty("--accent", accHsl);
    root.style.setProperty("--sidebar-accent", accHsl);
    if (!isDark) {
      root.style.setProperty("--muted", accHsl);
    }
  }
  if (settings.text_hex) {
    const txtHsl = hexToHsl(settings.text_hex);
    root.style.setProperty("--foreground", txtHsl);
    root.style.setProperty("--card-foreground", txtHsl);
    root.style.setProperty("--popover-foreground", txtHsl);
    root.style.setProperty("--secondary-foreground", txtHsl);
    root.style.setProperty("--accent-foreground", txtHsl);
    root.style.setProperty("--sidebar-foreground", txtHsl);
    root.style.setProperty("--sidebar-accent-foreground", txtHsl);
  }
  if (settings.sidebar_text_hex) {
    const sbHsl = hexToHsl(settings.sidebar_text_hex);
    root.style.setProperty("--sidebar-foreground", sbHsl);
    root.style.setProperty("--sidebar-accent-foreground", sbHsl);
  }
  if (settings.font_family && settings.font_family !== "system") {
    const fontStack = `'${settings.font_family}', ui-sans-serif, system-ui, sans-serif`;
    root.style.setProperty("--font-heading", fontStack);
    root.style.setProperty("--font-body", fontStack);
    root.style.setProperty("--font-display", fontStack);
    loadFont(settings.font_family);
  } else if (settings.font_family === "system") {
    root.style.removeProperty("--font-heading");
    root.style.removeProperty("--font-body");
    root.style.removeProperty("--font-display");
  }
  if (settings.border_radius) {
    const map = { sharp: "0px", rounded: "0.5rem", pill: "1rem" };
    root.style.setProperty("--radius", map[settings.border_radius] || "0.5rem");
  }
}

/**
 * Load saved theme from localStorage DB and apply it SYNCHRONOUSLY.
 * Called once at app startup (in Layout mount) so theme persists across refreshes.
 * Returns the settings object if found, or null.
 */
export function loadSavedTheme() {
  try {
    const dbRaw = localStorage.getItem("__agency_os_db__");
    if (!dbRaw) return null;
    const db = JSON.parse(dbRaw);
    const wsRows = db.WorkspaceSettings;
    if (!wsRows || !wsRows.length) return null;
    const s = wsRows[0]; // first saved settings
    applyTheme(s);
    if (s.workspace_name) updateTitle(s.workspace_name);
    if (s.favicon_url) updateFavicon(s.favicon_url);
    return s;
  } catch (e) {
    console.warn("[themeUtils] Failed to load saved theme:", e);
    return null;
  }
}

export function loadFont(fontFamily) {
  if (!fontFamily || fontFamily === "system") return;
  const id = `google-font-${fontFamily.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, "+")}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

export function updateFavicon(faviconUrl) {
  if (!faviconUrl) return;
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = faviconUrl;
}

export function updateTitle(workspaceName) {
  if (workspaceName) document.title = workspaceName;
}