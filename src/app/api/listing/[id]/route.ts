import { NextRequest, NextResponse } from "next/server";
import { analyzeListing } from "@/lib/analyze";
import { getTransactions } from "@/lib/pf/transactions";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = req.nextUrl.searchParams.get("url") || undefined;
  const force = req.nextUrl.searchParams.get("force") === "1";
  const withTx = req.nextUrl.searchParams.get("tx") === "1";
  try {
    const { listing, analysis } = await analyzeListing(id, url, force);
    return NextResponse.json({
      listing: {
        ...listing,
        images: JSON.parse(listing.images_json),
        amenities: JSON.parse(listing.amenities_json),
      },
      analysis,
      transactions:
        withTx && listing.tower_slug
          ? {
              buy: getTransactions(listing.tower_slug, "buy"),
              rent: getTransactions(listing.tower_slug, "rent"),
            }
          : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
