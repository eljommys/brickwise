import { NextRequest, NextResponse } from "next/server";
import { searchLocations } from "@/lib/pf/locations";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (q.trim().length < 2) return NextResponse.json({ locations: [] });
  try {
    const locations = await searchLocations(q);
    return NextResponse.json({ locations });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
