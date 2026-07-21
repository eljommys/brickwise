import { NextResponse } from "next/server";
import { gymsNear } from "@/lib/gyms";
import { listFavorites } from "@/lib/store";

/** All gyms within 2 km of every located favorite, deduplicated. */
export async function GET() {
  try {
    const favorites = listFavorites().filter((f) => f.lat != null && f.lon != null);
    const seen = new Map<string, { name: string; lat: number; lon: number }>();
    let failed = 0;
    for (const f of favorites) {
      const gyms = await gymsNear(f.lat!, f.lon!);
      if (gyms == null) {
        failed++;
        continue;
      }
      for (const g of gyms) {
        const key = `${g.lat.toFixed(5)},${g.lon.toFixed(5)}`;
        if (!seen.has(key)) seen.set(key, { name: g.name, lat: g.lat, lon: g.lon });
      }
    }
    return NextResponse.json({
      gyms: [...seen.values()],
      favoritesQueried: favorites.length,
      failed,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
