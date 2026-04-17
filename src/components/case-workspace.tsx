"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";

type FileReference = {
  url: string;
  pathname: string;
  fileName: string;
  contentType?: string | null;
  size?: number | null;
};

type RecordSummary = {
  id: string;
  title?: string | null;
  fullName?: string | null;
  createdAt: string | Date;
  description?: string | null;
  type?: string | null;
  status?: string | null;
  content?: string | null;
  senderName?: string | null;
  fileName?: string | null;
  statementFilePathname?: string | null;
  reportFilePathname?: string | null;
  attachmentName?: string | null;
  filePathname?: string | null;
  attachmentPathname?: string | null;
  fileReferences?: Record<string, unknown>[] | null;
  submittedBy?: string | null;
  invitationTokenExpiresAt?: string | Date | null;
  kycVerificationId?: string | null;
  kycStatus?: string | null;
};

type CaseWorkspaceProps = {
  caseId: string;
  roleLabel: string;
  canContribute: boolean;
  evidence: RecordSummary[];
  witnesses: RecordSummary[];
  consultants: RecordSummary[];
  expertiseRequests: RecordSummary[];
  messages: RecordSummary[];
  initialSection?: (typeof sections)[number]["key"];
  hideSectionNav?: boolean;
};

const sections = [
  { key: "evidence", label: "Evidence" },
  { key: "witnesses", label: "Witnesses" },
  { key: "consultants", label: "Consultants" },
  { key: "expertise", label: "Expertise" },
  { key: "messages", label: "Messages" },
] as const;

async function uploadCaseFile(caseId: string, category: string, file: File) {
  const formData = new FormData();
  formData.append("category", category);
  formData.append("file", file);

  const response = await fetch(`/api/cases/${caseId}/uploads`, {
    method: "POST",
    body: formData,
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Upload failed.");
  }

  return result.data as FileReference;
}

function fileLink(entity: "evidence" | "witnesses" | "consultants" | "messages", recordId: string) {
  return `/api/files/${entity}/${recordId}` as Route;
}

function expertiseLink(recordId: string, index: number) {
  return `/api/files/expertise/${recordId}?index=${index}` as Route;
}

export function CaseWorkspace(props: CaseWorkspaceProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<(typeof sections)[number]["key"]>(
    props.initialSection || "evidence",
  );
  const [error, setError] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const evidenceFileRef = useRef<HTMLInputElement | null>(null);
  const witnessFileRef = useRef<HTMLInputElement | null>(null);
  const consultantFileRef = useRef<HTMLInputElement | null>(null);
  const expertiseFileRef = useRef<HTMLInputElement | null>(null);
  const messageFileRef = useRef<HTMLInputElement | null>(null);
  const [forms, setForms] = useState({
    evidence: { title: "", description: "", type: "document", notes: "", attachment: null as FileReference | null },
    witness: {
      fullName: "",
      email: "",
      phone: "",
      relationship: "",
      statement: "",
      notes: "",
      attachment: null as FileReference | null,
    },
    consultant: {
      fullName: "",
      email: "",
      phone: "",
      company: "",
      expertise: "",
      role: "",
      report: "",
      notes: "",
      attachment: null as FileReference | null,
    },
    expertise: { title: "", description: "", attachments: [] as FileReference[] },
    message: { content: "", attachment: null as FileReference | null },
  });

  async function submit(path: string, body: unknown) {
    setError(null);

    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();

    if (!response.ok) {
      setError(result.error?.message || "Request failed.");
      return false;
    }

    router.refresh();
    return true;
  }

  async function remove(path: string) {
    setError(null);
    const response = await fetch(path, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message || "Delete failed.");
      return;
    }
    router.refresh();
  }

  async function handleUpload(category: string, file: File, onDone: (fileRef: FileReference) => void) {
    try {
      setError(null);
      setUploadingKey(category);
      const uploaded = await uploadCaseFile(props.caseId, category, file);
      onDone(uploaded);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploadingKey(null);
    }
  }

  function attachmentBadge(file: FileReference | null) {
    if (!file) {
      return null;
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        Attached: {file.fileName}
      </div>
    );
  }

  function renderFiles(record: RecordSummary, kind: "evidence" | "witnesses" | "consultants" | "expertise" | "messages") {
    if (kind === "expertise" && record.fileReferences?.length) {
      return (
        <div className="mt-3 flex flex-wrap gap-2">
          {record.fileReferences.map((file, index) => {
            const pathname = typeof file.pathname === "string" ? file.pathname : `${record.id}-${index}`;
            const fileName = typeof file.fileName === "string" ? file.fileName : `Attachment ${index + 1}`;

            return (
            <Link
              key={`${record.id}-${pathname}-${index}`}
              href={expertiseLink(record.id, index)}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400"
            >
              {fileName}
            </Link>
            );
          })}
        </div>
      );
    }

    const hasFile =
      (kind === "evidence" && record.filePathname) ||
      (kind === "witnesses" && record.statementFilePathname) ||
      (kind === "consultants" && record.reportFilePathname) ||
      (kind === "messages" && record.attachmentPathname);

    if (!hasFile) {
      return null;
    }

    const label =
      record.fileName || record.attachmentName || "Open attachment";

    return (
      <div className="mt-3">
        <Link
          href={fileLink(kind === "messages" ? "messages" : kind, record.id)}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400"
        >
          {label}
        </Link>
      </div>
    );
  }

  function getVerificationBadge(record: RecordSummary) {
    if (record.kycStatus === "verified" || record.status === "accepted") {
      return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Verified</span>;
    }
    if (record.invitationTokenExpiresAt) {
      const expiry = new Date(record.invitationTokenExpiresAt);
      if (expiry < new Date()) {
        return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Link expired</span>;
      }
    }
    return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pending</span>;
  }

  function handleResend(kind: "witnesses" | "consultants", recordId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/cases/${props.caseId}/${kind}/${recordId}/resend`, { method: "POST" });
      if (response.ok) {
        router.refresh();
      }
    });
  }

  function renderList(records: RecordSummary[], kind: "evidence" | "witnesses" | "consultants" | "expertise" | "messages") {
    if (records.length === 0) {
      return <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No records yet.</div>;
    }

    const showVerification = kind === "witnesses" || kind === "consultants";

    return (
      <div className="space-y-3">
        {records.map((record) => (
          <div key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    {record.title || record.fullName || record.senderName || "Record"}
                  </span>
                  {showVerification ? getVerificationBadge(record) : null}
                </div>
                <div className="text-sm text-slate-600">
                  {record.description || record.content || record.type || record.status || "No details"}
                </div>
                {kind === "evidence" && record.submittedBy ? (
                  <div className="text-xs uppercase tracking-[0.15em] text-slate-400">
                    Submitted by {record.submittedBy}
                  </div>
                ) : null}
                {renderFiles(record, kind)}
              </div>
              <div className="flex items-center gap-2">
                {showVerification && props.canContribute && record.kycStatus !== "verified" && record.status !== "accepted" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleResend(kind, record.id)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
                  >
                    Resend
                  </button>
                ) : null}
                {kind !== "messages" ? (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(() =>
                        remove(
                          `/api/cases/${props.caseId}/${kind === "expertise" ? "expertise" : kind}/${record.id}`,
                        ),
                      )
                    }
                    className="text-sm font-medium text-rose-600 hover:text-rose-700"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Case records</h2>
        </div>
      </div>

      {!props.hideSectionNav ? (
        <div className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveSection(section.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeSection === section.key
                  ? "bg-ink text-white"
                  : "border border-slate-300 text-slate-700 hover:border-slate-400"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {activeSection === "evidence" ? (
        <div className="space-y-5">
          {props.canContribute ? (
            <form
              className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const success = await submit(`/api/cases/${props.caseId}/evidence`, forms.evidence);
                  if (success) {
                    setForms((current) => ({
                      ...current,
                      evidence: { title: "", description: "", type: "document", notes: "", attachment: null },
                    }));
                  }
                });
              }}
            >
              <input
                value={forms.evidence.title}
                onChange={(event) =>
                  setForms((current) => ({
                    ...current,
                    evidence: { ...current.evidence, title: event.target.value },
                  }))
                }
                placeholder="Evidence title"
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              />
              <select
                value={forms.evidence.type}
                onChange={(event) =>
                  setForms((current) => ({
                    ...current,
                    evidence: { ...current.evidence, type: event.target.value },
                  }))
                }
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              >
                {["document", "contract", "correspondence", "photo", "video", "audio", "financial_record", "expert_report", "other"].map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <textarea
                value={forms.evidence.description}
                onChange={(event) =>
                  setForms((current) => ({
                    ...current,
                    evidence: { ...current.evidence, description: event.target.value },
                  }))
                }
                placeholder="Description"
                rows={3}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm md:col-span-2"
              />
              {attachmentBadge(forms.evidence.attachment)}
              <div className="md:col-span-2">
                <input ref={evidenceFileRef} type="file" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void handleUpload("evidence", file, (attachment) =>
                    setForms((current) => ({
                      ...current,
                      evidence: { ...current.evidence, attachment },
                    })),
                  );
                }} />
                <button
                  type="button"
                  onClick={() => evidenceFileRef.current?.click()}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                >
                  {uploadingKey === "evidence" ? "Uploading..." : "Attach file"}
                </button>
              </div>
              <button
                type="submit"
                disabled={isPending || uploadingKey === "evidence"}
                className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 md:col-span-2"
              >
                Add evidence
              </button>
            </form>
          ) : null}
          {renderList(props.evidence, "evidence")}
        </div>
      ) : null}

      {activeSection === "witnesses" ? (
        <div className="space-y-5">
          {props.canContribute ? (
            <form
              className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const success = await submit(`/api/cases/${props.caseId}/witnesses`, forms.witness);
                  if (success) {
                    setForms((current) => ({
                      ...current,
                      witness: { fullName: "", email: "", phone: "", relationship: "", statement: "", notes: "", attachment: null },
                    }));
                  }
                });
              }}
            >
              {["fullName", "email", "phone", "relationship"].map((key) => (
                <input
                  key={key}
                  value={forms.witness[key as "fullName" | "email" | "phone" | "relationship"]}
                  onChange={(event) =>
                    setForms((current) => ({
                      ...current,
                      witness: { ...current.witness, [key]: event.target.value },
                    }))
                  }
                  placeholder={key === "email" ? "email (required)" : key}
                  required={key === "fullName" || key === "email"}
                  type={key === "email" ? "email" : "text"}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                />
              ))}
              <textarea
                value={forms.witness.statement}
                onChange={(event) =>
                  setForms((current) => ({
                    ...current,
                    witness: { ...current.witness, statement: event.target.value },
                  }))
                }
                placeholder="Statement"
                rows={3}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm md:col-span-2"
              />
              {attachmentBadge(forms.witness.attachment)}
              <div className="md:col-span-2">
                <input ref={witnessFileRef} type="file" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void handleUpload("witnesses", file, (attachment) =>
                    setForms((current) => ({
                      ...current,
                      witness: { ...current.witness, attachment },
                    })),
                  );
                }} />
                <button
                  type="button"
                  onClick={() => witnessFileRef.current?.click()}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                >
                  {uploadingKey === "witnesses" ? "Uploading..." : "Attach statement file"}
                </button>
              </div>
              <button type="submit" disabled={isPending || uploadingKey === "witnesses"} className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 md:col-span-2">
                Add witness
              </button>
            </form>
          ) : null}
          {renderList(props.witnesses, "witnesses")}
        </div>
      ) : null}

      {activeSection === "consultants" ? (
        <div className="space-y-5">
          {props.canContribute ? (
            <form
              className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const success = await submit(`/api/cases/${props.caseId}/consultants`, forms.consultant);
                  if (success) {
                    setForms((current) => ({
                      ...current,
                      consultant: {
                        fullName: "",
                        email: "",
                        phone: "",
                        company: "",
                        expertise: "",
                        role: "",
                        report: "",
                        notes: "",
                        attachment: null,
                      },
                    }));
                  }
                });
              }}
            >
              {["fullName", "email", "phone", "company", "expertise", "role"].map((key) => (
                <input
                  key={key}
                  value={forms.consultant[key as "fullName" | "email" | "phone" | "company" | "expertise" | "role"]}
                  onChange={(event) =>
                    setForms((current) => ({
                      ...current,
                      consultant: { ...current.consultant, [key]: event.target.value },
                    }))
                  }
                  placeholder={key === "email" ? "email (required)" : key}
                  required={key === "fullName" || key === "email"}
                  type={key === "email" ? "email" : "text"}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                />
              ))}
              <textarea
                value={forms.consultant.report}
                onChange={(event) =>
                  setForms((current) => ({
                    ...current,
                    consultant: { ...current.consultant, report: event.target.value },
                  }))
                }
                placeholder="Report summary"
                rows={3}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm md:col-span-2"
              />
              {attachmentBadge(forms.consultant.attachment)}
              <div className="md:col-span-2">
                <input ref={consultantFileRef} type="file" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void handleUpload("consultants", file, (attachment) =>
                    setForms((current) => ({
                      ...current,
                      consultant: { ...current.consultant, attachment },
                    })),
                  );
                }} />
                <button
                  type="button"
                  onClick={() => consultantFileRef.current?.click()}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                >
                  {uploadingKey === "consultants" ? "Uploading..." : "Attach report file"}
                </button>
              </div>
              <button type="submit" disabled={isPending || uploadingKey === "consultants"} className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 md:col-span-2">
                Add consultant
              </button>
            </form>
          ) : null}
          {renderList(props.consultants, "consultants")}
        </div>
      ) : null}

      {activeSection === "expertise" ? (
        <div className="space-y-5">
          {props.canContribute ? (
            <form
              className="grid gap-3 rounded-2xl bg-slate-50 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const success = await submit(`/api/cases/${props.caseId}/expertise`, forms.expertise);
                  if (success) {
                    setForms((current) => ({
                      ...current,
                      expertise: { title: "", description: "", attachments: [] },
                    }));
                  }
                });
              }}
            >
              <input
                value={forms.expertise.title}
                onChange={(event) =>
                  setForms((current) => ({
                    ...current,
                    expertise: { ...current.expertise, title: event.target.value },
                  }))
                }
                placeholder="Expertise title"
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              />
              <textarea
                value={forms.expertise.description}
                onChange={(event) =>
                  setForms((current) => ({
                    ...current,
                    expertise: { ...current.expertise, description: event.target.value },
                  }))
                }
                placeholder="What analysis is needed?"
                rows={4}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              />
              {forms.expertise.attachments.length ? (
                <div className="flex flex-wrap gap-2">
                  {forms.expertise.attachments.map((file) => (
                    <div key={file.pathname} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                      {file.fileName}
                    </div>
                  ))}
                </div>
              ) : null}
              <div>
                <input ref={expertiseFileRef} type="file" multiple className="hidden" onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  if (!files.length) return;
                  void (async () => {
                    for (const file of files) {
                      await handleUpload("expertise", file, (attachment) =>
                        setForms((current) => ({
                          ...current,
                          expertise: {
                            ...current.expertise,
                            attachments: [...current.expertise.attachments, attachment],
                          },
                        })),
                      );
                    }
                  })();
                }} />
                <button
                  type="button"
                  onClick={() => expertiseFileRef.current?.click()}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                >
                  {uploadingKey === "expertise" ? "Uploading..." : "Attach supporting files"}
                </button>
              </div>
              <button type="submit" disabled={isPending || uploadingKey === "expertise"} className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                Add expertise request
              </button>
            </form>
          ) : null}
          {renderList(props.expertiseRequests, "expertise")}
        </div>
      ) : null}

      {activeSection === "messages" ? (
        <div className="space-y-5">
          <form
            className="grid gap-3 rounded-2xl bg-slate-50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const success = await submit(`/api/cases/${props.caseId}/messages`, forms.message);
                if (success) {
                  setForms((current) => ({
                    ...current,
                    message: { content: "", attachment: null },
                  }));
                }
              });
            }}
          >
            <textarea
              value={forms.message.content}
              onChange={(event) =>
                setForms((current) => ({
                  ...current,
                  message: { ...current.message, content: event.target.value },
                }))
              }
              placeholder={`Send a message as ${props.roleLabel}`}
              rows={3}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            />
            {attachmentBadge(forms.message.attachment)}
            <div>
              <input ref={messageFileRef} type="file" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void handleUpload("messages", file, (attachment) =>
                  setForms((current) => ({
                    ...current,
                    message: { ...current.message, attachment },
                  })),
                );
              }} />
              <button
                type="button"
                onClick={() => messageFileRef.current?.click()}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
              >
                {uploadingKey === "messages" ? "Uploading..." : "Attach file"}
              </button>
            </div>
            <button type="submit" disabled={isPending || uploadingKey === "messages"} className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
              Send message
            </button>
          </form>
          {renderList(props.messages, "messages")}
        </div>
      ) : null}
    </section>
  );
}
