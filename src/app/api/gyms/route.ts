import { NextResponse } from "next/server";
import { poisForPoints } from "@/lib/pois";
import { listFavorites } from "@/lib/store";

/** All gyms near any located favorite, in a single Overpass query. */
export async function GET() {
  try {
    const points = listFavorites()
      .filter((f) => f.lat != null && f.lon != null)
      .map((f) => ({ lat: f.lat!, lon: f.lon! }));
    const { pois, failed } = await poisForPoints(points, "gym");
    return NextResponse.json({ gyms: pois, favoritesQueried: points.length, failed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
