# Migration Inventory

This document maps the existing Base44 app to the greenfield rewrite targets.

## Current Base44 entities

| Base44 entity | Greenfield target |
| --- | --- |
| `User` | `users` |
| `Case` | `cases` |
| `Evidence` | `evidence` |
| `Witness` | `witnesses` |
| `Consultant` | `consultants` |
| `Expertise` | `expertise_requests` |
| `Message` | `case_messages` |
| `CaseActivity` | `case_activities` |
| `LawyerConversation` | `lawyer_conversations` |
| `CaseAudit` | `case_audits` |
| `TokenLedger` | `token_ledger` |
| `ProcessedStripeEvent` | `processed_stripe_events` |
| `AdminUserAction` | `admin_user_actions` |

## Current Base44 function families

| Base44 function | Future service/API area |
| --- | --- |
| `getCaseContext` | `cases/context` |
| `finalizeCaseCreation` | `cases/finalize` |
| `scheduleHearing` | `cases/hearings` |
| `notifyDefendant` | `cases/invitations` + `email` |
| `requestAudit` / `listCaseAudits` | `audits` |
| `generateJudgement` / `acceptJudgement` | `judgement` |
| `requestArbitrationAction` / `acceptArbitrationProposal` / `generateArbitrationProposal` | `arbitration` |
| `moderateEvidence` | `evidence/moderation` |
| `invokeGrok` | `ai` |
| `createCheckout` / `stripeWebhook` / `getTokenPricing` | `billing` |
| `spendTokens` / `previewTokenSpend` / `addTokens` / `deductTokens` / `setUserTokenBalance` | `tokens` |
| `listUsersForAdmin` / `adminUserAction` | `admin/users` |

## Current frontend dependency seams

- `base44.auth.*`
- `base44.entities.*`
- `base44.functions.invoke(...)`
- `base44.integrations.Core.UploadFile(...)`
- `base44.integrations.Core.InvokeLLM(...)`
- `base44.integrations.Core.SendEmail(...)`

These seams should not be recreated. Each should be replaced by explicit domain services and typed APIs.
