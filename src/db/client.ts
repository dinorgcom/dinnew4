import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

if (!env.DATABASE_URL) {
  console.warn("DATABASE_URL is not configured. Database calls will fail until it is set.");
}

const sql = neon(env.DATABASE_URL ?? "postgres://placeholder");

export const db = drizzle(sql, { schema });
