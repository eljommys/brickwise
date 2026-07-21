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
        🔨 Escenario de reforma{" "}
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
          <div className="relative h-2 rounded-full bg-gradient-to-r from-red-300 via-amber-300 to-emerald-400 dark:from-red-900 dark:via-amber-700 dark:to-emerald-600">
            {rent_p75 > rent_p25 && (
              <span
                className="absolute -top-1 h-4 w-1 rounded bg-neutral-900 dark:bg-white"
                style={{ left: `${Math.min(99, Math.max(1, ((median_rent - rent_p25) / (rent_p75 - rent_p25)) * 100))}%` }}
                title={`mediana ${fmtAED(median_rent)}`}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between text-xs font-semibold">
            <span>{fmtAED(rent_p25)}</span>
            <span className="text-neutral-500">{fmtAED(median_rent)}</span>
            <span>{fmtAED(rent_p75)}</span>
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
