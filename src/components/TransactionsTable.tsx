import { fmtAED, fmtDate, fmtSqft } from "@/lib/format";
import { TxRow } from "@/lib/pf/transactions";

export default function TransactionsTable({ title, rows, kind }: { title: string; rows: TxRow[]; kind: "buy" | "rent" }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-3 text-sm font-bold">
        {title} <span className="font-normal text-neutral-500">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Sin transacciones registradas.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Fecha</th>
                <th className="py-1.5 pr-3 font-semibold">{kind === "rent" ? "Renta anual" : "Precio"}</th>
                <th className="py-1.5 pr-3 font-semibold">Tamaño</th>
                <th className="py-1.5 pr-3 font-semibold">Hab</th>
                <th className="py-1.5 font-semibold">Unidad</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap font-medium">{fmtAED(t.amount)}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{fmtSqft(t.size_sqft)}</td>
                  <td className="py-1.5 pr-3">{t.bedrooms ?? "—"}</td>
                  <td className="py-1.5">{t.unit ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
