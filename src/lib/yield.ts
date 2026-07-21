import { TxRow } from "./pf/transactions";
import { SimilarTransaction, YieldResult } from "./types";

const WINDOW_MS = 24 * 30.44 * 24 * 3600 * 1000; // ~24 months
const MIN_SAMPLES = 3;
const SIZE_TOLERANCE = 0.2;

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

const median = (xs: number[]) => percentile(xs, 0.5);

/**
 * Comparable units: SIMILAR SIZE (±20%) is the primary criterion, refined by same
 * bedroom count when that still leaves a usable sample. Bedrooms-only is a last
 * resort for listings with no size. Never falls back to "every transaction in the
 * building" — mixing unit types is what produces bogus yields.
 */
function pickSample(txs: TxRow[], bedrooms: number | null, sizeSqft: number | null): TxRow[] {
  const cutoff = Date.now() - WINDOW_MS;
  const recent = txs.filter((t) => Date.parse(t.date) >= cutoff);
  const sameBdr = (t: TxRow) => bedrooms != null && t.bedrooms === bedrooms;
  const sameSize = (t: TxRow) =>
    sizeSqft != null && t.size_sqft != null && Math.abs(t.size_sqft - sizeSqft) / sizeSqft <= SIZE_TOLERANCE;

  const bySizeAndBdr = recent.filter((t) => sameSize(t) && sameBdr(t));
  if (bySizeAndBdr.length >= MIN_SAMPLES) return bySizeAndBdr;
  const bySize = recent.filter(sameSize);
  if (bySize.length >= MIN_SAMPLES) return bySize;
  // Below MIN_SAMPLES everywhere: best comparable set we have, even if tiny.
  if (bySizeAndBdr.length) return bySizeAndBdr;
  if (bySize.length) return bySize;
  return recent.filter(sameBdr); // only reachable when the listing has no size
}

/**
 * Annual rental yield from the building's real transactions:
 *   gross_yield  = median annual rent of comparable units / median sale price of comparable units
 *   asking_yield = median annual rent of comparable units / asking price of this listing
 * No appreciation / revaluation metrics.
 */
export function computeYield(
  price: number,
  sizeSqft: number | null,
  bedrooms: number | null,
  buyTxs: TxRow[],
  rentTxs: TxRow[]
): YieldResult {
  const buySample = pickSample(buyTxs, bedrooms, sizeSqft);
  const rentSample = pickSample(rentTxs, bedrooms, sizeSqft);

  const rents = rentSample.map((t) => t.amount);
  const sales = buySample.map((t) => t.amount);
  const medianRent = median(rents);
  const medianSalePrice = median(sales);

  return {
    gross_yield: medianRent != null && medianSalePrice ? medianRent / medianSalePrice : null,
    asking_yield: medianRent != null && price > 0 ? medianRent / price : null,
    median_rent: medianRent,
    median_sale_price: medianSalePrice,
    // Spread of comparable rents/sales: within one building + size band the location
    // is fixed, so the P25→P75 range mostly reflects interior condition/furnishing.
    rent_p25: percentile(rents, 0.25),
    rent_p75: percentile(rents, 0.75),
    sale_p25: percentile(sales, 0.25),
    sale_p75: percentile(sales, 0.75),
    rent_n: rentSample.length,
    buy_n: buySample.length,
  };
}

/** Fallback: the 5+5 size-matched transactions embedded in the listing detail page. */
export function similarToTxRows(sims: SimilarTransaction[], kind: "buy" | "rent"): TxRow[] {
  return sims.map((s, i) => ({
    id: `sim-${kind}-${i}-${s.date}`,
    kind,
    date: s.date,
    amount: parseFloat(s.amount),
    size_sqft: s.size ?? null,
    price_per_sqft: s.size ? parseFloat(s.amount) / s.size : null,
    bedrooms: null,
    unit: null,
  }));
}
