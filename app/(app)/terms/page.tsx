import { ensureAppUser } from "@/server/auth/provision";

const TERMS_VERSION = "v1.0";
const TERMS_LAST_UPDATED = "February 2026";

const TERMS_SECTIONS = [
  {
    title: "1. Introduction",
    body: 'Welcome to DIN.ORG International AI Court ("Platform", "we", "us", or "our"). These terms govern usage of our AI arbitration platform. Agreement is required upon access.',
  },
  {
    title: "2. Eligibility and Geographic Restrictions",
    body: 'Users must be 18 years or older, have legal capacity for contracts, and cannot be located in Israel. Parties located in Israel (claimants or respondents) are NOT eligible to use the Platform.',
  },
  {
    title: "3. Platform Services",
    body: "The platform offers AI case evaluation, document management, case tools, communication channels, arbitrator assignment, and AI-generated suggestions.",
  },
  {
    title: "4. Arbitration Agreement",
    body: "Filing a case means accepting binding arbitration, waiving court litigation rights, and treating arbitrator decisions as final and binding.",
  },
  {
    title: "5. Token System and Payments",
    body: "All token purchases are final and non-refundable. Tokens enable platform actions, with pricing shown before purchase. Stripe handles payments.",
  },
  {
    title: "6. User Responsibilities",
    body: "Users must provide truthful information, maintain credential confidentiality, submit authentic evidence, respect deadlines, and not misuse or attempt to manipulate the Platform or AI systems.",
  },
  {
    title: "7. AI Technology Disclaimer",
    body: "AI-generated suggestions are advisory and not legally binding. Human arbitrators make final decisions.",
  },
  {
    title: "8. Confidentiality and Privacy",
    body: "All case information is stored securely with bank-level encryption. Access is restricted to authorized parties.",
  },
  {
    title: "9. Intellectual Property",
    body: "DIN.ORG owns all platform content and features under international IP laws.",
  },
  {
    title: "10. Limitation of Liability",
    body: "Our liability is limited to the amount paid by you in the past 12 months. We disclaim warranties and liability for arbitrator decisions.",
  },
  {
    title: "11. Termination",
    body: "Accounts may be suspended for violations, false information, abuse, or being located in Israel.",
  },
  {
    title: "12. Governing Law and Jurisdiction",
    body: "These terms are governed by Israeli law and international arbitration principles.",
  },
  {
    title: "13. Changes to Terms",
    body: "Material changes require email or in-app notification; continued use signals acceptance.",
  },
  {
    title: "14. Contact Information",
    body: "legal@din.org · www.din.org",
  },
];

// Placeholder acceptance log. Real ledger to be wired later.
const PLACEHOLDER_ACCEPTANCES: Array<{
  name: string;
  email: string;
  role: string;
  version: string;
  acceptedAt: string;
}> = [
  { name: "Raphael Spannocchi", email: "rs@dubidu.io", role: "Claimant", version: "v1.0", acceptedAt: "2026-04-18 09:42 UTC" },
  { name: "Michael Marcovici", email: "mike@wave.cc", role: "Respondent", version: "v1.0", acceptedAt: "2026-04-22 14:08 UTC" },
  { name: "Viktor Hale", email: "lawyer@din.org", role: "Lawyer (Claimant)", version: "v1.0", acceptedAt: "2026-04-20 11:15 UTC" },
  { name: "Anna Lieber", email: "lawyer2@din.org", role: "Lawyer (Respondent)", version: "v1.0", acceptedAt: "2026-04-23 16:51 UTC" },
];

export default async function TermsPage() {
  const appUser = await ensureAppUser();
  const acceptances = [...PLACEHOLDER_ACCEPTANCES];
  if (appUser?.email) {
    acceptances.unshift({
      name: appUser.fullName || appUser.email,
      email: appUser.email,
      role: "You",
      version: TERMS_VERSION,
      acceptedAt: "2026-04-25 10:00 UTC",
    });
  }

  return (
    <div className="space-y-8 lg:py-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
          DIN.ORG · {TERMS_VERSION} · Last updated {TERMS_LAST_UPDATED}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          Terms &amp; conditions
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          The following terms govern use of the DIN.ORG International AI Court platform. By
          continuing to use the platform you accept these terms.
        </p>
      </div>

      <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6">
        {TERMS_SECTIONS.map((section) => (
          <article key={section.title}>
            <h2 className="text-base font-semibold text-ink">{section.title}</h2>
            <p className="mt-1.5 text-sm leading-7 text-slate-700">{section.body}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Acceptance log</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            Participants and the terms they accepted
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Each participant in the process below has accepted these terms. Versions and
            timestamps are recorded for audit purposes.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Participant</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">Accepted at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {acceptances.map((entry) => (
                <tr key={`${entry.email}-${entry.role}`}>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-900">{entry.name}</div>
                    <div className="text-xs text-slate-500">{entry.email}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{entry.role}</td>
                  <td className="px-3 py-3 text-slate-700">{entry.version}</td>
                  <td className="px-3 py-3 text-slate-700">{entry.acceptedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Sample data — when the per-case terms-acceptance ledger ships, this table will pull
          from the live record.
        </p>
      </section>
    </div>
  );
}
