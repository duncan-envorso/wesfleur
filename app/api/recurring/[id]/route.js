import { handle } from "@/lib/api";
import { deleteRecurring, saveRecurring } from "@/lib/recurring";

export const dynamic = "force-dynamic";

export const PUT = handle(async (req, { params }) => saveRecurring(await req.json(), (await params).id));
export const DELETE = handle(async (req, { params }) => deleteRecurring((await params).id));
