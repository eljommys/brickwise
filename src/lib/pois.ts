/* eslint-disable @typescript-eslint/no-explicit-any */
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
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "brickwise-local/0.1 (personal use)",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.remark && !(j.elements || []).length) continue;
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
    } catch {
      continue;
    }
  }
  return null; // all endpoints down: unknown, not cached
}
