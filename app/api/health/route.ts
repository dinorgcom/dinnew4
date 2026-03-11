import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    data: {
      status: "ok",
      service: "din-org-greenfield",
      timestamp: new Date().toISOString(),
    },
  });
}
