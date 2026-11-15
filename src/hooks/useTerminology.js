import { db } from "@/lib/dataClient";
import { useState, useEffect } from "react";




export function useTerminology() {
  const [terms, setTerms] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await db.entities.CustomTerm.filter({}, { limit: 100 });
        const map = {};
        (result.items || []).forEach((t) => {
          map[t.original_term.toLowerCase()] = t.custom_term;
        });
        setTerms(map);
      } catch (e) {
        console.error("Failed to load terminology:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const t = (term) => terms[term.toLowerCase()] || term;
  return { terms, t, loading };
}