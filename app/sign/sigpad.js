"use client";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

// Draw-or-type signature box. Calls onChange(pngDataUrl | null).
export default function SigPad({ label, typedDefault = "", height = 160, onChange, hint }) {
  const canvas = useRef(null);
  const pad = useRef(null);
  const [mode, setMode] = useState("draw");
  const [typed, setTyped] = useState(typedDefault);
  const [empty, setEmpty] = useState(true);

  // Keeps the canvas sharp on high-density screens and the right size on rotate.
  useEffect(() => {
    if (mode !== "draw") return;
    const c = canvas.current;
    const p = new SignaturePad(c, { penColor: "#0b1f4d", minWidth: 0.9, maxWidth: 2.6, backgroundColor: "rgba(0,0,0,0)" });
    pad.current = p;
    const fit = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = p.toData();
      c.width = c.offsetWidth * ratio;
      c.height = c.offsetHeight * ratio;
      c.getContext("2d").scale(ratio, ratio);
      p.clear();
      if (data.length) p.fromData(data);
    };
    fit();
    const end = () => { setEmpty(p.isEmpty()); onChange(p.isEmpty() ? null : trimmed(c), "draw"); };
    p.addEventListener("endStroke", end);
    window.addEventListener("resize", fit);
    return () => { p.removeEventListener("endStroke", end); window.removeEventListener("resize", fit); p.off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "type") return;
    const t = typed.trim();
    setEmpty(!t);
    onChange(t ? typedPng(t) : null, "type");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typed]);

  function clear() {
    if (mode === "draw") { pad.current?.clear(); setEmpty(true); onChange(null); }
    else setTyped("");
  }

  return (
    <div className="sigpad">
      <div className="sigpad-head">
        <b>{label}</b>
        <div className="seg small">
          <button type="button" className={mode === "draw" ? "on" : ""} onClick={() => { setMode("draw"); onChange(null); setEmpty(true); }}>Draw</button>
          <button type="button" className={mode === "type" ? "on" : ""} onClick={() => setMode("type")}>Type</button>
        </div>
      </div>
      {mode === "draw" ? (
        <div className="sigpad-box" style={{ height }}>
          <canvas ref={canvas} aria-label={`${label}: draw with your finger or mouse`} />
          {empty && <span className="sigpad-hint">{hint || "Sign here with your finger or mouse"}</span>}
          <span className="sigpad-line" />
        </div>
      ) : (
        <div className="sigpad-type">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your name" aria-label={`${label}: type`} />
          <div className="sigpad-preview" style={{ height: height * 0.7 }}>{typed.trim() ? <img src={typedPng(typed.trim())} alt="" /> : <span className="meta">Preview</span>}</div>
        </div>
      )}
      <button type="button" className="linkish small" onClick={clear}>Clear</button>
    </div>
  );
}

// Crops the drawn signature to its ink so it sits neatly on the PDF.
function trimmed(c) {
  const ctx = c.getContext("2d");
  const { width, height } = c;
  const d = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (d[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) return c.toDataURL("image/png");
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width, x1 + pad); y1 = Math.min(height, y1 + pad);
  const out = document.createElement("canvas");
  const scale = Math.min(1, 900 / (x1 - x0));
  out.width = Math.round((x1 - x0) * scale); out.height = Math.round((y1 - y0) * scale);
  out.getContext("2d").drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function typedPng(text) {
  const c = document.createElement("canvas");
  const size = 64;
  const font = `italic ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", "Apple Chancery", cursive`;
  const ctx = c.getContext("2d");
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 30;
  c.width = Math.min(w, 1200); c.height = size + 34;
  ctx.font = font;
  ctx.fillStyle = "#0b1f4d";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 15, c.height / 2, c.width - 30);
  return c.toDataURL("image/png");
}
