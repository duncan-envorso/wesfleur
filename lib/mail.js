// Email through Resend's HTTP API (no SDK needed).
// Set RESEND_API_KEY and MAIL_FROM (e.g. "Westfleur Centre <leases@yourdomain.co.za>") in Vercel.
// MAIL_FROM's domain must be verified in Resend before it can email tenants.

export function mailEnabled() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export function mailFrom() {
  return process.env.MAIL_FROM || null;
}

// attachments: [{ filename, content: Buffer | Uint8Array }]
export async function sendMail({ to, subject, html, text, attachments, replyTo }) {
  if (!mailEnabled()) throw new Error("Email isn't set up (RESEND_API_KEY and MAIL_FROM in Vercel)");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: replyTo || process.env.MAIL_REPLY_TO || undefined,
      attachments: attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Email not sent: ${j.message || j.error || r.status}`);
  return j.id;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// A plain, readable email layout.
export function emailHtml({ heading, paragraphs = [], button, footer }) {
  return `<!doctype html><html><body style="margin:0;background:#f3f6f5;font-family:Arial,Helvetica,sans-serif;color:#1b2324">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#0f3d3e;color:#fff;padding:14px 20px;border-radius:10px 10px 0 0;font-weight:bold">Westfleur Centre</div>
    <div style="background:#fff;padding:22px 20px;border:1px solid #e3e8e7;border-top:0;border-radius:0 0 10px 10px">
      <h1 style="font-size:19px;margin:0 0 14px">${esc(heading)}</h1>
      ${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${p}</p>`).join("")}
      ${button ? `<p style="margin:20px 0"><a href="${esc(button.href)}" style="background:#0f3d3e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold">${esc(button.label)}</a></p>` : ""}
      ${footer ? `<p style="font-size:12.5px;color:#5d6a6b;margin:18px 0 0">${footer}</p>` : ""}
    </div>
  </div></body></html>`;
}
