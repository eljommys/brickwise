interface UnitLike {
  id: string;
  tower_slug: string | null;
  bedrooms: number | null;
  size_sqft: number | null;
  price: number;
}

/**
 * The same physical apartment is often listed by several agents under different
 * Property Finder ids. Those share the building, bedroom count, size and asking
 * price (agents copy the same DLD figures), so collapse them to one card.
 *
 * When any of those fields is missing we cannot be confident two rows are the
 * same unit, so we key on the id and never merge.
 */
function unitSignature(r: UnitLike): string {
  if (!r.tower_slug || r.size_sqft == null || !r.price) return `id:${r.id}`;
  const bd = r.bedrooms == null ? "?" : r.bedrooms;
  return `${r.tower_slug}|${bd}|${Math.round(r.size_sqft)}|${r.price}`;
}

/** Keep the first occurrence of each physical unit (newest first with ob=mr). */
export function dedupeListings<T extends UnitLike>(rows: T[]): { unique: T[]; removed: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const r of rows) {
    const sig = unitSignature(r);
    if (seen.has(sig)) continue;
    seen.add(sig);
    unique.push(r);
  }
  return { unique, removed: rows.length - unique.length };
}
