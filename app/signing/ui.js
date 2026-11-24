"use client";
import Link from "next/link";

const PILL = { draft: "", sent: "info", completed: "ok", voided: "", declined: "bad" };
export const statusPill = (r) => <span className={`pill ${PILL[r.status] || ""}`}>{r.status_label}</span>;
export const when = (iso, dateOnly = false) => iso
  ? new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric", ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }) })
  : "—";

export function SetupNotes({ mail, drive }) {
  if (mail && drive?.connected) return null;
  return (
    <div className="card setup-note">
      {!mail && <p><b>Email isn&apos;t set up yet.</b> You can still send leases: use <b>Copy link</b> and send it by WhatsApp or email yourself. Tenants then sign without a one-time code, and the audit certificate records that you handed the link over directly. To add codes and automatic emails, set up email in <Link href="/settings#signing">Settings</Link>.</p>}
      {!drive?.connected && <p><b>Google Drive backup is off.</b> Signed leases are stored in the app. {drive?.configured ? <>Connect Drive in <Link href="/settings#signing">Settings</Link> to keep a copy there too.</> : <>See <Link href="/settings#signing">Settings</Link> to set it up.</>}</p>}
    </div>
  );
}

