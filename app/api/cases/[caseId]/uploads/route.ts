import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { getAuthorizedCase } from "@/server/cases/access";
import { sanitizeFileName, uploadBlob } from "@/server/blob/service";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const authorized = await getAuthorizedCase(user, caseId);

    if (!authorized) {
      return fail("UPLOAD_FORBIDDEN", "Forbidden", 403);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const category = String(formData.get("category") || "misc");

    if (!(file instanceof File)) {
      return fail("UPLOAD_INVALID", "A file is required.", 400);
    }

    const safeName = sanitizeFileName(file.name || "upload.bin");
    const pathname = `cases/${caseId}/${category}/${Date.now()}-${safeName}`;
    const uploaded = await uploadBlob({
      pathname,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
    });

    return ok({
      url: uploaded.url,
      pathname: uploaded.pathname,
      fileName: file.name,
      contentType: file.type || null,
      size: file.size || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return fail("UPLOAD_FAILED", message, 400);
  }
}
