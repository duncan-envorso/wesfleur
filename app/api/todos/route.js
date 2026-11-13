import { currentUser, handle } from "@/lib/api";
import { listTodos, saveTodo } from "@/lib/todos";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = new URL(req.url).searchParams;
  return listTodos({ show: u.get("show") || "open", tenantId: u.get("tenant") });
});
export const POST = handle(async (req) => saveTodo(await req.json(), await currentUser()));
