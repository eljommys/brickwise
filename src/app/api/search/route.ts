import { NextRequest, NextResponse } from "next/server";
import { scrapeSearch } from "@/lib/pf/search";
import { getAnalysis, upsertListing } from "@/lib/store";
import { dedupeListings } from "@/lib/dedupe";
import { SearchFilters } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const filters = (await req.json()) as SearchFilters;
    const { properties, totalCount } = await scrapeSearch(filters);
    const rows = properties.map((p) => upsertListing(p));
    // Collapse the same physical unit listed by several agents.
    const { unique, removed } = dedupeListings(rows);
    const results = unique.map((row) => ({
      ...row,
      images: JSON.parse(row.images_json),
      amenities: JSON.parse(row.amenities_json),
      // Cached analysis only — nothing is scraped here; the user analyzes on demand.
      analysis: getAnalysis(row.id),
    }));
    return NextResponse.json({ totalCount, count: results.length, duplicatesRemoved: removed, results });
  } catch (e) {
    console.error("search failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
