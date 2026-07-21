import { TxRow } from "./pf/transactions";

// Same ±20% "comparable" window the yield sample and the AED/sqft chart use.
const SIZE_TOLERANCE = 0.2;
const YEAR_MS = 365.25 * 24 * 3600 * 1000;

export interface TrendResult {
  /** Trend value (AED/sqft) at the most recent transaction date — the current fair price. */
  currentPsqft: number;
  /** Annual drift of the trend, as a fraction (e.g. 0.08 = +8 %/yr). */
  annualPct: number | null;
  /** Number of comparable points the fit used. */
  n: number;
}

/**
 * Least-squares trend of AED/sqft over time for a building's transactions,
 * fitted on comparable units (similar size ±20%, bedrooms fallback) — the exact
 * line drawn by PsqftChart. `currentPsqft` is that line evaluated at the latest
 * date, i.e. what a comparable unit is worth per sqft right now.
 */
export function psqftTrend(
  rows: TxRow[],
  listingSizeSqft: number | null,
  listingBedrooms: number | null
): TrendResult | null {
  const pts = rows
    .filter((r) => r.size_sqft && r.size_sqft > 0 && r.amount > 0 && r.date)
    .map((r) => ({
      t: Date.parse(r.date),
      y: r.amount / (r.size_sqft as number),
      comparable:
        listingSizeSqft != null
          ? Math.abs((r.size_sqft as number) - listingSizeSqft) / listingSizeSqft <= SIZE_TOLERANCE
          : listingBedrooms != null && r.bedrooms === listingBedrooms,
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y))
    .sort((a, b) => a.t - b.t);
  if (!pts.length) return null;

  const tMin = pts[0].t;
  const tMax = pts[pts.length - 1].t;
  const comp = pts.filter((p) => p.comparable);
  const fitSet = comp.length >= 2 ? comp : pts;
  if (fitSet.length < 2 || tMax <= tMin) return null;

  const n = fitSet.length;
  const mt = fitSet.reduce((s, p) => s + p.t, 0) / n;
  const my = fitSet.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of fitSet) {
    num += (p.t - mt) * (p.y - my);
    den += (p.t - mt) ** 2;
  }
  const slope = den ? num / den : 0; // AED/sqft per ms
  const intercept = my - slope * mt;

  return {
    currentPsqft: intercept + slope * tMax,
    annualPct: my ? (slope * YEAR_MS) / my : null,
    n: comp.length >= 2 ? comp.length : pts.length,
  };
}

/**
 * Discount of the asking price vs the current trend, as a fraction: positive when
 * the listing is cheaper than the trend (a discount), negative when it's above it.
 */
export function discountVsTrend(
  trend: TrendResult | null,
  askingPsqft: number | null
): number | null {
  if (!trend || askingPsqft == null || trend.currentPsqft <= 0) return null;
  return (trend.currentPsqft - askingPsqft) / trend.currentPsqft;
}
