import { currentSession, handle } from "@/lib/api";
import { deleteTodo, saveTodo, setDone } from "@/lib/todos";

export const dynamic = "force-dynamic";

// Body {done: true|false} ticks a task on or off; anything else edits it.
export const POST = handle(async (req, { params }) => {
  const id = (await params).id;
  const body = await req.json();
  const s = await currentSession();
  const admin = s?.role === "admin";
  if (Object.keys(body).length === 1 && "done" in body) return setDone(id, !!body.done, s?.user, admin);
  return saveTodo(body, s?.user, id, admin);
});
export const DELETE = handle(async (req, { params }) => {
  const s = await currentSession();
  return deleteTodo((await params).id, s?.role === "admin");
});
