import { z } from "zod";

export const caseStatusSchema = z.enum([
  "draft",
  "filed",
  "under_review",
  "hearing_scheduled",
  "in_arbitration",
  "awaiting_decision",
  "resolved",
  "closed",
  "withdrawn",
]);

export const partySideSchema = z.enum(["claimant", "respondent", "arbitrator"]);

export const discussionEntrySchema = z.object({
  comment: z.string(),
  submittedBy: z.string(),
  submittedAt: z.string(),
});

export const claimResponseSchema = z.object({
  response: z.string(),
  submittedBy: z.string(),
  submittedDate: z.string(),
});

export const claimSchema = z.object({
  claim: z.string(),
  details: z.string().optional(),
  evidenceIds: z.array(z.string()).default([]),
  witnessIds: z.array(z.string()).default([]),
  responses: z.array(claimResponseSchema).default([]),
});

export const casePrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const caseMutationSchema = z.object({
  description: z.string().min(1),
  category: z.string().min(1).default("commercial"),
  priority: casePrioritySchema.default("medium"),
  claimantName: z.string().min(1),
  claimantEmail: z.string().email(),
  claimantPhone: z.string().optional().nullable(),
  respondentName: z.string().min(1),
  respondentEmail: z.string().email(),
  respondentPhone: z.string().optional().nullable(),
  claimAmount: z.coerce.number().nonnegative().optional().nullable(),
  currency: z.string().default("USD"),
  claimantClaims: z.array(claimSchema).default([]),
  respondentClaims: z.array(claimSchema).default([]),
  claimantLawyerKey: z.string().optional().nullable(),
  saveMode: z.enum(["draft", "file"]).default("draft"),
});

export const caseClaimsUpdateSchema = z.object({
  claimantClaims: z.array(claimSchema).default([]),
  respondentClaims: z.array(claimSchema).default([]),
});

export const caseLawyerSelectionSchema = z.object({
  side: z.enum(["claimant", "respondent"]),
  lawyerKey: z.string().min(1),
});

export const hearingScheduleSchema = z.object({
  hearingDate: z.string().min(1),
  arbitrator: z.string().min(1),
  endTime: z.string().optional(),
  meetingUrl: z.string().url().optional(),
  meetingId: z.string().optional(),
});

export const caseContactsUpdateSchema = z.object({
  claimantName: z.string().trim().min(1).optional(),
  claimantEmail: z.string().trim().email().optional(),
  claimantPhone: z.string().trim().optional().nullable(),
  claimantAddress: z.string().trim().optional().nullable(),
  claimantCity: z.string().trim().optional().nullable(),
  claimantPostalCode: z.string().trim().optional().nullable(),
  claimantCountry: z.string().trim().optional().nullable(),
  respondentName: z.string().trim().min(1).optional(),
  respondentEmail: z.string().trim().email().optional(),
  respondentPhone: z.string().trim().optional().nullable(),
  respondentAddress: z.string().trim().optional().nullable(),
  respondentCity: z.string().trim().optional().nullable(),
  respondentPostalCode: z.string().trim().optional().nullable(),
  respondentCountry: z.string().trim().optional().nullable(),
});

export const evidenceCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum([
    "document",
    "contract",
    "correspondence",
    "photo",
    "video",
    "audio",
    "financial_record",
    "expert_report",
    "other",
  ]),
  notes: z.string().optional().nullable(),
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
});

export const evidenceReviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({
    action: z.literal("dismiss"),
    reason: z.string().min(1),
    attachment: z
      .object({
        url: z.string().url(),
        pathname: z.string(),
        fileName: z.string(),
        contentType: z.string().optional().nullable(),
        size: z.number().optional().nullable(),
      })
      .optional(),
  }),
  z.object({ action: z.literal("extend") }),
  z.object({
    action: z.literal("request_expertise"),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
  }),
]);

export const witnessCreateSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  relationship: z.string().optional(),
  statement: z.string().optional(),
  notes: z.string().optional(),
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
  photo: z
    .object({
      url: z.string().url(),
      pathname: z.string(),
      fileName: z.string(),
      contentType: z.string().optional().nullable(),
      size: z.number().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const consultantCreateSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  company: z.string().optional(),
  expertise: z.string().optional(),
  role: z.string().optional(),
  report: z.string().optional(),
  notes: z.string().optional(),
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
});

export const expertiseCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  attachments: z
    .array(
      z.object({
        url: z.string().url(),
        pathname: z.string(),
        fileName: z.string(),
        contentType: z.string().optional().nullable(),
        size: z.number().optional().nullable(),
      }),
    )
    .default([]),
});

export const messageCreateSchema = z.object({
  content: z.string().min(1),
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
});

export const recordCommentCreateSchema = z.object({
  comment: z.string().trim().min(1).max(4000),
});
