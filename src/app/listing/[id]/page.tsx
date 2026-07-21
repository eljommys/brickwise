"use client";

import { use, useEffect, useState } from "react";
import YieldBadge from "@/components/YieldBadge";
import TransactionsTable from "@/components/TransactionsTable";
import PsqftChart from "@/components/PsqftChart";
import ReformScenario from "@/components/ReformScenario";
import { fmtAED, fmtDist, fmtPct, fmtSqft } from "@/lib/format";
import { AnalysisRow } from "@/lib/types";
import { TxRow } from "@/lib/pf/transactions";

interface Detail {
  listing: {
    id: string;
    url: string;
    title: string;
    price: number;
    size_sqft: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    property_type: string;
    tower_name: string | null;
    tower_slug: string | null;
    description: string | null;
    images: { small: string; medium: string }[];
    amenities: string[];
  };
  analysis: AnalysisRow;
  transactions: { buy: TxRow[]; rent: TxRow[] } | null;
}

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [faved, setFaved] = useState(false);

  const addFavorite = async () => {
    if (!data) return;
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: data.listing.url }),
    });
    setFaved(true);
  };

  useEffect(() => {
    fetch(`/api/listing/${id}?tx=1`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">Error: {error}</div>
      </div>
    );
  if (!data)
    return (
      <p className="mx-auto w-full max-w-7xl animate-pulse px-4 py-6 text-neutral-500">
        Cargando análisis (scrapeando si es necesario)…
      </p>
    );

  const { listing, analysis, transactions } = data;
  const images = listing.images || [];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{listing.title}</h1>
          <YieldBadge value={analysis.gross_yield} n={analysis.rent_n} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {listing.tower_name} · {listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms ?? "?"} hab`} ·{" "}
          {listing.bathrooms ?? "?"} baños · {fmtSqft(listing.size_sqft)} · {listing.property_type}
        </p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold" style={{ color: "var(--accent)" }}>{fmtAED(listing.price)}</span>
          {listing.size_sqft ? (
            <span className="text-sm text-neutral-500">· {Math.round(listing.price / listing.size_sqft)} AED/sqft</span>
          ) : null}
        </p>
        <div className="mt-1 flex items-center gap-4">
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Ver anuncio en Property Finder ↗
          </a>
          <button
            onClick={addFavorite}
            disabled={faved}
            className="rounded-lg border border-neutral-300 px-3 py-1 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {faved ? "Guardado" : "Guardar en favoritos"}
          </button>
        </div>
      </div>

      {images.length > 0 && (
        <div className="grid gap-2 lg:grid-cols-[2fr_1fr]">
          <div className="relative overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[imgIdx]?.medium} alt={listing.title} className="aspect-[3/2] w-full object-cover" />
            {images.length > 1 && (
              <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-3">
                <button
                  onClick={() => setImgIdx((imgIdx - 1 + images.length) % images.length)}
                  className="rounded-full bg-black/50 px-3 py-1 text-white"
                >
                  ‹
                </button>
                <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                  {imgIdx + 1}/{images.length}
                </span>
                <button
                  onClick={() => setImgIdx((imgIdx + 1) % images.length)}
                  className="rounded-full bg-black/50 px-3 py-1 text-white"
                >
                  ›
                </button>
              </div>
            )}
          </div>
          <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-auto">
            {images.slice(0, 12).map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={img.small}
                alt=""
                onClick={() => setImgIdx(i)}
                className={`aspect-[3/2] w-full cursor-pointer rounded-lg object-cover ${i === imgIdx ? "ring-2 ring-blue-500" : ""}`}
                loading="lazy"
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Rentabilidad anual de alquiler"
          value={fmtPct(analysis.gross_yield)}
          sub="renta anual mediana ÷ precio de venta mediana (unidades comparables del edificio)"
          accent={analysis.gross_yield != null && analysis.gross_yield >= 0.06 ? "good" : undefined}
        />
        <Stat
          label="Se alquila por (año, mediana)"
          value={fmtAED(analysis.median_rent)}
          sub={`${analysis.rent_n} alquiler${analysis.rent_n === 1 ? "" : "es"} de tamaño similar (±20%, 24 meses)${
            analysis.rent_p25 != null && analysis.rent_p75 != null
              ? ` · rango ${fmtAED(analysis.rent_p25)}–${fmtAED(analysis.rent_p75)}`
              : ""
          }`}
        />
        <Stat
          label="Se vende por (mediana)"
          value={fmtAED(analysis.median_sale_price)}
          sub={`${analysis.buy_n} venta${analysis.buy_n === 1 ? "" : "s"} de tamaño similar (±20%, 24 meses)${
            analysis.sale_p25 != null ? ` · objetivo compra p/ reformar ≈ ${fmtAED(analysis.sale_p25)} (P25)` : ""
          }`}
        />
        <Stat
          label="Rentabilidad sobre el precio del anuncio"
          value={fmtPct(analysis.asking_yield)}
          sub={`si lo compras por ${fmtAED(listing.price)}`}
        />
        <Stat
          label="Gimnasio más cercano (OSM)"
          value={fmtDist(analysis.gym_distance_m)}
          sub={analysis.gym_name ?? undefined}
        />
        <Stat label="AED/sqft del anuncio" value={listing.size_sqft ? `${Math.round(listing.price / listing.size_sqft)} AED/sqft` : "—"} />
      </div>

      {listing.amenities?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {listing.amenities.map((a) => (
            <span key={a} className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs dark:bg-neutral-800">
              {a}
            </span>
          ))}
        </div>
      )}

      <ReformScenario
        listingId={listing.id}
        price={listing.price}
        sizeSqft={listing.size_sqft}
        analysis={analysis}
      />

      {transactions && (transactions.buy.length > 0 || transactions.rent.length > 0) && (
        <PsqftChart
          buy={transactions.buy}
          rent={transactions.rent}
          listingBedrooms={listing.bedrooms}
          listingSizeSqft={listing.size_sqft}
          listingPsqft={listing.size_sqft ? listing.price / listing.size_sqft : null}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <TransactionsTable
          title={`Transacciones de venta en ${listing.tower_name ?? "el edificio"}`}
          rows={transactions?.buy ?? []}
          kind="buy"
        />
        <TransactionsTable
          title={`Contratos de alquiler en ${listing.tower_name ?? "el edificio"}`}
          rows={transactions?.rent ?? []}
          kind="rent"
        />
      </div>

      {listing.description && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm whitespace-pre-line dark:border-neutral-800 dark:bg-neutral-900">
          {listing.description}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs font-semibold text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${
          accent === "good" ? "text-emerald-600 dark:text-emerald-400" : accent === "bad" ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}
