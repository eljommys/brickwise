/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb, now } from "./db";
import { AnalysisRow, ListingRow, PfProperty, YieldResult } from "./types";

function sizeSqft(p: PfProperty): number | null {
  const s: any = p.size;
  if (s == null) return null;
  if (typeof s === "number") return s;
  const parsed = parseFloat(String(s.value ?? s));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Coerce PF values that may come as number, numeric string, {value} or {price} object. */
function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "object") {
    const o = v as { value?: unknown; price?: unknown };
    return toNum(o.value ?? o.price);
  }
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Search pages: images is an array; detail pages: {property: [...]} with other size keys. */
function normalizeImages(p: PfProperty): { small: string; medium: string }[] {
  const raw: any = p.images;
  const arr: any[] = Array.isArray(raw) ? raw : raw?.property || [];
  return arr
    .map((i) => ({ small: i.small || i.thumbnail || i.medium || "", medium: i.medium || i.full || i.small || "" }))
    .filter((i) => i.medium);
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).toLowerCase();
  if (s === "studio") return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** The tower node (or deepest location) the transactions history is keyed on. */
function towerNode(p: PfProperty) {
  const tree = p.location_tree;
  if (tree?.length) {
    const tower = [...tree].reverse().find((l) => l.type === "TOWER");
    return tower || tree[tree.length - 1];
  }
  return p.location;
}

export function upsertListing(p: PfProperty, citySlug = "dubai"): ListingRow {
  const db = getDb();
  const tower = towerNode(p);
  const size = sizeSqft(p);
  const price = p.price?.value ?? 0;
  const ts = now();
  const existing = db
    .prepare(`SELECT first_seen_at, amenities_json, description, images_json FROM listings WHERE id = ?`)
    .get(p.id) as
    | { first_seen_at: string; amenities_json: string; description: string | null; images_json: string }
    | undefined;
  const amenities = p.amenity_names?.length
    ? JSON.stringify(p.amenity_names)
    : existing?.amenities_json ?? "[]";
  // Search cards only carry ~3 images; never let them clobber a richer detail-page set.
  let images = normalizeImages(p);
  if (existing) {
    try {
      const prev = JSON.parse(existing.images_json);
      if (Array.isArray(prev) && prev.length > images.length) images = prev;
    } catch {}
  }

  db.prepare(
    `INSERT OR REPLACE INTO listings
     (id, url, title, price, size_sqft, bedrooms, bathrooms, property_type, tower_id, tower_slug, tower_name,
      city_slug, lat, lon, images_json, amenities_json, agent_json, price_per_sqft, description, first_seen_at, last_scraped_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    String(p.id),
    p.share_url || `https://www.propertyfinder.ae${p.details_path || ""}`,
    p.title || "",
    price,
    size,
    toInt(p.bedrooms),
    toInt(p.bathrooms),
    p.property_type || "",
    tower?.id != null ? String(tower.id) : null,
    tower?.slug ?? null,
    tower?.name ?? null,
    citySlug,
    toNum(p.location?.coordinates?.lat),
    toNum(p.location?.coordinates?.lon),
    JSON.stringify(images),
    amenities,
    JSON.stringify({ agent: p.agent?.name ?? null, broker: p.broker?.name ?? null }),
    toNum(p.price_per_area) ?? (size && price ? price / size : null),
    p.description ?? existing?.description ?? null,
    existing?.first_seen_at ?? ts,
    ts
  );
  return getListing(p.id)!;
}

export function getListing(id: string): ListingRow | null {
  return (getDb().prepare(`SELECT * FROM listings WHERE id = ?`).get(id) as ListingRow) ?? null;
}

export function saveAnalysis(listingId: string, y: YieldResult, gym: { gym_name: string | null; distance_m: number | null }) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO analyses
       (listing_id, gross_yield, asking_yield, median_rent, median_sale_price,
        rent_n, buy_n, gym_distance_m, gym_name, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      listingId,
      y.gross_yield,
      y.asking_yield,
      y.median_rent,
      y.median_sale_price,
      y.rent_n,
      y.buy_n,
      gym.distance_m,
      gym.gym_name,
      now()
    );
}

export function getAnalysis(listingId: string): AnalysisRow | null {
  return (getDb().prepare(`SELECT * FROM analyses WHERE listing_id = ?`).get(listingId) as AnalysisRow) ?? null;
}

export interface AnalyzedListing extends ListingRow, Omit<AnalysisRow, "listing_id" | "computed_at"> {
  computed_at: string | null;
}

export function addFavorite(listingId: string) {
  getDb()
    .prepare(`INSERT OR IGNORE INTO favorites (listing_id, notes, added_at) VALUES (?, '', ?)`)
    .run(listingId, now());
}

export function removeFavorite(listingId: string) {
  getDb().prepare(`DELETE FROM favorites WHERE listing_id = ?`).run(listingId);
}

export function setFavoriteNotes(listingId: string, notes: string) {
  getDb().prepare(`UPDATE favorites SET notes = ? WHERE listing_id = ?`).run(notes, listingId);
}

export interface FavoriteListing extends AnalyzedListing {
  notes: string;
  added_at: string;
}

export function listFavorites(): FavoriteListing[] {
  return getDb()
    .prepare(
      `SELECT l.*, a.gross_yield, a.asking_yield, a.median_rent, a.median_sale_price,
              a.rent_n, a.buy_n, a.gym_distance_m, a.gym_name, a.computed_at,
              f.notes, f.added_at
       FROM favorites f
       JOIN listings l ON l.id = f.listing_id
       LEFT JOIN analyses a ON a.listing_id = f.listing_id
       ORDER BY a.gross_yield DESC NULLS LAST`
    )
    .all() as FavoriteListing[];
}

export function listAnalyzed(): AnalyzedListing[] {
  return getDb()
    .prepare(
      `SELECT l.*, a.gross_yield, a.asking_yield, a.median_rent, a.median_sale_price,
              a.rent_n, a.buy_n, a.gym_distance_m, a.gym_name, a.computed_at
       FROM listings l JOIN analyses a ON a.listing_id = l.id
       ORDER BY a.gross_yield DESC NULLS LAST`
    )
    .all() as AnalyzedListing[];
}
