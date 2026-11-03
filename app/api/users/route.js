import { handle } from "@/lib/api";
import { createUser, listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export const GET = handle(() => listUsers());
export const POST = handle(async (req) => createUser(await req.json()));
