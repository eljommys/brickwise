"use client";

import { useState } from "react";
import Link from "next/link";
import YieldBadge from "./YieldBadge";
import { fmtAED, fmtDist, fmtSqft } from "@/lib/format";
import { AnalysisRow } from "@/lib/types";

export interface CardListing {
  id: string;
  url: string;
  title: string;
  price: number;
  size_sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string;
  tower_name: string | null;
  images: { small: string; medium: string }[];
  amenities: string[];
}

export default function ListingCard({
  listing,
  analysis: initialAnalysis,
  onAnalyzed,
}: {
  listing: CardListing;
  analysis?: AnalysisRow | null;
  onAnalyzed?: (id: string, a: AnalysisRow) => void;
}) {
  const [analysis, setAnalysis] = useState<AnalysisRow | null>(initialAnalysis ?? null);
  const [loading, setLoading] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const images = listing.images || [];

  const analyze = () => {
    if (loading || analysis) return;
    setLoading(true);
    fetch(`/api/listing/${listing.id}?url=${encodeURIComponent(listing.url)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setAnalysis(j.analysis);
        onAnalyzed?.(listing.id, j.analysis);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
      <div className="relative aspect-[3/2] bg-neutral-100 dark:bg-neutral-800">
        {images.length > 0 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[imgIdx]?.medium || images[imgIdx]?.small}
            alt={listing.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
        {images.length > 1 && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-2 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => setImgIdx((imgIdx - 1 + images.length) % images.length)}
              className="rounded-full bg-black/50 px-2.5 py-1 text-sm text-white"
            >
              ‹
            </button>
            <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
              {imgIdx + 1}/{images.length}
            </span>
            <button
              onClick={() => setImgIdx((imgIdx + 1) % images.length)}
              className="rounded-full bg-black/50 px-2.5 py-1 text-sm text-white"
            >
              ›
            </button>
          </div>
        )}
        <div className="absolute left-2 top-2">
          {loading ? (
            <span className="inline-flex items-center rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
              analizando…
            </span>
          ) : analysis ? (
            <YieldBadge value={analysis.gross_yield} n={analysis.rent_n} />
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-bold">{fmtAED(listing.price)}</span>
          <span className="shrink-0 text-xs text-neutral-500">{listing.property_type}</span>
        </div>
        <Link href={`/listing/${listing.id}`} className="line-clamp-2 text-sm font-medium hover:underline">
          {listing.title}
        </Link>
        <div className="text-xs text-neutral-500">
          {listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms ?? "?"} hab`} · {listing.bathrooms ?? "?"} baños ·{" "}
          {fmtSqft(listing.size_sqft)}
        </div>
        {listing.tower_name && (
          <div className="truncate text-xs text-neutral-500">📍 {listing.tower_name}</div>
        )}
        {analysis && (
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-neutral-600 dark:text-neutral-400">
            <span>Alquiler/año: {fmtAED(analysis.median_rent)}</span>
            <span>🏋️ {fmtDist(analysis.gym_distance_m)}</span>
            <span>Venta med.: {fmtAED(analysis.median_sale_price)}</span>
            <span>s/ anuncio: {analysis.asking_yield != null ? (analysis.asking_yield * 100).toFixed(1) + " %" : "—"}</span>
          </div>
        )}
        <div className="mt-auto flex items-center gap-3 pt-2">
          {analysis ? (
            <Link
              href={`/listing/${listing.id}`}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Ver análisis
            </Link>
          ) : (
            <button
              onClick={analyze}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {loading ? "Analizando…" : "⚡ Analizar"}
            </button>
          )}
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Ver en Property Finder ↗
          </a>
        </div>
      </div>
    </div>
  );
}
