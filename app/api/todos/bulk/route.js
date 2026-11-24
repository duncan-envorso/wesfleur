import { currentSession, handle } from "@/lib/api";
import { bulkAssign } from "@/lib/todos";

export const dynamic = "force-dynamic";

// Body { ids: [1, 2, 3], assigned_to: "Kirah" } — an empty assigned_to clears the assignee.
export const POST = handle(async (req) => {
  const body = await req.json();
  const s = await currentSession();
  return bulkAssign(body.ids, body.assigned_to, s?.role === "admin");
});
