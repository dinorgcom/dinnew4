import Link from "next/link";
import type { Route } from "next";

export default function ApiDocsPage() {
  return (
    <div className="space-y-8 lg:py-6">
      <header>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Documentation</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          DIN.ORG REST API
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          The same case-management endpoints the web app calls are available
          to scripts and LLM agents using a personal access token. The token
          authenticates the call as a specific user — your role on each case
          (claimant, respondent, co-claimant, co-respondent, moderator) is
          determined exactly the same way as in the browser. Every call is
          tagged in the audit trail as{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">via API</code>.
        </p>
      </header>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-ink">Authentication</h2>
        <p className="mt-2 text-sm text-slate-600">
          Issue a token from{" "}
          <Link href={"/settings" as Route} className="text-rose-700 underline">
            Settings → Personal access tokens
          </Link>
          . The plain token is shown exactly once — store it in your secret
          manager. The token format is{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">din_pat_&lt;64 hex&gt;</code>.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Send the token as a Bearer header on every request:
        </p>
        <Pre>{`Authorization: Bearer din_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Pre>
        <p className="mt-3 text-xs text-slate-500">
          Tokens carry full account-level permissions. Treat them as you would
          a password. Revoke compromised tokens from the same Settings page.
        </p>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-ink">Base URL &amp; conventions</h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          <li>
            <strong>Production:</strong>{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">https://dinnew4.vercel.app</code>
          </li>
          <li>All requests and responses are JSON unless otherwise noted.</li>
          <li>
            Successful responses return{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{"{ data: ..., error: null }"}</code>
            ; failures return{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{"{ data: null, error: { code, message } }"}</code>{" "}
            with an HTTP status code.
          </li>
          <li>
            Token spends still apply: every action that costs tokens in the UI
            costs the same number of tokens via the API (see{" "}
            <Link href={"/billing" as Route} className="text-rose-700 underline">
              Billing
            </Link>
            ).
          </li>
        </ul>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-ink">Common flows</h2>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          File a new case (claimant)
        </h3>
        <Pre>{`curl -X POST https://dinnew4.vercel.app/api/cases \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "description": "Breach of consulting contract",
    "category": "commercial",
    "priority": "high",
    "claimantName": "Maria Schmidt",
    "claimantEmail": "maria@example.com",
    "respondentName": "Acme GmbH",
    "respondentEmail": "legal@acme.example",
    "claimAmount": 25000,
    "currency": "EUR",
    "saveMode": "file"
  }'`}</Pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          List the cases you can see
        </h3>
        <Pre>{`curl https://dinnew4.vercel.app/api/cases \\
  -H "Authorization: Bearer $DIN_TOKEN"`}</Pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Add evidence
        </h3>
        <Pre>{`# 1. Upload the file (multipart). Returns { url, pathname, fileName, ... }
curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/uploads \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -F "file=@/path/to/contract.pdf" \\
  -F "category=evidence"

# 2. Register the evidence record using the upload result
curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/evidence \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Original contract",
    "type": "contract",
    "description": "Signed contract dated 2024-03-01",
    "attachment": {
      "url": "https://...vercel-storage.com/cases/.../contract.pdf",
      "pathname": "cases/.../contract.pdf",
      "fileName": "contract.pdf",
      "contentType": "application/pdf",
      "size": 184220
    }
  }'`}</Pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Add a witness
        </h3>
        <Pre>{`curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/witnesses \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "relationship": "Former colleague",
    "statement": "I witnessed the signing of the contract on 2024-03-01."
  }'`}</Pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Add a lawyer
        </h3>
        <Pre>{`curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/lawyers \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fullName": "Eva Becker",
    "email": "eva@firm.example",
    "firmName": "Becker & Partner",
    "firmUrl": "https://becker-partner.example"
  }'`}</Pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Review the opposing party's evidence
        </h3>
        <Pre>{`curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/evidence/$EV_ID/review \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "action": "accept" }'

# Or dismiss with reason:
curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/evidence/$EV_ID/review \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "action": "dismiss", "reason": "Document is not authentic" }'

# Or extend the review window (costs tokens):
curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/evidence/$EV_ID/review \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "action": "extend" }'`}</Pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Mark discovery ready (advances to hearing)
        </h3>
        <Pre>{`curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/discovery-ready \\
  -H "Authorization: Bearer $DIN_TOKEN"`}</Pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Propose an additional party (multi-party)
        </h3>
        <Pre>{`curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/parties \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "side": "claimant",
    "fullName": "John Co",
    "email": "john@example.com"
  }'`}</Pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Vote on a proposed additional party
        </h3>
        <Pre>{`curl -X POST https://dinnew4.vercel.app/api/cases/$CASE_ID/parties/$PARTY_ID/vote \\
  -H "Authorization: Bearer $DIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "vote": "approve" }'`}</Pre>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-ink">Permissions &amp; safety</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li>
            <strong>Role checks:</strong> the same access rules apply as in the
            UI. A claimant token cannot review their own evidence; a respondent
            token cannot file the case; a moderator token can run AI workflows
            but cannot add evidence as a party.
          </li>
          <li>
            <strong>KYC gate:</strong> users who haven't passed identity
            verification cannot file a case via the API either — the call is
            saved as a draft until they verify in the browser.
          </li>
          <li>
            <strong>Audit trail:</strong> every API call is recorded as the
            token's owner, with a{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">(via API)</code>{" "}
            suffix on the audit-trail row and{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">authSource: "api"</code>{" "}
            in the activity metadata.
          </li>
          <li>
            <strong>Token management:</strong> the API tokens management
            endpoints themselves cannot be used via an API token — only via a
            real browser session — so a leaked token cannot enumerate or
            create more tokens on the same account.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-md bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}
