"use client";

import { useState } from "react";
import FiltersForm from "@/components/FiltersForm";
import ListingCard, { CardListing } from "@/components/ListingCard";
import { AnalysisRow, SearchFilters } from "@/lib/types";

export default function SearchPage() {
  const [results, setResults] = useState<CardListing[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisRow>>({});
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxGymM, setMaxGymM] = useState<number | undefined>(undefined);

  const search = async (f: SearchFilters) => {
    setSearching(true);
    setError(null);
    setResults([]);
    setAnalyses({});
    setMaxGymM(f.maxGymDistanceM);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setResults(j.results);
      const cached: Record<string, AnalysisRow> = {};
      for (const r of j.results) if (r.analysis) cached[r.id] = r.analysis;
      setAnalyses(cached);
      setTotalCount(j.totalCount);
      setDuplicatesRemoved(j.duplicatesRemoved ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const visible = results.filter((r) => {
    if (maxGymM == null) return true;
    const a = analyses[r.id];
    if (!a) return true; // keep while analysis pending
    return a.gym_distance_m != null && a.gym_distance_m <= maxGymM;
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
      <h1 className="text-2xl font-bold">Buscar inmuebles</h1>
      <FiltersForm onSearch={search} searching={searching} />

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Error: {error}
        </div>
      )}

      {totalCount != null && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {visible.length} mostrados de {results.length} únicos ({totalCount.toLocaleString()} en Property Finder)
          {duplicatesRemoved > 0 && (
            <span className="ml-1 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {duplicatesRemoved} duplicado{duplicatesRemoved === 1 ? "" : "s"} agrupado{duplicatesRemoved === 1 ? "" : "s"}
            </span>
          )}
          . Pulsa <span className="font-semibold">⚡ Analizar</span> en los inmuebles que te interesen (los ya analizados
          muestran su rentabilidad al instante).
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((r) => (
          <ListingCard
            key={r.id}
            listing={r}
            analysis={analyses[r.id] ?? null}
            onAnalyzed={(id, a) => setAnalyses((prev) => ({ ...prev, [id]: a }))}
          />
        ))}
      </div>
    </div>
  );
}
