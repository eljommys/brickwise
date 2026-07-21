import { NextResponse } from "next/server";
import { listAnalyzed } from "@/lib/store";

export async function GET() {
  try {
    const rows = listAnalyzed().map((r) => ({
      ...r,
      images: JSON.parse(r.images_json),
      amenities: JSON.parse(r.amenities_json),
    }));
    return NextResponse.json({ results: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
