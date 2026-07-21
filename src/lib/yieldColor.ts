// Shared yield → color scale used by both the map pins and the list badge.
// ≤6% red (mediocre) → 10%+ turquoise (espectacular); 8–9% around green (bueno).
export const YIELD_LOW = 0.06;
export const YIELD_HIGH = 0.1;

export function yieldColor(y: number | null): string {
  if (y == null) return "#8a8a8a";
  const t = Math.min(1, Math.max(0, (y - YIELD_LOW) / (YIELD_HIGH - YIELD_LOW)));
  const hue = t * 174; // 0° red → 174° turquoise
  return `hsl(${Math.round(hue)}, 66%, 44%)`;
}
