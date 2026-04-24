import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { consultants } from "@/db/schema";
import { createConsultantVerificationSession } from "@/server/identity/service";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const db = getDb();
    const rows = await db
      .select({ id: consultants.id, invitationTokenExpiresAt: consultants.invitationTokenExpiresAt })
      .from(consultants)
      .where(eq(consultants.invitationToken, token))
      .limit(1);

    const consultant = rows[0];
    if (!consultant) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    if (consultant.invitationTokenExpiresAt && consultant.invitationTokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "This invitation link has expired. Please ask the party to resend." }, { status: 410 });
    }

    const result = await createConsultantVerificationSession(consultant.id, token);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create verification session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
