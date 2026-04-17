import { NextResponse } from "next/server";
import { getConsultantVerificationStatus } from "@/server/identity/service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const result = await getConsultantVerificationStatus(token);
  if (!result) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  return NextResponse.json(result);
}
