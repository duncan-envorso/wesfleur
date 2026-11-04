import { currentUser, handle } from "@/lib/api";
import { deleteIncome, saveIncome } from "@/lib/income";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req, { params }) => saveIncome(await req.json(), await currentUser(), (await params).id));
export const DELETE = handle(async (req, { params }) => deleteIncome((await params).id));
