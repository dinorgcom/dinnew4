import { Resend } from "resend";
import { env } from "@/lib/env";
import { escapeHtml } from "@/server/email/html";

export async function sendWitnessInvitationEmail(
  to: string,
  data: { witnessName: string; calledByPartyName: string; token: string },
) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (verified sender in Resend).",
    );
  }

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const verifyUrl = `${base}/witness/${data.token}`;

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject: "You have been called as a witness",
    html: [
      `<p>Hello ${escapeHtml(data.witnessName)},</p>`,
      `<p>You have been called as a witness by <strong>${escapeHtml(data.calledByPartyName)}</strong> in an arbitration case.</p>`,
      `<p>Please review the statement prepared on your behalf and verify your identity:</p>`,
      `<p><a href="${escapeHtml(verifyUrl)}">Review statement &amp; verify identity</a></p>`,
      `<p>This link will expire in 7 days. If it has expired, the party who called you can resend the invitation.</p>`,
      `<p>This message was sent by the arbitration platform. If you were not expecting it, you can ignore it.</p>`,
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendConsultantInvitationEmail(
  to: string,
  data: { consultantName: string; calledByPartyName: string; token: string },
) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (verified sender in Resend).",
    );
  }

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const verifyUrl = `${base}/consultant/${data.token}`;

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject: "You have been called as a consultant",
    html: [
      `<p>Hello ${escapeHtml(data.consultantName)},</p>`,
      `<p>You have been called as a consultant by <strong>${escapeHtml(data.calledByPartyName)}</strong> in an arbitration case.</p>`,
      `<p>Please review the report prepared on your behalf and verify your identity:</p>`,
      `<p><a href="${escapeHtml(verifyUrl)}">Review report &amp; verify identity</a></p>`,
      `<p>This link will expire in 7 days. If it has expired, the party who called you can resend the invitation.</p>`,
      `<p>This message was sent by the arbitration platform. If you were not expecting it, you can ignore it.</p>`,
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message);
  }
}
