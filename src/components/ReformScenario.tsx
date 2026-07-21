"use client";

import { useState } from "react";
import { fmtAED, fmtPct } from "@/lib/format";
import { AnalysisRow } from "@/lib/types";

const DEFAULT_AED_PER_SQFT = 300;
const SIZE_TOLERANCE = 0.2;

interface Props {
  listingId: string;
  price: number;
  sizeSqft: number | null;
  analysis: AnalysisRow;
}

const REFORM_HELP =
  "Comparamos los alquileres de pisos de TAMAÑO SIMILAR (±20%) del mismo edificio (24 meses). " +
  "P25 = lo que se alquila un piso sin reformar; P75 = uno bien reformado; mediana = el típico. " +
  "La “dispersión” = (P75 − P25) ÷ mediana mide cuánto varían las rentas según el estado interior: " +
  "≥15% el interior manda (hay margen para que la reforma suba el alquiler); 8–15% margen moderado; " +
  "<8% el edificio “capa” la renta y la reforma no se paga. La barra verde es el margen de subida que " +
  "capta la reforma: de la renta típica (mediana) hasta el P75.";

/** Small "?" badge with a hover tooltip. */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle normal-case">
      <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-neutral-400 text-[10px] font-bold text-neutral-500 dark:border-neutral-500">
        ?
      </span>
      <span className="pointer-events-none absolute left-0 top-5 z-30 w-72 rounded-md border border-neutral-200 bg-white p-2.5 text-[11px] font-normal leading-snug text-neutral-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
        {text}
      </span>
    </span>
  );
}

/**
 * Buy → light reform → rent higher. Within one building + size band the location
 * is fixed, so the comparable-rent spread (P25→P75) approximates what the market
 * pays for interior condition; renting at ~P75 is the realistic post-reform rent.
 */
export default function ReformScenario({ listingId, price, sizeSqft, analysis }: Props) {
  const [cost, setCost] = useState(() => {
    const fallback = sizeSqft ? Math.round(sizeSqft * DEFAULT_AED_PER_SQFT) : 100000;
    if (typeof window === "undefined") return fallback;
    const saved = Number(localStorage.getItem(`bw-reform-${listingId}`));
    return Number.isFinite(saved) && saved > 0 ? saved : fallback;
  });

  const { rent_p25, rent_p75, median_rent, rent_n, asking_yield } = analysis;
  if (rent_p25 == null || rent_p75 == null || median_rent == null || rent_n < 3) return null;

  const setAndSave = (v: number) => {
    setCost(v);
    if (Number.isFinite(v) && v >= 0) localStorage.setItem(`bw-reform-${listingId}`, String(v));
  };

  const postReformYield = rent_p75 / (price + cost);
  const uplift = rent_p75 - median_rent;
  const paybackYears = uplift > 0 ? cost / uplift : null;
  const spread = (rent_p75 - rent_p25) / median_rent;
  const medianPct =
    rent_p75 > rent_p25
      ? Math.min(96, Math.max(4, ((median_rent - rent_p25) / (rent_p75 - rent_p25)) * 100))
      : 50;

  const spreadReading =
    spread >= 0.15
      ? { txt: "El interior mueve mucho la renta en este edificio: hay margen real para la reforma.", cls: "text-emerald-700 dark:text-emerald-400" }
      : spread >= 0.08
        ? { txt: "Margen moderado: la reforma ayuda, pero no esperes milagros en este edificio.", cls: "text-amber-700 dark:text-amber-400" }
        : { txt: "El edificio capa la renta: los comparables se alquilan casi igual estén como estén. La reforma difícilmente se paga aquí.", cls: "text-red-700 dark:text-red-400" };

  const band = sizeSqft
    ? `${Math.round(sizeSqft * (1 - SIZE_TOLERANCE))}–${Math.round(sizeSqft * (1 + SIZE_TOLERANCE))} sqft`
    : null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="text-sm font-bold">
        Escenario de reforma
        <InfoTip text={REFORM_HELP} />{" "}
        <span className="font-normal text-neutral-500">
          ({rent_n} alquileres comparables{band ? ` · ${band}` : ""})
        </span>
      </h3>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        {/* Rent range of comparables */}
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-neutral-500">
            <span>P25 (sin reformar)</span>
            <span>mediana</span>
            <span>P75 (reformado)</span>
          </div>
          <div className="relative h-2.5 rounded-full bg-neutral-200 dark:bg-neutral-800">
            {rent_p75 > rent_p25 && (
              <>
                {/* upside captured by reforming: median → P75 */}
                <div
                  className="absolute inset-y-0 right-0 rounded-r-full bg-emerald-400 dark:bg-emerald-600"
                  style={{ left: `${medianPct}%` }}
                  title="Margen de reforma: de la renta típica al P75"
                />
                {/* median tick */}
                <span
                  className="absolute -top-[3px] h-[17px] w-[3px] -translate-x-1/2 rounded bg-neutral-900 dark:bg-white"
                  style={{ left: `${medianPct}%` }}
                  title={`mediana ${fmtAED(median_rent)}`}
                />
              </>
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-xs font-semibold">
            <span>{fmtAED(rent_p25)}</span>
            <span className="text-neutral-500">{fmtAED(median_rent)}</span>
            <span>{fmtAED(rent_p75)}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-neutral-500">
            <span className="inline-block h-2 w-3 rounded-sm bg-emerald-400 dark:bg-emerald-600" />
            margen de reforma (mediana → P75)
          </div>
          <p className={`mt-2 text-xs ${spreadReading.cls}`}>
            Dispersión {fmtPct(spread, 0)} de la mediana — {spreadReading.txt}
          </p>
        </div>

        <div className="hidden w-px bg-neutral-200 lg:block dark:bg-neutral-800" />

        {/* Calculator */}
        <div className="text-sm">
          <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            Coste de la reforma (AED)
            {sizeSqft ? <span className="ml-1 font-normal text-neutral-400">(defecto {DEFAULT_AED_PER_SQFT}/sqft)</span> : null}
          </label>
          <input
            type="number"
            min={0}
            step={5000}
            suppressHydrationWarning
            value={cost}
            onChange={(e) => setAndSave(Number(e.target.value))}
            className="mt-1 w-40 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-950"
          />
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <span className="text-neutral-500">Yield actual (mediana / precio)</span>
            <b>{fmtPct(asking_yield)}</b>
            <span className="text-neutral-500">Yield post-reforma (P75 / precio+reforma)</span>
            <b className={postReformYield > (asking_yield ?? 0) ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              {fmtPct(postReformYield)}
            </b>
            <span className="text-neutral-500">Renta extra al año (P75 − mediana)</span>
            <b>{fmtAED(uplift)}</b>
            <span className="text-neutral-500">Payback de la reforma</span>
            <b>{paybackYears != null ? `${paybackYears.toFixed(1)} años` : "—"}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
