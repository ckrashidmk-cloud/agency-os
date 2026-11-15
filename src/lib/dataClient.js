import { requireSupabase } from "@/lib/supabaseClient";

const FILE_BUCKET = "agency-assets";

function sortRecords(records, orderBy) {
  if (!orderBy) return records;
  const descending = orderBy.startsWith("-");
  const field = descending ? orderBy.slice(1) : orderBy;
  return [...records].sort((left, right) => {
    const a = left[field] ?? "";
    const b = right[field] ?? "";
    const result = a < b ? -1 : a > b ? 1 : 0;
    return descending ? -result : result;
  });
}

function matches(record, conditions = {}) {
  return Object.entries(conditions).every(([field, expected]) => {
    if (expected && typeof expected === "object" && Array.isArray(expected.$in)) {
      return expected.$in.includes(record[field]);
    }
    return record[field] === expected;
  });
}

function entityApi(entity) {
  async function fetchRecords() {
    const client = requireSupabase();
    const records = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await client
        .from("agency_records")
        .select("record_id,payload")
        .eq("entity", entity)
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      records.push(...(data || []).map(({ record_id, payload }) => ({ ...payload, id: record_id })));
      if (!data || data.length < pageSize) break;
    }
    return records;
  }

  return {
    filter: async (conditions = {}, options = {}) => {
      let rows = (await fetchRecords()).filter((record) => matches(record, conditions));
      rows = sortRecords(rows, options.orderBy || options.sort);
      if (options.limit) rows = rows.slice(0, options.limit);
      return { items: rows };
    },
    list: async (orderBy, limit) => {
      let rows = sortRecords(await fetchRecords(), orderBy);
      if (limit) rows = rows.slice(0, limit);
      return rows;
    },
    get: async (id) => {
      const client = requireSupabase();
      const { data, error } = await client
        .from("agency_records")
        .select("record_id,payload")
        .eq("entity", entity)
        .eq("record_id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data.payload, id: data.record_id } : null;
    },
    create: async (input) => {
      const client = requireSupabase();
      const now = new Date().toISOString();
      const record = {
        id: input.id || crypto.randomUUID(),
        created_date: input.created_date || now,
        ...input,
      };
      const { data, error } = await client
        .from("agency_records")
        .insert({ entity, record_id: record.id, payload: record })
        .select("record_id,payload")
        .single();
      if (error) throw error;
      return { ...data.payload, id: data.record_id };
    },
    update: async (id, patch) => {
      const client = requireSupabase();
      const current = await entityApi(entity).get(id);
      if (!current) throw new Error(`${entity}/${id} was not found.`);
      const record = { ...current, ...patch, id, updated_date: new Date().toISOString() };
      const { data, error } = await client
        .from("agency_records")
        .update({ payload: record })
        .eq("entity", entity)
        .eq("record_id", id)
        .select("record_id,payload")
        .single();
      if (error) throw error;
      return { ...data.payload, id: data.record_id };
    },
    updateMany: async (conditions, patch) => {
      const rows = (await fetchRecords()).filter((record) => matches(record, conditions));
      return Promise.all(rows.map((record) => entityApi(entity).update(record.id, patch)));
    },
    delete: async (id) => {
      const client = requireSupabase();
      const { error } = await client
        .from("agency_records")
        .delete()
        .eq("entity", entity)
        .eq("record_id", id);
      if (error) throw error;
      return {};
    },
    /** @param {{ query?: Record<string, unknown>, groupBy?: string, count?: boolean, sum?: string }} options */
    aggregate: async ({ query = {}, groupBy, count, sum } = {}) => {
      const rows = (await fetchRecords()).filter((record) => matches(record, query));
      if (!groupBy) {
        return { rows: [{ count: count ? rows.length : undefined, sum: sum ? rows.reduce((total, row) => total + (Number(row[sum]) || 0), 0) : undefined }] };
      }
      const groups = new Map();
      rows.forEach((record) => {
        const key = record[groupBy] || "";
        const group = groups.get(key) || { [groupBy]: key, count: 0, sum: 0 };
        group.count += 1;
        if (sum) group.sum += Number(record[sum]) || 0;
        groups.set(key, group);
      });
      return { rows: [...groups.values()] };
    },
  };
}

export const db = {
  entities: new Proxy({}, { get: (_target, entity) => entityApi(String(entity)) }),
  functions: {
    invoke: async (name, options = {}) => {
      const client = requireSupabase();
      const functionName = {
        createCheckoutSession: "create-checkout-session",
      }[name] || name;
      const body = options.body ?? options;
      const { data, error } = await client.functions.invoke(functionName, { body });
      if (error) throw error;
      return data;
    },
  },
  integrations: {
    Core: {
      UploadFile: async (file) => {
        const client = requireSupabase();
        if (!(file instanceof File)) throw new Error("Choose a valid file to upload.");
        const userResult = await client.auth.getUser();
        if (userResult.error) throw userResult.error;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userResult.data.user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await client.storage.from(FILE_BUCKET).upload(path, file, {
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (error) throw error;
        const { data } = client.storage.from(FILE_BUCKET).getPublicUrl(path);
        return { file_url: data.publicUrl, file_name: file.name, file_key: path };
      },
      CreateFileSignedUrl: async ({ file_uri }) => {
        const client = requireSupabase();
        const { data, error } = await client.storage.from(FILE_BUCKET).createSignedUrl(file_uri, 3600);
        if (error) throw error;
        return { signed_url: data.signedUrl };
      },
    },
  },
};
