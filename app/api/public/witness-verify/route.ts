import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { witnesses } from "@/db/schema";
import { createWitnessVerificationSession } from "@/server/identity/service";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const db = getDb();
    const rows = await db
      .select({ id: witnesses.id, invitationTokenExpiresAt: witnesses.invitationTokenExpiresAt })
      .from(witnesses)
      .where(eq(witnesses.invitationToken, token))
      .limit(1);

    const witness = rows[0];
    if (!witness) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    if (witness.invitationTokenExpiresAt && witness.invitationTokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "This invitation link has expired. Please ask the party to resend." }, { status: 410 });
    }

    const result = await createWitnessVerificationSession(witness.id, token);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create verification session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
