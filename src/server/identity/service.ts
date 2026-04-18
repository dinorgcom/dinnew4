import { and, eq, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db/client";
import { caseActivities, cases, kycVerifications, processedStripeEvents, users, witnesses, consultants } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { assertAppUserActive } from "@/server/auth/provision";
import { env } from "@/lib/env";
import { getStripe } from "@/server/billing/stripe";
import { sendRespondentLinkedEmail } from "@/server/email/respondent-linked-notify";

type AppUser = ProvisionedAppUser | null;

export async function createVerificationSession(user: AppUser) {
  assertAppUserActive(user);
  if (!user.id) {
    throw new Error("Unauthorized");
  }

  // Check if user already has a verified KYC row
  const existing = await getVerificationStatus(user.id);
  if (existing.status === "verified") {
    return { alreadyVerified: true as const, url: null, sessionId: null };
  }

  const db = getDb();
  const stripe = getStripe();

  // If there's a pending session, check if it's still usable
  if (existing.status === "pending" && existing.stripeSessionId) {
    try {
      const existingSession = await stripe.identity.verificationSessions.retrieve(existing.stripeSessionId);
      if (existingSession.url && existingSession.status === "requires_input") {
        // Session is still active, reuse it
        return { alreadyVerified: false as const, url: existingSession.url, sessionId: existingSession.id };
      }
    } catch {
      // Session expired or invalid, create a new one
    }

    // Prior session is unusable — cancel it at Stripe and mark the DB row
    // canceled so a late "verified" webhook for this orphaned session can be
    // detected and skipped downstream (see processIdentityWebhookEvent).
    try {
      await stripe.identity.verificationSessions.cancel(existing.stripeSessionId);
    } catch {
      // Already terminal at Stripe — safe to ignore.
    }
    await db
      .update(kycVerifications)
      .set({ status: "canceled" })
      .where(eq(kycVerifications.stripeSessionId, existing.stripeSessionId));
  }

  const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/verify/result`;

  const session = await stripe.identity.verificationSessions.create({
    type: "document",
    metadata: { user_id: user.id },
    options: {
      document: {
        require_matching_selfie: true,
      },
    },
    return_url: returnUrl,
  });

  // Insert new KYC row
  const inserted = await db
    .insert(kycVerifications)
    .values({
      stripeSessionId: session.id,
      status: "pending",
    })
    .returning();

  const kycRow = inserted[0];
  if (!kycRow) {
    throw new Error("Failed to create KYC verification record.");
  }

  // Link it to the user
  await db
    .update(users)
    .set({ kycVerificationId: kycRow.id })
    .where(eq(users.id, user.id));

  return { alreadyVerified: false as const, url: session.url, sessionId: session.id };
}

export async function getVerificationStatus(userId: string) {
  const db = getDb();

  const rows = await db
    .select({
      status: kycVerifications.status,
      stripeSessionId: kycVerifications.stripeSessionId,
      verifiedFirstName: kycVerifications.verifiedFirstName,
      verifiedLastName: kycVerifications.verifiedLastName,
      verifiedDobDay: kycVerifications.verifiedDobDay,
      verifiedDobMonth: kycVerifications.verifiedDobMonth,
      verifiedDobYear: kycVerifications.verifiedDobYear,
      verifiedAddressCity: kycVerifications.verifiedAddressCity,
      verifiedAddressCountry: kycVerifications.verifiedAddressCountry,
      verifiedAt: kycVerifications.verifiedAt,
      lastErrorCode: kycVerifications.lastErrorCode,
      lastErrorReason: kycVerifications.lastErrorReason,
    })
    .from(users)
    .innerJoin(kycVerifications, eq(users.kycVerificationId, kycVerifications.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!rows[0]) {
    return { status: "not_started" as const, stripeSessionId: null };
  }

  return rows[0];
}

export async function isUserKycVerified(userId: string): Promise<boolean> {
  const status = await getVerificationStatus(userId);
  return status.status === "verified";
}

export async function createWitnessVerificationSession(witnessId: string, token: string) {
  const db = getDb();

  const rows = await db.select().from(witnesses).where(eq(witnesses.id, witnessId)).limit(1);
  const witness = rows[0];
  if (!witness) {
    throw new Error("Witness not found");
  }

  // Check if already verified
  if (witness.kycVerificationId) {
    const kycRows = await db
      .select({ status: kycVerifications.status, stripeSessionId: kycVerifications.stripeSessionId })
      .from(kycVerifications)
      .where(eq(kycVerifications.id, witness.kycVerificationId))
      .limit(1);

    if (kycRows[0]?.status === "verified") {
      return { alreadyVerified: true as const, url: null, sessionId: null };
    }

    // Try to reuse pending session
    if (kycRows[0]?.status === "pending" && kycRows[0]?.stripeSessionId) {
      const stripe = getStripe();
      try {
        const existingSession = await stripe.identity.verificationSessions.retrieve(kycRows[0].stripeSessionId);
        if (existingSession.url && existingSession.status === "requires_input") {
          return { alreadyVerified: false as const, url: existingSession.url, sessionId: existingSession.id };
        }
      } catch {
        // Session expired or invalid, create a new one
      }
    }
  }

  const stripe = getStripe();
  const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/witness/${token}/result`;

  const session = await stripe.identity.verificationSessions.create({
    type: "document",
    metadata: { witness_id: witnessId, entity_type: "witness" },
    options: {
      document: {
        require_matching_selfie: true,
      },
    },
    return_url: returnUrl,
  });

  const inserted = await db
    .insert(kycVerifications)
    .values({
      stripeSessionId: session.id,
      status: "pending",
    })
    .returning();

  const kycRow = inserted[0];
  if (!kycRow) {
    throw new Error("Failed to create KYC verification record.");
  }

  await db
    .update(witnesses)
    .set({ kycVerificationId: kycRow.id })
    .where(eq(witnesses.id, witnessId));

  return { alreadyVerified: false as const, url: session.url, sessionId: session.id };
}

export async function createConsultantVerificationSession(consultantId: string, token: string) {
  const db = getDb();

  const rows = await db.select().from(consultants).where(eq(consultants.id, consultantId)).limit(1);
  const consultant = rows[0];
  if (!consultant) {
    throw new Error("Consultant not found");
  }

  // Check if already verified
  if (consultant.kycVerificationId) {
    const kycRows = await db
      .select({ status: kycVerifications.status, stripeSessionId: kycVerifications.stripeSessionId })
      .from(kycVerifications)
      .where(eq(kycVerifications.id, consultant.kycVerificationId))
      .limit(1);

    if (kycRows[0]?.status === "verified") {
      return { alreadyVerified: true as const, url: null, sessionId: null };
    }

    if (kycRows[0]?.status === "pending" && kycRows[0]?.stripeSessionId) {
      const stripe = getStripe();
      try {
        const existingSession = await stripe.identity.verificationSessions.retrieve(kycRows[0].stripeSessionId);
        if (existingSession.url && existingSession.status === "requires_input") {
          return { alreadyVerified: false as const, url: existingSession.url, sessionId: existingSession.id };
        }
      } catch {
        // Session expired or invalid, create a new one
      }
    }
  }

  const stripe = getStripe();
  const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/consultant/${token}/result`;

  const session = await stripe.identity.verificationSessions.create({
    type: "document",
    metadata: { consultant_id: consultantId, entity_type: "consultant" },
    options: {
      document: {
        require_matching_selfie: true,
      },
    },
    return_url: returnUrl,
  });

  const inserted = await db
    .insert(kycVerifications)
    .values({
      stripeSessionId: session.id,
      status: "pending",
    })
    .returning();

  const kycRow = inserted[0];
  if (!kycRow) {
    throw new Error("Failed to create KYC verification record.");
  }

  await db
    .update(consultants)
    .set({ kycVerificationId: kycRow.id })
    .where(eq(consultants.id, consultantId));

  return { alreadyVerified: false as const, url: session.url, sessionId: session.id };
}

export async function getWitnessVerificationStatus(token: string) {
  const db = getDb();

  const rows = await db
    .select({
      witnessId: witnesses.id,
      kycStatus: kycVerifications.status,
    })
    .from(witnesses)
    .leftJoin(kycVerifications, eq(witnesses.kycVerificationId, kycVerifications.id))
    .where(eq(witnesses.invitationToken, token))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return { status: rows[0].kycStatus || ("not_started" as const) };
}

export async function getConsultantVerificationStatus(token: string) {
  const db = getDb();

  const rows = await db
    .select({
      consultantId: consultants.id,
      kycStatus: kycVerifications.status,
    })
    .from(consultants)
    .leftJoin(kycVerifications, eq(consultants.kycVerificationId, kycVerifications.id))
    .where(eq(consultants.invitationToken, token))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return { status: rows[0].kycStatus || ("not_started" as const) };
}

type RespondentLinkedEmailJob = {
  to: string;
  caseId: string;
  title: string;
  caseNumber: string;
  respondentAllegedName: string | null;
  respondentVerifiedName: string | null;
};

async function autoLinkRespondentOnKycVerified(
  userId: string,
  kycVerificationId: string,
  verifiedName: string | null,
): Promise<RespondentLinkedEmailJob[]> {
  const db = getDb();

  const userRows = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const userEmail = userRows[0]?.email?.toLowerCase();
  if (!userEmail) return [];

  const candidates = await db
    .select()
    .from(cases)
    .where(
      and(
        isNull(cases.respondentUserId),
        sql`lower(${cases.respondentEmailAlleged}) = ${userEmail}`,
      ),
    );

  const emailJobs: RespondentLinkedEmailJob[] = [];

  for (const caseRow of candidates) {
    const allegedSnapshot = caseRow.respondentNameAlleged ?? caseRow.respondentName;

    // Guard on `respondentUserId IS NULL` inside the UPDATE so a concurrent
    // retry (same event replayed before the idempotency row lands) won't
    // double-link or re-queue emails. `.returning()` tells us whether this
    // call actually performed the update.
    const linked = await db
      .update(cases)
      .set({
        respondentUserId: userId,
        respondentKycVerificationId: kycVerificationId,
        respondentNameVerified: verifiedName,
        respondentNameAlleged: allegedSnapshot,
        respondentName: verifiedName ?? caseRow.respondentName,
        respondentLinkedAt: new Date(),
      })
      .where(and(eq(cases.id, caseRow.id), isNull(cases.respondentUserId)))
      .returning({ id: cases.id });

    if (linked.length === 0) continue;

    await db.insert(caseActivities).values({
      caseId: caseRow.id,
      type: "respondent_linked",
      title: "Respondent linked",
      description: verifiedName
        ? `Respondent linked to verified user ${verifiedName}.`
        : "Respondent linked to a verified user.",
      performedBy: "system",
    });

    if (caseRow.claimantEmail) {
      emailJobs.push({
        to: caseRow.claimantEmail,
        caseId: caseRow.id,
        title: caseRow.title,
        caseNumber: caseRow.caseNumber,
        respondentAllegedName: caseRow.respondentNameAlleged ?? caseRow.respondentName,
        respondentVerifiedName: verifiedName,
      });
    }
  }

  return emailJobs;
}

export async function linkRespondentIfMatching(
  caseId: string,
  appUserId: string,
): Promise<{ linked: boolean }> {
  const db = getDb();

  const caseRows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  const caseRow = caseRows[0];
  if (!caseRow) return { linked: false };
  if (caseRow.respondentUserId) return { linked: false };

  const alleged = caseRow.respondentEmailAlleged ?? caseRow.respondentEmail;
  if (!alleged) return { linked: false };

  const userRows = await db
    .select({ id: users.id, email: users.email, kycId: users.kycVerificationId })
    .from(users)
    .where(eq(users.id, appUserId))
    .limit(1);
  const user = userRows[0];
  if (!user) return { linked: false };
  if ((user.email ?? "").toLowerCase() !== alleged.toLowerCase()) return { linked: false };
  if (!user.kycId) return { linked: false };

  const kycRows = await db
    .select({
      status: kycVerifications.status,
      firstName: kycVerifications.verifiedFirstName,
      lastName: kycVerifications.verifiedLastName,
    })
    .from(kycVerifications)
    .where(eq(kycVerifications.id, user.kycId))
    .limit(1);
  const kyc = kycRows[0];
  if (!kyc || kyc.status !== "verified") return { linked: false };

  const verifiedName = `${kyc.firstName ?? ""} ${kyc.lastName ?? ""}`.trim() || null;
  const allegedSnapshot = caseRow.respondentNameAlleged ?? caseRow.respondentName;

  await db
    .update(cases)
    .set({
      respondentUserId: user.id,
      respondentKycVerificationId: user.kycId,
      respondentNameVerified: verifiedName,
      respondentNameAlleged: allegedSnapshot,
      respondentName: verifiedName ?? caseRow.respondentName,
      respondentLinkedAt: new Date(),
    })
    .where(eq(cases.id, caseId));

  await db.insert(caseActivities).values({
    caseId,
    type: "respondent_linked",
    title: "Respondent linked",
    description: verifiedName
      ? `Respondent linked to verified user ${verifiedName}.`
      : "Respondent linked to a verified user.",
    performedBy: "system",
  });

  if (caseRow.claimantEmail) {
    try {
      await sendRespondentLinkedEmail(caseRow.claimantEmail, {
        id: caseRow.id,
        title: caseRow.title,
        caseNumber: caseRow.caseNumber,
        respondentAllegedName: caseRow.respondentNameAlleged ?? caseRow.respondentName,
        respondentVerifiedName: verifiedName,
      });
    } catch (err) {
      console.error("sendRespondentLinkedEmail failed", err);
    }
  }

  return { linked: true };
}

export async function processIdentityWebhookEvent(event: Stripe.Event) {
  const db = getDb();

  // Emails are collected during processing and dispatched *after* the
  // idempotency row is written, so a crash mid-handler can never leave the
  // system having emailed without a persisted record.
  const pendingEmails: RespondentLinkedEmailJob[] = [];

  // Idempotency check
  const replay = await db
    .select()
    .from(processedStripeEvents)
    .where(eq(processedStripeEvents.eventId, event.id))
    .limit(1);

  if (replay[0]) {
    return { received: true, replayed: true };
  }

  const session = event.data.object as Stripe.Identity.VerificationSession;
  const stripeSessionId = session.id;

  // Find the KYC row by stripeSessionId
  const kycRows = await db
    .select()
    .from(kycVerifications)
    .where(eq(kycVerifications.stripeSessionId, stripeSessionId))
    .limit(1);

  const kycRow = kycRows[0];
  if (!kycRow) {
    // No matching KYC row — could be from a session we didn't create
    return { received: true, ignored: true };
  }

  if (event.type === "identity.verification_session.verified") {
    // Retrieve expanded session to get verified_outputs
    const stripe = getStripe();
    const expanded = await stripe.identity.verificationSessions.retrieve(stripeSessionId, {
      expand: ["verified_outputs"],
    });

    const outputs = expanded.verified_outputs;

    await db
      .update(kycVerifications)
      .set({
        status: "verified",
        verifiedFirstName: outputs?.first_name ?? null,
        verifiedLastName: outputs?.last_name ?? null,
        verifiedDobDay: outputs?.dob?.day ?? null,
        verifiedDobMonth: outputs?.dob?.month ?? null,
        verifiedDobYear: outputs?.dob?.year ?? null,
        verifiedAddressLine1: outputs?.address?.line1 ?? null,
        verifiedAddressLine2: outputs?.address?.line2 ?? null,
        verifiedAddressCity: outputs?.address?.city ?? null,
        verifiedAddressState: outputs?.address?.state ?? null,
        verifiedAddressPostalCode: outputs?.address?.postal_code ?? null,
        verifiedAddressCountry: outputs?.address?.country ?? null,
        verifiedIdNumber: outputs?.id_number ?? null,
        verifiedIdNumberType: outputs?.id_number_type ?? null,
        verifiedOutputsJson: outputs as unknown as Record<string, unknown> | null,
        verifiedAt: new Date(),
        lastErrorCode: null,
        lastErrorReason: null,
      })
      .where(eq(kycVerifications.id, kycRow.id));

    // Identity resolution: overwrite witness/consultant names with the verified
    // identity, preserve the originally-alleged name, and try to auto-link any
    // case where this verified user is the respondent.
    //
    // Side effects (entity updates, activity inserts, auto-link, emails) only
    // run when the KYC row the event targets is still the *current* row for
    // its owning entity. If the entity rotated to a newer session, we still
    // record this row's verified outputs for audit, but skip downstream work.
    const verifiedName = `${outputs?.first_name ?? ""} ${outputs?.last_name ?? ""}`.trim();

    const entityType = session.metadata?.entity_type;
    if (entityType === "witness") {
      const witnessId = session.metadata?.witness_id;
      if (witnessId) {
        const [current] = await db.select().from(witnesses).where(eq(witnesses.id, witnessId)).limit(1);
        if (current && current.kycVerificationId === kycRow.id) {
          if (verifiedName && current.fullName !== verifiedName) {
            await db
              .update(witnesses)
              .set({
                fullName: verifiedName,
                originalFullName: current.originalFullName ?? current.fullName,
                nameUpdatedAt: new Date(),
                status: "accepted",
              })
              .where(eq(witnesses.id, witnessId));

            await db.insert(caseActivities).values({
              caseId: current.caseId,
              type: "identity_verified",
              title: "Witness identity verified",
              description: `Witness "${current.fullName}" verified as "${verifiedName}".`,
              performedBy: "system",
            });
          } else {
            await db.update(witnesses).set({ status: "accepted" }).where(eq(witnesses.id, witnessId));
          }
        }
      }
    } else if (entityType === "consultant") {
      const consultantId = session.metadata?.consultant_id;
      if (consultantId) {
        const [current] = await db.select().from(consultants).where(eq(consultants.id, consultantId)).limit(1);
        if (current && current.kycVerificationId === kycRow.id) {
          if (verifiedName && current.fullName !== verifiedName) {
            await db
              .update(consultants)
              .set({
                fullName: verifiedName,
                originalFullName: current.originalFullName ?? current.fullName,
                nameUpdatedAt: new Date(),
                status: "accepted",
              })
              .where(eq(consultants.id, consultantId));

            await db.insert(caseActivities).values({
              caseId: current.caseId,
              type: "identity_verified",
              title: "Consultant identity verified",
              description: `Consultant "${current.fullName}" verified as "${verifiedName}".`,
              performedBy: "system",
            });
          } else {
            await db.update(consultants).set({ status: "accepted" }).where(eq(consultants.id, consultantId));
          }
        }
      }
    } else {
      // Regular user KYC — try to auto-link any case where this user is the respondent.
      const userId = session.metadata?.user_id;
      if (userId) {
        const [currentUser] = await db
          .select({ kycId: users.kycVerificationId })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (currentUser?.kycId === kycRow.id) {
          try {
            const jobs = await autoLinkRespondentOnKycVerified(userId, kycRow.id, verifiedName || null);
            pendingEmails.push(...jobs);
          } catch (err) {
            console.error("autoLinkRespondentOnKycVerified failed", err);
          }
        }
      }
    }
  } else if (event.type === "identity.verification_session.requires_input") {
    await db
      .update(kycVerifications)
      .set({
        status: "requires_input",
        lastErrorCode: session.last_error?.code ?? null,
        lastErrorReason: session.last_error?.reason ?? null,
      })
      .where(eq(kycVerifications.id, kycRow.id));
  } else if (event.type === "identity.verification_session.canceled") {
    await db
      .update(kycVerifications)
      .set({ status: "canceled" })
      .where(eq(kycVerifications.id, kycRow.id));
  } else {
    return { received: true, ignored: true };
  }

  // Record processed event for idempotency
  const userId = session.metadata?.user_id ?? null;

  await db.insert(processedStripeEvents).values({
    eventId: event.id,
    sessionId: stripeSessionId,
    userId,
    packageId: "identity_verification",
    creditedTokens: 0,
    processedAt: new Date(),
  });

  // Dispatch queued emails after the idempotency record is persisted. A
  // failure here must not fail the webhook — the DB state is committed and
  // Stripe would otherwise retry, producing duplicate writes.
  for (const job of pendingEmails) {
    try {
      await sendRespondentLinkedEmail(job.to, {
        id: job.caseId,
        title: job.title,
        caseNumber: job.caseNumber,
        respondentAllegedName: job.respondentAllegedName,
        respondentVerifiedName: job.respondentVerifiedName,
      });
    } catch (err) {
      console.error("sendRespondentLinkedEmail (webhook) failed", err);
    }
  }

  return { received: true };
}
