import { db } from "@/lib/dataClient";
import { useState, useEffect } from "react";


import { applyTheme, loadFont, updateFavicon, updateTitle } from "@/lib/themeUtils";



export function useBranding() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await db.entities.WorkspaceSettings.filter({}, { limit: 1 });
        const s = result.items?.[0];
        if (s) {
          setSettings(s);
          applyTheme(s);
          loadFont(s.font_family);
          updateFavicon(s.favicon_url);
          updateTitle(s.workspace_name);
          if (s.theme_mode === "light") {
            document.documentElement.classList.remove("dark");
          } else {
            document.documentElement.classList.add("dark");
          }
          localStorage.setItem("branding_settings", JSON.stringify(s));
        }
      } catch (e) {
        console.error("Failed to load branding:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { settings, loading };
}