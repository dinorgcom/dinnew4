import { z } from "zod";
import { randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { fail, ok } from "@/server/api/responses";
import { ensureAppUser, hashApiToken } from "@/server/auth/provision";
import { getDb } from "@/db/client";
import { serviceTokens } from "@/db/schema";

const createSchema = z.object({
  label: z.string().trim().min(1).max(64),
});

function generatePlainToken() {
  // 32 random bytes = 64 hex chars; total token shape: din_pat_<64 hex>
  return `din_pat_${randomBytes(32).toString("hex")}`;
}

export async function GET() {
  const user = await ensureAppUser();
  if (!user?.id) return fail("UNAUTHORIZED", "Not signed in", 401);

  // Reading the tokens list itself via an API token would let a leaked
  // token enumerate other tokens on the same account, so we only allow
  // listing from a real browser session.
  if (user.authSource === "api") {
    return fail("FORBIDDEN", "API tokens cannot be managed via the API", 403);
  }

  const db = getDb();
  const rows = await db
    .select({
      id: serviceTokens.id,
      label: serviceTokens.label,
      tokenPrefix: serviceTokens.tokenPrefix,
      lastUsedAt: serviceTokens.lastUsedAt,
      revokedAt: serviceTokens.revokedAt,
      createdAt: serviceTokens.createdAt,
    })
    .from(serviceTokens)
    .where(and(eq(serviceTokens.userId, user.id), isNull(serviceTokens.revokedAt)))
    .orderBy(desc(serviceTokens.createdAt));

  return ok({ tokens: rows });
}

export async function POST(request: Request) {
  const user = await ensureAppUser();
  if (!user?.id) return fail("UNAUTHORIZED", "Not signed in", 401);
  if (user.authSource === "api") {
    return fail("FORBIDDEN", "API tokens cannot be created via the API", 403);
  }

  try {
    const body = createSchema.parse(await request.json());
    const plain = generatePlainToken();
    const tokenHash = hashApiToken(plain);
    const tokenPrefix = plain.slice(0, 16); // "din_pat_" + 8 hex chars

    const db = getDb();
    const inserted = await db
      .insert(serviceTokens)
      .values({
        userId: user.id,
        label: body.label,
        tokenHash,
        tokenPrefix,
      })
      .returning({
        id: serviceTokens.id,
        label: serviceTokens.label,
        tokenPrefix: serviceTokens.tokenPrefix,
        createdAt: serviceTokens.createdAt,
      });

    // The plain token is returned exactly once, here. We never persist it
    // and there is no way for the user to see it again — they have to
    // create a new token if they lose it.
    return ok(
      {
        token: inserted[0],
        plainToken: plain,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create token";
    return fail("TOKEN_CREATE_FAILED", message, 400);
  }
}
