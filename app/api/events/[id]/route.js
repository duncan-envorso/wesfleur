import { handle } from "@/lib/api";
import { deleteEvent } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (req, { params }) => deleteEvent((await params).id));
