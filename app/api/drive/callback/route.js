import { NextResponse } from "next/server";
import { finishConnect } from "@/lib/drive";

export const dynamic = "force-dynamic";
const originOf = (req) => (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

export async function GET(req) {
  const origin = originOf(req);
  const u = new URL(req.url).searchParams;
  const back = (q) => { const r = NextResponse.redirect(`${origin}/settings?drive=${q}#drive`); r.cookies.delete("wf_drive_state"); return r; };
  if (u.get("error")) return back("cancelled");
  if (!u.get("state") || u.get("state") !== req.cookies.get("wf_drive_state")?.value) return back("bad_state");
  try { await finishConnect(origin, u.get("code")); return back("connected"); }
  catch (e) { return back("failed&msg=" + encodeURIComponent(e.message)); }
}
