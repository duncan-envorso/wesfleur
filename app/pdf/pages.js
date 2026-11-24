"use client";
import { useEffect, useRef, useState } from "react";

let pdfjsPromise;
function loadPdfjs() {
  pdfjsPromise ||= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

// Shows every page of a PDF, full width, drawing each page only when it scrolls near view.
// overlay(pageIndex) is drawn on top of each page; place children with % positions.
export default function PdfPages({ url, overlay, onLoad, onPageClick, maxWidth = 900, className = "" }) {
  const [doc, setDoc] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    let task;
    setDoc(null); setSizes([]); setErr("");
    loadPdfjs().then(async (pdfjs) => {
      task = pdfjs.getDocument({ url, withCredentials: true });
      const d = await task.promise;
      const s = [];
      for (let i = 1; i <= d.numPages; i++) {
        const p = await d.getPage(i);
        const v = p.getViewport({ scale: 1 });
        s.push({ w: v.width, h: v.height });
      }
      if (cancelled) return;
      setDoc(d); setSizes(s); onLoad?.(d.numPages, s);
    }).catch((e) => !cancelled && setErr(e?.message || "Couldn't open the PDF"));
    return () => { cancelled = true; task?.destroy?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (err) return <p className="err">Couldn&apos;t show the lease: {err}</p>;
  if (!doc) return <p className="meta">Loading the lease…</p>;
  return (
    <div className={"pdfpages " + className} style={{ maxWidth }}>
      {sizes.map((s, i) => (
        <Page key={i} doc={doc} index={i} size={s} overlay={overlay} onPageClick={onPageClick} />
      ))}
    </div>
  );
}

function Page({ doc, index, size, overlay, onPageClick }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [visible, setVisible] = useState(false);
  const [drawnAt, setDrawnAt] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let job;
    const draw = async () => {
      const el = wrap.current;
      if (!el) return;
      const cssW = el.clientWidth;
      if (!cssW || Math.abs(cssW - drawnAt) < 2) return;
      const page = await doc.getPage(index + 1);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (cssW / size.w) * ratio });
      const c = canvas.current;
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      job = page.render({ canvas: c, canvasContext: c.getContext("2d"), viewport: vp });
      await job.promise.catch(() => {});
      if (!cancelled) setDrawnAt(cssW);
    };
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => { cancelled = true; job?.cancel?.(); window.removeEventListener("resize", onResize); };
  }, [visible, doc, index, size, drawnAt]);

  function click(e) {
    if (!onPageClick || e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    onPageClick(index, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }

  return (
    <div className="pdfpage" ref={wrap} style={{ aspectRatio: `${size.w} / ${size.h}` }} data-page={index}>
      <canvas ref={canvas} aria-hidden="true" />
      <div className="pdfpage-layer" onClick={click}>{overlay?.(index)}</div>
      <span className="pdfpage-no">{index + 1}</span>
    </div>
  );
}
