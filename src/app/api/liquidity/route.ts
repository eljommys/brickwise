import { NextRequest, NextResponse } from "next/server";
import { annualLiquidityByTower, listFavorites } from "@/lib/store";

/**
 * Liquidity of each located favorite's tower = average annual DLD transactions of
 * `kind` (via ?kind=buy|rent, defaults to rent). Feeds the heatmap: each favorite
 * is a weighted point, so nearby towers blend into a "how active is this pocket"
 * surface for that market (rentals vs sales). Weight unit is transactions/year.
 */
export async function GET(req: NextRequest) {
  try {
    const kindParam = req.nextUrl.searchParams.get("kind");
    const kind: "buy" | "rent" = kindParam === "buy" ? "buy" : "rent";
    const rates = annualLiquidityByTower(kind);

    const points = listFavorites()
      .filter((f) => f.lat != null && f.lon != null)
      .map((f) => ({
        id: f.id,
        lat: f.lat as number,
        lon: f.lon as number,
        weight: f.tower_slug ? rates.get(f.tower_slug) ?? 0 : 0,
      }));

    const max = points.reduce((m, p) => Math.max(m, p.weight), 0);
    return NextResponse.json({ points, max, kind, unit: "year" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
