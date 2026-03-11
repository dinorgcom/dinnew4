import { env } from "@/lib/env";

export function isDatabaseConfigured() {
  return Boolean(env.DATABASE_URL);
}
