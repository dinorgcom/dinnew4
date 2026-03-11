import { ok } from "@/server/api/responses";
import { getPricing } from "@/server/billing/service";

export function GET() {
  return ok(getPricing());
}

