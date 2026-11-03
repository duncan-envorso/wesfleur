import { handle } from "@/lib/api";
import { deletePayment } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (req, { params }) => deletePayment((await params).id));
