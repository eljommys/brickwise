"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import YieldBadge from "@/components/YieldBadge";
import { fmtAED, fmtDist, fmtSqft } from "@/lib/format";

interface FavRow {
  id: string;
  url: string;
  title: string;
  price: number;
  size_sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string;
  tower_name: string | null;
  lat: number | null;
  lon: number | null;
  images: { small: string; medium: string }[];
  gross_yield: number | null;
  asking_yield: number | null;
  median_rent: number | null;
  median_sale_price: number | null;
  rent_n: number | null;
  buy_n: number | null;
  gym_distance_m: number | null;
  gym_name: string | null;
  price_per_sqft: number | null;
  notes: string;
}

const GYM_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M2 10h2v4H2zM5 8h2v8H5zM17 8h2v8h-2zM20 10h2v4h-2zM8 11h8v2H8z"/></svg>`;

function matchesBedFilter(r: { bedrooms: number | null }, bedFilter: number[]): boolean {
  return bedFilter.length === 0 || (r.bedrooms != null && bedFilter.includes(r.bedrooms));
}

// Yield color anchors: ≤6% red (mediocre) → 10%+ turquoise (espectacular),
// with 8–9% around the green middle (bueno).
const YIELD_LOW = 0.06;
const YIELD_HIGH = 0.1;

function yieldColor(y: number | null): string {
  if (y == null) return "#8a8a8a";
  const t = Math.min(1, Math.max(0, (y - YIELD_LOW) / (YIELD_HIGH - YIELD_LOW)));
  const hue = t * 174; // 0° red → 174° turquoise
  return `hsl(${Math.round(hue)}, 66%, 44%)`;
}

function popupHtml(r: FavRow): string {
  const img = r.images?.[0]?.medium || r.images?.[0]?.small;
  const yieldTxt = r.gross_yield != null ? (r.gross_yield * 100).toFixed(1) + " %" : "sin datos";
  return `
    <div style="width:230px">
      ${img ? `<img src="${img}" style="width:100%;height:120px;object-fit:cover;border-radius:8px" alt=""/>` : ""}
      <div style="font-weight:600;margin-top:6px;line-height:1.3">${r.title}</div>
      <div style="color:#666;font-size:12px;margin-top:2px">${r.tower_name ?? ""}</div>
      <div style="margin-top:4px;font-size:14px">
        Rentabilidad: <span style="color:${yieldColor(r.gross_yield)};font-weight:700">${yieldTxt}</span>
      </div>
      <div style="margin-top:6px;display:flex;gap:10px;font-size:12px">
        <a href="/listing/${r.id}">Ver análisis</a>
        <a href="${r.url}" target="_blank" rel="noopener noreferrer">PF ↗</a>
      </div>
    </div>`;
}

const MIN_W = 320;
const MAX_W = 760;

const SAVED_URL = "https://www.propertyfinder.ae/en/user/saved-properties";

// Bookmarklet: run on the Property Finder "saved properties" page (logged in) to
// collect every saved listing URL and copy them to the clipboard. String.raw keeps
// the regex backslashes intact; it is set on the link imperatively because React
// strips javascript: hrefs.
const BOOKMARKLET = String.raw`javascript:(function(){var u=new Set();document.querySelectorAll('a[href]').forEach(function(a){var h=(a.href||'').split('?')[0];if(/\/plp\/.*-\d+\.html$/.test(h))u.add(h)});try{var n=document.getElementById('__NEXT_DATA__');if(n){(JSON.stringify(JSON.parse(n.textContent)).match(/https?:\/\/[^"']*\/plp\/[^"']*-\d+\.html/g)||[]).forEach(function(x){u.add(x.split('?')[0])})}}catch(e){}var l=[...u];if(!l.length){alert('No encontre pisos guardados aqui. Abre tu pagina de Guardados de Property Finder con la sesion iniciada.');return}var t=l.join('\n');if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){alert(l.length+' piso(s) copiados. Abre Brickwise y pulsa "Pegar de Property Finder".')},function(){prompt('Copia estos enlaces y pegalos en Brickwise:',t)})}else{prompt('Copia estos enlaces y pegalos en Brickwise:',t)}})();`;

export default function FavoritesMapPage() {
  const [rows, setRows] = useState<FavRow[] | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showSync, setShowSync] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [sidebarW, setSidebarW] = useState(() => {
    if (typeof window === "undefined") return 440;
    const saved = Number(localStorage.getItem("bw-sidebar-w"));
    return saved >= MIN_W && saved <= MAX_W ? saved : 440;
  });
  const [mapReady, setMapReady] = useState(false);
  const [gymsVisible, setGymsVisible] = useState(false);
  const [gymsLoading, setGymsLoading] = useState(false);
  const [gymCount, setGymCount] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"yield" | "price">("yield");
  const [bedFilter, setBedFilter] = useState<number[]>([]);

  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const gymLayerRef = useRef<LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const didFitRef = useRef(false);
  const processing = useRef(false);
  const bookmarkletRef = useRef<HTMLAnchorElement | null>(null);

  // React refuses to render javascript: hrefs, so set it via the DOM.
  useEffect(() => {
    if (showSync && bookmarkletRef.current) bookmarkletRef.current.setAttribute("href", BOOKMARKLET);
  }, [showSync]);

  const load = useCallback(
    () =>
      fetch("/api/favorites")
        .then((r) => r.json())
        .then((j) => setRows(j.results || []))
        .catch(() => setRows([])),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  // --- Map creation (once) -------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        center: [25.1, 55.2],
        zoom: 11,
        zoomControl: true,
        scrollWheelZoom: false, // replaced by the trackpad handler below
        zoomSnap: 0, // allow fractional zoom for smooth pinch
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;

      // Trackpad gestures: two-finger scroll pans in 2D, pinch zooms.
      // Browsers report a trackpad pinch as a wheel event with ctrlKey set.
      const el = map.getContainer();
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          const rect = el.getBoundingClientRect();
          const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
          map.setZoomAround(point, map.getZoom() - e.deltaY * 0.01, { animate: false });
        } else {
          const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
          map.panBy([e.deltaX * scale, e.deltaY * scale], { animate: false });
        }
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      map.on("remove", () => el.removeEventListener("wheel", onWheel));
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        const w = containerRef.current?.clientWidth ?? 0;
        if ((w > 300 && document.readyState === "complete") || tries > 30) {
          clearInterval(timer);
          map.invalidateSize();
          setMapReady(true);
        }
      }, 100);
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(containerRef.current);
      map.on("remove", () => {
        clearInterval(timer);
        ro.disconnect();
      });
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
      gymLayerRef.current = null;
      didFitRef.current = false;
      setMapReady(false);
    };
  }, []);

  // --- Property markers: kept in sync with the favorites list --------------
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady || !rows) return;
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
    const bounds: [number, number][] = [];
    for (const r of rows) {
      if (r.lat == null || r.lon == null) continue;
      const y = r.gross_yield != null ? (r.gross_yield * 100).toFixed(1) + "%" : "—";
      const icon = L.divIcon({
        className: "",
        html: `<div class="bw-pin" style="--pin-color:${yieldColor(r.gross_yield)}"><div class="bw-pin-label">${y}</div><div class="bw-pin-tail"></div></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker([r.lat, r.lon], { icon })
        .addTo(map)
        .bindPopup(popupHtml(r), { maxWidth: 260, offset: [0, -34] });
      marker.on("mouseover", () => {
        setHoveredId(r.id);
        document.getElementById(`fav-${r.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      marker.on("mouseout", () => setHoveredId(null));
      markersRef.current[r.id] = marker;
      bounds.push([r.lat, r.lon]);
    }
    if (!didFitRef.current && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      didFitRef.current = true;
    }
  }, [rows, mapReady]);

  // --- Bidirectional hover highlight ---------------------------------------
  useEffect(() => {
    for (const [id, m] of Object.entries(markersRef.current)) {
      const pin = m.getElement()?.querySelector(".bw-pin");
      pin?.classList.toggle("bw-pin--hl", id === hoveredId);
      m.setZIndexOffset(id === hoveredId ? 1000 : 0);
    }
  }, [hoveredId]);

  // --- Filter: dim (darker + transparent) the markers that don't match -----
  useEffect(() => {
    const byId = new Map((rows ?? []).map((r) => [r.id, r]));
    for (const [id, m] of Object.entries(markersRef.current)) {
      const r = byId.get(id);
      const dim = !!r && !matchesBedFilter(r, bedFilter);
      m.getElement()?.querySelector(".bw-pin")?.classList.toggle("bw-pin--dim", dim);
    }
  }, [bedFilter, rows, mapReady]);

  // --- Add-by-URL queue ----------------------------------------------------
  useEffect(() => {
    if (processing.current || queue.length === 0) return;
    processing.current = true;
    fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: queue[0] }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      })
      .catch((e) => setErrors((prev) => [...prev, `${queue[0]} → ${(e as Error).message}`]))
      .finally(() => {
        processing.current = false;
        setQueue((prev) => prev.slice(1));
        load();
      });
  }, [queue, load]);

  const enqueueUrls = (raw: string): number => {
    const urls = raw
      .split(/[\n\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("http") && /propertyfinder\.ae/.test(s));
    if (urls.length) {
      setErrors([]);
      setQueue((prev) => [...prev, ...urls]);
    }
    return urls.length;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (enqueueUrls(input) > 0) setInput("");
  };

  const pasteFromPf = async () => {
    setSyncMsg(null);
    try {
      const text = await navigator.clipboard.readText();
      const n = enqueueUrls(text);
      setSyncMsg(
        n > 0
          ? `${n} piso${n === 1 ? "" : "s"} en cola — analizando y añadiendo…`
          : "El portapapeles no tenía enlaces de Property Finder. Ejecuta el marcador en tu página de Guardados primero."
      );
    } catch {
      setSyncMsg("No pude leer el portapapeles. Pega los enlaces manualmente en el cuadro de arriba.");
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/favorites?id=${id}`, { method: "DELETE" });
    load();
  };

  const saveNotes = (id: string, notes: string) => {
    fetch("/api/favorites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, notes }),
    }).catch(() => {});
  };

  const focus = (r: FavRow) => {
    const marker = markersRef.current[r.id];
    if (mapRef.current && marker && r.lat != null && r.lon != null) {
      mapRef.current.flyTo([r.lat, r.lon], Math.max(mapRef.current.getZoom(), 15), { duration: 0.6 });
      marker.openPopup();
    }
  };

  const toggleGyms = async () => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (gymLayerRef.current) {
      if (gymsVisible) map.removeLayer(gymLayerRef.current);
      else gymLayerRef.current.addTo(map);
      setGymsVisible(!gymsVisible);
      return;
    }
    setGymsLoading(true);
    try {
      const res = await fetch("/api/gyms");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const layer = L.layerGroup();
      for (const g of j.gyms as { name: string; lat: number; lon: number }[]) {
        const icon = L.divIcon({
          className: "",
          html: `<div class="bw-gym">${GYM_SVG}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        const safeName = g.name.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
        // Link to the exact coordinates, not a text search: a name search gets biased
        // to the viewer's own location (e.g. Andorra), while coordinates always drop
        // the pin on this gym's spot in Dubai.
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${g.lat}%2C${g.lon}`;
        L.marker([g.lat, g.lon], { icon })
          .bindPopup(
            `<b>${safeName}</b><br><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:12px">Ver en Google Maps ↗</a>`,
            { offset: [0, -16] }
          )
          .addTo(layer);
      }
      layer.addTo(map);
      gymLayerRef.current = layer;
      setGymCount(j.gyms.length);
      setGymsVisible(true);
    } catch {
      setGymCount(null);
    } finally {
      setGymsLoading(false);
    }
  };

  // --- Resizable divider ---------------------------------------------------
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarW;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX));
      setSidebarW(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("bw-sidebar-w", String(w));
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const busy = queue.length > 0;

  const sorted = [...(rows ?? [])].sort((a, b) =>
    sortBy === "price"
      ? a.price - b.price
      : (b.gross_yield ?? -1) - (a.gross_yield ?? -1)
  );
  const visible = sorted.filter((r) => matchesBedFilter(r, bedFilter));
  const dimmed = sorted.filter((r) => !matchesBedFilter(r, bedFilter));
  const bedOptions = Array.from(
    new Set((rows ?? []).map((r) => r.bedrooms).filter((b): b is number => b != null))
  ).sort((a, b) => a - b);
  const bedLabel = (b: number) => (b === 0 ? "Studio" : String(b));
  const toggleBed = (b: number) =>
    setBedFilter((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));

  const renderCard = (r: FavRow, dim = false) => (
    <div
      key={r.id}
      id={`fav-${r.id}`}
      onMouseEnter={() => setHoveredId(r.id)}
      onMouseLeave={() => setHoveredId(null)}
      className={`border-b border-neutral-100 p-3 transition-colors dark:border-neutral-800 ${
        hoveredId === r.id ? "bg-blue-50 dark:bg-neutral-800" : ""
      } ${dim ? "opacity-40 grayscale" : ""}`}
    >
      <div className="flex gap-3">
        {r.images?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.images[0].small}
            alt=""
            onClick={() => focus(r)}
            className="h-16 w-24 shrink-0 cursor-pointer rounded-lg object-cover"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={() => focus(r)}
              className="line-clamp-1 text-left font-sans text-sm font-semibold normal-case tracking-normal hover:underline"
              title="Centrar en el mapa"
            >
              {r.title}
            </button>
            <button
              onClick={() => remove(r.id)}
              title="Quitar de favoritos"
              className="shrink-0 rounded-md px-1.5 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            >
              ✕
            </button>
          </div>
          <div className="truncate text-xs text-neutral-500">
            {r.tower_name} · {r.bedrooms === 0 ? "Studio" : `${r.bedrooms ?? "?"} hab`} / {r.bathrooms ?? "?"} baños ·{" "}
            {fmtSqft(r.size_sqft)}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <YieldBadge value={r.gross_yield} n={r.rent_n ?? undefined} />
            {r.asking_yield != null && (
              <span className="text-xs text-neutral-500">s/ anuncio: {(r.asking_yield * 100).toFixed(1)} %</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-neutral-600 dark:text-neutral-400">
        <span>
          Precio: <b className="text-neutral-900 dark:text-neutral-100">{fmtAED(r.price)}</b>
        </span>
        <span>AED/sqft: {r.price_per_sqft ? Math.round(r.price_per_sqft) : "—"}</span>
        <span>
          Renta mediana: {fmtAED(r.median_rent)}
          {r.rent_n ? ` (${r.rent_n})` : ""}
        </span>
        <span>
          Venta mediana: {fmtAED(r.median_sale_price)}
          {r.buy_n ? ` (${r.buy_n})` : ""}
        </span>
        <span title={r.gym_name ?? undefined}>Gym: {fmtDist(r.gym_distance_m)}</span>
        <span className="flex gap-2">
          <Link href={`/listing/${r.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Ver análisis
          </Link>
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            PF ↗
          </a>
        </span>
      </div>

      <textarea
        className="mt-2 h-9 w-full resize-none rounded-md border border-transparent bg-neutral-50 px-2 py-1 text-xs outline-none focus:border-neutral-300 dark:bg-neutral-950 dark:focus:border-neutral-700"
        defaultValue={r.notes}
        placeholder="notas…"
        onBlur={(e) => saveNotes(r.id, e.target.value)}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* ------------------------------------------------ sidebar */}
      <aside
        style={{ width: sidebarW }}
        suppressHydrationWarning
        className="flex min-h-0 shrink-0 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center gap-3 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <Link href="/" className="font-brand text-sm font-bold tracking-tight">
            Brickwise
          </Link>
          <span className="ml-auto flex items-center gap-1 text-xs">
            <Link href="/" className="btn-font rounded-full px-2.5 py-1 font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
              Analizados
            </Link>
          </span>
        </div>
        <div className="border-b border-neutral-200 p-3 dark:border-neutral-800">
          <form onSubmit={submit}>
            <textarea
              className="h-14 w-full resize-none rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-950"
              placeholder="Pega enlaces de Property Finder (uno por línea) y pulsa Añadir…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="mt-2 flex flex-col gap-1.5">
              <button
                type="submit"
                disabled={!input.trim() || busy}
                className="w-full rounded-lg bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {busy ? `Analizando ${queue.length}…` : "Añadir y analizar"}
              </button>
              <button
                type="button"
                onClick={toggleGyms}
                disabled={gymsLoading || (rows?.length ?? 0) === 0}
                className="w-full rounded-lg border border-neutral-300 py-2 text-xs font-semibold hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {gymsLoading
                  ? "Buscando…"
                  : gymCount != null
                    ? gymsVisible
                      ? `Ocultar gyms (${gymCount})`
                      : `Mostrar gyms (${gymCount})`
                    : "Gimnasios"}
              </button>
              <button
                type="button"
                onClick={() => setShowSync((v) => !v)}
                className={`w-full rounded-lg border py-2 text-xs font-semibold ${
                  showSync
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                }`}
              >
                Sincronizar con PF
              </button>
            </div>
            {errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-red-600 dark:text-red-400">
                {errors.map((er, i) => (
                  <li key={i} className="break-all">
                    {er}
                  </li>
                ))}
              </ul>
            )}
          </form>

          {showSync && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-[12px] leading-relaxed dark:border-blue-900 dark:bg-blue-950/40">
              <p className="font-semibold">Traer tus guardados de Property Finder</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                <li>
                  Arrastra este botón a tu barra de marcadores (solo la primera vez):{" "}
                  <a
                    ref={bookmarkletRef}
                    onClick={(e) => e.preventDefault()}
                    className="mx-0.5 inline-block cursor-grab rounded bg-neutral-900 px-2 py-0.5 font-bold text-white dark:bg-white dark:text-neutral-900"
                    draggable
                  >
                    Guardados a Brickwise
                  </a>
                </li>
                <li>
                  Abre tu{" "}
                  <a href={SAVED_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline dark:text-blue-400">
                    página de Guardados
                  </a>{" "}
                  (con tu sesión de PF) y pulsa el marcador: copia tus pisos.
                </li>
                <li>
                  Vuelve aquí y pulsa{" "}
                  <button
                    type="button"
                    onClick={pasteFromPf}
                    className="rounded bg-blue-600 px-2 py-0.5 font-bold text-white hover:bg-blue-500"
                  >
                    Pegar de Property Finder
                  </button>
                </li>
              </ol>
              {syncMsg && <p className="mt-2 font-medium text-blue-700 dark:text-blue-300">{syncMsg}</p>}
              <p className="mt-2 text-[11px] text-neutral-500">
                Los que ya tengas no se duplican; los nuevos se analizan uno a uno.
              </p>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows == null ? (
            <p className="animate-pulse p-4 text-sm text-neutral-500">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              No hay favoritos aún. Pega arriba un enlace de Property Finder o usa Sincronizar con PF.
            </p>
          ) : (
            <>
              {/* sort + bedroom filter */}
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-neutral-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
                <span className="btn-font text-[10px] text-neutral-500">Ordenar</span>
                {(["yield", "price"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSortBy(k)}
                    className={`rounded px-2 py-0.5 text-[11px] ${
                      sortBy === k
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                        : "border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {k === "yield" ? "Rentabilidad" : "Precio"}
                  </button>
                ))}
                {bedOptions.length > 0 && (
                  <>
                    <span className="btn-font ml-2 text-[10px] text-neutral-500">Hab</span>
                    {bedOptions.map((b) => (
                      <button
                        key={b}
                        onClick={() => toggleBed(b)}
                        className={`rounded px-2 py-0.5 text-[11px] ${
                          bedFilter.includes(b)
                            ? "bg-blue-600 text-white"
                            : "border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                        }`}
                      >
                        {bedLabel(b)}
                      </button>
                    ))}
                    {bedFilter.length > 0 && (
                      <button onClick={() => setBedFilter([])} className="px-1 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                        Limpiar
                      </button>
                    )}
                  </>
                )}
              </div>

              {visible.map((r) => renderCard(r))}

              {bedFilter.length > 0 && dimmed.length > 0 && (
                <>
                  <div className="btn-font border-y border-neutral-200 bg-neutral-100 px-3 py-1.5 text-[10px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
                    No coinciden con el filtro ({dimmed.length})
                  </div>
                  {dimmed.map((r) => renderCard(r, true))}
                </>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ------------------------------------------------ divider */}
      <div
        onMouseDown={startDrag}
        title="Arrastra para redimensionar"
        className="w-1.5 shrink-0 cursor-col-resize bg-neutral-200 transition-colors hover:bg-blue-400 dark:bg-neutral-800 dark:hover:bg-blue-600"
      />

      {/* ------------------------------------------------ map */}
      <div className="relative min-h-0 min-w-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute bottom-4 left-3 z-[500] rounded border border-black/10 bg-white/90 px-2.5 py-2 text-neutral-700 shadow-lg dark:border-white/10 dark:bg-neutral-900/90 dark:text-neutral-200">
          <div className="btn-font mb-1 text-[9px] text-neutral-500">Rentabilidad anual</div>
          <div
            className="h-2 w-52 rounded-sm"
            style={{ background: "linear-gradient(90deg, hsl(0,66%,44%), hsl(87,66%,44%), hsl(174,66%,44%))" }}
          />
          <div className="mt-1 flex w-52 justify-between text-[10px] font-semibold">
            <span>Mediocre</span>
            <span>Bueno</span>
            <span>Espectacular</span>
          </div>
          <div className="flex w-52 justify-between text-[9px] text-neutral-500">
            <span>≤6%</span>
            <span>8–9%</span>
            <span>10%+</span>
          </div>
        </div>
      </div>
    </div>
  );
}
