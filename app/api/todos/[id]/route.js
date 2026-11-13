import { currentUser, handle } from "@/lib/api";
import { deleteTodo, saveTodo, setDone } from "@/lib/todos";

export const dynamic = "force-dynamic";

// Body {done: true|false} ticks a task on or off; anything else edits it.
export const POST = handle(async (req, { params }) => {
  const id = (await params).id;
  const body = await req.json();
  if (Object.keys(body).length === 1 && "done" in body) return setDone(id, !!body.done, await currentUser());
  return saveTodo(body, await currentUser(), id);
});
export const DELETE = handle(async (req, { params }) => deleteTodo((await params).id));
