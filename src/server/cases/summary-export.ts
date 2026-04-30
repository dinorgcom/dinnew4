import { and, eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { getDb } from "@/db/client";
import { caseAudits } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { getAuthorizedCase } from "@/server/cases/access";

type AppUser = ProvisionedAppUser | null;

function writeWrapped(doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}) {
  doc.text(text || "-", {
    width: 500,
    lineGap: 2,
    ...options,
  });
}

function writeList(doc: PDFKit.PDFDocument, title: string, items: string[]) {
  doc.moveDown(0.8);
  doc.fillColor("#0f172a").fontSize(12).text(title);
  doc.fillColor("#334155").fontSize(9);
  if (items.length === 0) {
    writeWrapped(doc, "-");
    return;
  }
  items.forEach((item) => writeWrapped(doc, `- ${item}`));
}

export async function renderCaseSummaryPdf(user: AppUser, caseId: string, auditId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(caseAudits)
    .where(and(eq(caseAudits.caseId, caseId), eq(caseAudits.id, auditId)))
    .limit(1);
  const audit = rows[0];
  if (!audit) {
    throw new Error("Summary not found");
  }

  const body = audit.auditJson as {
    executive_summary?: string;
    strengths?: string[];
    weaknesses?: string[];
    missing_information?: string[];
    recommended_next_steps?: string[];
    overall_readiness?: string;
    evidence_assessment?: Array<{ title?: string; relevance?: string; concern?: string }>;
  };
  const snapshot = audit.snapshotJson as { perspective?: string };

  const doc = new PDFDocument({ margin: 48, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fillColor("#0f172a").fontSize(18).text("Case Summary");
  doc.moveDown(0.5);
  doc.fillColor("#475569").fontSize(10);
  writeWrapped(doc, `Case: ${authorized.case.caseNumber} - ${authorized.case.title}`);
  writeWrapped(doc, `Perspective: ${snapshot.perspective || "Case"}`);
  writeWrapped(doc, `Readiness: ${body.overall_readiness || "unknown"}`);
  writeWrapped(doc, `Generated: ${audit.requestedAt ? new Date(audit.requestedAt).toISOString() : ""}`);
  writeWrapped(doc, `Exported: ${new Date().toISOString()}`);

  doc.moveDown();
  doc.fillColor("#0f172a").fontSize(12).text(audit.title || "Untitled summary");
  doc.fillColor("#334155").fontSize(9);
  writeWrapped(doc, body.executive_summary || "");

  writeList(doc, "Strengths", body.strengths || []);
  writeList(doc, "Weaknesses", body.weaknesses || []);
  writeList(doc, "Missing Information", body.missing_information || []);
  writeList(doc, "Recommended Next Steps", body.recommended_next_steps || []);

  doc.moveDown(0.8);
  doc.fillColor("#0f172a").fontSize(12).text("Evidence Assessment");
  doc.fillColor("#334155").fontSize(9);
  const evidence = body.evidence_assessment || [];
  if (evidence.length === 0) {
    writeWrapped(doc, "-");
  } else {
    evidence.forEach((item, index) => {
      if (doc.y > 735) doc.addPage();
      doc.fillColor("#0f172a").fontSize(10).text(item.title || `Evidence ${index + 1}`);
      doc.fillColor("#334155").fontSize(9);
      writeWrapped(doc, `Relevance: ${item.relevance || "-"}`);
      writeWrapped(doc, `Concern: ${item.concern || "-"}`);
      doc.moveDown(0.4);
    });
  }

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
