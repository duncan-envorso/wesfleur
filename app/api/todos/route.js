import { currentSession, handle } from "@/lib/api";
import { listTodos, saveTodo } from "@/lib/todos";

export const dynamic = "force-dynamic";

const isAdmin = async () => (await currentSession())?.role === "admin";

export const GET = handle(async (req) => {
  const u = new URL(req.url).searchParams;
  return listTodos({ show: u.get("show") || "open", tenantId: u.get("tenant"), assignee: u.get("who") || "", admin: await isAdmin() });
});
export const POST = handle(async (req) => {
  const s = await currentSession();
  return saveTodo(await req.json(), s?.user, null, s?.role === "admin");
});
