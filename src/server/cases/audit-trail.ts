import { asc, eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { getDb } from "@/db/client";
import { caseActivities } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { getAuthorizedCase } from "@/server/cases/mutations";

type AppUser = ProvisionedAppUser | null;

export type AuditTrailEntry = typeof caseActivities.$inferSelect;

export async function listCaseAuditTrail(user: AppUser, caseId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  const entries = await db
    .select()
    .from(caseActivities)
    .where(eq(caseActivities.caseId, caseId))
    .orderBy(asc(caseActivities.createdAt));

  return {
    case: {
      id: authorized.case.id,
      caseNumber: authorized.case.caseNumber,
      title: authorized.case.title,
      claimantName: authorized.case.claimantName,
      respondentName: authorized.case.respondentName,
    },
    entries,
  };
}

function writeWrapped(doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}) {
  doc.text(text || "-", {
    width: 500,
    lineGap: 2,
    ...options,
  });
}

export async function renderAuditTrailPdf(user: AppUser, caseId: string) {
  const { case: caseItem, entries } = await listCaseAuditTrail(user, caseId);
  const doc = new PDFDocument({ margin: 48, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(18).text("Case Audit Trail", { continued: false });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#475569");
  writeWrapped(doc, `Case: ${caseItem.caseNumber} - ${caseItem.title}`);
  writeWrapped(doc, `Parties: ${caseItem.claimantName || "Claimant"} vs ${caseItem.respondentName || "Respondent"}`);
  writeWrapped(doc, `Exported: ${new Date().toISOString()}`);
  doc.moveDown();

  entries.forEach((entry, index) => {
    const timestamp = entry.createdAt ? new Date(entry.createdAt).toISOString() : "";
    const metadata = entry.metadataJson || {};
    const eventKey = typeof metadata.eventKey === "string" ? metadata.eventKey : entry.type;
    const entityType = typeof metadata.entityType === "string" ? metadata.entityType : "";
    const entityTitle = typeof metadata.entityTitle === "string" ? metadata.entityTitle : "";

    if (doc.y > 735) {
      doc.addPage();
    }

    doc.fillColor("#0f172a").fontSize(11).text(`${index + 1}. ${entry.title}`);
    doc.fillColor("#64748b").fontSize(8);
    writeWrapped(doc, `${timestamp}${entry.performedBy ? ` | ${entry.performedBy}` : ""}${eventKey ? ` | ${eventKey}` : ""}`);
    if (entityType || entityTitle) {
      writeWrapped(doc, `Record: ${[entityType, entityTitle].filter(Boolean).join(" - ")}`);
    }
    doc.fillColor("#334155").fontSize(9);
    writeWrapped(doc, entry.description || "");
    doc.moveDown(0.7);
  });

  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor("#94a3b8").text(`Page ${i + 1} of ${pageCount}`, 48, 805, {
      align: "right",
      width: 500,
    });
  }

  doc.end();
  return done;
}
