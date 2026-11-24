// Online lease signing: a request holds one lease PDF and its signers. Each signer gets a private
// link; with email set up they also confirm a one-time code. When everyone has signed, the lease
// is sealed (signing-pdf.js), stored here, emailed to the parties and copied to Google Drive.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { uploadToDrive, driveStatus } from "./drive";
import { emailHtml, esc, mailEnabled, sendMail } from "./mail";
import { buildSignedPdf, inspectPdf, sha256 } from "./signing-pdf";
import { cleanFields } from "./lease-fields";

export const LESSOR = "Westfleur Centre (Pty) Ltd";
export const MAX_PDF = 4 * 1024 * 1024; // Vercel functions accept up to ~4.5 MB per request
const LINK_DAYS = 21;
const CODE_MINUTES = 10;
const CODE_TRIES = 5;
const VERIFIED_FOR_MS = 2 * 3600 * 1000;

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const clean = (v) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createSigningSchema(q) {
  await q`CREATE TABLE IF NOT EXISTS signing_files (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT 'application/pdf',
    size INT NOT NULL,
    sha256 TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS signing_requests (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL,
    lease_id INT REFERENCES leases(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    mark_lease_signed BOOLEAN NOT NULL DEFAULT true,
    original_file_id INT REFERENCES signing_files(id),
    signed_file_id INT REFERENCES signing_files(id),
    original_sha256 TEXT,
    signed_sha256 TEXT,
    page_count INT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    seal_error TEXT,
    drive_status TEXT,
    drive_file_id TEXT,
    drive_link TEXT,
    drive_error TEXT
  )`;
  await q`CREATE TABLE IF NOT EXISTS signing_signers (
    id SERIAL PRIMARY KEY,
    request_id INT NOT NULL REFERENCES signing_requests(id) ON DELETE CASCADE,
    sort INT NOT NULL DEFAULT 0,
    party TEXT NOT NULL DEFAULT 'tenant',
    name TEXT NOT NULL,
    email TEXT,
    capacity TEXT,
    status TEXT NOT NULL DEFAULT 'waiting',
    token_hash TEXT UNIQUE,
    link_expires TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    otp_hash TEXT,
    otp_expires TIMESTAMPTZ,
    otp_tries INT NOT NULL DEFAULT 0,
    otp_sent INT NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ,
    verify_method TEXT,
    signed_at TIMESTAMPTZ,
    place TEXT,
    signature_png TEXT,
    initials_png TEXT,
    ip TEXT,
    user_agent TEXT,
    decline_reason TEXT
  )`;
  await q`ALTER TABLE signing_requests ADD COLUMN IF NOT EXISTS fields JSONB`;
  await q`ALTER TABLE signing_requests ADD COLUMN IF NOT EXISTS template_id INT`;
  await q`ALTER TABLE signing_signers ADD COLUMN IF NOT EXISTS field_values JSONB`;
  await q`CREATE TABLE IF NOT EXISTS lease_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    file_id INT NOT NULL REFERENCES signing_files(id),
    page_count INT NOT NULL,
    fields JSONB NOT NULL DEFAULT '[]',
    notes TEXT,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS signing_events (
    id SERIAL PRIMARY KEY,
    request_id INT NOT NULL REFERENCES signing_requests(id) ON DELETE CASCADE,
    signer_id INT REFERENCES signing_signers(id) ON DELETE SET NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind TEXT NOT NULL,
    detail TEXT,
    ip TEXT,
    user_agent TEXT
  )`;
}

export async function event(q, requestId, signerId, kind, detail, meta = {}) {
  await q`INSERT INTO signing_events (request_id, signer_id, kind, detail, ip, user_agent)
          VALUES (${requestId}, ${signerId || null}, ${kind}, ${detail || null}, ${meta.ip || null}, ${meta.ua ? meta.ua.slice(0, 300) : null})`;
}

export function clientMeta(req) {
  const h = req.headers;
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, ua: h.get("user-agent") || null };
}

export async function saveFile(q, name, bytes) {
  const buf = Buffer.from(bytes);
  const [r] = await q`INSERT INTO signing_files (name, size, sha256, data) VALUES (${name}, ${buf.length}, ${sha256(buf)}, ${buf.toString("base64")}) RETURNING id, sha256`;
  return r;
}
export async function fileBytes(id) {
  const q = await db();
  const [r] = await q`SELECT name, mime, data FROM signing_files WHERE id = ${Number(id)}`;
  if (!r) throw new Error("File not found");
  return { name: r.name, mime: r.mime, bytes: Buffer.from(r.data, "base64") };
}

// ---------- admin ----------

export async function createRequest(form, user) {
  const q = await db();
  const file = form.get("file");
  if (!file || typeof file === "string" || !file.size) throw new Error("Attach the final lease as a PDF");
  if (file.size > MAX_PDF) throw new Error("That PDF is over 4 MB. Export it from Word as a normal (not scanned) PDF");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("That file isn't a PDF");
  const { pages } = await inspectPdf(bytes);

  const f = await saveFile(q, file.name || "lease.pdf", bytes);
  let signers;
  try { signers = JSON.parse(form.get("signers") || "[]"); } catch { throw new Error("Signer list is invalid"); }
  return createRecord(q, {
    tenantId: Number(form.get("tenant_id")) || null, leaseId: Number(form.get("lease_id")) || null,
    title: form.get("title"), message: form.get("message"), markSigned: form.get("mark_lease_signed") !== "false",
    file: f, pages, signers, user, note: `${file.name || "lease.pdf"}, ${pages} pages`,
  });
}

// Shared by uploads and templates. signers: [{ name, email, capacity, party, role? }]; fields use "role".
export async function createRecord(q, { tenantId, leaseId, title: rawTitle, message, markSigned = true, file: f, pages, signers, user, note, fields = [], templateId = null }) {
  if (!tenantId) throw new Error("Choose the tenant");
  const [tenant] = await q`SELECT id, trading_name FROM tenants WHERE id = ${tenantId}`;
  if (!tenant) throw new Error("Tenant not found");
  if (leaseId) {
    const [l] = await q`SELECT id FROM leases WHERE id = ${leaseId} AND tenant_id = ${tenantId}`;
    if (!l) throw new Error("That lease belongs to a different tenant");
  }
  const title = clean(rawTitle) || `Lease agreement - ${tenant.trading_name}`;
  signers = signers.map((s, i) => ({ name: clean(s.name), email: clean(s.email)?.toLowerCase() || null, capacity: clean(s.capacity), party: ["tenant", "landlord", "other"].includes(s.party) ? s.party : "other", role: s.role || null, sort: i }))
    .filter((s) => s.name);
  if (!signers.length) throw new Error("Add at least one signer");
  if (signers.length > 6) throw new Error("Six signers at most");
  for (const s of signers) if (s.email && !EMAIL_RE.test(s.email)) throw new Error(`Check the email address for ${s.name}`);
  if (mailEnabled()) for (const s of signers) if (!s.email) throw new Error(`Add an email address for ${s.name} (needed for their one-time code)`);
  const roles = new Set(signers.map((s) => s.role).filter(Boolean));
  for (const x of fields) if (x.kind !== "data" && !x.signer_id && !roles.has(x.role)) throw new Error(`The template has boxes for the ${x.role === "surety" ? "other signer" : x.role}, so add someone signing as ${x.role === "surety" ? "the other signer" : `the ${x.role}`}`);

  const [r] = await q`INSERT INTO signing_requests (tenant_id, lease_id, title, message, mark_lease_signed, original_file_id, original_sha256, page_count, created_by, template_id)
                      VALUES (${tenantId}, ${leaseId}, ${title}, ${clean(message)}, ${markSigned}, ${f.id}, ${f.sha256}, ${pages}, ${user || null}, ${templateId})
                      RETURNING id`;
  const byRole = {};
  for (const s of signers) {
    const [row] = await q`INSERT INTO signing_signers (request_id, sort, party, name, email, capacity) VALUES (${r.id}, ${s.sort}, ${s.party}, ${s.name}, ${s.email}, ${s.capacity}) RETURNING id`;
    if (s.role) byRole[s.role] = row.id;
  }
  // Template boxes are for a role; tie each to that role's signer.
  const placed = fields.filter((x) => x.kind !== "data").map((x) => {
    const signer_id = x.signer_id || byRole[x.role];
    const { role, ...rest } = x;
    return { ...rest, signer_id };
  });
  if (placed.length) await q`UPDATE signing_requests SET fields = ${JSON.stringify(placed)} WHERE id = ${r.id}`;
  await event(q, r.id, null, "created", `Prepared by ${user || "admin"}: ${note}, SHA-256 ${f.sha256}`);
  return { id: r.id };
}

const STATUS_LABEL = { draft: "Draft", sent: "Out for signing", completed: "Signed by all", voided: "Cancelled", declined: "Declined" };

export async function listRequests({ tenantId = null } = {}) {
  const q = await db();
  const rows = await q`SELECT r.id, r.tenant_id, r.lease_id, r.title, r.status, r.created_at, r.sent_at, r.completed_at, r.page_count,
                              r.drive_status, r.seal_error, t.trading_name AS tenant_name
                       FROM signing_requests r LEFT JOIN tenants t ON t.id = r.tenant_id
                       ORDER BY r.id DESC LIMIT 300`;
  const signers = await q`SELECT request_id, name, party, status, signed_at FROM signing_signers ORDER BY request_id, sort`;
  const list = rows.filter((r) => !tenantId || r.tenant_id === Number(tenantId)).map((r) => ({
    ...r, status_label: STATUS_LABEL[r.status] || r.status,
    signers: signers.filter((s) => s.request_id === r.id),
  }));
  return { requests: list, mail: mailEnabled(), drive: await driveStatus() };
}

export async function getRequest(id) {
  const q = await db();
  const [r] = await q`SELECT r.*, t.trading_name AS tenant_name, t.legal_name AS tenant_legal_name
                      FROM signing_requests r LEFT JOIN tenants t ON t.id = r.tenant_id WHERE r.id = ${Number(id)}`;
  if (!r) throw new Error("Signing request not found");
  const signers = await q`SELECT id, sort, party, name, email, capacity, status, link_expires, sent_at, viewed_at, verified_at, verify_method,
                                 signed_at, place, ip, decline_reason FROM signing_signers WHERE request_id = ${r.id} ORDER BY sort`;
  const events = await q`SELECT e.at, e.kind, e.detail, e.ip, s.name AS signer_name FROM signing_events e
                         LEFT JOIN signing_signers s ON s.id = e.signer_id WHERE e.request_id = ${r.id} ORDER BY e.at, e.id`;
  return { request: { ...r, status_label: STATUS_LABEL[r.status] || r.status }, signers, events, mail: mailEnabled(), drive: await driveStatus() };
}

async function newLink(q, signer, origin) {
  const token = randomBytes(24).toString("base64url");
  await q`UPDATE signing_signers SET token_hash = ${hash(token)}, link_expires = now() + make_interval(days => ${LINK_DAYS}),
            status = CASE WHEN status = 'waiting' THEN 'sent' ELSE status END, sent_at = COALESCE(sent_at, now())
          WHERE id = ${signer.id}`;
  return `${origin}/sign/${token}`;
}

function inviteEmail(r, s, url) {
  const who = s.party === "landlord" ? `${r.tenant_name} has a lease ready for you to countersign` : `${LESSOR} has sent you a lease to sign`;
  return {
    subject: `Please sign: ${r.title}`,
    html: emailHtml({
      heading: `Hi ${s.name.split(" ")[0]}, please sign your lease`,
      paragraphs: [
        esc(who) + ".",
        `<b>${esc(r.title)}</b> (${r.page_count} pages)`,
        ...(r.message ? [esc(r.message).replace(/\n/g, "<br>")] : []),
        "Open the link below, read the lease, then confirm with a one-time code we'll email you, and sign on your phone or computer.",
      ],
      button: { href: url, label: "Review and sign" },
      footer: `This link is personal to you and expires in ${LINK_DAYS} days. If you weren't expecting this, ignore this email.`,
    }),
  };
}

// action: send (all unsent / everyone not signed), resend (one signer), link (copy link for one signer), void
export async function requestAction(id, body, user, origin) {
  const q = await db();
  const data = await getRequest(id);
  const r = data.request;
  const action = body.action;
  if (["completed", "voided", "declined"].includes(r.status) && action !== "retry_drive" && action !== "retry_seal")
    throw new Error(`This request is ${r.status_label.toLowerCase()}`);

  if (action === "void") {
    await q`UPDATE signing_requests SET status = 'voided', voided_at = now(), void_reason = ${clean(body.reason)} WHERE id = ${r.id}`;
    await q`UPDATE signing_signers SET token_hash = NULL WHERE request_id = ${r.id}`;
    await event(q, r.id, null, "voided", `Cancelled by ${user || "admin"}${body.reason ? `: ${body.reason}` : ""}`);
    return { ok: true };
  }
  if (action === "fields") {
    if (r.status !== "draft") throw new Error("Boxes can only be changed before the lease is sent");
    const ids = data.signers.map((s) => s.id);
    const fields = cleanFields(body.fields, { pages: r.page_count }).map((f) => {
      if (!ids.includes(f.signer_id)) throw new Error("A box belongs to someone who isn't signing");
      return f;
    });
    await q`UPDATE signing_requests SET fields = ${JSON.stringify(fields)} WHERE id = ${r.id}`;
    return { ok: true, count: fields.length };
  }
  if (action === "retry_seal") {
    if (r.status !== "sent" || data.signers.some((s) => s.status !== "signed")) throw new Error("Not everyone has signed yet");
    await finalize(r.id);
    return { ok: true };
  }
  if (action === "retry_drive") {
    if (r.status !== "completed") throw new Error("Only signed leases are backed up");
    await backupToDrive(r.id);
    return getRequest(r.id);
  }
  if (action === "link") {
    const s = data.signers.find((x) => x.id === Number(body.signer_id));
    if (!s || s.status === "signed") throw new Error("That signer has already signed");
    const url = await newLink(q, s, origin);
    if (r.status === "draft") await q`UPDATE signing_requests SET status = 'sent', sent_at = now() WHERE id = ${r.id}`;
    await event(q, r.id, s.id, "link", `New signing link made by ${user || "admin"} to hand over directly (any earlier link for ${s.name} stops working)`);
    return { url, expires_days: LINK_DAYS };
  }
  if (action === "send" || action === "resend") {
    if (!mailEnabled()) throw new Error("Email isn't set up yet, so use “Copy link” and send it by WhatsApp or email yourself");
    const targets = data.signers.filter((s) => s.status !== "signed" && (action === "send" ? true : s.id === Number(body.signer_id)));
    if (!targets.length) throw new Error("Nobody left to send to");
    const sent = [];
    for (const s of targets) {
      if (!s.email) throw new Error(`No email address for ${s.name}`);
      const url = await newLink(q, s, origin);
      const m = inviteEmail(r, s, url);
      await sendMail({ to: s.email, ...m });
      await event(q, r.id, s.id, "sent", `Signing link emailed to ${s.email}`);
      sent.push(s.name);
    }
    if (r.status === "draft") await q`UPDATE signing_requests SET status = 'sent', sent_at = now() WHERE id = ${r.id}`;
    return { sent };
  }
  throw new Error("Unknown action");
}

// ---------- signer (public, by link) ----------

async function signerByToken(q, token) {
  if (!token || token.length < 20) throw new Error("This signing link isn't valid");
  const [s] = await q`SELECT * FROM signing_signers WHERE token_hash = ${hash(token)}`;
  if (!s) throw new Error("This signing link isn't valid any more. Ask Westfleur Centre for a new one");
  const [r] = await q`SELECT r.*, t.trading_name AS tenant_name FROM signing_requests r LEFT JOIN tenants t ON t.id = r.tenant_id WHERE r.id = ${s.request_id}`;
  if (s.status !== "signed" && s.link_expires && new Date(s.link_expires) < new Date()) throw new Error("This signing link has expired. Ask Westfleur Centre for a new one");
  return { s, r };
}

export async function publicView(token, meta) {
  const q = await db();
  const { s, r } = await signerByToken(q, token);
  if (!s.viewed_at && s.status !== "signed") {
    await q`UPDATE signing_signers SET viewed_at = now(), status = CASE WHEN status IN ('waiting','sent') THEN 'viewed' ELSE status END WHERE id = ${s.id}`;
    await event(q, r.id, s.id, "viewed", "Opened the signing link", meta);
  }
  const others = await q`SELECT name, party, status FROM signing_signers WHERE request_id = ${r.id} AND id <> ${s.id} ORDER BY sort`;
  const needsCode = mailEnabled() && !!s.email;
  const verified = !!s.verified_at && Date.now() - new Date(s.verified_at).getTime() < VERIFIED_FOR_MS;
  const masked = s.email ? s.email.replace(/^(.)(.*)(@.*)$/, (m, a, b, c) => a + "•".repeat(Math.min(6, b.length)) + c) : null;
  const all = Array.isArray(r.fields) ? r.fields : [];
  const names = Object.fromEntries((await q`SELECT id, name, status FROM signing_signers WHERE request_id = ${r.id}`).map((x) => [x.id, x]));
  const fields = all.map((f) => ({
    id: f.id, kind: f.kind, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, label: f.label, required: f.required !== false,
    mine: f.signer_id === s.id, who: names[f.signer_id]?.name || "", done: names[f.signer_id]?.status === "signed",
  }));
  return {
    fields,
    title: r.title, tenant: r.tenant_name, lessor: LESSOR, pages: r.page_count, message: r.message,
    request_status: r.status, completed: r.status === "completed",
    signer: { name: s.name, party: s.party, capacity: s.capacity, status: s.status, email: masked, signed_at: s.signed_at },
    others, needsCode, verified: !needsCode || verified, mail: mailEnabled(),
  };
}

export async function publicDocument(token, which = "original") {
  const q = await db();
  const { r, s } = await signerByToken(q, token);
  if (which === "signed") {
    if (r.status !== "completed" || !r.signed_file_id) throw new Error("The signed copy isn't ready yet");
    if (s.status !== "signed") throw new Error("Not available");
    return fileBytes(r.signed_file_id);
  }
  return fileBytes(r.original_file_id);
}

function assertOpen(r, s) {
  if (r.status === "voided") throw new Error("Westfleur Centre has cancelled this signing request");
  if (r.status === "declined") throw new Error("This lease was declined, so it can't be signed");
  if (r.status === "completed" || s.status === "signed") throw new Error("You've already signed this lease");
}

export async function sendCode(token, meta) {
  const q = await db();
  const { s, r } = await signerByToken(q, token);
  assertOpen(r, s);
  if (!mailEnabled() || !s.email) throw new Error("No code is needed for this link");
  if (s.otp_sent >= 8) throw new Error("Too many codes sent. Ask Westfleur Centre for a new link");
  if (s.otp_expires && new Date(s.otp_expires).getTime() - CODE_MINUTES * 60000 > Date.now() - 45000) throw new Error("A code was just sent. Wait a minute before asking for another");
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await q`UPDATE signing_signers SET otp_hash = ${hash(`${s.id}:${code}`)}, otp_expires = now() + make_interval(mins => ${CODE_MINUTES}),
            otp_tries = 0, otp_sent = otp_sent + 1 WHERE id = ${s.id}`;
  await sendMail({
    to: s.email,
    subject: `Your signing code: ${code}`,
    html: emailHtml({ heading: `Your code is ${code}`, paragraphs: [`Enter this code to sign <b>${esc(r.title)}</b>. It works for ${CODE_MINUTES} minutes.`], footer: "If you didn't ask for this code, someone may have your signing link. Tell Westfleur Centre." }),
    text: `Your code to sign ${r.title} is ${code}. It works for ${CODE_MINUTES} minutes.`,
  });
  await event(q, r.id, s.id, "code_sent", `One-time code emailed to ${s.email}`, meta);
  return { ok: true, minutes: CODE_MINUTES };
}

export async function verifyCode(token, code, meta) {
  const q = await db();
  const { s, r } = await signerByToken(q, token);
  assertOpen(r, s);
  if (!s.otp_hash || !s.otp_expires || new Date(s.otp_expires) < new Date()) throw new Error("That code has expired. Ask for a new one");
  if (s.otp_tries >= CODE_TRIES) throw new Error("Too many wrong codes. Ask for a new one");
  const want = Buffer.from(s.otp_hash, "hex");
  const got = Buffer.from(hash(`${s.id}:${String(code || "").replace(/\D/g, "")}`), "hex");
  if (!timingSafeEqual(want, got)) {
    await q`UPDATE signing_signers SET otp_tries = otp_tries + 1 WHERE id = ${s.id}`;
    await event(q, r.id, s.id, "code_wrong", "Wrong code entered", meta);
    throw new Error(`That code isn't right (${CODE_TRIES - s.otp_tries - 1} tries left)`);
  }
  await q`UPDATE signing_signers SET verified_at = now(), verify_method = 'email_code', otp_hash = NULL WHERE id = ${s.id}`;
  await event(q, r.id, s.id, "verified", `Confirmed the one-time code sent to ${s.email}`, meta);
  return { ok: true };
}

const PNG_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export async function signAsSigner(token, body, meta) {
  const q = await db();
  const { s, r } = await signerByToken(q, token);
  assertOpen(r, s);
  const needsCode = mailEnabled() && !!s.email;
  if (needsCode && !(s.verified_at && Date.now() - new Date(s.verified_at).getTime() < VERIFIED_FOR_MS)) throw new Error("Confirm your one-time code first");
  if (body.agree !== true) throw new Error("Tick the box to confirm you've read the lease and agree to sign it electronically");
  const mine = (Array.isArray(r.fields) ? r.fields : []).filter((f) => f.signer_id === s.id);
  const values = {};
  for (const f of mine.filter((x) => x.kind === "text" || x.kind === "place")) {
    const v = clean(body.values?.[f.id]);
    if (!v && f.required !== false) throw new Error(`Fill in ${f.kind === "place" ? "the place you're signing" : `"${f.label || "the text box"}"`}`);
    if (v) values[f.id] = v.slice(0, 200);
  }
  const applied = new Set(Array.isArray(body.applied) ? body.applied : []);
  const missing = mine.filter((f) => (f.kind === "signature" || f.kind === "initials") && !applied.has(f.id));
  if (missing.length) throw new Error(`${missing.length} signature or initial box${missing.length === 1 ? " is" : "es are"} still empty`);
  const place = clean(body.place) || mine.filter((f) => f.kind === "place").map((f) => values[f.id]).find(Boolean) || null;
  if (!place) throw new Error("Enter the town or city where you're signing");
  for (const [k, label] of [["signature", "signature"], ["initials", "initials"]]) {
    const v = body[k];
    if (!v || !PNG_RE.test(v)) throw new Error(`Add your ${label}`);
    if (v.length > 400000) throw new Error(`Your ${label} image is too large`);
  }
  const [done] = await q`UPDATE signing_signers SET status = 'signed', signed_at = now(), place = ${place.slice(0, 80)},
                           signature_png = ${body.signature}, initials_png = ${body.initials}, ip = ${meta.ip}, user_agent = ${meta.ua ? meta.ua.slice(0, 300) : null},
                           field_values = ${JSON.stringify(values)},
                           verify_method = COALESCE(verify_method, 'link')
                         WHERE id = ${s.id} AND status <> 'signed' RETURNING id`;
  if (!done) throw new Error("You've already signed this lease");
  const nSig = mine.filter((f) => f.kind === "signature").length, nIni = mine.filter((f) => f.kind === "initials").length;
  const boxes = mine.length ? `; signed ${nSig} signature box${nSig === 1 ? "" : "es"} and initialled ${nIni} box${nIni === 1 ? "" : "es"} on the agreement` : "";
  await event(q, r.id, s.id, "signed", `Signed at ${place} (${body.method === "typed" ? "typed" : "drawn"} signature)${boxes}, agreeing to sign electronically`, meta);

  const [{ left }] = await q`SELECT count(*)::int AS left FROM signing_signers WHERE request_id = ${r.id} AND status <> 'signed'`;
  if (left === 0) {
    try { await finalize(r.id); } catch (e) {
      await q`UPDATE signing_requests SET seal_error = ${e.message} WHERE id = ${r.id}`;
      await event(q, r.id, null, "seal_failed", `Sealing failed: ${e.message}`);
    }
  }
  return { ok: true, completed: left === 0 };
}

export async function declineAsSigner(token, reason, meta) {
  const q = await db();
  const { s, r } = await signerByToken(q, token);
  assertOpen(r, s);
  const why = clean(reason);
  if (!why) throw new Error("Tell Westfleur Centre briefly why you're declining");
  await q`UPDATE signing_signers SET status = 'declined', decline_reason = ${why.slice(0, 500)} WHERE id = ${s.id}`;
  await q`UPDATE signing_requests SET status = 'declined' WHERE id = ${r.id}`;
  await q`UPDATE signing_signers SET token_hash = NULL WHERE request_id = ${r.id} AND id <> ${s.id}`;
  await event(q, r.id, s.id, "declined", `Declined to sign: ${why}`, meta);
  if (r.tenant_id) await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text) VALUES (${r.tenant_id}, ${new Date().toISOString().slice(0, 10)}, 'Lease', ${`${s.name} declined to sign "${r.title}": ${why}`})`;
  return { ok: true };
}

// ---------- completion ----------

export async function finalize(id) {
  const q = await db();
  const [r] = await q`SELECT r.*, t.trading_name AS tenant_name, t.legal_name FROM signing_requests r LEFT JOIN tenants t ON t.id = r.tenant_id WHERE r.id = ${Number(id)}`;
  if (r.status === "completed") return;
  const signers = await q`SELECT * FROM signing_signers WHERE request_id = ${r.id} ORDER BY sort`;
  if (signers.some((s) => s.status !== "signed")) throw new Error("Not everyone has signed");
  const events = await q`SELECT e.at, e.kind, e.detail, e.ip, s.name AS signer_name FROM signing_events e
                         LEFT JOIN signing_signers s ON s.id = e.signer_id WHERE e.request_id = ${r.id} ORDER BY e.at, e.id`;
  const original = await fileBytes(r.original_file_id);
  if (sha256(original.bytes) !== r.original_sha256) throw new Error("The stored lease doesn't match its fingerprint");

  const signed = await buildSignedPdf(original.bytes, { id: r.id, title: r.title, tenant_name: r.legal_name || r.tenant_name, lessor_name: LESSOR, original_sha256: r.original_sha256 }, signers, events, Array.isArray(r.fields) ? r.fields : []);
  const name = `${r.title.replace(/[\\/:*?"<>|]/g, "-")} - signed.pdf`;
  const f = await saveFile(q, name, signed);
  const [ok] = await q`UPDATE signing_requests SET status = 'completed', completed_at = now(), signed_file_id = ${f.id}, signed_sha256 = ${f.sha256}, seal_error = NULL
                       WHERE id = ${r.id} AND status = 'sent' RETURNING id`;
  if (!ok) return;
  await event(q, r.id, null, "completed", `All parties signed. Sealed PDF SHA-256 ${f.sha256}`);

  if (r.tenant_id) {
    await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text)
            VALUES (${r.tenant_id}, ${new Date().toISOString().slice(0, 10)}, 'Lease', ${`Signed online by all parties: "${r.title}" (WFC-SIGN-${r.id})`})`;
  }
  if (r.lease_id && r.mark_lease_signed) {
    await q`UPDATE leases SET status = 'signed' WHERE id = ${r.lease_id} AND status IN ('unsigned', 'none')`;
  }

  if (mailEnabled()) {
    for (const s of signers.filter((x) => x.email)) {
      try {
        await sendMail({
          to: s.email,
          subject: `Signed: ${r.title}`,
          html: emailHtml({ heading: "Your lease is signed", paragraphs: [`Everyone has signed <b>${esc(r.title)}</b>. Your copy is attached, including the signature page and audit certificate.`, "Keep it for your records."] }),
          attachments: [{ filename: name, content: signed }],
        });
        await event(q, r.id, s.id, "copy_sent", `Signed copy emailed to ${s.email}`);
      } catch (e) {
        await event(q, r.id, s.id, "copy_failed", `Couldn't email the signed copy: ${e.message}`);
      }
    }
  }
  try { await backupToDrive(r.id); } catch { /* recorded on the request; retry from the app */ }
}

export async function backupToDrive(id) {
  const q = await db();
  const [r] = await q`SELECT r.*, t.trading_name AS tenant_name FROM signing_requests r LEFT JOIN tenants t ON t.id = r.tenant_id WHERE r.id = ${Number(id)}`;
  const st = await driveStatus();
  if (!st.connected) {
    await q`UPDATE signing_requests SET drive_status = 'not_connected', drive_error = NULL WHERE id = ${r.id}`;
    return;
  }
  try {
    const f = await fileBytes(r.signed_file_id);
    const up = await uploadToDrive(["Leases", r.tenant_name || "No tenant"], f.name, "application/pdf", f.bytes);
    await q`UPDATE signing_requests SET drive_status = 'saved', drive_file_id = ${up.id}, drive_link = ${up.webViewLink || null}, drive_error = NULL WHERE id = ${r.id}`;
    await event(q, r.id, null, "drive", `Copied to Google Drive (${st.email || "connected account"})`);
  } catch (e) {
    await q`UPDATE signing_requests SET drive_status = 'failed', drive_error = ${e.message} WHERE id = ${r.id}`;
    throw e;
  }
}
