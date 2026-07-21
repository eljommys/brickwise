import { TxRow } from "./pf/transactions";
import { SimilarTransaction, YieldResult } from "./types";

const WINDOW_MS = 24 * 30.44 * 24 * 3600 * 1000; // ~24 months
const MIN_SAMPLES = 3;
const SIZE_TOLERANCE = 0.2;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Comparable units only: same bedrooms + similar size when possible, relaxing to
 * same bedrooms, then similar size. Never falls back to "every transaction in the
 * building" — mixing unit types is what produces bogus yields.
 */
function pickSample(txs: TxRow[], bedrooms: number | null, sizeSqft: number | null): TxRow[] {
  const cutoff = Date.now() - WINDOW_MS;
  const recent = txs.filter((t) => Date.parse(t.date) >= cutoff);
  const sameBdr = (t: TxRow) => bedrooms != null && t.bedrooms === bedrooms;
  const sameSize = (t: TxRow) =>
    sizeSqft != null && t.size_sqft != null && Math.abs(t.size_sqft - sizeSqft) / sizeSqft <= SIZE_TOLERANCE;

  const byBoth = recent.filter((t) => sameBdr(t) && sameSize(t));
  if (byBoth.length >= MIN_SAMPLES) return byBoth;
  const byBdr = recent.filter(sameBdr);
  if (byBdr.length >= MIN_SAMPLES) return byBdr;
  const bySize = recent.filter(sameSize);
  if (bySize.length >= MIN_SAMPLES) return bySize;
  // Below MIN_SAMPLES everywhere: use the best comparable set we have, even if tiny.
  if (byBoth.length) return byBoth;
  if (byBdr.length) return byBdr;
  return bySize;
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

  const medianRent = median(rentSample.map((t) => t.amount));
  const medianSalePrice = median(buySample.map((t) => t.amount));

  return {
    gross_yield: medianRent != null && medianSalePrice ? medianRent / medianSalePrice : null,
    asking_yield: medianRent != null && price > 0 ? medianRent / price : null,
    median_rent: medianRent,
    median_sale_price: medianSalePrice,
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
