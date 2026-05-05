import { generateObject, generateText, type CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { env } from "@/lib/env";

const primaryModel = env.OPENAI_API_KEY ? openai("gpt-4.1-mini") : null;

export function isAiConfigured() {
  return Boolean(primaryModel || env.ANTHROPIC_API_KEY);
}

async function resolveAnthropicModelId() {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("No AI provider configured.");
  }
  const response = await fetch("https://api.anthropic.com/v1/models", {
    method: "GET",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Anthropic models.");
  }

  // const payload = (await response.json()) as { data?: Array<{ id?: string }> };
  // const availableIds = (payload.data || [])
  //   .map((item) => item.id)
  //   .filter((id): id is string => typeof id === "string");
  
  // // Log available models for debugging
  // console.log("Available Anthropic models:", availableIds);
  
  const selectedModel = "claude-sonnet-4-20250514"; // Use available Claude 4 model

  if (!selectedModel) {
    throw new Error("No Anthropic models available for this API key.");
  }

  return selectedModel;
}

export async function getModel() {
  if (primaryModel) {
    return primaryModel;
  }
  if (env.ANTHROPIC_API_KEY) {
    const modelId = await resolveAnthropicModelId();
    return anthropic(modelId);
  }

  throw new Error("No AI provider configured.");
}

export async function generatePlainText(prompt: string) {
  const result = await generateText({
    model: await getModel(),
    prompt,
    // Explicitly avoid temperature for Claude 4 compatibility
    temperature: undefined,
  });

  return result.text;
}

export async function generateStructuredObject<TSchema extends z.ZodTypeAny>(
  prompt: string,
  schema: TSchema,
) {
  const model = await getModel();
  const result = await generateObject({
    model,
    prompt,
    schema,
    // Explicitly avoid temperature for Claude 4 compatibility
    temperature: undefined,
  });

  return result.object;
}

// Same as generateStructuredObject but takes a full messages array so the
// caller can include multimodal content (PDFs, images) alongside text.
// Anthropic supports {type: "file", mediaType: "application/pdf", data: ...}
// natively for Claude 3.5+, so no client-side text extraction is needed.
export async function generateStructuredObjectFromMessages<TSchema extends z.ZodTypeAny>(
  messages: CoreMessage[],
  schema: TSchema,
) {
  const model = await getModel();
  const result = await generateObject({
    model,
    messages,
    schema,
    temperature: undefined,
  });

  return result.object;
}

// Plain-text version that accepts multimodal messages — used for steps
// like "extract verbatim text from this PDF" where we don't want to also
// constrain Claude to a JSON schema. PDF + structured-output in one call
// is flaky; doing extraction in plain text first and then a text-only
// schema'd call is much more reliable.
export async function generatePlainTextFromMessages(messages: CoreMessage[]) {
  const model = await getModel();
  const result = await generateText({
    model,
    messages,
    temperature: undefined,
  });
  return result.text;
}
