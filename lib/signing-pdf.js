// Builds the final signed lease: initials on every page, a signature page, an audit certificate,
// and a digital seal (PAdES) so any later change to the file shows up as tampering.
import { createHash, randomBytes } from "node:crypto";
import forge from "node-forge";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { SUBFILTER_ETSI_CADES_DETACHED } from "@signpdf/utils";
import { db } from "./db";

export const sha256 = (bytes) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");

const SAST = (iso) => iso
  ? new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " SAST"
  : "—";

// Checks an uploaded lease PDF: readable, not password-protected. Returns its page count.
export async function inspectPdf(bytes) {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(e.message)) throw new Error("That PDF is password-protected. Export it again from Word without a password.");
    throw new Error("That file isn't a readable PDF");
  }
  return { pages: doc.getPageCount() };
}

// The seal certificate: made once, kept in settings. Self-issued, so PDF readers show it as
// "identity not verified", but any change to the signed file after sealing is still detected.
async function sealCertificate() {
  const q = await db();
  const [row] = await q`SELECT value FROM settings WHERE key = 'signing_seal'`;
  if (row?.value?.p12) return row.value;
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + randomBytes(8).toString("hex");
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 20 * 365 * 86400000);
  const attrs = [
    { name: "commonName", value: "Westfleur Centre (Pty) Ltd - document seal" },
    { name: "organizationName", value: "Westfleur Centre (Pty) Ltd" },
    { name: "countryName", value: "ZA" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: "basicConstraints", cA: false }, { name: "keyUsage", digitalSignature: true, nonRepudiation: true }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const passphrase = randomBytes(18).toString("base64url");
  const p12 = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" })).getBytes();
  const value = { p12: Buffer.from(p12, "binary").toString("base64"), passphrase, created_at: new Date().toISOString() };
  await q`INSERT INTO settings (key, value) VALUES ('signing_seal', ${JSON.stringify(value)}) ON CONFLICT (key) DO NOTHING`;
  const [again] = await q`SELECT value FROM settings WHERE key = 'signing_seal'`;
  return again.value;
}

const pngBytes = (dataUrl) => Buffer.from(String(dataUrl).replace(/^data:image\/png;base64,/, ""), "base64");

// Wraps text to a width with a standard font.
function wrap(text, font, size, width) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const t = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
// pdf-lib's standard fonts only cover WinAnsi; replace anything else.
const safe = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

/**
 * req: { id, title, tenant_name, lessor_name, original_sha256 }
 * signers: [{ name, email, party, capacity, place, signed_at, verified_at, verify_method, ip, user_agent,
 *             signature_png, initials_png, sent_at, viewed_at }]
 * events: [{ at, kind, detail, signer_name, ip }]
 */
export async function buildSignedPdf(originalBytes, req, signers, events) {
  const doc = await PDFDocument.load(originalBytes, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.14, 0.14);
  const grey = rgb(0.38, 0.42, 0.42);
  const originalPages = doc.getPageCount();

  const imgs = [];
  for (const s of signers) {
    imgs.push({
      sig: await doc.embedPng(pngBytes(s.signature_png)),
      ini: await doc.embedPng(pngBytes(s.initials_png || s.signature_png)),
    });
  }

  // 1. Initials of every signer at the foot of every original page.
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const boxW = 46, boxH = 22, gap = 6;
    let x = width - 24 - signers.length * (boxW + gap) + gap;
    page.drawText("Initials:", { x: x - 40, y: 12, size: 7, font, color: grey });
    imgs.forEach(({ ini }) => {
      const sc = Math.min(boxW / ini.width, boxH / ini.height);
      page.drawImage(ini, { x: x + (boxW - ini.width * sc) / 2, y: 8, width: ini.width * sc, height: ini.height * sc });
      page.drawLine({ start: { x, y: 7 }, end: { x: x + boxW, y: 7 }, thickness: 0.4, color: grey });
      x += boxW + gap;
    });
  }

  const A4 = [595.28, 841.89];
  const M = 56;
  const newPage = () => { const p = doc.addPage(A4); return { p, y: A4[1] - M }; };
  const text = (ctx, str, { size = 10, f = font, color = ink, indent = 0, lh = 1.4 } = {}) => {
    for (const line of wrap(safe(str), f, size, A4[0] - 2 * M - indent)) {
      if (ctx.y < M + 20) { const n = newPage(); ctx.p = n.p; ctx.y = n.y; }
      ctx.p.drawText(line, { x: M + indent, y: ctx.y, size, font: f, color });
      ctx.y -= size * lh;
    }
  };

  // 2. Signature page.
  let ctx = newPage();
  text(ctx, "SIGNATURE PAGE", { size: 15, f: bold });
  ctx.y -= 6;
  text(ctx, `This page forms part of "${req.title}" between ${req.lessor_name} (the Landlord) and ${req.tenant_name} (the Tenant): ${originalPages} pages before this page.`);
  text(ctx, "The parties signed this agreement electronically, as recorded in the audit certificate that follows, and agree that their electronic signatures and initials have the same effect as handwritten ones (Electronic Communications and Transactions Act 25 of 2002).");
  text(ctx, `Fingerprint (SHA-256) of the agreement as presented for signature: ${req.original_sha256}`, { size: 8, color: grey });
  ctx.y -= 10;
  signers.forEach((s, i) => {
    if (ctx.y < M + 150) { const n = newPage(); ctx.p = n.p; ctx.y = n.y; }
    text(ctx, s.party === "landlord" ? "FOR THE LANDLORD" : s.party === "tenant" ? "FOR THE TENANT" : "SIGNATORY", { size: 9, f: bold, color: grey });
    const { sig } = imgs[i];
    const sc = Math.min(220 / sig.width, 70 / sig.height);
    ctx.p.drawImage(sig, { x: M, y: ctx.y - sig.height * sc - 2, width: sig.width * sc, height: sig.height * sc });
    ctx.y -= 76;
    ctx.p.drawLine({ start: { x: M, y: ctx.y }, end: { x: M + 260, y: ctx.y }, thickness: 0.6, color: ink });
    ctx.y -= 14;
    text(ctx, s.name, { f: bold });
    if (s.capacity) text(ctx, s.capacity, { size: 9 });
    text(ctx, `Signed electronically at ${s.place || "-"} on ${SAST(s.signed_at)}`, { size: 9, color: grey });
    ctx.y -= 18;
  });

  // 3. Audit certificate.
  ctx = newPage();
  text(ctx, "AUDIT CERTIFICATE", { size: 15, f: bold });
  ctx.y -= 4;
  text(ctx, `Document: ${req.title}`);
  text(ctx, `Reference: WFC-SIGN-${req.id}`);
  text(ctx, `Prepared by: ${req.lessor_name}, through the Westfleur Centre system`);
  text(ctx, `Pages signed: ${originalPages} (plus this signature page and certificate)`);
  text(ctx, `Fingerprint (SHA-256) of the document presented for signature: ${req.original_sha256}`, { size: 8.5 });
  ctx.y -= 8;
  for (const s of signers) {
    text(ctx, `${s.name}${s.party ? ` (${s.party})` : ""}`, { f: bold, size: 10.5 });
    const rows = [
      ["Email", s.email || "-"],
      ["Capacity", s.capacity || "-"],
      ["Link sent", SAST(s.sent_at)],
      ["First opened", SAST(s.viewed_at)],
      ["Identity check", s.verify_method === "email_code" ? `One-time code sent to ${s.email}, entered ${SAST(s.verified_at)}` : "Signing link handed over directly by the Landlord (no email code)"],
      ["Signed", `${SAST(s.signed_at)} at ${s.place || "-"}`],
      ["IP address", s.ip || "-"],
      ["Device", (s.user_agent || "-").slice(0, 160)],
    ];
    for (const [k, v] of rows) text(ctx, `${k}: ${v}`, { size: 8.5, indent: 10, lh: 1.35 });
    ctx.y -= 6;
  }
  ctx.y -= 4;
  text(ctx, "Event log", { f: bold, size: 10.5 });
  for (const e of events) text(ctx, `${SAST(e.at)}  ${e.signer_name ? e.signer_name + ": " : ""}${e.detail || e.kind}${e.ip ? `  (IP ${e.ip})` : ""}`, { size: 8, indent: 10, lh: 1.35 });
  ctx.y -= 8;
  text(ctx, "This file carries a digital seal applied when the last party signed. Opening it in a PDF reader that checks signatures (e.g. Adobe Acrobat) shows whether it has been changed since. The seal is issued by Westfleur Centre itself, so the reader may describe the signer's identity as not verified; that does not affect the tamper check.", { size: 8, color: grey });

  doc.setTitle(`${req.title} (signed)`);
  doc.setProducer("Westfleur Centre");
  doc.setModificationDate(new Date());

  // 4. Digital seal over the whole file.
  const seal = await sealCertificate();
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: `Signed by all parties (WFC-SIGN-${req.id})`,
    contactInfo: "Westfleur Centre (Pty) Ltd",
    name: "Westfleur Centre (Pty) Ltd",
    location: "Atlantis, South Africa",
    signatureLength: 16384,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
    appName: "Westfleur Centre",
  });
  const unsigned = Buffer.from(await doc.save({ useObjectStreams: false }));
  const signer = new P12Signer(Buffer.from(seal.p12, "base64"), { passphrase: seal.passphrase });
  return new SignPdf().sign(unsigned, signer);
}
