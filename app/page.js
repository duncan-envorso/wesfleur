"use client";
import { useCallback, useEffect, useState } from "react";
import { calculate, money, parseReading, prevPeriod } from "@/lib/calc";
import { compressImage } from "@/lib/image";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const fmt = (n, d = 4) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-ZA", { minimumFractionDigits: d, maximumFractionDigits: d }));

function MeterCard({ m, period, tariffs, aiEnabled, readBy, onSaved }) {
  const [value, setValue] = useState(m.current !== null ? String(m.current).replace(".", ",") : "");
  const [opening, setOpening] = useState("");
  const [note, setNote] = useState(m.note || "");
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(m.photo_url || null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const current = parseReading(value);
  const previous = m.previous ?? (opening ? parseReading(opening) : null);
  const calc = Number.isFinite(current) && Number.isFinite(previous)
    ? calculate({ type: m.type, previous, current }, tariffs)
    : null;
  const unit = m.type === "electricity" ? "kWh" : "kL";

  async function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    const small = await compressImage(f);
    setPhoto(small);
    setPreview(URL.createObjectURL(small));
    if (aiEnabled) readPhoto(small);
  }

  async function readPhoto(file = photo) {
    if (!file) return;
    setBusy("Reading the meter…");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("type", m.type);
      const r = await fetch("/api/read-photo", { method: "POST", body: fd });
      const j = await r.json();
      if (j.reading) {
        setValue(j.reading);
        if (j.confidence !== "high") setError(`Check this reading (${j.confidence} confidence)${j.note ? ": " + j.note : ""}`);
      } else setError(j.error || "Could not read the photo — type the reading in");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setError("");
    if (!Number.isFinite(current)) return setError("Enter the reading, e.g. 0247,5018");
    setBusy("Saving…");
    try {
      if (m.previous === null && opening) {
        const o = new FormData();
        o.append("meter_id", m.id);
        o.append("period", prevPeriod(period));
        o.append("reading", opening);
        o.append("note", "Opening reading entered manually");
        const r0 = await fetch("/api/readings", { method: "POST", body: o });
        if (!r0.ok) throw new Error((await r0.json()).error);
      }
      const fd = new FormData();
      fd.append("meter_id", m.id);
      fd.append("period", period);
      fd.append("reading", value);
      fd.append("note", note);
      if (readBy) fd.append("read_by", readBy);
      if (photo) fd.append("photo", photo);
      const r = await fetch("/api/readings", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json()).error);
      setPhoto(null);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const done = m.current !== null && !photo && parseReading(value) === m.current;

  return (
    <div className={"card" + (done ? " done" : "")}>
      <div className="row">
        <div>
          <h2>{m.name}</h2>
          <div className="meta">{m.tenant}{m.meter_no ? ` · meter ${m.meter_no}` : ""}</div>
        </div>
        <span className={"pill" + (done ? " ok" : "")}>{done ? "Saved" : m.type}</span>
      </div>

      <div className="meta">
        Previous: {m.previous !== null ? <b>{fmt(m.previous)} {unit}</b> : "none"} {m.previous_period ? `(${m.previous_period})` : ""}
        {m.previous_photo_url && <> · <a href={m.previous_photo_url} target="_blank">photo</a></>}
      </div>
      {m.previous === null && (
        <label>Last month&apos;s reading (opening)
          <input inputMode="decimal" placeholder="e.g. 0239,0224" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </label>
      )}

      {preview && <img className="photo" src={preview} alt={`${m.name} meter`} />}
      <label className="btn ghost" style={{ textAlign: "center" }}>
        {preview ? "Retake photo" : "Take photo"}
        <input type="file" accept="image/*" capture="environment" onChange={pick} hidden />
      </label>

      <label>This month&apos;s reading ({unit})
        <input className="big" inputMode="decimal" placeholder="0247,5018" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      {aiEnabled && photo && <button className="ghost" onClick={() => readPhoto()} disabled={!!busy}>Read from photo</button>}

      {calc && (
        <div className="calc">
          <div className="row"><span>Used</span><b>{fmt(calc.usage)} {unit}</b></div>
          {calc.lines.map((l) => (
            <div className="row" key={l.label}><span>{l.label} {fmt(l.qty, 3)} {l.unit} × {money(l.rate)}</span><span>{money(l.amount)}</span></div>
          ))}
          <div className="row tot"><span>Total{tariffs.add_vat ? " incl. VAT" : ""}</span><span>{money(calc.total)}</span></div>
          {calc.warning && <div className="warnbox">{calc.warning}</div>}
        </div>
      )}

      <label>Note
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. leak at tap, meter dial dirty" />
      </label>
      {error && <div className="err">{error}</div>}
      <button onClick={save} disabled={!!busy}>{busy || (m.current !== null ? "Update reading" : "Save reading")}</button>
    </div>
  );
}

export default function Capture() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [aiEnabled, setAi] = useState(false);
  const [readBy, setReadBy] = useState("");
  const [filter, setFilter] = useState("todo");

  const load = useCallback(async () => {
    setError("");
    const r = await fetch(`/api/readings?period=${period}`);
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setData(j);
  }, [period]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/read-photo").then((r) => r.json()).then((j) => setAi(j.enabled)).catch(() => {});
    try { setReadBy(localStorage.getItem("readBy") || ""); } catch {}
  }, []);

  const meters = data?.meters || [];
  const doneCount = meters.filter((m) => m.current !== null).length;
  const shown = filter === "todo" ? meters.filter((m) => m.current === null) : meters;

  return (
    <>
      <h1>Capture meter readings</h1>
      <div className="bar">
        <label>Billing month
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
        <label>Read by
          <input value={readBy} placeholder="Your name" onChange={(e) => { setReadBy(e.target.value); try { localStorage.setItem("readBy", e.target.value); } catch {} }} />
        </label>
        <label>Show
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="todo">Still to read</option>
            <option value="all">All meters</option>
          </select>
        </label>
        <span className="pill">{doneCount} of {meters.length} read</span>
      </div>
      {error && <p className="err">{error}</p>}
      {!data && !error && <p className="meta">Loading…</p>}
      {data && shown.length === 0 && <p>All meters read for {period}. <a href="/report">See the report →</a></p>}
      <div className="grid">
        {shown.map((m) => (
          <MeterCard key={`${m.id}-${period}-${m.current}`} m={m} period={period} tariffs={data.tariffs} aiEnabled={aiEnabled} readBy={readBy} onSaved={load} />
        ))}
      </div>
    </>
  );
}
