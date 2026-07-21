import { fetchPfPage } from "./client";
import { extractPageProps } from "./parse";
import { PfProperty } from "../types";

export interface ListingDetail {
  property: PfProperty;
  citySlug: string;
}

export async function scrapeListing(url: string): Promise<ListingDetail> {
  const html = await fetchPfPage(url);
  const pp = extractPageProps(html);
  const property = pp.propertyResult?.property;
  if (!property) throw new Error(`propertyResult.property missing for ${url}`);
  return { property, citySlug: pp.citySlug || "dubai" };
}
