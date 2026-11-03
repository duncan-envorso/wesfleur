import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { checkPassword } from "@/lib/passwords";
import { COOKIE, MAX_AGE, createToken, safeEqual } from "@/lib/session";

export const dynamic = "force-dynamic";

// Signs in either a user from the users table, or the built-in admin from APP_USERNAME / APP_PASSWORD.
export async function POST(req) {
  const envUser = process.env.APP_USERNAME || "westfleur";
  const envPass = process.env.APP_PASSWORD;
  if (!envPass) {
    return Response.json({ error: "The app has no password yet. Set APP_PASSWORD in Vercel and redeploy." }, { status: 500 });
  }
  const { username = "", password = "" } = await req.json().catch(() => ({}));
  const name = String(username).trim().toLowerCase();

  let who = null;
  if (safeEqual(name, envUser.toLowerCase()) & safeEqual(password, envPass)) {
    who = { user: envUser, role: "admin" };
  } else {
    const q = await db();
    const [u] = await q`SELECT username, role, password_hash FROM users WHERE lower(username) = ${name} AND active`;
    if (u && checkPassword(password, u.password_hash)) {
      who = { user: u.username, role: u.role };
      await q`UPDATE users SET last_login = now() WHERE lower(username) = ${name}`;
    }
  }
  if (!who) {
    await new Promise((r) => setTimeout(r, 1200)); // slow down password guessing
    return Response.json({ error: "Incorrect username or password" }, { status: 401 });
  }
  (await cookies()).set(COOKIE, await createToken(who.user, who.role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return Response.json({ ok: true, role: who.role });
}

export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
}
