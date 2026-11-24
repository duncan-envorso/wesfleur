// Google Drive backup over Drive's REST API (no SDK needed).
// Uses the "drive.file" permission: the app can only see and change files and folders it created
// itself, never the rest of the Drive. Files go under "Westfleur Centre (app)/…" in the connected Drive.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel; an admin then connects from Settings.
import { db } from "./db";

const KEY = "gdrive";
const ROOT = "Westfleur Centre (app)";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email";

export const driveConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

async function getState() {
  const q = await db();
  const [r] = await q`SELECT value FROM settings WHERE key = ${KEY}`;
  return r?.value || null;
}
async function setState(v) {
  const q = await db();
  if (v === null) return q`DELETE FROM settings WHERE key = ${KEY}`;
  await q`INSERT INTO settings (key, value) VALUES (${KEY}, ${JSON.stringify(v)})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

export async function driveStatus() {
  const s = await getState();
  return { configured: driveConfigured(), connected: !!s?.refresh_token, email: s?.email || null, since: s?.connected_at || null, root: ROOT };
}

export function authUrl(origin, state) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/drive/callback`,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return u.toString();
}

export async function finishConnect(origin, code) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/api/drive/callback`, grant_type: "authorization_code",
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || "Google didn't return a refresh token");
  let email = null;
  try { email = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString()).email || null; } catch { /* no id token */ }
  await setState({ refresh_token: j.refresh_token, email, connected_at: new Date().toISOString(), folders: {} });
  return email;
}

export async function disconnect() {
  const s = await getState();
  if (s?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.refresh_token)}`, { method: "POST" }).catch(() => {});
  }
  await setState(null);
}

async function accessToken(s) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: s.refresh_token, grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) {
    if (j.error === "invalid_grant") throw new Error("Google Drive access has expired or was removed — reconnect it in Settings");
    throw new Error(j.error_description || j.error || "Couldn't get a Google Drive token");
  }
  return j.access_token;
}

async function gapi(token, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google Drive: ${j.error?.message || r.status}`);
  return j;
}

// Finds (or creates) a folder the app made earlier; ids are cached in settings.
async function folder(token, s, name, parentId) {
  const key = `${parentId || "root"}/${name}`;
  const cached = s.folders?.[key];
  if (cached) {
    const ok = await gapi(token, `https://www.googleapis.com/drive/v3/files/${cached}?fields=id,trashed`).catch(() => null);
    if (ok && !ok.trashed) return cached;
  }
  const qs = `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId || "root"}' in parents`;
  const found = await gapi(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qs)}&fields=files(id)&spaces=drive`);
  let id = found.files?.[0]?.id;
  if (!id) {
    const made = await gapi(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : undefined }),
    });
    id = made.id;
  }
  s.folders = { ...(s.folders || {}), [key]: id };
  return id;
}

// Uploads a file into "Westfleur Centre (app)/<...path>". Returns { id, webViewLink }.
export async function uploadToDrive(path, name, mime, bytes) {
  const s = await getState();
  if (!driveConfigured() || !s?.refresh_token) throw new Error("Google Drive isn't connected");
  const token = await accessToken(s);
  let parent = await folder(token, s, ROOT, null);
  for (const p of path) parent = await folder(token, s, p.replace(/[/\\]/g, "-").trim() || "Other", parent);
  await setState(s); // save any new folder ids

  const boundary = "wfc" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [parent] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return gapi(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
}
