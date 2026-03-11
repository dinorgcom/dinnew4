import { processStripeWebhook } from "@/server/billing/service";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    const body = await request.text();
    const result = await processStripeWebhook(body, signature);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    return Response.json({ error: message }, { status: 400 });
  }
}

