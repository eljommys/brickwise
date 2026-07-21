import { poisNear, Poi } from "./pois";

export type Gym = Poi;

export interface GymResult {
  gym_name: string | null;
  distance_m: number | null;
}

/** All gyms (OSM fitness centres) within 2 km, nearest first; cached. */
export function gymsNear(lat: number, lon: number): Promise<Gym[] | null> {
  return poisNear(lat, lon, "gym");
}

/** Nearest gym within 2 km (derived from the cached list). */
export async function nearestGym(lat: number, lon: number): Promise<GymResult> {
  const gyms = await gymsNear(lat, lon);
  const best = gyms?.[0];
  return best ? { gym_name: best.name, distance_m: best.distance_m } : { gym_name: null, distance_m: null };
}
