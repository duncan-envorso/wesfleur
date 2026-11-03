import { NextResponse } from "next/server";
import { COOKIE, verifyToken } from "./lib/session";

const PUBLIC = ["/login", "/api/login"];
// Readers can only capture meter readings; everything else needs an admin.
const READER_OK = ["/", "/api/readings", "/api/read-photo", "/api/me"];

export async function proxy(req) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();

  const session = await verifyToken(req.cookies.get(COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");
  if (!session) {
    if (isApi) return NextResponse.json({ error: "Signed out — please log in again" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (session.role !== "admin" && !READER_OK.includes(pathname)) {
    if (isApi) return NextResponse.json({ error: "Only admins can do this" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  if (isApi) res.headers.set("cache-control", "no-store");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
