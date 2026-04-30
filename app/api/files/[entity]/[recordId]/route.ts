import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { caseMessages, consultants, evidence, expertiseRequests, witnesses } from "@/db/schema";
import { env } from "@/lib/env";
import { ensureAppUser } from "@/server/auth/provision";
import { getAuthorizedCase } from "@/server/cases/access";

type RouteProps = {
  params: Promise<{ entity: string; recordId: string }>;
};

async function serveBlob(url: string, opts: { download?: boolean; fileName?: string | null } = {}) {
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

  let disposition = blob.blob.contentDisposition;
  if (opts.download) {
    const safeName = (opts.fileName || "download").replace(/"/g, "");
    disposition = `attachment; filename="${safeName}"`;
  }

  return new Response(blob.stream, {
    headers: {
      "content-type": blob.blob.contentType,
      "content-disposition": disposition,
      "cache-control": blob.blob.cacheControl,
      etag: blob.blob.etag,
    },
  });
}

export async function GET(request: Request, { params }: RouteProps) {
  const { entity, recordId } = await params;
  const requestUrl = new URL(request.url);
  const index = Number(requestUrl.searchParams.get("index") || "0");
  const download = requestUrl.searchParams.get("download") === "1";
  const user = await ensureAppUser();
  const db = getDb();

  if (entity === "evidence") {
    const rows = await db.select().from(evidence).where(eq(evidence.id, recordId)).limit(1);
    const record = rows[0];
    if (!record?.fileUrl) {
      return new Response("Not found", { status: 404 });
    }
    const authorized = await getAuthorizedCase(user, record.caseId);
    if (!authorized) {
      return new Response("Forbidden", { status: 403 });
    }
    return serveBlob(record.fileUrl, { download, fileName: record.fileName });
  }

  if (entity === "witnesses") {
    const rows = await db.select().from(witnesses).where(eq(witnesses.id, recordId)).limit(1);
    const record = rows[0];
    if (!record) {
      return new Response("Not found", { status: 404 });
    }
    const asset = requestUrl.searchParams.get("asset");
    const sourceUrl = asset === "photo" ? record.photoUrl : record.statementFileUrl;
    if (!sourceUrl) {
      return new Response("Not found", { status: 404 });
    }
    const authorized = await getAuthorizedCase(user, record.caseId);
    if (!authorized) {
      return new Response("Forbidden", { status: 403 });
    }
    return serveBlob(sourceUrl, { download, fileName: record.fullName ?? null });
  }

  if (entity === "consultants") {
    const rows = await db.select().from(consultants).where(eq(consultants.id, recordId)).limit(1);
    const record = rows[0];
    if (!record?.reportFileUrl) {
      return new Response("Not found", { status: 404 });
    }
    const authorized = await getAuthorizedCase(user, record.caseId);
    if (!authorized) {
      return new Response("Forbidden", { status: 403 });
    }
    return serveBlob(record.reportFileUrl, { download, fileName: record.fullName ?? null });
  }

  if (entity === "messages") {
    const rows = await db.select().from(caseMessages).where(eq(caseMessages.id, recordId)).limit(1);
    const record = rows[0];
    if (!record?.attachmentUrl) {
      return new Response("Not found", { status: 404 });
    }
    const authorized = await getAuthorizedCase(user, record.caseId);
    if (!authorized) {
      return new Response("Forbidden", { status: 403 });
    }
    return serveBlob(record.attachmentUrl, { download, fileName: record.attachmentName ?? null });
  }

  if (entity === "expertise") {
    const rows = await db.select().from(expertiseRequests).where(eq(expertiseRequests.id, recordId)).limit(1);
    const record = rows[0];
    const attachments = Array.isArray(record?.fileReferences) ? record.fileReferences : [];
    const selected = attachments[index] as { url?: string; fileName?: string } | undefined;
    if (!selected?.url || !record) {
      return new Response("Not found", { status: 404 });
    }
    const authorized = await getAuthorizedCase(user, record.caseId);
    if (!authorized) {
      return new Response("Forbidden", { status: 403 });
    }
    return serveBlob(selected.url, { download, fileName: selected.fileName ?? null });
  }

  return new Response("Not found", { status: 404 });
}
