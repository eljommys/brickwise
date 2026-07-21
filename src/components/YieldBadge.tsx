import { fmtPct } from "@/lib/format";
import { yieldColor } from "@/lib/yieldColor";

export default function YieldBadge({ value, n }: { value: number | null; n?: number }) {
  if (value == null)
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        sin datos
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ background: yieldColor(value) }}
    >
      {fmtPct(value)}
      {n != null && <span className="font-normal opacity-80">({n} tx)</span>}
    </span>
  );
}
