"use client";

import { useMemo, useState } from "react";
import { TxRow } from "@/lib/pf/transactions";

interface Props {
  buy: TxRow[];
  rent: TxRow[];
  listingBedrooms: number | null;
  listingSizeSqft: number | null;
  listingPsqft: number | null; // asking price / size
}

const SIZE_TOLERANCE = 0.2;

interface Pt {
  t: number; // date ms
  y: number; // AED/sqft
  bedrooms: number | null;
  amount: number;
  size: number | null;
  comparable: boolean;
}

const W = 760;
const H = 320;
const M = { top: 16, right: 16, bottom: 34, left: 52 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

const ACCENT = "#2563eb"; // comparable (same bedrooms)
const MUTED = "#9ca3af"; // other units
const REF = "#059669"; // this listing
const TREND = "#7c3aed"; // tendency line

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-6; v += step) out.push(v);
  return out;
}

const fmtMonth = (ms: number) =>
  new Date(ms).toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("es-ES");
const fmtAED = (n: number) => new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 }).format(n);

export default function PsqftChart({ buy, rent, listingBedrooms, listingSizeSqft, listingPsqft }: Props) {
  const [mode, setMode] = useState<"buy" | "rent">("buy");
  const [hover, setHover] = useState<{ p: Pt; x: number; y: number } | null>(null);

  const rows = mode === "buy" ? buy : rent;

  const pts: Pt[] = useMemo(
    () =>
      rows
        .filter((r) => r.size_sqft && r.size_sqft > 0 && r.amount > 0 && r.date)
        .map((r) => ({
          t: Date.parse(r.date),
          y: r.amount / (r.size_sqft as number), // sale AED/sqft, or annual rent AED/sqft
          bedrooms: r.bedrooms,
          amount: r.amount,
          size: r.size_sqft,
          // Same criterion as the yield sample: similar size first, bedrooms fallback.
          comparable:
            listingSizeSqft != null
              ? Math.abs((r.size_sqft as number) - listingSizeSqft) / listingSizeSqft <= SIZE_TOLERANCE
              : listingBedrooms != null && r.bedrooms === listingBedrooms,
        }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y))
        .sort((a, b) => a.t - b.t),
    [rows, listingBedrooms, listingSizeSqft]
  );

  const scales = useMemo(() => {
    if (!pts.length) return null;
    const ts = pts.map((p) => p.t);
    const ys = pts.map((p) => p.y);
    const refY = mode === "buy" ? listingPsqft ?? null : null;
    const tMin = Math.min(...ts);
    const tMax = Math.max(...ts);

    // Least-squares trend over comparable units (fallback to all) — the tendency.
    const comp = pts.filter((p) => p.comparable);
    const fitSet = comp.length >= 2 ? comp : pts;
    let trend: { y0: number; y1: number; annualPct: number | null } | null = null;
    if (fitSet.length >= 2 && tMax > tMin) {
      const n = fitSet.length;
      const mt = fitSet.reduce((s, p) => s + p.t, 0) / n;
      const my = fitSet.reduce((s, p) => s + p.y, 0) / n;
      let num = 0;
      let den = 0;
      for (const p of fitSet) {
        num += (p.t - mt) * (p.y - my);
        den += (p.t - mt) ** 2;
      }
      const slope = den ? num / den : 0; // AED/sqft per ms
      const intercept = my - slope * mt;
      const YEAR = 365.25 * 24 * 3600 * 1000;
      trend = {
        y0: intercept + slope * tMin,
        y1: intercept + slope * tMax,
        annualPct: my ? (slope * YEAR) / my : null,
      };
    }

    const extra = [...(refY ? [refY] : []), ...(trend ? [trend.y0, trend.y1] : [])];
    let yMin = Math.min(...ys, ...extra);
    let yMax = Math.max(...ys, ...extra);
    const pad = (yMax - yMin) * 0.1 || yMax * 0.1 || 1;
    yMin = Math.max(0, yMin - pad);
    yMax = yMax + pad;
    const x = (t: number) => (tMax === tMin ? IW / 2 : ((t - tMin) / (tMax - tMin)) * IW);
    const y = (v: number) => IH - ((v - yMin) / (yMax - yMin)) * IH;
    // median of comparable set (fallback to all)
    const base = (comp.length ? comp : pts).map((p) => p.y).sort((a, b) => a - b);
    const median = base.length ? base[Math.floor(base.length / 2)] : null;
    return { x, y, tMin, tMax, yMin, yMax, refY, median, trend };
  }, [pts, mode, listingPsqft]);

  const compCount = pts.filter((p) => p.comparable).length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">
          AED/sqft por transacción{" "}
          <span className="font-normal text-neutral-500">
            ({mode === "buy" ? "ventas" : "alquileres anuales"} del edificio · {pts.length})
          </span>
        </h3>
        <div className="flex overflow-hidden rounded-lg border border-neutral-300 text-xs dark:border-neutral-700">
          {(["buy", "rent"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setHover(null);
              }}
              className={`px-3 py-1 font-semibold ${
                mode === m
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {m === "buy" ? "Venta" : "Alquiler"}
            </button>
          ))}
        </div>
      </div>

      {!scales ? (
        <p className="py-10 text-center text-sm text-neutral-500">
          Sin transacciones de {mode === "buy" ? "venta" : "alquiler"} registradas.
        </p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img">
            <g transform={`translate(${M.left},${M.top})`}>
              {/* Y grid + labels */}
              {niceTicks(scales.yMin, scales.yMax, 5).map((v) => (
                <g key={v}>
                  <line x1={0} x2={IW} y1={scales.y(v)} y2={scales.y(v)} stroke="currentColor" strokeOpacity={0.12} />
                  <text x={-8} y={scales.y(v)} dy="0.32em" textAnchor="end" className="fill-neutral-500 text-[10px]">
                    {fmtAED(v)}
                  </text>
                </g>
              ))}
              {/* X labels */}
              {niceTicks(scales.tMin, scales.tMax, 5).map((t) => (
                <text
                  key={t}
                  x={scales.x(t)}
                  y={IH + 20}
                  textAnchor="middle"
                  className="fill-neutral-500 text-[10px]"
                >
                  {fmtMonth(t)}
                </text>
              ))}

              {/* median line */}
              {scales.median != null && (
                <line
                  x1={0}
                  x2={IW}
                  y1={scales.y(scales.median)}
                  y2={scales.y(scales.median)}
                  stroke={MUTED}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              )}
              {/* this-listing reference line (sale only) */}
              {scales.refY != null && (
                <>
                  <line
                    x1={0}
                    x2={IW}
                    y1={scales.y(scales.refY)}
                    y2={scales.y(scales.refY)}
                    stroke={REF}
                    strokeWidth={2}
                  />
                  <text x={IW} y={scales.y(scales.refY) - 5} textAnchor="end" className="text-[10px]" fill={REF}>
                    este anuncio {fmtAED(scales.refY)}
                  </text>
                </>
              )}

              {/* trend (least-squares) line */}
              {scales.trend && (
                <line
                  x1={scales.x(scales.tMin)}
                  x2={scales.x(scales.tMax)}
                  y1={scales.y(scales.trend.y0)}
                  y2={scales.y(scales.trend.y1)}
                  stroke={TREND}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              )}

              {/* points: muted first, comparable on top; small dot + invisible hit area */}
              {pts
                .slice()
                .sort((a, b) => Number(a.comparable) - Number(b.comparable))
                .map((p, i) => (
                  <g key={i}>
                    <circle
                      cx={scales.x(p.t)}
                      cy={scales.y(p.y)}
                      r={p.comparable ? 3 : 2}
                      fill={p.comparable ? ACCENT : MUTED}
                      stroke="#fff"
                      strokeWidth={p.comparable ? 1 : 0.5}
                      opacity={p.comparable ? 1 : 0.7}
                    />
                    <circle
                      cx={scales.x(p.t)}
                      cy={scales.y(p.y)}
                      r={8}
                      fill="transparent"
                      onMouseEnter={() => setHover({ p, x: scales.x(p.t), y: scales.y(p.y) })}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: "pointer" }}
                    />
                  </g>
                ))}
            </g>
          </svg>

          {hover && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
              style={{
                left: `calc(${((M.left + hover.x) / W) * 100}% + 8px)`,
                top: `calc(${((M.top + hover.y) / H) * 100}% - 8px)`,
                transform: hover.x > IW * 0.7 ? "translateX(-100%) translateX(-16px)" : undefined,
              }}
            >
              <div className="font-bold">{fmtAED(hover.p.y)} AED/sqft</div>
              <div className="text-neutral-500">
                {fmtDate(hover.p.t)} · {hover.p.bedrooms === 0 ? "Studio" : `${hover.p.bedrooms ?? "?"} hab`}
              </div>
              <div className="text-neutral-500">
                {fmtAED(hover.p.amount)} AED · {hover.p.size ? Math.round(hover.p.size) : "—"} sqft
              </div>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ACCENT }} />
              {listingSizeSqft != null ? "Tamaño similar (±20%)" : "Mismo nº de habitaciones"} ({compCount})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: MUTED }} />
              Otras unidades
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-4 border-t-[1.5px] border-dashed" style={{ borderColor: MUTED }} />
              Mediana
            </span>
            {scales.trend && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-4 border-t-[2.5px]" style={{ borderColor: TREND }} />
                <span style={{ color: TREND }} className="font-semibold">
                  Tendencia
                  {scales.trend.annualPct != null &&
                    ` (${scales.trend.annualPct >= 0 ? "+" : ""}${(scales.trend.annualPct * 100).toFixed(1)} %/año)`}
                </span>
              </span>
            )}
            {mode === "buy" && listingPsqft != null && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-4 border-t-2" style={{ borderColor: REF }} />
                Este anuncio
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
