import { currentUser, handle } from "@/lib/api";
import { emailHtml, sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const { to } = await req.json();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || "")) throw new Error("Enter an email address");
  await sendMail({ to, subject: "Test email from Westfleur Centre", html: emailHtml({ heading: "Email works", paragraphs: [`Sent by ${await currentUser() || "an admin"} from Settings.`] }) });
  return { ok: true };
});
