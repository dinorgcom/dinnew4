import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ensureAppUser } from "@/server/auth/provision";
import { getAuthorizedCase } from "@/server/cases/mutations";
import { sanitizeFileName } from "@/server/blob/service";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

export async function POST(request: Request, { params }: RouteProps) {
  const { caseId } = await params;
  const user = await ensureAppUser();
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayloadRaw) => {
        const clientPayload =
          typeof clientPayloadRaw === "string" && clientPayloadRaw
            ? (JSON.parse(clientPayloadRaw) as { category?: string })
            : {};
        const category = String(clientPayload.category || "misc").replace(/[^a-zA-Z0-9_-]/g, "");
        const safeName = sanitizeFileName(pathname.split("/").pop() || "upload.bin");
        const targetPathname = `cases/${caseId}/${category}/${Date.now()}-${safeName}`;
        return {
          allowedContentTypes: ["*/*"] as unknown as string[],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ caseId, category }),
          // Override pathname so the file lands in our cases/{caseId}/{category}
          // namespace regardless of what the client passes.
          pathname: targetPathname,
        } as any;
      },
      onUploadCompleted: async () => {
        // No-op: the case mutation that consumes this upload (createEvidence /
        // createWitness etc.) will persist the URL into the right table. We
        // don't need to record anything here.
      },
    });

    return Response.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload token failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
