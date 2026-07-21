export const fmtAED = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 }).format(n) + " AED";

export const fmtPct = (x: number | null | undefined, digits = 1) =>
  x == null ? "—" : (x * 100).toFixed(digits) + " %";

export const fmtSqft = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 }).format(n) + " sqft";

export const fmtDist = (m: number | null | undefined) =>
  m == null ? "—" : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

export const fmtDate = (d: string | null | undefined) => (d ? d.slice(0, 10) : "—");
