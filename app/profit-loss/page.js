"use client";
import { useEffect, useState } from "react";
import { R, api } from "../tenants/ui";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mlabel = (p) => `${SHORT[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;
const cell = (v) => (Math.abs(v) < 0.005 ? <span className="meta">—</span> : R(v));

function Section({ title, rows, months }) {
  if (!rows.length) return null;
  return (
    <>
      <tr className="pl-section"><td colSpan={months.length + 2}>{title}</td></tr>
      {rows.map((r) => (
        <tr key={r.label}><td className="pl-label">{r.label}</td>{months.map((m) => <td key={m} className="num">{cell(r.values[m])}</td>)}<td className="num">{cell(r.sum)}</td></tr>
      ))}
    </>
  );
}
function TotalRow({ label, values, months, strong, signed }) {
  const sum = months.reduce((s, m) => s + values[m], 0);
  const cls = (v) => (signed ? (v < -0.005 ? "neg" : v > 0.005 ? "pos" : "") : "");
  return (
    <tr className={strong ? "pl-total strong" : "pl-total"}>
      <td className="pl-label">{label}</td>
      {months.map((m) => <td key={m} className={`num ${cls(values[m])}`}>{R(values[m])}</td>)}
      <td className={`num ${cls(sum)}`}>{R(sum)}</td>
    </tr>
  );
}

export default function ProfitLoss() {
  const [to, setTo] = useState(thisMonth());
  const [n, setN] = useState(6);
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api(`/api/pnl?to=${to}&months=${n}`).then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message)); }, [to, n]);

  function csv() {
    const head = ["", ...d.months, "Total"];
    const rows = [];
    const push = (label, values) => rows.push([label, ...d.months.map((m) => values[m]), d.months.reduce((s, m) => s + values[m], 0).toFixed(2)]);
    rows.push(["Income"]); d.billing.forEach((r) => push(r.label, r.values)); d.other.forEach((r) => push(r.label, r.values)); push("Total income", d.income);
    rows.push(["Expenses"]); d.costs.forEach((r) => push(r.label, r.values)); push("Total expenses", d.costTotal);
    push("Net profit", d.profit);
    rows.push(["Below the line"]); d.capitalIncome.forEach((r) => push(r.label, r.values)); d.below.forEach((r) => push(r.label, r.values));
    const text = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `westfleur-profit-loss-${d.months[0]}-to-${d.months.at(-1)}.csv`;
    a.click();
  }

  const last = d?.months.at(-1);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Profit &amp; loss</h1>
          <p className="meta">Westfleur Centre (Pty) Ltd — rent and recoveries from invoices, other income, and expenses, by month.</p>
        </div>
        <div className="row wrap">
          <label className="month-pick">Up to<input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Months
            <select value={n} onChange={(e) => setN(Number(e.target.value))}>{[3, 6, 12].map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </label>
          {d && <button className="ghost" onClick={csv}>Download CSV</button>}
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      {d && (
        <>
          <div className="summary">
            <div className="stat"><span className="meta">Income, {mlabel(last)}</span><b>{R(d.income[last])}</b></div>
            <div className="stat"><span className="meta">Expenses, {mlabel(last)}</span><b>{R(d.costTotal[last])}</b></div>
            <div className={"stat" + (d.profit[last] < 0 ? " alert" : "")}><span className="meta">Net profit, {mlabel(last)}</span>
              <b className={d.profit[last] < 0 ? "neg" : "pos"}>{R(d.profit[last])}</b></div>
            <div className="stat"><span className="meta">Drawings &amp; personal, {mlabel(last)}</span><b>{R(d.belowTotal[last])}</b><span className="meta">not company costs</span></div>
          </div>
          {d.draftMonths.length > 0 && (
            <p className="warnbox">{d.draftMonths.map(mlabel).join(", ")} include{d.draftMonths.length === 1 ? "s" : ""} draft invoices that haven&apos;t been issued yet.</p>
          )}
          <div className="scroll">
            <table className="pl">
              <thead><tr><th></th>{d.months.map((m) => <th key={m} className="num">{mlabel(m)}{d.draftMonths.includes(m) ? "*" : ""}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                <Section title="Income — tenant billing" rows={d.billing} months={d.months} />
                <Section title="Income — other" rows={d.other} months={d.months} />
                <TotalRow label="Total income" values={d.income} months={d.months} />
                <Section title="Expenses" rows={d.costs} months={d.months} />
                <TotalRow label="Total expenses" values={d.costTotal} months={d.months} />
                <TotalRow label="Net profit" values={d.profit} months={d.months} strong signed />
                {(d.capitalIncome.length > 0 || d.below.length > 0) && <tr className="pl-gap"><td colSpan={d.months.length + 2}></td></tr>}
                <Section title="Below the line — capital receipts" rows={d.capitalIncome} months={d.months} />
                <Section title="Below the line — drawings, personal, loan capital, assets" rows={d.below} months={d.months} />
              </tbody>
            </table>
          </div>
          <p className="meta">
            Rent and recoveries are counted in the month invoiced (issued invoices; a draft counts until it&apos;s issued). Other income and expenses are counted in the month they&apos;re for.
            Bond and vehicle finance repayments include capital — split them into interest and capital when recording, or profit will be understated.
            Amounts include VAT paid to suppliers, as the company isn&apos;t VAT-registered. This is a management report; your accountant&apos;s figures for SARS may differ (e.g. wear and tear, accruals).
          </p>
        </>
      )}
    </>
  );
}
