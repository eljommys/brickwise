import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

let db: Database.Database | null = null;

/**
 * Stable per-user location so data survives no matter how the app is launched
 * (including `npx`, which runs from an ephemeral cache). Override with BRICKWISE_DB.
 * One-time migrates a legacy ./brickwise.db from earlier local runs.
 */
function resolveDbPath(): string {
  if (process.env.BRICKWISE_DB) return process.env.BRICKWISE_DB;
  const dir = path.join(os.homedir(), ".brickwise");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "brickwise.db");
  if (!fs.existsSync(target)) {
    const legacy = path.join(process.cwd(), "brickwise.db");
    if (fs.existsSync(legacy)) {
      try {
        fs.copyFileSync(legacy, target);
      } catch {
        /* start fresh if the copy fails */
      }
    }
  }
  return target;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path_name TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  city_slug TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  price REAL NOT NULL,
  size_sqft REAL,
  bedrooms INTEGER,
  bathrooms INTEGER,
  property_type TEXT NOT NULL DEFAULT '',
  tower_id TEXT,
  tower_slug TEXT,
  tower_name TEXT,
  city_slug TEXT,
  lat REAL,
  lon REAL,
  images_json TEXT NOT NULL DEFAULT '[]',
  amenities_json TEXT NOT NULL DEFAULT '[]',
  agent_json TEXT NOT NULL DEFAULT '{}',
  price_per_sqft REAL,
  description TEXT,
  first_seen_at TEXT NOT NULL,
  last_scraped_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  tower_slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('buy','rent')),
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  size_sqft REAL,
  price_per_sqft REAL,
  bedrooms INTEGER,
  unit TEXT,
  scraped_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_tower ON transactions(tower_slug, kind);

CREATE TABLE IF NOT EXISTS tx_sync (
  tower_slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (tower_slug, kind)
);

CREATE TABLE IF NOT EXISTS gym_cache (
  geo_key TEXT PRIMARY KEY,
  gym_name TEXT,
  gym_lat REAL,
  gym_lon REAL,
  distance_m REAL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gyms_list_cache (
  geo_key TEXT PRIMARY KEY,
  gyms_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id),
  notes TEXT NOT NULL DEFAULT '',
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id),
  gross_yield REAL,
  yield_vs_market REAL,
  market_value_est REAL,
  median_rent REAL,
  median_buy_psqft REAL,
  rent_n INTEGER NOT NULL DEFAULT 0,
  buy_n INTEGER NOT NULL DEFAULT 0,
  premium_pct REAL,
  gym_distance_m REAL,
  gym_name TEXT,
  computed_at TEXT NOT NULL
);
`;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(resolveDbPath());
    db.pragma("journal_mode = WAL");
    db.exec(SCHEMA);
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database) {
  const cols = (db.prepare(`PRAGMA table_info(analyses)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("median_sale_price")) db.exec(`ALTER TABLE analyses ADD COLUMN median_sale_price REAL`);
  if (!cols.includes("asking_yield")) db.exec(`ALTER TABLE analyses ADD COLUMN asking_yield REAL`);
}

export function now(): string {
  return new Date().toISOString();
}
