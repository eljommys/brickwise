"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import YieldBadge from "@/components/YieldBadge";
import { fmtAED, fmtDist, fmtSqft } from "@/lib/format";

interface Row {
  id: string;
  url: string;
  title: string;
  price: number;
  size_sqft: number | null;
  bedrooms: number | null;
  property_type: string;
  tower_name: string | null;
  images: { small: string; medium: string }[];
  gross_yield: number | null;
  asking_yield: number | null;
  median_rent: number | null;
  median_sale_price: number | null;
  rent_n: number;
  buy_n: number;
  gym_distance_m: number | null;
  computed_at: string | null;
}

type SortKey = "gross_yield" | "asking_yield" | "price" | "gym_distance_m";

export default function Dashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("gross_yield");
  const [asc, setAsc] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((j) => setRows(j.results || []))
      .catch(() => setRows([]));
  }, []);

  const sorted = useMemo(() => {
    if (!rows) return null;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, sortKey, asc]);

  const header = (label: string, key: SortKey) => (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
      onClick={() => {
        if (sortKey === key) setAsc(!asc);
        else {
          setSortKey(key);
          setAsc(key === "gym_distance_m");
        }
      }}
    >
      {label} {sortKey === key ? (asc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inmuebles analizados</h1>
        <Link
          href="/favorites"
          className="btn-font rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
        >
          + Añadir inmuebles
        </Link>
      </div>

      {sorted == null ? (
        <p className="animate-pulse text-neutral-500">Cargando…</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700">
          Aún no hay inmuebles analizados. Añade enlaces de Property Finder en{" "}
          <Link href="/favorites" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
            ⭐ Favoritos + Mapa
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-500">Inmueble</th>
                {header("Rentabilidad", "gross_yield")}
                {header("s/ anuncio", "asking_yield")}
                {header("Precio", "price")}
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-500">Venta mediana</th>
                {header("Gym", "gym_distance_m")}
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-500">Renta mediana</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {r.images?.[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.images[0].small} alt="" className="h-12 w-16 rounded-md object-cover" loading="lazy" />
                      )}
                      <div className="min-w-0">
                        <Link href={`/listing/${r.id}`} className="line-clamp-1 font-medium hover:underline">
                          {r.title}
                        </Link>
                        <div className="text-xs text-neutral-500">
                          {r.tower_name} · {r.bedrooms === 0 ? "Studio" : `${r.bedrooms ?? "?"} hab`} · {fmtSqft(r.size_sqft)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <YieldBadge value={r.gross_yield} n={r.rent_n} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.asking_yield != null ? (r.asking_yield * 100).toFixed(1) + " %" : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{fmtAED(r.price)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtAED(r.median_sale_price)}
                    {r.buy_n ? <span className="ml-1 text-xs text-neutral-500">({r.buy_n})</span> : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDist(r.gym_distance_m)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtAED(r.median_rent)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      PF ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
