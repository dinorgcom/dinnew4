# DIN.ORG Greenfield Rewrite

This directory is the new application scaffold for the Base44 replacement.

Target stack:

- Next.js App Router
- Neon Postgres
- Drizzle ORM
- Clerk
- Vercel Blob
- Vercel AI SDK
- Stripe
- Resend

The existing app in the repo root remains reference material only. Feature migration should happen into this directory in vertical slices.

## Getting started

1. Copy `.env.example` to `.env.local`.
2. Install dependencies with `npm install`.
3. Run `npm run dev`.

## Initial scope

This scaffold intentionally includes:

- app shell and health route
- env validation
- database config and schema foundation
- service boundaries for auth, blob, AI, and API responses
- Clerk-backed app user provisioning
- authenticated dashboard, cases list, and case detail reads
- migration inventory docs

It intentionally does not include:

- migrated pages
- write-path workflows
- uploads
- Stripe flows
- AI prompts
- data import scripts
