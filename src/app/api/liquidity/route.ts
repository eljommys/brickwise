import { NextResponse } from "next/server";
import { listFavorites, txCountByTowerSince } from "@/lib/store";

const MONTHS = 12;

/**
 * Liquidity of each located favorite's tower = DLD transactions (buy + rent)
 * registered in the last 12 months. Feeds the heatmap: each favorite is a
 * weighted point, so nearby towers blend into a "how active is this pocket" surface.
 */
export async function GET() {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - MONTHS);
    const sinceISO = since.toISOString().slice(0, 10);
    const counts = txCountByTowerSince(sinceISO);

    const points = listFavorites()
      .filter((f) => f.lat != null && f.lon != null)
      .map((f) => ({
        id: f.id,
        lat: f.lat as number,
        lon: f.lon as number,
        weight: f.tower_slug ? counts.get(f.tower_slug) ?? 0 : 0,
      }));

    const max = points.reduce((m, p) => Math.max(m, p.weight), 0);
    return NextResponse.json({ points, max, months: MONTHS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
