/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchPfPage } from "./client";
import { extractPageProps } from "./parse";
import { getDb, now } from "../db";
import { PfTransaction } from "../types";

const BASE = "https://www.propertyfinder.ae";
const MAX_TX_PAGES = 10;
const SYNC_TTL_MS = 7 * 24 * 3600 * 1000;

async function scrapeTransactionPages(
  citySlug: string,
  towerSlug: string,
  kind: "buy" | "rent"
): Promise<PfTransaction[]> {
  const all: PfTransaction[] = [];
  let pageCount = 1;
  for (let page = 1; page <= Math.min(pageCount, MAX_TX_PAGES); page++) {
    const url = `${BASE}/en/transactions/${kind}/${citySlug}/${towerSlug}${page > 1 ? `?page=${page}` : ""}`;
    let pp: any;
    try {
      pp = extractPageProps(await fetchPfPage(url));
    } catch {
      break; // tower without transaction page
    }
    const list = pp.list;
    if (!list?.transactionList) break;
    all.push(...list.transactionList);
    pageCount = list.totalPageCount ?? 1;
  }
  return all;
}

/** Scrape buy+rent transaction history for a tower into SQLite (7-day TTL). */
export async function syncTransactions(citySlug: string, towerSlug: string): Promise<void> {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR REPLACE INTO transactions (id, tower_slug, kind, date, amount, size_sqft, price_per_sqft, bedrooms, unit, scraped_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const getSync = db.prepare(`SELECT synced_at FROM tx_sync WHERE tower_slug = ? AND kind = ?`);
  const setSync = db.prepare(`INSERT OR REPLACE INTO tx_sync (tower_slug, kind, synced_at) VALUES (?, ?, ?)`);

  for (const kind of ["buy", "rent"] as const) {
    const sync = getSync.get(towerSlug, kind) as { synced_at: string } | undefined;
    if (sync && Date.now() - Date.parse(sync.synced_at) < SYNC_TTL_MS) continue;
    const txs = await scrapeTransactionPages(citySlug, towerSlug, kind);
    const ts = now();
    const write = db.transaction(() => {
      for (const t of txs) {
        insert.run(
          t.id,
          towerSlug,
          kind,
          kind === "rent" ? (t.contractStartDate || t.transactionDate) : t.transactionDate,
          t.price,
          t.propertySize || null,
          t.pricePerSqft || null,
          typeof t.bedrooms === "number" ? t.bedrooms : parseInt(String(t.bedrooms)) || null,
          t.propertyNumber || null,
          ts
        );
      }
      setSync.run(towerSlug, kind, ts);
    });
    write();
  }
}

export interface TxRow {
  id: string;
  kind: "buy" | "rent";
  date: string;
  amount: number;
  size_sqft: number | null;
  price_per_sqft: number | null;
  bedrooms: number | null;
  unit: string | null;
}

export function getTransactions(towerSlug: string, kind: "buy" | "rent"): TxRow[] {
  return getDb()
    .prepare(`SELECT * FROM transactions WHERE tower_slug = ? AND kind = ? ORDER BY date DESC`)
    .all(towerSlug, kind) as TxRow[];
}
