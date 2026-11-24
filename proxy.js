import { NextResponse } from "next/server";
import { COOKIE, verifyToken } from "./lib/session";

const PUBLIC = ["/login", "/api/login"];
// Staff capture meter readings and photos without signing in (the API routes add their own limits).
const STAFF_OPEN = ["/", "/api/readings", "/api/read-photo", "/api/me"];
// Readers can only capture meter readings. Property managers also get the To-do list
// (no money: invoices, payments, tenants' rents, reports and settings stay admin-only).
const READER_OK = ["/", "/api/readings", "/api/read-photo", "/api/me"];
const MANAGER_OK = [...READER_OK, "/todos", "/api/todos"];
function allowed(role, pathname) {
  if (role === "admin") return true;
  if (role === "manager") return MANAGER_OK.includes(pathname) || pathname.startsWith("/api/todos/");
  return READER_OK.includes(pathname);
}

export async function proxy(req) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  // Tenants open their own signing link without an account; the link itself is the key.
  if (pathname.startsWith("/sign/") || pathname.startsWith("/api/sign/")) {
    const res = NextResponse.next();
    res.headers.set("cache-control", "no-store");
    res.headers.set("referrer-policy", "no-referrer");
    res.headers.set("x-robots-tag", "noindex");
    return res;
  }

  const session = await verifyToken(req.cookies.get(COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");
  if (!session && STAFF_OPEN.includes(pathname) && ["GET", "POST", "HEAD"].includes(req.method)) {
    const res = NextResponse.next();
    if (isApi) res.headers.set("cache-control", "no-store");
    return res;
  }
  if (!session) {
    if (isApi) return NextResponse.json({ error: "Signed out — please log in again" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (!allowed(session.role, pathname)) {
    if (isApi) return NextResponse.json({ error: "You don’t have access to this" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  if (isApi) res.headers.set("cache-control", "no-store");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|pdfjs/).*)"] };
