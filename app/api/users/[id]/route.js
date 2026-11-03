import { handle } from "@/lib/api";
import { updateUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req, { params }) => updateUser((await params).id, await req.json()));
