// Signed session cookie using Web Crypto (works in the proxy and in route handlers).
export const COOKIE = "wf_session";
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  // Changing APP_PASSWORD (or SESSION_SECRET) signs everyone out.
  return (process.env.SESSION_SECRET || "") + "|" + (process.env.APP_PASSWORD || "");
}

const enc = new TextEncoder();

async function hmac(data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function createToken(user) {
  const payload = `${encodeURIComponent(user)}.${Math.floor(Date.now() / 1000) + MAX_AGE}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyToken(token) {
  if (!token || !process.env.APP_PASSWORD) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts;
  if (!safeEqual(sig, await hmac(`${user}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return decodeURIComponent(user);
}
