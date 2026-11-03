import { cookies } from "next/headers";
import { COOKIE, verifyToken } from "./session";

// Wraps a route handler so thrown errors come back as JSON the page can show.
export function handle(fn) {
  return async (req, ctx) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (e) {
      return Response.json({ error: e.message || "Something went wrong" }, { status: 400 });
    }
  };
}

export async function currentUser() {
  return (await verifyToken((await cookies()).get(COOKIE)?.value))?.user || null;
}
