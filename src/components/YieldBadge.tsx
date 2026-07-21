import { fmtPct } from "@/lib/format";

export default function YieldBadge({ value, n }: { value: number | null; n?: number }) {
  if (value == null)
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        sin datos
      </span>
    );
  const color =
    value >= 0.07
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : value >= 0.055
        ? "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300"
        : value >= 0.04
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {fmtPct(value)}
      {n != null && <span className="font-normal opacity-70">({n} tx)</span>}
    </span>
  );
}
