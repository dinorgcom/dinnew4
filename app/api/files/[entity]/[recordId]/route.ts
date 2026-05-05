import { get, head } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { caseMessages, cases, consultants, evidence, expertiseRequests, lawyers, pleadings, witnesses } from "@/db/schema";
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

  const token = env.BLOB_READ_WRITE_TOKEN;

  // Try get() with both access types. The store default occasionally flips
  // and old rows may carry a URL whose host doesn't match the current
  // setting, so brute-forcing both is the most reliable path.
  async function tryGet(access: "private" | "public") {
    try {
      return await get(url, { access, token });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[files] get(access=${access}) threw`, { url, err: String(err) });
      return null;
    }
  }

  let blob = await tryGet("private");
  if (!blob || !blob.stream) {
    blob = await tryGet("public");
  }

  // Last-resort fallback: head() to verify the blob exists, then fetch the
  // returned URL with the token as Authorization header.
  if (!blob || !blob.stream) {
    try {
      const meta = await head(url, { token });
      const upstream = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (upstream.ok && upstream.body) {
        let disposition = meta.contentDisposition;
        if (opts.download) {
          const safeName = (opts.fileName || "download").replace(/"/g, "");
          disposition = `attachment; filename="${safeName}"`;
        }
        return new Response(upstream.body, {
          headers: {
            "content-type": meta.contentType,
            "content-disposition": disposition,
            "cache-control": meta.cacheControl,
          },
        });
      }
      // eslint-disable-next-line no-console
      console.error(`[files] fetch(meta.url) failed`, {
        url,
        metaUrl: meta.url,
        upstreamStatus: upstream.status,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[files] head() threw`, { url, err: String(err) });
    }
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

  if (entity === "lawyers") {
    const rows = await db.select().from(lawyers).where(eq(lawyers.id, recordId)).limit(1);
    const record = rows[0];
    if (!record?.proofFileUrl) {
      return new Response("Not found", { status: 404 });
    }
    const authorized = await getAuthorizedCase(user, record.caseId);
    if (!authorized) {
      return new Response("Forbidden", { status: 403 });
    }
    return serveBlob(record.proofFileUrl, { download, fileName: record.proofFileName ?? record.fullName ?? null });
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

  // Pleading attachments — recordId is the pleadings row id, ?asset
  // selects original ("file", default) or translated copy ("translation").
  if (entity === "pleadings") {
    const rows = await db.select().from(pleadings).where(eq(pleadings.id, recordId)).limit(1);
    const record = rows[0];
    if (!record) {
      return new Response("Not found", { status: 404 });
    }
    const authorized = await getAuthorizedCase(user, record.caseId);
    if (!authorized) {
      return new Response("Forbidden", { status: 403 });
    }
    const asset = requestUrl.searchParams.get("asset") || "file";
    let sourceUrl: string | null = null;
    let fileName: string | null = null;
    if (asset === "translation") {
      sourceUrl = record.translationUrl ?? null;
      fileName = record.translationName ?? null;
    } else {
      sourceUrl = record.fileUrl ?? null;
      fileName = record.fileName ?? null;
    }
    if (!sourceUrl) {
      return new Response("Not found", { status: 404 });
    }
    return serveBlob(sourceUrl, { download, fileName });
  }

  // Case-level assets (currently the per-side statement attachment).
  // recordId is the caseId; ?asset selects which slot.
  if (entity === "case") {
    const asset = requestUrl.searchParams.get("asset");
    const rows = await db.select().from(cases).where(eq(cases.id, recordId)).limit(1);
    const record = rows[0];
    if (!record) {
      return new Response("Not found", { status: 404 });
    }
    const authorized = await getAuthorizedCase(user, record.id);
    if (!authorized) {
      return new Response("Forbidden", { status: 403 });
    }
    let sourceUrl: string | null = null;
    let fileName: string | null = null;
    if (asset === "claimant-statement") {
      sourceUrl = record.claimantStatementFileUrl ?? null;
      fileName = record.claimantStatementFileName ?? null;
    } else if (asset === "respondent-statement") {
      sourceUrl = record.respondentStatementFileUrl ?? null;
      fileName = record.respondentStatementFileName ?? null;
    } else if (asset === "claimant-statement-translation") {
      sourceUrl = record.claimantStatementFileTranslationUrl ?? null;
      fileName = record.claimantStatementFileTranslationName ?? null;
    } else if (asset === "respondent-statement-translation") {
      sourceUrl = record.respondentStatementFileTranslationUrl ?? null;
      fileName = record.respondentStatementFileTranslationName ?? null;
    }
    if (!sourceUrl) {
      return new Response("Not found", { status: 404 });
    }
    return serveBlob(sourceUrl, { download, fileName });
  }

  return new Response("Not found", { status: 404 });
}
