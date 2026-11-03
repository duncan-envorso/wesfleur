import { currentUser, handle } from "@/lib/api";
import { creditNote, deleteDraft, getInvoice, issueInvoice, refreshDraft, updateDraft } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }) => getInvoice((await params).id));
export const PATCH = handle(async (req, { params }) => updateDraft(Number((await params).id), await req.json()));
export const DELETE = handle(async (req, { params }) => deleteDraft(Number((await params).id)));
export const POST = handle(async (req, { params }) => {
  const id = Number((await params).id);
  const { action, reason } = await req.json();
  const user = await currentUser();
  if (action === "issue") return { number: await issueInvoice(id, user) };
  if (action === "credit") return { number: await creditNote(id, { reason, user }) };
  if (action === "refresh") return refreshDraft(id);
  throw new Error("Unknown action");
});
