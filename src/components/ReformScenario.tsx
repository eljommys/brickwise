"use client";

import { useState } from "react";
import { fmtAED, fmtPct } from "@/lib/format";
import { AnalysisRow } from "@/lib/types";

const SIZE_TOLERANCE = 0.2;

interface Props {
  listingId: string;
  price: number;
  sizeSqft: number | null;
  analysis: AnalysisRow;
}

/**
 * Itemized reform model. The rent uplift you can claim depends on the SCOPE of
 * the reform (which items you do), not on the money you type in: each item
 * captures a share ("weight") of the median→P75 spread. Costs only affect the
 * payback. This prevents "cheap reform + full P75 rent" from inflating yields.
 *
 * Default costs are rough Dubai light-reform figures per sqft; edit them freely.
 */
const ITEMS = {
  mobiliario: { label: "Mobiliario", defaults: { comprado: 45, medida: 100 }, weights: { comprado: 0.4, medida: 0.5 } },
  suelo: { label: "Suelo", perSqft: 55, weight: 0.25 },
  paredes: { label: "Paredes (pintura y arreglos)", perSqft: 12, weight: 0.2 },
  techos: { label: "Techos (falso techo e iluminación)", perSqft: 20, weight: 0.1 },
} as const;

type FurnitureType = "comprado" | "medida";

interface ReformState {
  mobiliario: { on: boolean; tipo: FurnitureType; cost: number };
  suelo: { on: boolean; cost: number };
  paredes: { on: boolean; cost: number };
  techos: { on: boolean; cost: number };
}

function defaultState(sizeSqft: number | null): ReformState {
  const s = sizeSqft ?? 500;
  return {
    mobiliario: { on: true, tipo: "comprado", cost: Math.round(s * ITEMS.mobiliario.defaults.comprado) },
    suelo: { on: true, cost: Math.round(s * ITEMS.suelo.perSqft) },
    paredes: { on: true, cost: Math.round(s * ITEMS.paredes.perSqft) },
    techos: { on: false, cost: Math.round(s * ITEMS.techos.perSqft) },
  };
}

const REFORM_HELP =
  "Comparamos los alquileres de pisos de TAMAÑO SIMILAR (±20%) del mismo edificio (24 meses). " +
  "P25 = piso sin reformar; P75 = bien reformado; mediana = el típico. La reforma solo puede capturar " +
  "el margen mediana→P75, y CADA PARTIDA captura una parte: mobiliario 40% (50% si es a medida), " +
  "suelo 25%, paredes 20%, techos 10%. Marcar o desmarcar partidas cambia la renta esperada; " +
  "el coste que escribas solo cambia el payback — así una reforma barata no infla la rentabilidad.";

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

export default function ReformScenario({ listingId, price, sizeSqft, analysis }: Props) {
  const [state, setState] = useState<ReformState>(() => {
    const fallback = defaultState(sizeSqft);
    if (typeof window === "undefined") return fallback;
    try {
      const saved = JSON.parse(localStorage.getItem(`bw-reform-${listingId}`) ?? "");
      // Older versions stored a plain number — ignore those.
      if (saved && typeof saved === "object" && saved.mobiliario) return saved as ReformState;
    } catch {}
    return fallback;
  });

  const { rent_p25, rent_p75, median_rent, rent_n, asking_yield } = analysis;
  if (rent_p25 == null || rent_p75 == null || median_rent == null || rent_n < 3) return null;

  const update = (next: ReformState) => {
    setState(next);
    localStorage.setItem(`bw-reform-${listingId}`, JSON.stringify(next));
  };

  const uplift = rent_p75 - median_rent; // full spread captured by a complete reform
  const weightOf = {
    mobiliario: state.mobiliario.on ? ITEMS.mobiliario.weights[state.mobiliario.tipo] : 0,
    suelo: state.suelo.on ? ITEMS.suelo.weight : 0,
    paredes: state.paredes.on ? ITEMS.paredes.weight : 0,
    techos: state.techos.on ? ITEMS.techos.weight : 0,
  };
  const scope = Math.min(1, weightOf.mobiliario + weightOf.suelo + weightOf.paredes + weightOf.techos);
  const totalCost =
    (state.mobiliario.on ? state.mobiliario.cost : 0) +
    (state.suelo.on ? state.suelo.cost : 0) +
    (state.paredes.on ? state.paredes.cost : 0) +
    (state.techos.on ? state.techos.cost : 0);

  const expectedRent = median_rent + uplift * scope;
  const capturedUplift = expectedRent - median_rent;
  const postReformYield = expectedRent / (price + totalCost);
  const paybackYears = capturedUplift > 0 && totalCost > 0 ? totalCost / capturedUplift : null;
  const spread = (rent_p75 - rent_p25) / median_rent;
  const medianPct =
    rent_p75 > rent_p25 ? Math.min(96, Math.max(4, ((median_rent - rent_p25) / (rent_p75 - rent_p25)) * 100)) : 50;

  const spreadReading =
    spread >= 0.15
      ? { txt: "El interior mueve mucho la renta en este edificio: hay margen real para la reforma.", cls: "text-emerald-700 dark:text-emerald-400" }
      : spread >= 0.08
        ? { txt: "Margen moderado: la reforma ayuda, pero no esperes milagros en este edificio.", cls: "text-amber-700 dark:text-amber-400" }
        : { txt: "El edificio capa la renta: los comparables se alquilan casi igual estén como estén. La reforma difícilmente se paga aquí.", cls: "text-red-700 dark:text-red-400" };

  const band = sizeSqft
    ? `${Math.round(sizeSqft * (1 - SIZE_TOLERANCE))}–${Math.round(sizeSqft * (1 + SIZE_TOLERANCE))} sqft`
    : null;

  const rowCls = "flex items-center gap-2 py-1";
  const inputCls =
    "w-24 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-right text-xs outline-none focus:border-blue-500 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950";

  const itemRow = (
    key: "suelo" | "paredes" | "techos",
    label: string,
    weight: number
  ) => (
    <label className={rowCls}>
      <input
        type="checkbox"
        checked={state[key].on}
        onChange={(e) => update({ ...state, [key]: { ...state[key], on: e.target.checked } })}
        className="h-3.5 w-3.5 accent-blue-600"
      />
      <span className="flex-1 text-xs">{label}</span>
      <span className="text-[10px] text-neutral-400">+{Math.round(weight * 100)}%</span>
      <input
        type="number"
        min={0}
        step={1000}
        disabled={!state[key].on}
        value={state[key].cost}
        suppressHydrationWarning
        onChange={(e) => update({ ...state, [key]: { ...state[key], cost: Number(e.target.value) } })}
        className={inputCls}
      />
    </label>
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="text-sm font-bold">
        Escenario de reforma
        <InfoTip text={REFORM_HELP} />{" "}
        <span className="font-normal text-neutral-500">
          ({rent_n} alquileres comparables{band ? ` · ${band}` : ""})
        </span>
      </h3>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto_1.15fr]">
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
                {/* upside captured by the CURRENT scope */}
                <div
                  className="absolute inset-y-0 rounded-r-full bg-emerald-400 dark:bg-emerald-600"
                  style={{ left: `${medianPct}%`, width: `${(100 - medianPct) * scope}%` }}
                  title={`Margen capturado por esta reforma (${Math.round(scope * 100)}%)`}
                />
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
            margen capturado por esta reforma ({Math.round(scope * 100)}% del total)
          </div>
          <p className={`mt-2 text-xs ${spreadReading.cls}`}>
            Dispersión {fmtPct(spread, 0)} de la mediana — {spreadReading.txt}
          </p>
        </div>

        <div className="hidden w-px bg-neutral-200 lg:block dark:bg-neutral-800" />

        {/* Itemized reform */}
        <div className="text-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">Partidas de la reforma</span>
            <span className="text-[10px] text-neutral-400">% del margen · coste AED</span>
          </div>

          {/* Mobiliario: checkbox + type selector */}
          <label className={rowCls}>
            <input
              type="checkbox"
              checked={state.mobiliario.on}
              onChange={(e) => update({ ...state, mobiliario: { ...state.mobiliario, on: e.target.checked } })}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            <span className="text-xs">Mobiliario</span>
            <select
              disabled={!state.mobiliario.on}
              value={state.mobiliario.tipo}
              onChange={(e) => {
                const tipo = e.target.value as FurnitureType;
                const cost = sizeSqft ? Math.round(sizeSqft * ITEMS.mobiliario.defaults[tipo]) : state.mobiliario.cost;
                update({ ...state, mobiliario: { ...state.mobiliario, tipo, cost } });
              }}
              className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px] disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="comprado">comprado</option>
              <option value="medida">a medida</option>
            </select>
            <span className="flex-1" />
            <span className="text-[10px] text-neutral-400">
              +{Math.round(ITEMS.mobiliario.weights[state.mobiliario.tipo] * 100)}%
            </span>
            <input
              type="number"
              min={0}
              step={1000}
              disabled={!state.mobiliario.on}
              value={state.mobiliario.cost}
              suppressHydrationWarning
              onChange={(e) => update({ ...state, mobiliario: { ...state.mobiliario, cost: Number(e.target.value) } })}
              className={inputCls}
            />
          </label>

          {itemRow("suelo", "Suelo", ITEMS.suelo.weight)}
          {itemRow("paredes", "Paredes (pintura y arreglos)", ITEMS.paredes.weight)}
          {itemRow("techos", "Techos (falso techo, iluminación)", ITEMS.techos.weight)}

          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-neutral-200 pt-2 text-xs dark:border-neutral-800">
            <span className="text-neutral-500">Coste total</span>
            <b>{fmtAED(totalCost)}</b>
            <span className="text-neutral-500">Renta esperada post-reforma</span>
            <b>
              {fmtAED(Math.round(expectedRent))}
              <span className="ml-1 font-normal text-neutral-400">({Math.round(scope * 100)}% del margen)</span>
            </b>
            <span className="text-neutral-500">Yield actual (mediana / precio)</span>
            <b>{fmtPct(asking_yield)}</b>
            <span className="text-neutral-500">Yield post-reforma</span>
            <b className={postReformYield > (asking_yield ?? 0) ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              {fmtPct(postReformYield)}
            </b>
            <span className="text-neutral-500">Renta extra al año</span>
            <b>{fmtAED(Math.round(capturedUplift))}</b>
            <span className="text-neutral-500">Payback de la reforma</span>
            <b>{paybackYears != null ? `${paybackYears.toFixed(1)} años` : "—"}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
