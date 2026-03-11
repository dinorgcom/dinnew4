# Base44 Import

This repo includes a one-time importer for moving exported Base44 records into the Neon-backed rewrite.

## What the importer does

- reads a directory of exported JSON or JSONC files, or a single bundle file
- generates fresh UUIDs for the new schema and remaps cross-record references
- normalizes legacy record statuses into the current Postgres enums
- imports:
  - users
  - cases
  - evidence
  - witnesses
  - consultants
  - expertise requests
  - case messages
  - case activities
  - lawyer conversations
  - case audits
  - token ledger
  - processed Stripe events
  - admin user actions

## What it does not do

- create Clerk users
- copy binary files out of Base44 storage
- translate every removed legacy field one-to-one when there is no equivalent target column

Blob-backed files should be migrated separately if you want the actual objects moved, not just the metadata URLs.

## Expected export layout

The importer accepts either:

1. A directory containing entity files such as:
   - `User.json`
   - `Case.json`
   - `Evidence.json`
   - `Witness.json`
   - `Consultant.json`
   - `Expertise.json`
   - `Message.json`
   - `CaseActivity.json`
   - `LawyerConversation.json`
   - `CaseAudit.json`
   - `TokenLedger.json`
   - `ProcessedStripeEvent.json`
   - `AdminUserAction.json`

2. A single JSON/JSONC bundle file with top-level arrays keyed by those entity names.

## Usage

Dry run:

```bash
npm run import:base44 -- --source ../base44-export
```

Apply to the configured Neon database:

```bash
npm run import:base44 -- --source ../base44-export --apply
```

Allow writing into a database that already has rows:

```bash
npm run import:base44 -- --source ../base44-export --apply --allow-non-empty
```

## Notes

- The importer refuses to write into a non-empty `users` or `cases` table unless `--allow-non-empty` is passed.
- `DATABASE_URL` must be set in the environment before running it.
- Review the dry-run report first. It reports inserted counts, skipped counts, and missing-reference warnings.
