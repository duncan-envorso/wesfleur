"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, dateZA } from "../tenants/ui";

const BLANK = { title: "", notes: "", due_date: "", priority: "normal", tenant_id: "", unit_code: "", assigned_to: "" };
const GROUPS = [
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["week", "Next 7 days"],
  ["later", "Later"],
  ["nodate", "No due date"],
  ["done", "Done"],
];
const PRI = { high: ["High", "bad"], normal: ["Normal", ""], low: ["Low", ""] };

function TodoForm({ initial, tenants, onSaved, onCancel }) {
  const [v, setV] = useState({ ...BLANK, ...(initial || {}), tenant_id: initial?.tenant_id ?? "", due_date: initial?.due_date ?? "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api(initial?.id ? `/api/todos/${initial.id}` : "/api/todos", "POST", v);
      onSaved();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="row"><h2>{initial?.id ? "Edit task" : "New task"}</h2><button type="button" className="ghost small-btn" onClick={onCancel}>Close</button></div>
      <div className="form-grid">
        <label className="wide">Task<input value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Send Shop 3 escalation letter" autoFocus required /></label>
        <label>Due date<input type="date" value={v.due_date} onChange={(e) => set("due_date", e.target.value)} /></label>
        <label>Priority
          <select value={v.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
          </select>
        </label>
        <label>Tenant (optional)
          <select value={v.tenant_id} onChange={(e) => set("tenant_id", e.target.value)}>
            <option value="">—</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.trading_name}{t.lease?.unit_code ? ` (Shop ${t.lease.unit_code})` : ""}</option>)}
          </select>
        </label>
        <label>Shop / area (optional)<input value={v.unit_code || ""} onChange={(e) => set("unit_code", e.target.value)} placeholder="e.g. 4, roof, gym" /></label>
        <label>Who&apos;s doing it<input value={v.assigned_to || ""} onChange={(e) => set("assigned_to", e.target.value)} placeholder="e.g. Duncan, plumber" /></label>
        <label className="wide">Notes<textarea rows={2} value={v.notes || ""} onChange={(e) => set("notes", e.target.value)} /></label>
      </div>
      {err && <p className="err">{err}</p>}
      <div><button disabled={busy}>{busy ? "Saving…" : "Save task"}</button></div>
    </form>
  );
}

export default function Todos() {
  const [show, setShow] = useState("open");
  const [data, setData] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(null); // null | {} (new) | task (edit)
  const [quick, setQuick] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const pending = useRef({ id: null, at: 0 });

  const load = useCallback(async () => {
    try { setData(await api(`/api/todos?show=${show}`)); setErr(""); } catch (e) { setErr(e.message); }
  }, [show]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api("/api/tenants").then((j) => setTenants(j.tenants || [])).catch(() => {}); }, []);

  async function addQuick(e) {
    e.preventDefault();
    if (!quick.trim()) return;
    try { await api("/api/todos", "POST", { title: quick }); setQuick(""); setMsg("Task added."); load(); } catch (e2) { setErr(e2.message); }
  }
  async function toggle(t) {
    setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === t.id ? { ...r, done: !t.done } : r)) }));
    try { await api(`/api/todos/${t.id}`, "POST", { done: !t.done }); setMsg(t.done ? "Task reopened." : "Task done."); } catch (e) { setErr(e.message); }
    load();
  }
  async function remove(id) {
    const now = Date.now();
    if (pending.current.id !== id || now - pending.current.at > 3000) { pending.current = { id, at: now }; setMsg("Tap × again to delete that task."); return; }
    await api(`/api/todos/${id}`, "DELETE"); setMsg("Task deleted."); load();
  }

  const c = data?.counts;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>To-do</h1>
          <p className="meta">Jobs for the centre: follow-ups, repairs, letters to tenants, things to check.</p>
        </div>
        <div className="row wrap"><button onClick={() => setForm({})}>New task</button></div>
      </div>
      {err && <p className="err">{err}</p>}
      {form && <TodoForm key={form.id || "new"} initial={form.id ? form : null} tenants={tenants} onCancel={() => setForm(null)}
        onSaved={() => { setForm(null); setMsg("Task saved."); load(); }} />}

      {c && (
        <div className="summary">
          <div className="stat"><span className="meta">Open</span><b>{c.open}</b><span className="meta">{c.high} high priority</span></div>
          <div className={"stat" + (c.overdue ? " alert" : "")}><span className="meta">Overdue</span><b>{c.overdue}</b><span className="meta">past their due date</span></div>
          <div className="stat"><span className="meta">Due today or this week</span><b>{c.today + c.week}</b><span className="meta">{c.today} today</span></div>
          <div className="stat"><span className="meta">Done</span><b>{c.done}</b><span className="meta">ticked off</span></div>
        </div>
      )}

      <form className="todo-quick" onSubmit={addQuick}>
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add a task and press Enter…" aria-label="Quick add a task" />
        <button className="ghost" disabled={!quick.trim()}>Add</button>
      </form>

      <div className="bar">
        <div className="segmented" role="tablist">
          {[["open", "Open"], ["done", "Done"], ["all", "All"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={show === k} className={show === k ? "on" : ""} onClick={() => setShow(k)}>{l}</button>
          ))}
        </div>
        {msg && <span className="pill ok">{msg}</span>}
      </div>

      {data && data.rows.length === 0 && (
        <p className="meta">{show === "done" ? "Nothing ticked off yet." : "Nothing on the list. Add a task above."}</p>
      )}
      {data && GROUPS.map(([key, label]) => {
        const rows = data.rows.filter((r) => r.bucket === key);
        if (!rows.length) return null;
        return (
          <section key={key} className="todo-group">
            <h2 className={key === "overdue" ? "bad-text" : ""}>{label} <span className="meta">{rows.length}</span></h2>
            <ul className="todo-list">
              {rows.map((t) => (
                <li key={t.id} className={"todo" + (t.done ? " is-done" : "")}>
                  <input type="checkbox" checked={!!t.done} onChange={() => toggle(t)} aria-label={t.done ? "Mark not done" : "Mark done"} />
                  <div className="todo-body">
                    <div className="todo-title">{t.title}</div>
                    <div className="todo-meta">
                      {t.priority !== "normal" && <span className={`pill ${PRI[t.priority][1]}`}>{PRI[t.priority][0]}</span>}
                      {t.due_date && <span className={key === "overdue" ? "bad-text" : ""}>Due {dateZA(t.due_date)}</span>}
                      {t.tenant_id && <Link href={`/tenants/${t.tenant_id}`}>{t.tenant_name}</Link>}
                      {t.unit_code && <span>Shop/area {t.unit_code}</span>}
                      {t.assigned_to && <span>→ {t.assigned_to}</span>}
                      {t.done && t.done_at && <span>Done {dateZA(String(t.done_at).slice(0, 10))}{t.done_by ? ` by ${t.done_by}` : ""}</span>}
                    </div>
                    {t.notes && <div className="todo-notes">{t.notes}</div>}
                  </div>
                  <div className="nowrap">
                    <button className="linkish small" onClick={() => setForm(t)}>edit</button>
                    <button className="linkish" onClick={() => remove(t.id)} aria-label="Delete task">×</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
