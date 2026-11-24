"use client";
import { useCallback, useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/expense-categories";
import { R, api } from "../tenants/ui";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const short = (p) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;
const long = (p) => `${MONTH[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const FREQ = { monthly: "Monthly", quarterly: "Every 3 months", yearly: "Once a year" };
const STATUS = {
  paid: ["Paid", "ok"], differs: ["Paid a different amount", "warn"], extra: ["Paid (not expected this month)", "info"],
  missing: ["Not recorded as paid", "bad"], due: ["Due", "warn"], planned: ["Expected", ""], none: ["", ""],
};
const BLANK = { name: "", supplier: "", match_text: "", category: "", amount: "", frequency: "monthly", due_day: "", start_period: "", end_period: "", method: "Debit order", notes: "", active: true };
const ord = (d) => d ? `${d}${[, "st", "nd", "rd"][d % 10 > 3 || Math.floor(d / 10) === 1 ? 0 : d % 10] || "th"}` : "";

export default function MonthlyCosts() {
  const [d, setD] = useState(null);
  const [months, setMonths] = useState(6);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => api(`/api/recurring?months=${months}`).then(setD).catch((e) => setErr(e.message)), [months]);
  useEffect(() => { load(); }, [load]);

  async function paid(row, period) {
    setBusy(`${row.id}:${period}`); setErr(""); setMsg("");
    try { await api("/api/recurring", "POST", { action: "paid", id: row.id, period }); setMsg(`${row.name}: recorded as paid for ${long(period)}.`); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(""); }
  }

  if (err && !d) return <p className="err">{err}</p>;
  if (!d) return <p className="meta">Loading…</p>;
  const ci = d.periods.indexOf(d.now);
  const cur = d.totals[ci];
  // Average over past months that have something recorded (payments or a City bill).
  const done = d.totals.filter((t) => t.period < d.now && (t.paid || t.city));
  const avg = done.length ? done.reduce((s, t) => s + t.paid + (t.city || 0), 0) / done.length : 0;

  return (
    <>
      <div className="row" style={{ alignItems: "baseline" }}>
        <div>
          <h1>Monthly costs</h1>
          <p className="meta" style={{ marginTop: -8 }}>Costs that come round every month: what to expect, what&apos;s been paid, and what&apos;s still due. Payments come from your Expenses; City fixed charges from each month&apos;s City bill.</p>
        </div>
        {!form && <button onClick={() => setForm({ ...BLANK, start_period: d.now })}>Add a recurring cost</button>}
      </div>

      <div className="summary">
        <div className="stat"><span className="meta">Recurring payments, {long(d.now)}</span><b>{R(cur?.expected || 0)}</b>
          <span className="meta">{R(cur?.paid || 0)} paid so far</span></div>
        <div className={"stat" + (cur?.outstanding ? " alert" : "")}><span className="meta">Still to pay this month</span><b>{R(cur?.outstanding || 0)}</b>
          <span className="meta">{d.due_now.length ? d.due_now.map((x) => `${x.name}${x.due_day ? ` (${ord(x.due_day)})` : ""}`).join(", ") : "Nothing outstanding"}</span></div>
        <div className="stat"><span className="meta">City fixed charges, {long(d.now)}</span><b>{cur?.city === null || cur?.city === undefined ? "—" : R(cur.city)}</b>
          <span className="meta">{cur?.city === null || cur?.city === undefined ? "City bill not entered yet" : "Rates, fixed water & sewerage, refuse, electricity service charge"}</span></div>
        <div className="stat"><span className="meta">Average per month{done.length ? ` (${done.length} month${done.length === 1 ? "" : "s"} with records)` : ""}</span><b>{R(avg)}</b><span className="meta">Paid recurring costs + City fixed charges</span></div>
      </div>

      {form && <CostForm initial={form} onCancel={() => setForm(null)} onSaved={(m) => { setForm(null); setMsg(m); load(); }} />}
      {msg && <p className="pill ok" style={{ justifySelf: "start" }}>{msg}</p>}
      {err && <p className="err">{err}</p>}

      <section className="card">
        <div className="row">
          <h2>Month by month</h2>
          <label className="fe-inline meta">Show
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[6, 12].map((n) => <option key={n} value={n}>last {n} months</option>)}
            </select>
          </label>
        </div>
        <div className="scroll">
          <table className="costs-grid">
            <thead>
              <tr><th>Cost</th>{d.periods.map((p) => <th key={p} className={"num" + (p === d.now ? " now" : "")}>{short(p)}</th>)}</tr>
            </thead>
            <tbody>
              <tr className="grp"><td colSpan={d.periods.length + 1}>Recurring payments</td></tr>
              {d.rows.length === 0 && <tr><td colSpan={d.periods.length + 1} className="meta">None set up yet. Add the costs you pay every month (insurance, bond, security, subscriptions…), or start from the suggestions below.</td></tr>}
              {d.rows.map((r) => (
                <tr key={r.id} className={r.active ? "" : "inactive"}>
                  <td>
                    <button type="button" className="linkish cost-name" onClick={() => setForm({ ...BLANK, ...r, amount: String(r.amount), end_period: r.end_period || "", due_day: r.due_day || "" })}>{r.name}</button>
                    <div className="meta">{R(r.amount)} · {FREQ[r.frequency]}{r.due_day ? ` · ${ord(r.due_day)}` : ""}{!r.active ? " · stopped" : ""}</div>
                  </td>
                  {r.cells.map((c) => {
                    const [label, cls] = STATUS[c.status];
                    return (
                      <td key={c.period} className={`num cell ${c.status}${c.period === d.now ? " now" : ""}`} title={label}>
                        {c.status === "none" ? <span className="meta">—</span> : (
                          <>
                            <span className={`pill ${cls}`}>{c.paid ? R(c.paid) : R(c.expected)}</span>
                            {c.status === "differs" && <div className="meta tiny">expected {R(c.expected)}</div>}
                            {["due", "missing"].includes(c.status) && (
                              <div><button type="button" className="linkish tiny" disabled={!!busy} onClick={() => paid(r, c.period)}>{busy === `${r.id}:${c.period}` ? "…" : "Mark paid"}</button></div>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="sub"><td>Recurring payments: paid</td>{d.totals.map((t) => <td key={t.period} className={"num" + (t.period === d.now ? " now" : "")}>{t.paid ? R(t.paid) : <span className="meta">—</span>}{t.expected && t.period >= d.now ? <div className="meta tiny">of {R(t.expected)}</div> : null}</td>)}</tr>

              <tr className="grp"><td colSpan={d.periods.length + 1}>City fixed charges <span className="meta">(from the City bill, part of your municipal payment)</span></td></tr>
              {d.city.map((c) => (
                <tr key={c.key}><td>{c.name}</td>{c.cells.map((x) => <td key={x.period} className={"num" + (x.period === d.now ? " now" : "")}>{x.amount === null ? <span className="meta">—</span> : x.amount ? R(x.amount) : <span className="meta">R0</span>}</td>)}</tr>
              ))}
              <tr className="sub"><td>City fixed charges</td>{d.totals.map((t) => <td key={t.period} className={"num" + (t.period === d.now ? " now" : "")}>{t.city === null ? <span className="meta">no bill</span> : R(t.city)}</td>)}</tr>
            </tbody>
            <tfoot>
              <tr><td><b>Total fixed costs</b></td>{d.totals.map((t) => <td key={t.period} className={"num" + (t.period === d.now ? " now" : "")}><b>{R((t.period >= d.now ? Math.max(t.expected, t.paid) : t.paid) + (t.city || 0))}</b></td>)}</tr>
            </tfoot>
          </table>
        </div>
        <p className="meta">
          <span className="pill ok">Paid</span> matched to an expense · <span className="pill warn">Due</span> this month, not yet recorded · <span className="pill bad">Not recorded</span> expected in a past month but no matching expense ·
          {" "}Payments are matched by supplier name, so a payment split over several expenses (e.g. bond interest and capital) counts in full. <b>Mark paid</b> records an expense at the expected amount; change it on Expenses if the amount differed.
          {" "}This month&apos;s total uses what&apos;s expected; past months use what was paid.
        </p>
      </section>

      {d.suggestions.length > 0 && (
        <section className="card">
          <h2>These look like recurring costs</h2>
          <p className="meta">Suppliers you paid in at least 3 of the last 6 months that aren&apos;t tracked here yet.</p>
          <ul className="signer-list">
            {d.suggestions.map((s) => (
              <li key={s.supplier}>
                <div className="signer-main"><b>{s.supplier}</b><div className="meta">{s.category_label} · paid in {s.months} of the last 6 months · about {R(s.monthly)} a month</div></div>
                <div className="signer-act"><button className="ghost" onClick={() => { setForm({ ...BLANK, name: s.supplier, supplier: s.supplier, category: s.category, amount: String(s.monthly), start_period: d.now }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Track it</button></div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function CostForm({ initial, onSaved, onCancel }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  async function save(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      if (v.id) await api(`/api/recurring/${v.id}`, "PUT", v); else await api("/api/recurring", "POST", v);
      onSaved(v.id ? `${v.name} updated.` : `${v.name} added.`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }
  async function remove() {
    setBusy(true); setErr("");
    try { await api(`/api/recurring/${v.id}`, "DELETE"); onSaved(`${v.name} removed. Its past expenses stay on the Expenses page.`); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return (
    <form className="card" onSubmit={save}>
      <div className="row"><h2>{v.id ? "Edit recurring cost" : "Add a recurring cost"}</h2><button type="button" className="ghost" onClick={onCancel}>Close</button></div>
      <div className="formgrid">
        <label>Name<input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Building insurance" required /></label>
        <label>Amount each time, incl. VAT (R)<input inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} placeholder="5 995,43" required /></label>
        <label>How often
          <select value={v.frequency} onChange={(e) => set("frequency", e.target.value)}>{Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label>Day it&apos;s due (optional)<input type="number" min={1} max={31} value={v.due_day} onChange={(e) => set("due_day", e.target.value)} placeholder="e.g. 1" /></label>
        <label>Category
          <select value={v.category || ""} onChange={(e) => set("category", e.target.value)} required>
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label>Paid to (supplier)<input value={v.supplier || ""} onChange={(e) => set("supplier", e.target.value)} placeholder="e.g. Renasa" /></label>
        <label>Match expenses whose supplier contains<input value={v.match_text || ""} onChange={(e) => set("match_text", e.target.value)} placeholder={v.supplier || "Same as supplier"} />
          <span className="hint">How the app finds this cost among your expenses</span></label>
        <label>Paid by<select value={v.method || "Debit order"} onChange={(e) => set("method", e.target.value)}>{["Debit order", "EFT", "Card", "Cash", "Other"].map((m) => <option key={m}>{m}</option>)}</select></label>
        <label>First month<input type="month" value={v.start_period} onChange={(e) => set("start_period", e.target.value)} required /></label>
        <label>Last month (optional)<input type="month" value={v.end_period || ""} onChange={(e) => set("end_period", e.target.value)} />
          <span className="hint">e.g. when a loan or contract ends</span></label>
        <label className="wide">Notes<input value={v.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Policy or account number, what it covers…" /></label>
        {v.id && <label className="check"><input type="checkbox" checked={v.active !== false} onChange={(e) => set("active", e.target.checked)} /> Still being paid</label>}
      </div>
      {err && <p className="err">{err}</p>}
      <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
        <button disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        {v.id && <button type="button" className="ghost" disabled={busy} onClick={remove}>Remove</button>}
      </div>
    </form>
  );
}
