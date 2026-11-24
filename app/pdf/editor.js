"use client";
import { useEffect, useRef, useState } from "react";
import PdfPages from "./pages";
import { DATA_SOURCES, SIGNER_KINDS, clampBox, dataLabel, kindInfo, newFieldId } from "@/lib/lease-fields";

/**
 * Place boxes on a PDF.
 * whoKey: "role" (templates: tenant / landlord / other) or "signer_id" (a lease already made).
 * people: [{ key, label, color }]
 * allowData: templates can also have "lease data" boxes filled from the tenant's records.
 */
export default function FieldEditor({ url, fields, onChange, whoKey = "role", people, allowData = false, values = null }) {
  const [who, setWho] = useState(people[0]?.key ?? null);
  const [tool, setTool] = useState(allowData ? "data" : "signature");
  const [source, setSource] = useState("tenant.legal_name");
  const [sel, setSel] = useState(null);
  const [pages, setPages] = useState(0);
  const pagesRef = useRef(null);

  useEffect(() => { if (!people.some((p) => p.key === who)) setWho(people[0]?.key ?? null); }, [people, who]);
  useEffect(() => {
    const onKey = (e) => {
      if (!sel || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(sel); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const colorOf = (f) => (f.kind === "data" ? "#0f7a55" : people.find((p) => p.key === f[whoKey])?.color || "#5d6a6b");
  const nameOf = (f) => (f.kind === "data" ? "" : people.find((p) => p.key === f[whoKey])?.label || "Nobody");
  const update = (id, patch) => onChange(fields.map((f) => (f.id === id ? clampBox({ ...f, ...patch }) : f)));
  const remove = (id) => { onChange(fields.filter((f) => f.id !== id)); setSel(null); };

  function place(page, x, y) {
    const info = kindInfo(tool);
    const f = clampBox({
      id: newFieldId(), kind: tool, page, w: info.w, h: info.h, x: x - info.w / 2, y: y - info.h / 2, required: true,
      ...(tool === "data" ? { source, label: source === "custom" ? "Other" : null } : { [whoKey]: who }),
    });
    onChange([...fields, f]);
    setSel(f.id);
  }

  function initialsEverywhere() {
    const idx = Math.max(0, people.findIndex((p) => p.key === who));
    const have = new Set(fields.filter((f) => f.kind === "initials" && f[whoKey] === who).map((f) => f.page));
    const add = [];
    for (let p = 0; p < pages; p++) {
      if (have.has(p)) continue;
      add.push(clampBox({ id: newFieldId(), kind: "initials", page: p, w: 0.08, h: 0.03, x: 0.9 - (idx + 1) * 0.09, y: 0.955, [whoKey]: who, required: true }));
    }
    onChange([...fields, ...add]);
  }

  const selected = fields.find((f) => f.id === sel);
  const counts = people.map((p) => ({ ...p, n: fields.filter((f) => f.kind !== "data" && f[whoKey] === p.key).length,
    sig: fields.some((f) => f.kind === "signature" && f[whoKey] === p.key) }));

  return (
    <div className="fe">
      <div className="fe-bar">
        <div className="fe-row">
          {allowData && <button type="button" className={"fe-tool data" + (tool === "data" ? " on" : "")} onClick={() => setTool("data")}>Lease data</button>}
          {SIGNER_KINDS.map((k) => (
            <button type="button" key={k.key} className={"fe-tool" + (tool === k.key ? " on" : "")} onClick={() => setTool(k.key)}>{k.label}</button>
          ))}
        </div>
        <div className="fe-row">
          {tool === "data" ? (
            <label className="fe-inline">Fill with
              <select value={source} onChange={(e) => setSource(e.target.value)}>{DATA_SOURCES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
            </label>
          ) : (
            <label className="fe-inline">For
              <select value={who ?? ""} onChange={(e) => setWho(whoKey === "signer_id" ? Number(e.target.value) : e.target.value)}>
                {people.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <span className="fe-swatch" style={{ background: people.find((p) => p.key === who)?.color }} />
            </label>
          )}
          {tool !== "data" && <button type="button" className="ghost small" disabled={!pages} onClick={initialsEverywhere}>Initials on every page</button>}
          <span className="meta">Tap the page to drop a <b>{kindInfo(tool).label.toLowerCase()}</b> box. Drag to move, corner to resize.</span>
        </div>
        <div className="fe-row meta">
          {counts.map((c) => <span key={c.key}><span className="fe-swatch" style={{ background: c.color }} /> {c.label}: {c.n} box{c.n === 1 ? "" : "es"}{c.n > 0 && !c.sig && <b className="warnbox"> · no signature box (they'll sign on a page added at the end)</b>}</span>)}
          {allowData && <span><span className="fe-swatch" style={{ background: "#0f7a55" }} /> Lease data: {fields.filter((f) => f.kind === "data").length}</span>}
        </div>
        {selected && (
          <div className="fe-row fe-sel">
            <b>{kindInfo(selected.kind).label}</b>
            {selected.kind === "data" ? (
              <>
                <select value={selected.source} onChange={(e) => update(selected.id, { source: e.target.value })}>{DATA_SOURCES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
                {selected.source === "custom" && <input value={selected.label || ""} onChange={(e) => update(selected.id, { label: e.target.value })} placeholder="What goes here, e.g. Trading hours" />}
              </>
            ) : (
              <select value={selected[whoKey] ?? ""} onChange={(e) => update(selected.id, { [whoKey]: whoKey === "signer_id" ? Number(e.target.value) : e.target.value })}>
                {people.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            )}
            {selected.kind === "text" && <input value={selected.label || ""} onChange={(e) => update(selected.id, { label: e.target.value })} placeholder="Question, e.g. ID number" />}
            {["text", "place"].includes(selected.kind) && (
              <label className="check"><input type="checkbox" checked={selected.required !== false} onChange={(e) => update(selected.id, { required: e.target.checked })} /> Required</label>
            )}
            <span className="meta">page {selected.page + 1}</span>
            <button type="button" className="ghost small" onClick={() => remove(selected.id)}>Delete box</button>
          </div>
        )}
      </div>

      <div ref={pagesRef}>
        <PdfPages
          url={url}
          onLoad={(n) => setPages(n)}
          onPageClick={(page, x, y) => { if (sel) setSel(null); else place(page, x, y); }}
          overlay={(page) => fields.filter((f) => f.page === page).map((f) => (
            <Box key={f.id} f={f} color={colorOf(f)} who={nameOf(f)} selected={f.id === sel} onSelect={() => setSel(f.id)}
              onMove={(patch) => update(f.id, patch)} value={values?.[f.id]} />
          ))}
        />
      </div>
    </div>
  );
}

function Box({ f, color, who, selected, onSelect, onMove, value }) {
  const drag = useRef(null);
  function start(e, mode) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const layer = e.currentTarget.closest(".pdfpage-layer").getBoundingClientRect();
    drag.current = { mode, x0: e.clientX, y0: e.clientY, f: { ...f }, W: layer.width, H: layer.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) / d.W, dy = (e.clientY - d.y0) / d.H;
    if (d.mode === "move") onMove({ x: d.f.x + dx, y: d.f.y + dy });
    else onMove({ w: d.f.w + dx, h: d.f.h + dy });
  }
  const end = () => { drag.current = null; };
  const text = f.kind === "data" ? (value ?? dataLabel(f.source === "custom" ? f.label || "Other" : f.source)) : `${kindInfo(f.kind).label}${f.kind === "text" && f.label ? `: ${f.label}` : ""}`;
  return (
    <div className={"fe-box" + (selected ? " sel" : "") + (f.kind === "data" ? " data" : "")}
      style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, "--c": color }}
      onPointerDown={(e) => start(e, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onClick={(e) => e.stopPropagation()} title={`${text}${who ? ` · ${who}` : ""}`}>
      <span className="fe-box-text">{text}{who && f.kind !== "data" ? <em> · {who}</em> : null}</span>
      <span className="fe-handle" onPointerDown={(e) => start(e, "size")} onPointerMove={move} onPointerUp={end} />
    </div>
  );
}
