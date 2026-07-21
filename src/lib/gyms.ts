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

export interface Gym {
  name: string;
  lat: number;
  lon: number;
  distance_m: number;
}

export interface GymResult {
  gym_name: string | null;
  distance_m: number | null;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Overpass allows very few concurrent requests per IP — serialize ours.
let queue: Promise<unknown> = Promise.resolve();

/** All gyms (OSM fitness centres) within 2 km, nearest first; cached by ~100 m grid cell. */
export function gymsNear(lat: number, lon: number): Promise<Gym[] | null> {
  const task = queue.then(() => doGymsNear(lat, lon));
  queue = task.catch(() => null);
  return task;
}

/** null = Overpass unavailable (not cached); [] = confirmed no gyms nearby. */
async function doGymsNear(lat: number, lon: number): Promise<Gym[] | null> {
  const db = getDb();
  const geoKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = db.prepare(`SELECT * FROM gyms_list_cache WHERE geo_key = ?`).get(geoKey) as any;
  if (cached && Date.now() - Date.parse(cached.fetched_at) < TTL_MS) {
    return JSON.parse(cached.gyms_json);
  }

  const query = `[out:json][timeout:15];(node["leisure"="fitness_centre"](around:${RADIUS_M},${lat},${lon});way["leisure"="fitness_centre"](around:${RADIUS_M},${lat},${lon}););out center 60;`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // overpass-api.de answers 406 to requests without a User-Agent
          "User-Agent": "brickwise-local/0.1 (personal use)",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      // Overloaded instances answer 200 + empty elements + a "remark" runtime error.
      if (j.remark && !(j.elements || []).length) continue;
      const gyms: Gym[] = [];
      for (const el of j.elements || []) {
        const eLat = el.lat ?? el.center?.lat;
        const eLon = el.lon ?? el.center?.lon;
        if (eLat == null || eLon == null) continue;
        gyms.push({
          name: el.tags?.name || "Gym",
          lat: eLat,
          lon: eLon,
          distance_m: Math.round(haversineM(lat, lon, eLat, eLon)),
        });
      }
      gyms.sort((a, b) => a.distance_m - b.distance_m);
      db.prepare(
        `INSERT OR REPLACE INTO gyms_list_cache (geo_key, gyms_json, fetched_at) VALUES (?, ?, ?)`
      ).run(geoKey, JSON.stringify(gyms), now());
      return gyms;
    } catch {
      continue;
    }
  }
  return null; // all endpoints down: unknown, not cached
}

/** Nearest gym within 2 km (derived from the cached list). */
export async function nearestGym(lat: number, lon: number): Promise<GymResult> {
  const gyms = await gymsNear(lat, lon);
  const best = gyms?.[0];
  return best
    ? { gym_name: best.name, distance_m: best.distance_m }
    : { gym_name: null, distance_m: null };
}
