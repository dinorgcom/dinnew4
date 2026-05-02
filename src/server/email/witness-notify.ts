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

export async function sendPartyInvitationEmail(
  to: string,
  data: {
    partyName: string;
    side: "claimant" | "respondent";
    invitedByPartyName: string;
    caseNumber: string;
    caseTitle: string;
    token: string;
  },
) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (verified sender in Resend).",
    );
  }

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const acceptUrl = `${base}/party/${data.token}`;
  const sideLabel = data.side === "claimant" ? "co-claimant" : "co-respondent";

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject: `You have been invited to join case ${data.caseNumber} as a ${sideLabel}`,
    html: [
      `<p>Hello ${escapeHtml(data.partyName)},</p>`,
      `<p>You have been invited by <strong>${escapeHtml(data.invitedByPartyName)}</strong> to join the arbitration case <strong>${escapeHtml(data.caseNumber)}</strong> — ${escapeHtml(data.caseTitle)} as an additional ${escapeHtml(sideLabel)}.</p>`,
      `<p>Joining the case gives you access to all evidence, witnesses, lawyers and proceedings on your side. You can also add your own evidence, witnesses, consultants and lawyers.</p>`,
      `<p><a href="${escapeHtml(acceptUrl)}">Review the case &amp; accept the invitation</a></p>`,
      `<p>This link will expire in 7 days. If it has expired, the party who invited you can resend the invitation.</p>`,
      `<p>If you do not want to join the case you can simply ignore this email or click decline on the page above.</p>`,
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendPartyApprovalRequestEmail(
  to: string,
  data: {
    voterName: string;
    proposedPartyName: string;
    proposedSide: "claimant" | "respondent";
    invitedByPartyName: string;
    caseNumber: string;
    caseTitle: string;
    deadline: Date;
  },
) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (verified sender in Resend).",
    );
  }

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const caseUrl = `${base}/cases?tab=parties`;
  const sideLabel = data.proposedSide === "claimant" ? "co-claimant" : "co-respondent";
  const deadlineStr = data.deadline.toUTCString();

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject: `Approval requested: add ${data.proposedPartyName} to case ${data.caseNumber}`,
    html: [
      `<p>Hello ${escapeHtml(data.voterName)},</p>`,
      `<p><strong>${escapeHtml(data.invitedByPartyName)}</strong> has proposed adding <strong>${escapeHtml(data.proposedPartyName)}</strong> as an additional ${escapeHtml(sideLabel)} on case <strong>${escapeHtml(data.caseNumber)}</strong> — ${escapeHtml(data.caseTitle)}.</p>`,
      `<p>All current parties on the case must approve before the new party is invited. If no decision is reached by <strong>${escapeHtml(deadlineStr)}</strong>, the addition will go through automatically.</p>`,
      `<p><a href="${escapeHtml(caseUrl)}">Open the case to review and vote</a></p>`,
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendLawyerInvitationEmail(
  to: string,
  data: { lawyerName: string; calledByPartyName: string; token: string; firmName?: string | null },
) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (verified sender in Resend).",
    );
  }

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const verifyUrl = `${base}/lawyer/${data.token}`;
  const firm = data.firmName ? ` of <strong>${escapeHtml(data.firmName)}</strong>` : "";

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject: "You have been retained as a lawyer",
    html: [
      `<p>Hello ${escapeHtml(data.lawyerName)}${firm},</p>`,
      `<p>You have been added as legal representative by <strong>${escapeHtml(data.calledByPartyName)}</strong> in an arbitration case on DIN.ORG.</p>`,
      `<p>Please review the case details and verify your identity:</p>`,
      `<p><a href="${escapeHtml(verifyUrl)}">Review case &amp; verify identity</a></p>`,
      `<p>This link will expire in 7 days. If it has expired, the party who added you can resend the invitation.</p>`,
      `<p>This message was sent by the arbitration platform. If you were not expecting it, you can ignore it.</p>`,
    ].join("\n"),
  });

  if (error) {
    throw new Error(error.message);
  }
}
