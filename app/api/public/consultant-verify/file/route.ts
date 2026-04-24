import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { consultants } from "@/db/schema";
import { env } from "@/lib/env";

async function serveBlob(url: string) {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    return new Response("Blob token not configured", { status: 500 });
  }

  const access = url.includes(".private.blob.vercel-storage.com/") ? "private" : "public";
  const blob = await get(url, {
    access,
    token: env.BLOB_READ_WRITE_TOKEN,
  });

  if (!blob || !blob.stream) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(blob.stream, {
    headers: {
      "content-type": blob.blob.contentType,
      "content-disposition": blob.blob.contentDisposition,
      "cache-control": blob.blob.cacheControl,
      etag: blob.blob.etag,
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(consultants)
    .where(eq(consultants.invitationToken, token))
    .limit(1);

  const consultant = rows[0];
  if (!consultant) {
    return new Response("Not found", { status: 404 });
  }

  if (consultant.invitationTokenExpiresAt && consultant.invitationTokenExpiresAt.getTime() < Date.now()) {
    return new Response("Link expired", { status: 403 });
  }

  if (!consultant.reportFileUrl) {
    return new Response("Not found", { status: 404 });
  }

  return serveBlob(consultant.reportFileUrl);
}
