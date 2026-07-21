/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchPfPage } from "./client";
import { getDb } from "../db";

const LIST_URL =
  "https://www.propertyfinder.ae/api/pwa/location/list?l_t=TOWER%2CSUBCOMMUNITY%2CCOMMUNITY%2CCITY&c=1&locale=en";

export interface LocationRow {
  id: string;
  name: string;
  path_name: string;
  slug: string;
  city_slug: string;
  type: string;
  path: string;
}

const DEPTH_TYPES = ["CITY", "COMMUNITY", "SUBCOMMUNITY"];

export async function syncLocations(): Promise<number> {
  const raw = JSON.parse(await fetchPfPage(LIST_URL));
  const items: any[] = Array.isArray(raw) ? raw : raw?.data || [];
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR REPLACE INTO locations (id, name, path_name, slug, city_slug, type, path) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertDerived = db.prepare(
    `INSERT OR IGNORE INTO locations (id, name, path_name, slug, city_slug, type, path) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const write = db.transaction(() => {
    for (const l of items) {
      insert.run(String(l.id), l.n || "", l.p_n || l.en_p_n || "", l.en_s || l.s || "", l.en_c_s || "", l.l_t || "", l.p || "");
    }
    // The feed only contains leaf-ish locations (towers/subcommunities and a few
    // communities). Cities and most communities — e.g. "Dubai Marina" — only appear
    // as ancestors inside each row's id path (p: "1.86.1198.4328") and path name
    // (p_n: "Dubai, Palm Jumeirah, Marina Residences"), so derive them from there.
    for (const l of items) {
      const ids = String(l.p || "").split(".");
      const names = String(l.p_n || l.en_p_n || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (ids.length < 2 || names.length !== ids.length - 1) continue;
      for (let i = 0; i < names.length; i++) {
        insertDerived.run(
          ids[i],
          names[i],
          names.slice(0, i).join(", "),
          "",
          l.en_c_s || "",
          DEPTH_TYPES[Math.min(i, DEPTH_TYPES.length - 1)],
          ids.slice(0, i + 1).join(".")
        );
      }
    }
  });
  write();
  return items.length;
}

export async function searchLocations(q: string, limit = 12): Promise<LocationRow[]> {
  const db = getDb();
  const count = (db.prepare(`SELECT COUNT(*) AS c FROM locations`).get() as { c: number }).c;
  if (count === 0) await syncLocations();
  const like = `%${q.trim().replace(/\s+/g, "%")}%`;
  return db
    .prepare(
      `SELECT * FROM locations
       WHERE name LIKE ? OR path_name LIKE ?
       ORDER BY CASE type WHEN 'CITY' THEN 0 WHEN 'COMMUNITY' THEN 1 WHEN 'SUBCOMMUNITY' THEN 2 ELSE 3 END,
                length(name)
       LIMIT ?`
    )
    .all(like, like, limit) as LocationRow[];
}
