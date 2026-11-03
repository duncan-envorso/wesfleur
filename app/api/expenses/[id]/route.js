import { currentUser, handle } from "@/lib/api";
import { deleteExpense, saveExpense } from "@/lib/expenses";

export const dynamic = "force-dynamic";

export const POST = handle(async (req, { params }) => saveExpense(await req.formData(), await currentUser(), (await params).id));
export const DELETE = handle(async (req, { params }) => deleteExpense((await params).id));
