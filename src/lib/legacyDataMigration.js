import { db } from "@/lib/dataClient";

function replaceLocalAdministrator(value, userId) {
  if (typeof value === "string") return value.replaceAll("local-admin", userId);
  if (Array.isArray(value)) return value.map((item) => replaceLocalAdministrator(item, userId));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceLocalAdministrator(item, userId)]));
  }
  return value;
}

export async function migrateLegacyBrowserRecords(currentUserId) {
  if (!currentUserId) throw new Error("Sign in with the administrator account before migrating local records.");
  const raw = window.localStorage.getItem("__agency_os_db__");
  if (!raw) throw new Error("No legacy browser data was found in this browser profile.");

  let legacy;
  try {
    legacy = JSON.parse(raw);
  } catch {
    throw new Error("The legacy browser data is not valid JSON. Export a backup before changing it.");
  }
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) {
    throw new Error("The legacy browser data has an unsupported format.");
  }

  const result = { imported: 0, alreadyPresent: 0, staffSkipped: 0, invalidSkipped: 0 };
  for (const [entity, rows] of Object.entries(legacy)) {
    if (!Array.isArray(rows)) continue;
    if (entity === "User") {
      result.staffSkipped += rows.filter((row) => row?.id !== "local-admin").length;
      continue;
    }
    for (const row of rows) {
      if (!row || typeof row !== "object" || !row.id || row.id === "local-admin") {
        result.invalidSkipped += 1;
        continue;
      }
      const existing = await db.entities[entity].get(String(row.id));
      if (existing) {
        result.alreadyPresent += 1;
        continue;
      }
      await db.entities[entity].create(replaceLocalAdministrator(row, currentUserId));
      result.imported += 1;
    }
  }
  return result;
}
