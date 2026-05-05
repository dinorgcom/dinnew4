import { env } from "@/lib/env";

// DeepL has two API hosts:
//   - api-free.deepl.com  → free tier (key suffix ":fx")
//   - api.deepl.com       → paid tier
// We pick automatically from the key suffix so the same code works for
// both plans without extra configuration.
function deeplBaseUrl() {
  const key = env.DEEPL_API_KEY;
  if (!key) {
    throw new Error("DEEPL_API_KEY is not set");
  }
  return key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

function authHeader() {
  const key = env.DEEPL_API_KEY;
  if (!key) throw new Error("DEEPL_API_KEY is not set");
  return `DeepL-Auth-Key ${key}`;
}

// Map our internal short codes (en, de, fr, ...) to DeepL's expected
// target codes. DeepL distinguishes EN-US/EN-GB and PT-BR/PT-PT but for
// our purposes the generic codes are fine.
function toDeeplTarget(code: string): string {
  const c = code.toLowerCase();
  switch (c) {
    case "en":
      return "EN-US";
    case "pt":
      return "PT-PT";
    case "zh":
      return "ZH";
    default:
      return c.toUpperCase();
  }
}

export type TranslateTextResult = {
  translatedText: string;
  detectedSourceLang: string;
};

export async function translateText(
  text: string,
  targetLang: string,
): Promise<TranslateTextResult> {
  if (!text.trim()) {
    return { translatedText: "", detectedSourceLang: "" };
  }
  const response = await fetch(`${deeplBaseUrl()}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
      target_lang: toDeeplTarget(targetLang),
      preserve_formatting: true,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepL translate failed: ${response.status} ${body}`);
  }
  const data = (await response.json()) as {
    translations: Array<{ detected_source_language: string; text: string }>;
  };
  const first = data.translations?.[0];
  return {
    translatedText: first?.text ?? "",
    detectedSourceLang: first?.detected_source_language ?? "",
  };
}

export type TranslateDocumentResult = {
  translatedBlob: Buffer;
  fileName: string;
  contentType: string;
  billedCharacters: number;
};

// Submit a document to DeepL, poll until done, then download the
// translated file. Synchronous from the caller's POV — typical legal
// document of a few pages takes 10–30s. For 50+ page docs this might
// hit Vercel's function timeout; we'll surface a clear error if so.
export async function translateDocument(args: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  targetLang: string;
}): Promise<TranslateDocumentResult> {
  const base = deeplBaseUrl();
  const target = toDeeplTarget(args.targetLang);

  // 1. Upload — multipart/form-data
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(args.buffer)], { type: args.contentType }),
    args.fileName,
  );
  form.append("target_lang", target);

  const uploadRes = await fetch(`${base}/v2/document`, {
    method: "POST",
    headers: { Authorization: authHeader() },
    body: form,
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => "");
    throw new Error(`DeepL document upload failed: ${uploadRes.status} ${body}`);
  }
  const uploadJson = (await uploadRes.json()) as {
    document_id: string;
    document_key: string;
  };

  // 2. Poll status — DeepL recommends polling every few seconds.
  type StatusJson = { status: string; billed_characters?: number; error_message?: string };
  const POLL_INTERVAL_MS = 2_000;
  const TIMEOUT_MS = 120_000; // 2 min cap
  const start = Date.now();
  let status: StatusJson | null = null;
  while (Date.now() - start < TIMEOUT_MS) {
    const r = await fetch(`${base}/v2/document/${uploadJson.document_id}`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ document_key: uploadJson.document_key }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`DeepL document status failed: ${r.status} ${body}`);
    }
    status = (await r.json()) as StatusJson;
    if (status.status === "done") break;
    if (status.status === "error") {
      throw new Error(`DeepL document translation failed: ${status.error_message || "unknown"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  if (!status || status.status !== "done") {
    throw new Error("DeepL document translation timed out — try again with a smaller file.");
  }

  // 3. Download translated file.
  const downloadRes = await fetch(`${base}/v2/document/${uploadJson.document_id}/result`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ document_key: uploadJson.document_key }),
  });
  if (!downloadRes.ok) {
    const body = await downloadRes.text().catch(() => "");
    throw new Error(`DeepL document download failed: ${downloadRes.status} ${body}`);
  }
  const translatedBuffer = Buffer.from(await downloadRes.arrayBuffer());

  return {
    translatedBlob: translatedBuffer,
    fileName: args.fileName,
    contentType: args.contentType,
    billedCharacters: status.billed_characters ?? 0,
  };
}
