import { generateObject, generateText } from "ai";
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
  const result = await generateObject({
    model: await getModel(),
    prompt,
    schema,
    // Explicitly avoid temperature for Claude 4 compatibility
    temperature: undefined,
  });

  return result.object;
}
