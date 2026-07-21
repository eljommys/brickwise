/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchPfPage } from "./client";
import { extractPageProps } from "./parse";
import { PfProperty, SearchFilters } from "../types";

const BASE = "https://www.propertyfinder.ae";

export function buildSearchUrl(f: SearchFilters, page: number): string {
  const params = new URLSearchParams();
  params.set("l", f.locationId || "1"); // default: Dubai
  params.set("c", "1"); // category: buy
  params.set("fu", "0");
  params.set("ob", "mr"); // most recent
  if (f.minPrice) params.set("pf", String(f.minPrice));
  if (f.maxPrice) params.set("pt", String(f.maxPrice));
  if (f.minArea) params.set("af", String(f.minArea));
  if (f.maxArea) params.set("at", String(f.maxArea));
  if (f.propertyTypeId) params.set("t", f.propertyTypeId);
  for (const b of f.bedrooms || []) params.append("bdr[]", b);
  for (const b of f.bathrooms || []) params.append("btr[]", b);
  for (const a of f.amenities || []) params.append("am[]", a);
  if (page > 1) params.set("page", String(page));
  return `${BASE}/en/search?${params.toString()}`;
}

export interface SearchPageResult {
  properties: PfProperty[];
  pageCount: number;
  totalCount: number;
}

export async function scrapeSearchPage(f: SearchFilters, page: number): Promise<SearchPageResult> {
  const html = await fetchPfPage(buildSearchUrl(f, page));
  const pp = extractPageProps(html);
  const sr = pp.searchResult;
  if (!sr) throw new Error("searchResult missing on search page");
  const properties: PfProperty[] = (sr.listings || [])
    .filter((l: any) => l.listing_type === "property" && l.property)
    .map((l: any) => l.property);
  return {
    properties,
    pageCount: sr.meta?.page_count ?? 1,
    totalCount: sr.meta?.total_count ?? properties.length,
  };
}

export async function scrapeSearch(f: SearchFilters): Promise<{ properties: PfProperty[]; totalCount: number }> {
  const maxPages = Math.min(f.maxPages || 2, 10);
  const first = await scrapeSearchPage(f, 1);
  const all = [...first.properties];
  const pages = Math.min(maxPages, first.pageCount);
  for (let p = 2; p <= pages; p++) {
    const r = await scrapeSearchPage(f, p);
    all.push(...r.properties);
  }
  return { properties: all, totalCount: first.totalCount };
}
