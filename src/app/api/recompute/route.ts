import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getTransactions } from "@/lib/pf/transactions";
import { computeYield } from "@/lib/yield";
import { getAnalysis, saveAnalysis } from "@/lib/store";
import { ListingRow } from "@/lib/types";

/** Recompute every stored analysis from the cached transactions (no scraping). */
export async function POST() {
  try {
    const db = getDb();
    const listings = db
      .prepare(`SELECT l.* FROM listings l JOIN analyses a ON a.listing_id = l.id`)
      .all() as ListingRow[];
    let updated = 0;
    for (const l of listings) {
      const buy = l.tower_slug ? getTransactions(l.tower_slug, "buy") : [];
      const rent = l.tower_slug ? getTransactions(l.tower_slug, "rent") : [];
      const y = computeYield(l.price, l.size_sqft, l.bedrooms, buy, rent);
      const prev = getAnalysis(l.id);
      saveAnalysis(l.id, y, { gym_name: prev?.gym_name ?? null, distance_m: prev?.gym_distance_m ?? null });
      updated++;
    }
    return NextResponse.json({ updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
