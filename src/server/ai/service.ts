import { generateObject, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { env } from "@/lib/env";

const primaryModel = env.OPENAI_API_KEY ? openai("gpt-4.1-mini") : null;
const fallbackModel = env.ANTHROPIC_API_KEY ? anthropic("claude-3-5-haiku-latest") : null;

export function isAiConfigured() {
  return Boolean(primaryModel || fallbackModel);
}

function getModel() {
  if (primaryModel) {
    return primaryModel;
  }
  if (fallbackModel) {
    return fallbackModel;
  }
  throw new Error("No AI provider configured.");
}

export async function generatePlainText(prompt: string) {
  const result = await generateText({
    model: getModel(),
    prompt,
  });

  return result.text;
}

export async function generateStructuredObject<TSchema extends z.ZodTypeAny>(
  prompt: string,
  schema: TSchema,
) {
  const result = await generateObject({
    model: getModel(),
    prompt,
    schema,
  });

  return result.object;
}
