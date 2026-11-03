import { NextResponse } from "next/server";

// Basic-auth login for the whole app. Set APP_USERNAME and APP_PASSWORD in Vercel.
export function proxy(req) {
  const user = process.env.APP_USERNAME || "westfleur";
  const pass = process.env.APP_PASSWORD;
  if (!pass) {
    return new NextResponse("Set APP_PASSWORD in the Vercel environment variables.", { status: 500 });
  }
  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    const [u, p] = atob(header.slice(6)).split(":");
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Westfleur meters"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
