import { Resend } from "resend";
import { env } from "@/lib/env";
import { escapeHtml } from "@/server/email/html";

type Args = {
  id: string;
  title: string;
  caseNumber: string;
  respondentAllegedName: string | null;
  respondentVerifiedName: string | null;
};

export async function sendRespondentLinkedEmail(to: string, caseItem: Args) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (verified sender in Resend).",
    );
  }

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const caseUrl = `${base}/cases/${caseItem.id}`;
  const verified = caseItem.respondentVerifiedName ?? "a verified user";
  const alleged = caseItem.respondentAllegedName ?? "the named respondent";

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject: `${caseItem.caseNumber}: respondent identity verified`,
    html: [
      `<p>Hello,</p>`,
      `<p>The respondent you named in case <strong>${escapeHtml(caseItem.caseNumber)}</strong> (${escapeHtml(caseItem.title)}) has completed identity verification on the platform.</p>`,
      `<p>Filed as: <strong>${escapeHtml(alleged)}</strong><br/>Verified as: <strong>${escapeHtml(verified)}</strong></p>`,
      `<p><a href="${escapeHtml(caseUrl)}">Open the case workspace</a> to review.</p>`,
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message);
  }
}
