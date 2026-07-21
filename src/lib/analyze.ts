import { scrapeListing } from "./pf/listing";
import { getTransactions, syncTransactions } from "./pf/transactions";
import { computeYield, similarToTxRows } from "./yield";
import { nearestGym } from "./gyms";
import { getAnalysis, getListing, saveAnalysis, upsertListing } from "./store";
import { AnalysisRow, ListingRow } from "./types";

const ANALYSIS_TTL_MS = 24 * 3600 * 1000;

export interface AnalyzeResult {
  listing: ListingRow;
  analysis: AnalysisRow;
}

/**
 * Full analysis of one listing: detail scrape (for photos/description/fallback
 * transactions), tower transaction history, yield computation and gym distance.
 */
export async function analyzeListing(id: string, url?: string, force = false): Promise<AnalyzeResult> {
  let listing = getListing(id);
  const cached = getAnalysis(id);
  if (!force && listing && cached && Date.now() - Date.parse(cached.computed_at) < ANALYSIS_TTL_MS) {
    return { listing, analysis: cached };
  }

  const listingUrl = url || listing?.url;
  if (!listingUrl) throw new Error(`Unknown listing ${id} and no URL provided`);

  const detail = await scrapeListing(listingUrl);
  listing = upsertListing(detail.property, detail.citySlug);

  let buy = similarToTxRows(detail.property.similar_price_transactions?.buy || [], "buy");
  let rent = similarToTxRows(detail.property.similar_price_transactions?.rent || [], "rent");

  if (listing.tower_slug) {
    await syncTransactions(detail.citySlug, listing.tower_slug);
    const fullBuy = getTransactions(listing.tower_slug, "buy");
    const fullRent = getTransactions(listing.tower_slug, "rent");
    if (fullBuy.length) buy = fullBuy;
    if (fullRent.length) rent = fullRent;
  }

  const yieldRes = computeYield(listing.price, listing.size_sqft, listing.bedrooms, buy, rent);
  const gym =
    listing.lat != null && listing.lon != null
      ? await nearestGym(listing.lat, listing.lon)
      : { gym_name: null, distance_m: null };

  saveAnalysis(listing.id, yieldRes, gym);
  return { listing, analysis: getAnalysis(listing.id)! };
}
