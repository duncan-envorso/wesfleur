// Lease templates: a PDF plus boxes. "Lease data" boxes are filled from the tenant's records when a
// lease is made; signing boxes belong to a role (tenant, landlord, other signer).
import { db } from "./db";
import { cleanFields, dataLabel, resolveData } from "./lease-fields";
import { createRecord, event, fileBytes, MAX_PDF, saveFile } from "./signing";
import { inspectPdf, stampDataFields } from "./signing-pdf";

const clean = (v) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };

export async function listTemplates() {
  const q = await db();
  const rows = await q`SELECT id, name, page_count, fields, notes, archived, created_at, updated_at FROM lease_templates ORDER BY archived, name`;
  return { templates: rows.map(({ fields, ...t }) => ({ ...t, boxes: (fields || []).length, data_boxes: (fields || []).filter((f) => f.kind === "data").length })) };
}

export async function getTemplate(id) {
  const q = await db();
  const [t] = await q`SELECT id, name, file_id, page_count, fields, notes, archived, created_at, updated_at FROM lease_templates WHERE id = ${Number(id)}`;
  if (!t) throw new Error("Template not found");
  return { template: { ...t, fields: t.fields || [] } };
}

export async function createTemplate(form, user) {
  const q = await db();
  const file = form.get("file");
  if (!file || typeof file === "string" || !file.size) throw new Error("Attach the lease template as a PDF");
  if (file.size > MAX_PDF) throw new Error("That PDF is over 4 MB. Export it from Word as a normal (not scanned) PDF");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("That file isn't a PDF");
  const { pages } = await inspectPdf(bytes);
  const name = clean(form.get("name")) || (file.name || "Lease template").replace(/\.pdf$/i, "");
  const f = await saveFile(q, file.name || "template.pdf", bytes);
  const [t] = await q`INSERT INTO lease_templates (name, file_id, page_count, created_by) VALUES (${name}, ${f.id}, ${pages}, ${user || null}) RETURNING id`;
  return { id: t.id };
}

export async function updateTemplate(id, body) {
  const q = await db();
  const { template: t } = await getTemplate(id);
  const name = body.name !== undefined ? clean(body.name) : t.name;
  if (!name) throw new Error("Give the template a name");
  const fields = body.fields !== undefined ? cleanFields(body.fields, { pages: t.page_count, allowData: true }) : t.fields;
  await q`UPDATE lease_templates SET name = ${name}, fields = ${JSON.stringify(fields)}, notes = ${body.notes !== undefined ? clean(body.notes) : t.notes},
            archived = ${body.archived !== undefined ? !!body.archived : t.archived}, updated_at = now() WHERE id = ${t.id}`;
  return { ok: true, boxes: fields.length };
}

export async function templateFile(id) {
  const { template: t } = await getTemplate(id);
  return fileBytes(t.file_id);
}

// Tenant's details for filling a template, with the tenant's current (or chosen) lease and unit.
async function tenantContext(q, tenantId, leaseId) {
  const [tenant] = await q`SELECT * FROM tenants WHERE id = ${Number(tenantId)}`;
  if (!tenant) throw new Error("Tenant not found");
  const leases = await q`SELECT l.*, u.name AS unit_name, u.code AS unit_code, u.area_m2 FROM leases l LEFT JOIN units u ON u.id = l.unit_id
                         WHERE l.tenant_id = ${tenant.id} ORDER BY (l.status = 'ended'), l.id DESC`;
  const lease = (leaseId ? leases.find((l) => l.id === Number(leaseId)) : leases.find((l) => l.status === "renewal") || leases[0]) || {};
  return { tenant, lease, unit: { name: lease.unit_name, code: lease.unit_code, area_m2: lease.area_m2 }, leases };
}

// What each data box would say for this tenant (shown for checking before the lease is made).
export async function prefill(templateId, tenantId, leaseId) {
  const q = await db();
  const { template: t } = await getTemplate(templateId);
  const ctx = await tenantContext(q, tenantId, leaseId);
  const data = resolveData(ctx);
  const values = {};
  for (const f of t.fields.filter((x) => x.kind === "data")) values[f.id] = data[f.source] ?? "";
  const roles = [...new Set(t.fields.filter((f) => f.kind !== "data").map((f) => f.role))];
  return {
    values,
    lease_id: ctx.lease.id || null,
    leases: ctx.leases.map((l) => ({ id: l.id, label: `${l.unit_name || "Unit?"} · ${l.status}${l.start_date ? ` · from ${l.start_date}` : ""}` })),
    roles,
    signers: {
      tenant: { name: ctx.tenant.contact_name || "", email: ctx.tenant.email || "", capacity: `For ${ctx.tenant.legal_name || ctx.tenant.trading_name}, duly authorised` },
      landlord: { name: "Kirah Matthews", email: "", capacity: "For Westfleur Centre (Pty) Ltd, director, duly authorised" },
      surety: { name: ctx.tenant.surety_name || "", email: "", capacity: "" },
    },
    title: `Lease agreement - ${ctx.tenant.trading_name}${ctx.lease.unit_name ? ` (${ctx.lease.unit_name})` : ""}`,
  };
}

// Makes a lease from a template: fills the data boxes into the PDF, then creates a draft signing request.
export async function createFromTemplate(body, user) {
  const q = await db();
  const { template: t } = await getTemplate(body.template_id);
  if (t.archived) throw new Error("That template is archived");
  if (!t.fields.some((f) => f.kind === "signature")) throw new Error("The template has no signature boxes yet. Open it and place them first");
  const data = t.fields.filter((f) => f.kind === "data").map((f) => ({ ...f, value: String(body.values?.[f.id] ?? "").slice(0, 300) }));
  const original = await fileBytes(t.file_id);
  const filled = data.length ? await stampDataFields(original.bytes, data) : original.bytes;
  const { pages } = await inspectPdf(filled);
  const title = clean(body.title) || t.name;
  const f = await saveFile(q, `${title.replace(/[\\/:*?"<>|]/g, "-")}.pdf`, filled);
  const signers = (Array.isArray(body.signers) ? body.signers : []).map((s) => ({
    ...s, party: s.role === "landlord" ? "landlord" : s.role === "tenant" ? "tenant" : "other",
  }));
  const r = await createRecord(q, {
    tenantId: Number(body.tenant_id) || null, leaseId: Number(body.lease_id) || null, title, message: body.message,
    markSigned: body.mark_lease_signed !== false, file: f, pages, signers, user,
    note: `made from template "${t.name}" (${data.length} details filled in), ${pages} pages`,
    fields: t.fields.filter((x) => x.kind !== "data"), templateId: t.id,
  });
  const filledList = data.filter((d) => d.value).map((d) => `${d.source === "custom" ? d.label || "Other" : dataLabel(d.source)}: ${d.value}`).join("; ");
  if (filledList) await event(q, r.id, null, "filled", `Details filled in: ${filledList}`.slice(0, 2000));
  return r;
}
