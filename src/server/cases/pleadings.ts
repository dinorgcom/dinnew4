import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { head } from "@vercel/blob";
import { getDb } from "@/db/client";
import { cases, pleadings } from "@/db/schema";
import { env } from "@/lib/env";
import { generateStructuredObject } from "@/server/ai/service";
import { spendForAction } from "@/server/billing/service";
import { uploadBlob } from "@/server/blob/service";
import { getAuthorizedCase } from "@/server/cases/access";
import {
  createCaseActivity,
  // applySanitizeEdits is internal to mutations.ts; re-implement a thin
  // server-side splitter here (the full helper logic is duplicated for
  // clarity rather than imported, since the schema is a sibling concern).
} from "@/server/cases/mutations";
import { notifyCaseEvent } from "@/server/notifications/service";
import { translateDocument, translateText } from "@/server/translation/deepl";
import type { ProvisionedAppUser } from "@/server/auth/provision";

type AppUser = ProvisionedAppUser | null;

// Slot order — defines the workflow: each slot only opens once the
// predecessor is locked. Server enforces this on save and submit.
export const PLEADING_SLOT_ORDER: Array<{ side: "claimant" | "respondent"; round: 1 | 2 }> = [
  { side: "claimant", round: 1 },
  { side: "respondent", round: 1 },
  { side: "claimant", round: 2 },
  { side: "respondent", round: 2 },
];

// Friendly labels (English) used in audit-trail entries and notifications.
export function pleadingSlotLabel(side: "claimant" | "respondent", round: 1 | 2): string {
  if (side === "claimant" && round === 1) return "Claim (round 1)";
  if (side === "respondent" && round === 1) return "Response (round 1)";
  if (side === "claimant" && round === 2) return "Reply (round 2)";
  return "Rejoinder (round 2)";
}

const sideSchema = z.enum(["claimant", "respondent"]);
const roundSchema = z.union([z.literal(1), z.literal(2)]);

const pleadingSaveSchema = z.object({
  text: z.string().trim().default(""),
  attachment: z
    .object({
      url: z.string().url(),
      pathname: z.string(),
      fileName: z.string(),
      contentType: z.string().optional().nullable(),
      size: z.number().optional().nullable(),
    })
    .optional()
    .nullable(),
  removeAttachment: z.boolean().optional(),
});

function parseSlot(side: unknown, round: unknown) {
  const parsedSide = sideSchema.parse(side);
  const parsedRound = roundSchema.parse(typeof round === "string" ? Number(round) : round);
  return { side: parsedSide, round: parsedRound as 1 | 2 };
}

async function loadPleadings(caseId: string) {
  const db = getDb();
  return db
    .select()
    .from(pleadings)
    .where(eq(pleadings.caseId, caseId))
    .orderBy(asc(pleadings.round), asc(pleadings.side));
}

// Find the (side, round) row in the pleadings list. Returns undefined
// if no row exists yet — the slot is empty.
function findSlot(
  rows: Array<typeof pleadings.$inferSelect>,
  side: "claimant" | "respondent",
  round: 1 | 2,
) {
  return rows.find((row) => row.side === side && row.round === round);
}

// Returns the index in PLEADING_SLOT_ORDER for the given slot.
function slotIndex(side: "claimant" | "respondent", round: 1 | 2) {
  return PLEADING_SLOT_ORDER.findIndex((slot) => slot.side === side && slot.round === round);
}

// True if EVERY predecessor of the given slot is locked. The first slot
// (claimant round 1) is always editable.
function predecessorsLocked(
  rows: Array<typeof pleadings.$inferSelect>,
  side: "claimant" | "respondent",
  round: 1 | 2,
): boolean {
  const idx = slotIndex(side, round);
  if (idx <= 0) return true;
  for (let i = 0; i < idx; i++) {
    const prev = PLEADING_SLOT_ORDER[i];
    const prevRow = findSlot(rows, prev.side, prev.round);
    if (!prevRow?.lockedAt) return false;
  }
  return true;
}

export async function getCasePleadings(user: AppUser, caseId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const rows = await loadPleadings(caseId);
  return PLEADING_SLOT_ORDER.map((slot) => {
    const row = findSlot(rows, slot.side, slot.round);
    return {
      side: slot.side,
      round: slot.round,
      label: pleadingSlotLabel(slot.side, slot.round),
      text: row?.text ?? null,
      fileUrl: row?.fileUrl ?? null,
      fileName: row?.fileName ?? null,
      filePathname: row?.filePathname ?? null,
      translationUrl: row?.translationUrl ?? null,
      translationName: row?.translationName ?? null,
      translationLang: row?.translationLang ?? null,
      lockedAt: row?.lockedAt ?? null,
      submittedByUserId: row?.submittedByUserId ?? null,
      // Whether all predecessors are locked → this slot is reachable now.
      reachable: predecessorsLocked(rows, slot.side, slot.round),
      // Whether the row exists at all in DB.
      exists: !!row,
    };
  });
}

async function ensureEditable(
  caseId: string,
  side: "claimant" | "respondent",
  round: 1 | 2,
) {
  const rows = await loadPleadings(caseId);
  const row = findSlot(rows, side, round);
  if (row?.lockedAt) {
    throw new Error("This pleading has already been finalized — it cannot be edited.");
  }
  if (!predecessorsLocked(rows, side, round)) {
    throw new Error(
      "The previous pleading in this round has not been finalized yet. Wait for the other side to finish.",
    );
  }
  return { rows, row };
}

export async function savePleading(
  user: AppUser,
  caseId: string,
  sideRaw: unknown,
  roundRaw: unknown,
  payload: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const { side, round } = parseSlot(sideRaw, roundRaw);
  if (authorized.role !== side) {
    throw new Error(`Only the ${side} can edit the ${side} pleading.`);
  }
  const parsed = pleadingSaveSchema.parse(payload);
  const { row } = await ensureEditable(caseId, side, round);

  const cleanedText = parsed.text.trim() || null;

  // Resolve attachment field — explicit replace, explicit remove, or keep.
  let nextFileUrl: string | null = row?.fileUrl ?? null;
  let nextFilePath: string | null = row?.filePathname ?? null;
  let nextFileName: string | null = row?.fileName ?? null;
  if (parsed.removeAttachment) {
    nextFileUrl = null;
    nextFilePath = null;
    nextFileName = null;
  } else if (parsed.attachment) {
    nextFileUrl = parsed.attachment.url;
    nextFilePath = parsed.attachment.pathname;
    nextFileName = parsed.attachment.fileName;
  }

  const db = getDb();
  if (row) {
    await db
      .update(pleadings)
      .set({
        text: cleanedText,
        fileUrl: nextFileUrl,
        filePathname: nextFilePath,
        fileName: nextFileName,
        updatedAt: new Date(),
      })
      .where(eq(pleadings.id, row.id));
  } else {
    await db.insert(pleadings).values({
      caseId,
      side,
      round,
      text: cleanedText,
      fileUrl: nextFileUrl,
      filePathname: nextFilePath,
      fileName: nextFileName,
    });
  }

  return { success: true };
}

export async function submitPleading(
  user: AppUser,
  caseId: string,
  sideRaw: unknown,
  roundRaw: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const { side, round } = parseSlot(sideRaw, roundRaw);
  if (authorized.role !== side) {
    throw new Error(`Only the ${side} can submit the ${side} pleading.`);
  }
  const { row } = await ensureEditable(caseId, side, round);
  if (!row) {
    throw new Error("Save your text or attach a document before final submit.");
  }
  const hasContent = !!(row.text && row.text.trim()) || !!row.fileUrl;
  if (!hasContent) {
    throw new Error("Save your text or attach a document before final submit.");
  }

  const db = getDb();
  const now = new Date();
  await db
    .update(pleadings)
    .set({
      lockedAt: now,
      submittedByUserId: user?.id ?? null,
      updatedAt: now,
    })
    .where(eq(pleadings.id, row.id));

  const label = pleadingSlotLabel(side, round);
  await createCaseActivity(
    caseId,
    "filing",
    `${label} finalized`,
    `${side} submitted the ${label} as final.`,
    { user, impersonation: authorized.impersonation },
  );

  // Notify the other side that it's their turn (or that pleadings phase
  // closed if this was the last slot).
  const idx = slotIndex(side, round);
  const nextSlot = PLEADING_SLOT_ORDER[idx + 1];
  if (nextSlot) {
    await notifyCaseEvent(caseId, "evidence_added", {
      title: `${label} finalized`,
      body: `Your turn: ${pleadingSlotLabel(nextSlot.side, nextSlot.round)} is now editable.`,
      actor: user?.fullName || user?.email || authorized.role,
    });
  } else {
    await notifyCaseEvent(caseId, "evidence_added", {
      title: "Pleadings phase complete",
      body: "All four pleadings have been finalized. The case moves to evidence and discovery.",
      actor: user?.fullName || user?.email || authorized.role,
    });
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// AI sanitize on a pleading slot. Mirrors the older single-statement flow but
// scoped to one slot. Does NOT save the result; returns the suggestion so the
// UI can preview and let the user apply + Save.
// ---------------------------------------------------------------------------

const sanitizeOutputSchema = z.object({
  removed: z
    .array(
      z.object({
        passage: z.string().default(""),
        reason: z.string().default(""),
      }),
    )
    .default([]),
  note: z.string().default(""),
});

const SANITIZE_SYSTEM_PROMPT = `You are a legal assistant for DIN.ORG, an international online arbitration tribunal that decides civil and commercial disputes between private parties.

YOUR JOB IS NARROW. By default you keep the entire pleading intact, including the full factual narrative, dates, names, amounts, contractual references, and legal arguments. You only flag the specific passages that an arbitral tribunal genuinely cannot grant.

KEEP — the tribunal CAN order all of these:
- Money damages, refund, restitution, agreed price, interest, costs, contract penalties.
- Performance of contractual obligations, delivery, hand-over, transfer, signing/executing notarial deeds.
- Declarations about contractual rights and duties; declared termination, rescission, amendment.
- Factual statements about what happened, dates, places, names.
- Legal arguments about contract law, tort, unjust enrichment, warranty, IP licensing, partnership.
- References to court documents and prior orders — these are context.

REMOVE / FLAG — the tribunal CANNOT do these:
- Preliminary injunctions enforceable against third parties or by state coercion (einstweilige Verfügung, einstweilige Anordnung, freezing orders against non-parties).
- Criminal sanctions, Strafantrag/Strafanzeige, custodial orders, fines payable to the state.
- Orders requiring entries in state registers (land, commercial, civil status, criminal).
- Public-law / administrative orders against government bodies.
- Asylum, immigration, family-status decisions reserved to state courts.

OUTPUT RULES:
- DO NOT output the full text. Server applies your edits.
- "removed" = list each verbatim quote of the source to strip. Match source bytes exactly so server can find it. Keep entries SHORT (single sentence or clause where possible).
- "reason" = one-sentence why-not.
- "note" = short paragraph for the party. If nothing was removed, say so explicitly.

If you find yourself listing more than ~10% of the text, stop and reconsider — almost certainly too aggressive. Default = keep nothing flagged unless clearly out of scope.
`;

function applySanitizeEdits(
  original: string,
  removed: Array<{ passage: string; reason: string }>,
) {
  let result = original;
  const applied: Array<{ passage: string; reason: string; matched: boolean }> = [];
  for (const entry of removed) {
    const passage = (entry.passage || "").trim();
    if (!passage) continue;
    const next = result.split(passage).join("");
    const matched = next !== result;
    if (matched) result = next;
    applied.push({ passage: entry.passage, reason: entry.reason, matched });
  }
  return { sanitized: result, applied };
}

async function fetchAttachmentBuffer(
  storedUrl: string,
): Promise<{ buffer: Buffer; mediaType: string }> {
  if (!env.BLOB_READ_WRITE_TOKEN) throw new Error("Blob token not configured");
  const meta = await head(storedUrl, { token: env.BLOB_READ_WRITE_TOKEN });
  const upstream = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error("Could not download the attached document.");
  }
  const buffer = Buffer.from(await upstream.arrayBuffer());
  const MAX_BYTES = 25 * 1024 * 1024;
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("Attached document is too large for the AI to process.");
  }
  return { buffer, mediaType: meta.contentType || "application/octet-stream" };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // @ts-ignore — package may not be installed in dev, Vercel installs from package.json
  const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text || "";
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  // @ts-ignore — package may not be installed in dev
  const mammoth = (await import("mammoth")) as {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value?: string }>;
  };
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

export async function sanitizePleading(
  user: AppUser,
  caseId: string,
  sideRaw: unknown,
  roundRaw: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) throw new Error("Forbidden");
  const { side, round } = parseSlot(sideRaw, roundRaw);
  if (authorized.role !== side) {
    throw new Error(`Only the ${side} can run the AI clean-up on the ${side} pleading.`);
  }
  const rows = await loadPleadings(caseId);
  const row = findSlot(rows, side, round);
  if (!row) throw new Error("Nothing to sanitize on this slot yet.");
  if (row.lockedAt) throw new Error("This pleading is locked and can no longer be modified.");

  const language = (authorized.case.language || "en").toLowerCase();

  // Resolve source text: prefer saved text; fall back to extracting from
  // an attached PDF/DOCX server-side.
  let sourceText = (row.text || "").trim();
  let sourceLabel = "saved text";
  if (!sourceText && row.fileUrl) {
    const downloaded = await fetchAttachmentBuffer(row.fileUrl);
    const lowerName = (row.fileName ?? "").toLowerCase();
    const isPdf =
      downloaded.mediaType === "application/pdf" || lowerName.endsWith(".pdf");
    const isDocx =
      downloaded.mediaType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerName.endsWith(".docx");
    if (isPdf) {
      sourceText = (await extractPdfText(downloaded.buffer)).trim();
      sourceLabel = `PDF (${row.fileName ?? "attachment"})`;
    } else if (isDocx) {
      sourceText = (await extractDocxText(downloaded.buffer)).trim();
      sourceLabel = `Word document (${row.fileName ?? "attachment"})`;
    } else {
      throw new Error(
        "Only PDF and .docx attachments can be read directly. Paste the text into the field instead.",
      );
    }
    if (!sourceText) {
      throw new Error("Could not extract any text from the attached document.");
    }
  }
  if (!sourceText) {
    throw new Error("Add either text or a document to your pleading first.");
  }

  const spend = await spendForAction(user, {
    actionCode: "statement_sanitize",
    caseId,
    idempotencyKey: `pleading_sanitize:${caseId}:${side}:${round}:${Date.now()}`,
    metadata: { side, round, length: sourceText.length },
  });
  if (!spend.success) throw new Error(spend.error || "Insufficient tokens");

  const taskInstruction = [
    `The pleading was filed by the ${side} (${pleadingSlotLabel(side, round)}).`,
    `Case language: ${language}. Write the removed-list and note in this language.`,
    "Output JSON conforming to the schema.",
  ].join(" ");

  const prompt = [
    SANITIZE_SYSTEM_PROMPT,
    "",
    taskInstruction,
    "",
    `Source: ${sourceLabel}.`,
    "",
    "STATEMENT:",
    sourceText,
  ].join("\n");

  const aiResult = await generateStructuredObject(prompt, sanitizeOutputSchema, {
    maxTokens: 8000,
  });

  const removedEntries: Array<{ passage: string; reason: string }> = aiResult.removed ?? [];
  const { sanitized, applied } = applySanitizeEdits(sourceText, removedEntries);
  const matchedCount = applied.filter((entry) => entry.matched).length;
  const unmatchedCount = applied.length - matchedCount;

  await createCaseActivity(
    caseId,
    "note",
    "AI sanitize ran on pleading",
    `${pleadingSlotLabel(side, round)} (${sourceLabel}), ${matchedCount} passage(s) removed${
      unmatchedCount > 0 ? `, ${unmatchedCount} unmatched` : ""
    }.`,
    { user, impersonation: authorized.impersonation },
  );

  return {
    sanitized,
    removed: removedEntries.map((entry, idx) => ({
      passage: entry.passage,
      reason: entry.reason,
      matched: applied[idx]?.matched ?? false,
    })),
    note: aiResult.note,
  };
}

// ---------------------------------------------------------------------------
// Translation (text + document) on a pleading slot.
// ---------------------------------------------------------------------------

export async function translatePleadingText(
  user: AppUser,
  caseId: string,
  sideRaw: unknown,
  roundRaw: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) throw new Error("Forbidden");
  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Only an active party can translate pleadings.");
  }
  const { side, round } = parseSlot(sideRaw, roundRaw);
  const rows = await loadPleadings(caseId);
  const row = findSlot(rows, side, round);
  const text = (row?.text || "").trim();
  if (!text) throw new Error("There is no text to translate on this slot yet.");

  const targetLang = (authorized.case.language || "en").toLowerCase();
  const spend = await spendForAction(user, {
    actionCode: "statement_translate",
    caseId,
    idempotencyKey: `pleading_translate:${caseId}:${side}:${round}:${Date.now()}`,
    metadata: { side, round, targetLang, length: text.length },
  });
  if (!spend.success) throw new Error(spend.error || "Insufficient tokens");

  const result = await translateText(text, targetLang);
  await createCaseActivity(
    caseId,
    "note",
    "Pleading translated",
    `${pleadingSlotLabel(side, round)} translated ${result.detectedSourceLang || "?"} → ${targetLang}.`,
    { user, impersonation: authorized.impersonation },
  );
  return {
    translatedText: result.translatedText,
    detectedSourceLang: result.detectedSourceLang,
    targetLang,
  };
}

export async function translatePleadingDocument(
  user: AppUser,
  caseId: string,
  sideRaw: unknown,
  roundRaw: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) throw new Error("Forbidden");
  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Only an active party can translate pleading documents.");
  }
  const { side, round } = parseSlot(sideRaw, roundRaw);
  const rows = await loadPleadings(caseId);
  const row = findSlot(rows, side, round);
  if (!row?.fileUrl) {
    throw new Error("There is no document on this slot to translate.");
  }
  const targetLang = (authorized.case.language || "en").toLowerCase();
  if (row.translationLang === targetLang && row.translationUrl) {
    return { translatedUrl: row.translationUrl, targetLang, cached: true };
  }

  const spend = await spendForAction(user, {
    actionCode: "document_translate",
    caseId,
    idempotencyKey: `pleading_doc_translate:${caseId}:${side}:${round}:${targetLang}:${Date.now()}`,
    metadata: { side, round, targetLang, sourceFileName: row.fileName },
  });
  if (!spend.success) throw new Error(spend.error || "Insufficient tokens");

  if (!env.BLOB_READ_WRITE_TOKEN) throw new Error("Blob token not configured");
  const meta = await head(row.fileUrl, { token: env.BLOB_READ_WRITE_TOKEN });
  const upstream = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error("Could not download the original document.");
  }
  const sourceBuffer = Buffer.from(await upstream.arrayBuffer());
  const translated = await translateDocument({
    buffer: sourceBuffer,
    fileName: row.fileName ?? "pleading",
    contentType: meta.contentType,
    targetLang,
  });

  const baseName = (row.fileName ?? "pleading").replace(/\.[^.]+$/, "");
  const ext = translated.fileName.match(/\.[^.]+$/)?.[0] ?? "";
  const translatedFileName = `${baseName}.${targetLang}${ext}`;
  const blobPath = `cases/${caseId}/translations/${Date.now()}-${translatedFileName.replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  )}`;
  const uploaded = await uploadBlob({
    pathname: blobPath,
    body: translated.translatedBlob,
    contentType: translated.contentType,
  });

  const db = getDb();
  await db
    .update(pleadings)
    .set({
      translationUrl: uploaded.url,
      translationPathname: uploaded.pathname,
      translationName: translatedFileName,
      translationLang: targetLang,
      updatedAt: new Date(),
    })
    .where(eq(pleadings.id, row.id));

  await createCaseActivity(
    caseId,
    "note",
    "Pleading document translated",
    `${pleadingSlotLabel(side, round)} document translated to ${targetLang} (${translated.billedCharacters.toLocaleString()} chars).`,
    { user, impersonation: authorized.impersonation },
  );

  return {
    translatedUrl: uploaded.url,
    targetLang,
    cached: false,
    billedCharacters: translated.billedCharacters,
  };
}
