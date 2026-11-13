import { db } from "./db";

// Dates are ISO text (YYYY-MM-DD), like the tenant tables.
export async function createTodoSchema(q) {
  await q`CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL,
    unit_code TEXT,
    assigned_to TEXT,
    done BOOLEAN NOT NULL DEFAULT false,
    done_at TIMESTAMPTZ,
    done_by TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

export const PRIORITIES = ["high", "normal", "low"];
const PRI_ORDER = { high: 0, normal: 1, low: 2 };
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);
const clean = (v) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
// "Today" in Cape Town, so a task due today doesn't turn overdue at 2am.
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

// Which bucket an open task falls in, relative to today.
export function bucket(todo, t = todayIso()) {
  if (todo.done) return "done";
  if (!todo.due_date) return "nodate";
  if (todo.due_date < t) return "overdue";
  if (todo.due_date === t) return "today";
  if (todo.due_date <= addDays(t, 7)) return "week";
  return "later";
}

export async function listTodos({ show = "open", tenantId = null } = {}, t = todayIso()) {
  const q = await db();
  const rows = await q`SELECT td.*, tn.trading_name AS tenant_name
                       FROM todos td LEFT JOIN tenants tn ON tn.id = td.tenant_id
                       ORDER BY td.id DESC LIMIT 1000`;
  const all = rows.map((r) => ({ ...r, bucket: bucket(r, t) }));
  const scoped = tenantId ? all.filter((r) => r.tenant_id === Number(tenantId)) : all;
  const open = scoped.filter((r) => !r.done);
  const list = show === "done" ? scoped.filter((r) => r.done) : show === "all" ? scoped : open;
  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return String(b.done_at).localeCompare(String(a.done_at));
    const da = a.due_date || "9999-99-99", dbb = b.due_date || "9999-99-99";
    return da.localeCompare(dbb) || PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || a.id - b.id;
  });
  return {
    today: t,
    rows: list,
    counts: {
      open: open.length,
      overdue: open.filter((r) => r.bucket === "overdue").length,
      today: open.filter((r) => r.bucket === "today").length,
      week: open.filter((r) => r.bucket === "week").length,
      high: open.filter((r) => r.priority === "high").length,
      done: scoped.length - open.length,
    },
  };
}

export async function saveTodo(body, user, id = null) {
  const q = await db();
  const title = clean(body.title);
  if (!title) throw new Error("Give the task a title");
  const priority = PRIORITIES.includes(body.priority) ? body.priority : "normal";
  const due = body.due_date ? isoDate(body.due_date) : null;
  if (body.due_date && !due) throw new Error("Due date isn't a valid date");
  const tenantId = body.tenant_id ? Number(body.tenant_id) : null;
  const vals = [title, clean(body.notes), due, priority, tenantId, clean(body.unit_code), clean(body.assigned_to)];
  if (id) {
    const r = await q`UPDATE todos SET title = ${vals[0]}, notes = ${vals[1]}, due_date = ${vals[2]}, priority = ${vals[3]},
                      tenant_id = ${vals[4]}, unit_code = ${vals[5]}, assigned_to = ${vals[6]}
                      WHERE id = ${Number(id)} RETURNING id`;
    if (!r.length) throw new Error("That task no longer exists");
    return { id: r[0].id };
  }
  const [r] = await q`INSERT INTO todos (title, notes, due_date, priority, tenant_id, unit_code, assigned_to, created_by)
                      VALUES (${vals[0]}, ${vals[1]}, ${vals[2]}, ${vals[3]}, ${vals[4]}, ${vals[5]}, ${vals[6]}, ${user || null})
                      RETURNING id`;
  return { id: r.id };
}

export async function setDone(id, done, user) {
  const q = await db();
  const r = done
    ? await q`UPDATE todos SET done = true, done_at = now(), done_by = ${user || null} WHERE id = ${Number(id)} RETURNING id`
    : await q`UPDATE todos SET done = false, done_at = NULL, done_by = NULL WHERE id = ${Number(id)} RETURNING id`;
  if (!r.length) throw new Error("That task no longer exists");
  return { ok: true };
}

export async function deleteTodo(id) {
  const q = await db();
  await q`DELETE FROM todos WHERE id = ${Number(id)}`;
  return { ok: true };
}
