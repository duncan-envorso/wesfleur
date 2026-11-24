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
  // Admins-only tasks are hidden from property managers (e.g. anything about rents or their own lease).
  await q`ALTER TABLE todos ADD COLUMN IF NOT EXISTS private BOOLEAN NOT NULL DEFAULT false`;
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

// Assignee names are free text; compare them ignoring case and extra spaces.
export const whoKey = (v) => (v ?? "").toString().trim().replace(/\s+/g, " ").toLowerCase();
export const UNASSIGNED = "__none";

// assignee: "" = everyone, UNASSIGNED = tasks with nobody on them, otherwise a name.
export async function listTodos({ show = "open", tenantId = null, assignee = "", admin = true } = {}, t = todayIso()) {
  const q = await db();
  const rows = await q`SELECT td.*, tn.trading_name AS tenant_name
                       FROM todos td LEFT JOIN tenants tn ON tn.id = td.tenant_id
                       ORDER BY td.id DESC LIMIT 1000`;
  const all = rows.filter((r) => admin || !r.private).map((r) => ({ ...r, bucket: bucket(r, t) }));
  const byTenant = tenantId ? all.filter((r) => r.tenant_id === Number(tenantId)) : all;

  // People to filter by: everyone named on a task, plus the app's users, with open-task counts.
  // Shown under the spelling used most often (capitalised wins a tie), e.g. "Kirah" over "kirah".
  const people = new Map();
  const add = (name, weight = 1) => {
    const k = whoKey(name);
    if (!k) return k;
    const shown = name.toString().trim().replace(/\s+/g, " ");
    const p = people.get(k) || { open: 0, spellings: new Map() };
    p.spellings.set(shown, (p.spellings.get(shown) || 0) + weight);
    people.set(k, p);
    return k;
  };
  const bestName = (spellings) => [...spellings].sort((a, b) =>
    b[1] - a[1] || (/^[A-Z]/.test(b[0]) - /^[A-Z]/.test(a[0])) || a[0].localeCompare(b[0]))[0][0];
  for (const r of byTenant) {
    const k = add(r.assigned_to);
    if (k && !r.done) people.get(k).open++;
  }
  try {
    for (const u of await q`SELECT username, name FROM users WHERE active`) add(u.name || u.username, 0.5);
  } catch { /* users table not created yet */ }
  const unassignedOpen = byTenant.filter((r) => !r.done && !whoKey(r.assigned_to)).length;
  const assignees = [...people.values()].map((p) => ({ name: bestName(p.spellings), open: p.open }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const want = assignee === UNASSIGNED ? UNASSIGNED : whoKey(assignee);
  const scoped = !want ? byTenant
    : want === UNASSIGNED ? byTenant.filter((r) => !whoKey(r.assigned_to))
    : byTenant.filter((r) => whoKey(r.assigned_to) === want);
  const open = scoped.filter((r) => !r.done);
  const list = show === "done" ? scoped.filter((r) => r.done) : show === "all" ? scoped : open;
  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return String(b.done_at).localeCompare(String(a.done_at));
    const da = a.due_date || "9999-99-99", dbb = b.due_date || "9999-99-99";
    return da.localeCompare(dbb) || PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || a.id - b.id;
  });
  // Names and shops only (no rents), so the task form works for property managers too.
  const tenantOptions = await q`SELECT DISTINCT ON (tn.id) tn.id, tn.trading_name, u.code AS unit_code
                                FROM tenants tn
                                LEFT JOIN leases l ON l.tenant_id = tn.id AND l.status <> 'ended'
                                LEFT JOIN units u ON u.id = l.unit_id
                                WHERE EXISTS (SELECT 1 FROM leases x WHERE x.tenant_id = tn.id AND x.status <> 'ended')
                                ORDER BY tn.id, l.id DESC`;
  tenantOptions.sort((a, b) => a.trading_name.localeCompare(b.trading_name));
  return {
    today: t,
    admin,
    tenantOptions,
    assignees,
    unassignedOpen,
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

// Non-admins can't see, change or create admins-only tasks.
async function guard(q, id, admin) {
  if (admin) return;
  const [r] = await q`SELECT private FROM todos WHERE id = ${Number(id)}`;
  if (!r || r.private) throw new Error("That task no longer exists");
}

export async function saveTodo(body, user, id = null, admin = true) {
  const q = await db();
  if (id) await guard(q, id, admin);
  const title = clean(body.title);
  if (!title) throw new Error("Give the task a title");
  const priority = PRIORITIES.includes(body.priority) ? body.priority : "normal";
  const due = body.due_date ? isoDate(body.due_date) : null;
  if (body.due_date && !due) throw new Error("Due date isn't a valid date");
  const tenantId = body.tenant_id ? Number(body.tenant_id) : null;
  const who = clean(body.assigned_to)?.replace(/\s+/g, " ") ?? null;
  const vals = [title, clean(body.notes), due, priority, tenantId, clean(body.unit_code), who];
  if (id) {
    const r = await q`UPDATE todos SET title = ${vals[0]}, notes = ${vals[1]}, due_date = ${vals[2]}, priority = ${vals[3]},
                      tenant_id = ${vals[4]}, unit_code = ${vals[5]}, assigned_to = ${vals[6]},
                      private = CASE WHEN ${admin} THEN ${!!body.private} ELSE private END
                      WHERE id = ${Number(id)} RETURNING id`;
    if (!r.length) throw new Error("That task no longer exists");
    return { id: r[0].id };
  }
  const [r] = await q`INSERT INTO todos (title, notes, due_date, priority, tenant_id, unit_code, assigned_to, created_by, private)
                      VALUES (${vals[0]}, ${vals[1]}, ${vals[2]}, ${vals[3]}, ${vals[4]}, ${vals[5]}, ${vals[6]}, ${user || null}, ${admin && !!body.private})
                      RETURNING id`;
  return { id: r.id };
}

export async function setDone(id, done, user, admin = true) {
  const q = await db();
  await guard(q, id, admin);
  const r = done
    ? await q`UPDATE todos SET done = true, done_at = now(), done_by = ${user || null} WHERE id = ${Number(id)} RETURNING id`
    : await q`UPDATE todos SET done = false, done_at = NULL, done_by = NULL WHERE id = ${Number(id)} RETURNING id`;
  if (!r.length) throw new Error("That task no longer exists");
  return { ok: true };
}

export async function deleteTodo(id, admin = true) {
  const q = await db();
  await guard(q, id, admin);
  await q`DELETE FROM todos WHERE id = ${Number(id)}`;
  return { ok: true };
}
