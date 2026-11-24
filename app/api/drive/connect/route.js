import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authUrl, driveConfigured } from "@/lib/drive";

export const dynamic = "force-dynamic";
const originOf = (req) => (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

export async function GET(req) {
  const origin = originOf(req);
  if (!driveConfigured()) return NextResponse.redirect(`${origin}/settings?drive=not_configured`);
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set("wf_drive_state", state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/drive", maxAge: 600 });
  return res;
}
