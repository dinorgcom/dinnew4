import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { scheduleHearing } from "@/server/cases/mutations";
import { getDb } from "@/db/client";
import { cases } from "@/db/schema";
import { eq } from "drizzle-orm";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    return ok(await scheduleHearing(user, caseId, body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to schedule hearing";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("HEARING_SCHEDULE_FAILED", message, status);
  }
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    
    // Update hearing information in database
    const db = getDb();
    await db.update(cases)
      .set({
        hearingDate: body.hearingDate,
        updatedAt: new Date(),
        // Add meeting URL if provided
        ...(body.meetingUrl && { meetingUrl: body.meetingUrl })
      })
      .where(eq(cases.id, caseId));

    return ok({ success: true, message: "Hearing updated successfully" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update hearing";
    return fail("HEARING_UPDATE_FAILED", message, 400);
  }
}
