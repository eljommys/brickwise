/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "crypto";
import { getDb, now } from "./db";

// Overpass instances are flaky under load; try each twice, in order.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const RADIUS_M = 2000;
const TTL_MS = 30 * 24 * 3600 * 1000;

export type PoiKind = "gym" | "cafe";

// OSM tag filters + default label per kind.
const POI = {
  gym: { tag: `["leisure"="fitness_centre"]`, label: "Gym" },
  cafe: { tag: `["amenity"="cafe"]`, label: "Café" },
} as const;

export interface Poi {
  name: string;
  lat: number;
  lon: number;
  distance_m: number;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Overpass allows very few concurrent requests per IP — serialize ours.
let queue: Promise<unknown> = Promise.resolve();

/** All POIs of `kind` within 2 km, nearest first; cached by ~100 m grid cell. */
export function poisNear(lat: number, lon: number, kind: PoiKind): Promise<Poi[] | null> {
  const task = queue.then(() => doPoisNear(lat, lon, kind));
  queue = task.catch(() => null);
  return task;
}

/** null = Overpass unavailable (not cached); [] = confirmed none nearby. */
async function doPoisNear(lat: number, lon: number, kind: PoiKind): Promise<Poi[] | null> {
  const db = getDb();
  const geoKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = db.prepare(`SELECT * FROM poi_list_cache WHERE geo_key = ? AND kind = ?`).get(geoKey, kind) as any;
  if (cached && Date.now() - Date.parse(cached.fetched_at) < TTL_MS) {
    return JSON.parse(cached.json);
  }

  const tag = POI[kind].tag;
  const query = `[out:json][timeout:15];(node${tag}(around:${RADIUS_M},${lat},${lon});way${tag}(around:${RADIUS_M},${lat},${lon}););out center 80;`;
  const j = await overpassJson(query, 12000);
  if (!j) return null; // all endpoints down: unknown, not cached
  const pois: Poi[] = [];
  for (const el of j.elements || []) {
    const eLat = el.lat ?? el.center?.lat;
    const eLon = el.lon ?? el.center?.lon;
    if (eLat == null || eLon == null) continue;
    pois.push({
      name: el.tags?.name || POI[kind].label,
      lat: eLat,
      lon: eLon,
      distance_m: Math.round(haversineM(lat, lon, eLat, eLon)),
    });
  }
  pois.sort((a, b) => a.distance_m - b.distance_m);
  db.prepare(`INSERT OR REPLACE INTO poi_list_cache (geo_key, kind, json, fetched_at) VALUES (?, ?, ?, ?)`).run(
    geoKey,
    kind,
    JSON.stringify(pois),
    now()
  );
  return pois;
}

/** POST an Overpass query, trying each endpoint until one answers; null if all fail. */
async function overpassJson(query: string, timeoutMs: number): Promise<any | null> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "brickwise-local/0.1 (personal use)",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.remark && !(j.elements || []).length) continue;
      return j;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * All POIs of `kind` near ANY of the given points, in a SINGLE Overpass query
 * (one request for the whole map, not one per property). Cached by the point set.
 */
export function poisForPoints(
  points: { lat: number; lon: number }[],
  kind: PoiKind
): Promise<{ pois: Poi[]; failed: boolean }> {
  const task = queue.then(() => doPoisForPoints(points, kind));
  queue = task.catch(() => ({ pois: [] as Poi[], failed: true }));
  return task;
}

async function doPoisForPoints(
  points: { lat: number; lon: number }[],
  kind: PoiKind
): Promise<{ pois: Poi[]; failed: boolean }> {
  const db = getDb();
  // One ~100 m cell per cluster of nearby favorites (key format == doPoisNear's).
  const cellMap = new Map<string, { lat: number; lon: number }>();
  for (const p of points) {
    const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
    if (!cellMap.has(key)) cellMap.set(key, { lat: p.lat, lon: p.lon });
  }
  if (!cellMap.size) return { pois: [], failed: false };

  const dedupe = (list: Poi[]) => {
    const m = new Map<string, Poi>();
    for (const p of list) m.set(`${p.lat.toFixed(5)},${p.lon.toFixed(5)}`, p);
    return [...m.values()];
  };
  const fresh = (row: any) => row && Date.now() - Date.parse(row.fetched_at) < TTL_MS;
  const get = (key: string) => db.prepare(`SELECT * FROM poi_list_cache WHERE geo_key = ? AND kind = ?`).get(key, kind) as any;
  const put = (key: string, pois: Poi[]) =>
    db.prepare(`INSERT OR REPLACE INTO poi_list_cache (geo_key, kind, json, fetched_at) VALUES (?, ?, ?, ?)`).run(key, kind, JSON.stringify(pois), now());

  const allKeys = [...cellMap.keys()].sort();
  const multiKey = "multi:" + createHash("md5").update(allKeys.join(";")).digest("hex");

  // 1) Whole-set cache.
  const multi = get(multiKey);
  if (fresh(multi)) return { pois: JSON.parse(multi.json), failed: false };

  // 2) Reuse per-cell cache; only query Overpass for what's missing.
  const collected: Poi[] = [];
  const missing: { lat: number; lon: number }[] = [];
  for (const [key, c] of cellMap) {
    const cc = get(key);
    if (fresh(cc)) collected.push(...(JSON.parse(cc.json) as Poi[]));
    else missing.push(c);
  }
  if (missing.length === 0) {
    const pois = dedupe(collected);
    put(multiKey, pois);
    return { pois, failed: false };
  }

  // 3) One combined Overpass query for the missing cells.
  const tag = POI[kind].tag;
  const clauses = missing
    .map((c) => `node${tag}(around:${RADIUS_M},${c.lat},${c.lon});way${tag}(around:${RADIUS_M},${c.lat},${c.lon});`)
    .join("");
  const query = `[out:json][timeout:90];(${clauses});out center 600;`;
  const j = await overpassJson(query, 40000);
  if (!j) {
    // 4) Overpass down: return whatever we already had cached (partial).
    const pois = dedupe(collected);
    return { pois, failed: pois.length === 0 };
  }

  for (const el of j.elements || []) {
    const eLat = el.lat ?? el.center?.lat;
    const eLon = el.lon ?? el.center?.lon;
    if (eLat == null || eLon == null) continue;
    collected.push({ name: el.tags?.name || POI[kind].label, lat: eLat, lon: eLon, distance_m: 0 });
  }
  const pois = dedupe(collected);
  put(multiKey, pois);
  return { pois, failed: false };
}
