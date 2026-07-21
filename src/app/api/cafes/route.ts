import { NextResponse } from "next/server";
import { poisNear } from "@/lib/pois";
import { listFavorites } from "@/lib/store";

/** All cafés within 2 km of every located favorite, deduplicated. */
export async function GET() {
  try {
    const favorites = listFavorites().filter((f) => f.lat != null && f.lon != null);
    // Query once per ~100 m cell — nearby favorites share the same cached result.
    const cells = new Map<string, { lat: number; lon: number }>();
    for (const f of favorites) {
      const key = `${f.lat!.toFixed(3)},${f.lon!.toFixed(3)}`;
      if (!cells.has(key)) cells.set(key, { lat: f.lat!, lon: f.lon! });
    }
    const seen = new Map<string, { name: string; lat: number; lon: number }>();
    let failed = 0;
    const deadline = Date.now() + 45000; // never hang the request
    for (const f of cells.values()) {
      if (Date.now() > deadline) break;
      const cafes = await poisNear(f.lat, f.lon, "cafe");
      if (cafes == null) {
        failed++;
        continue;
      }
      for (const c of cafes) {
        const key = `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;
        if (!seen.has(key)) seen.set(key, { name: c.name, lat: c.lat, lon: c.lon });
      }
    }
    return NextResponse.json({ cafes: [...seen.values()], favoritesQueried: cells.size, failed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
