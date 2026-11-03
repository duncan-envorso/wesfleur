import { cookies } from "next/headers";
import { COOKIE, MAX_AGE, createToken, safeEqual } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const expectedUser = process.env.APP_USERNAME || "westfleur";
  const expectedPass = process.env.APP_PASSWORD;
  if (!expectedPass) {
    return Response.json({ error: "The app has no password yet. Set APP_PASSWORD in Vercel and redeploy." }, { status: 500 });
  }
  const { username = "", password = "" } = await req.json().catch(() => ({}));
  const ok = safeEqual(username.trim().toLowerCase(), expectedUser.toLowerCase()) & safeEqual(password, expectedPass);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1200)); // slow down password guessing
    return Response.json({ error: "Incorrect username or password" }, { status: 401 });
  }
  (await cookies()).set(COOKIE, await createToken(expectedUser), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
}
