"use client";

import { useEffect, useRef, useState } from "react";
import { SearchFilters } from "@/lib/types";

const AMENITIES = [
  { value: "SY", label: "Gimnasio compartido" },
  { value: "PY", label: "Gimnasio privado" },
  { value: "CP", label: "Parking cubierto" },
  { value: "SP", label: "Piscina compartida" },
  { value: "PP", label: "Piscina privada" },
  { value: "BA", label: "Balcón" },
  { value: "AC", label: "A/C central" },
  { value: "MR", label: "Cuarto de servicio" },
  { value: "BW", label: "Armarios empotrados" },
  { value: "ST", label: "Estudio/despacho" },
  { value: "VW", label: "Vistas al agua" },
  { value: "PA", label: "Mascotas" },
];

const PROPERTY_TYPES = [
  { value: "", label: "Cualquiera" },
  { value: "1", label: "Apartamento" },
  { value: "35", label: "Villa" },
  { value: "22", label: "Townhouse" },
  { value: "20", label: "Penthouse" },
  { value: "24", label: "Dúplex" },
];

const BEDROOM_OPTS = ["0", "1", "2", "3", "4", "5"];

interface LocOption {
  id: string;
  name: string;
  path_name: string;
}

export default function FiltersForm({
  onSearch,
  searching,
}: {
  onSearch: (f: SearchFilters) => void;
  searching: boolean;
}) {
  const [locQuery, setLocQuery] = useState("");
  const [locOptions, setLocOptions] = useState<LocOption[]>([]);
  const [location, setLocation] = useState<LocOption | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");
  const [bedrooms, setBedrooms] = useState<string[]>([]);
  const [propertyTypeId, setPropertyTypeId] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [maxGymKm, setMaxGymKm] = useState("");
  const [maxPages, setMaxPages] = useState("2");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (locQuery.trim().length < 2 || locQuery === location?.name) {
        setLocOptions([]);
        return;
      }
      fetch(`/api/locations?q=${encodeURIComponent(locQuery)}`)
        .then((r) => r.json())
        .then((j) => setLocOptions(j.locations || []))
        .catch(() => {});
    }, 250);
  }, [locQuery, location]);

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      locationId: location?.id,
      locationLabel: location ? `${location.name} (${location.path_name})` : "Dubai",
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      minArea: minArea ? Number(minArea) : undefined,
      maxArea: maxArea ? Number(maxArea) : undefined,
      bedrooms: bedrooms.length ? bedrooms : undefined,
      propertyTypeId: propertyTypeId || undefined,
      amenities: amenities.length ? amenities : undefined,
      maxGymDistanceM: maxGymKm ? Number(maxGymKm) * 1000 : undefined,
      maxPages: Number(maxPages) || 2,
    });
  };

  const inputCls =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <form onSubmit={submit} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Ubicación</label>
          <input
            className={inputCls}
            placeholder="Ciudad, zona o edificio (p. ej. Dubai Marina)"
            value={locQuery}
            onChange={(e) => {
              setLocQuery(e.target.value);
              setLocation(null);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
          />
          {showDropdown && locOptions.length > 0 && (
            <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              {locOptions.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onClick={() => {
                      setLocation(o);
                      setLocQuery(o.name);
                      setShowDropdown(false);
                    }}
                  >
                    <span className="font-medium">{o.name}</span>
                    <span className="ml-2 text-xs text-neutral-500">{o.path_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Tipo</label>
          <select className={inputCls} value={propertyTypeId} onChange={(e) => setPropertyTypeId(e.target.value)}>
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Páginas a scrapear (×25)</label>
          <select className={inputCls} value={maxPages} onChange={(e) => setMaxPages(e.target.value)}>
            {["1", "2", "3", "4", "5"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Precio mín. (AED)</label>
          <input className={inputCls} type="number" min="0" placeholder="500000" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Precio máx. (AED)</label>
          <input className={inputCls} type="number" min="0" placeholder="2000000" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Superficie mín. (sqft)</label>
          <input className={inputCls} type="number" min="0" placeholder="800" value={minArea} onChange={(e) => setMinArea(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Superficie máx. (sqft)</label>
          <input className={inputCls} type="number" min="0" placeholder="1500" value={maxArea} onChange={(e) => setMaxArea(e.target.value)} />
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Habitaciones</label>
        <div className="flex flex-wrap gap-2">
          {BEDROOM_OPTS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => toggle(bedrooms, b, setBedrooms)}
              className={`rounded-full border px-3 py-1 text-sm ${
                bedrooms.includes(b)
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            >
              {b === "0" ? "Studio" : b === "5" ? "5+" : b}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Características</label>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => toggle(amenities, a.value, setAmenities)}
              className={`rounded-full border px-3 py-1 text-xs ${
                amenities.includes(a.value)
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            Dist. máx. a gimnasio externo (km, opcional)
          </label>
          <input
            className={inputCls}
            type="number"
            step="0.1"
            min="0"
            placeholder="p. ej. 0.5"
            value={maxGymKm}
            onChange={(e) => setMaxGymKm(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="ml-auto rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {searching ? "Scrapeando…" : "Buscar en Property Finder"}
        </button>
      </div>
    </form>
  );
}
