"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import YieldBadge from "@/components/YieldBadge";
import { fmtAED, fmtDist, fmtSqft } from "@/lib/format";
import { yieldColor } from "@/lib/yieldColor";

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
  description: string | null;
  notes: string;
}

interface GymRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  url: string | null;
  added_at: string;
}

const MORE_SVG = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M11 8v6M8 11h6M20 20l-3.5-3.5" />
  </svg>
);

const GYM_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M2 10h2v4H2zM5 8h2v8H5zM17 8h2v8h-2zM20 10h2v4h-2zM8 11h8v2H8z"/></svg>`;
const CAFE_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M4 8h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z"/><path d="M16 9h2a2 2 0 0 1 0 4h-2"/><path d="M6 3v2M10 3v2M14 3v2"/></svg>`;

function matchesBedFilter(r: { bedrooms: number | null }, bedFilter: number[]): boolean {
  return bedFilter.length === 0 || (r.bedrooms != null && bedFilter.includes(r.bedrooms));
}

function popupHtml(r: FavRow): string {
  const img = r.images?.[0]?.medium || r.images?.[0]?.small;
  const yieldTxt = r.asking_yield != null ? (r.asking_yield * 100).toFixed(1) + " %" : "sin datos";
  return `
    <div style="width:230px">
      ${img ? `<img src="${img}" style="width:100%;height:120px;object-fit:cover;border-radius:8px" alt=""/>` : ""}
      <div style="font-weight:600;margin-top:6px;line-height:1.3">${r.title}</div>
      <div style="color:#666;font-size:12px;margin-top:2px">${r.tower_name ?? ""}</div>
      <div style="margin-top:4px;font-size:14px">
        Rentabilidad: <span style="color:${yieldColor(r.asking_yield)};font-weight:700">${yieldTxt}</span>
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

// leaflet.heat's radius is in screen pixels, so a fixed value shrinks in real-world
// terms as you zoom in. Scale it by 2^(Δzoom) from a reference zoom so the geographic
// influence grows as you zoom in — but HARD-CAP it: an uncapped radius becomes a
// district-sized disc whose brush gets clipped at the canvas edge, showing as hard
// "growing quarter-circles". The cap keeps every bloom a smooth, localized spot.
const HEAT_REF_ZOOM = 13;
const HEAT_REF_RADIUS = 26;
const HEAT_MIN_RADIUS = 14;
const HEAT_MAX_RADIUS = 70;
function heatRadiusForZoom(zoom: number): { radius: number; blur: number } {
  const scale = Math.pow(2, zoom - HEAT_REF_ZOOM);
  const radius = Math.min(HEAT_MAX_RADIUS, Math.max(HEAT_MIN_RADIUS, HEAT_REF_RADIUS * scale));
  return { radius, blur: Math.round(radius * 0.75) };
}

function LayerToggle({
  label,
  color,
  loading,
  visible,
  count,
  onToggle,
}: {
  label: string;
  color: string;
  loading: boolean;
  visible: boolean;
  count: number | null;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      className="btn-font flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] hover:bg-neutral-100 disabled:opacity-60 dark:hover:bg-neutral-800"
    >
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border"
        style={{ background: visible ? color : "transparent", borderColor: color, opacity: 0.85 }}
      >
        {visible && (
          <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 6" />
          </svg>
        )}
      </span>
      <span className="flex-1 text-left">{label}</span>
      <span className="text-neutral-500">{loading ? "Buscando…" : count != null ? count : ""}</span>
    </button>
  );
}

export default function FavoritesMapPage() {
  const [rows, setRows] = useState<FavRow[] | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showSync, setShowSync] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [skippedMsg, setSkippedMsg] = useState<string | null>(null);
  const [sidebarW, setSidebarW] = useState(() => {
    if (typeof window === "undefined") return 440;
    const saved = Number(localStorage.getItem("bw-sidebar-w"));
    return saved >= MIN_W && saved <= MAX_W ? saved : 440;
  });
  const [mapReady, setMapReady] = useState(false);
  const [gymsVisible, setGymsVisible] = useState(false);
  const [savedGyms, setSavedGyms] = useState<GymRow[]>([]);
  const [gymInput, setGymInput] = useState("");
  const [gymBusy, setGymBusy] = useState(false);
  const [gymError, setGymError] = useState<string | null>(null);
  const [cafesVisible, setCafesVisible] = useState(false);
  const [cafesLoading, setCafesLoading] = useState(false);
  const [cafeCount, setCafeCount] = useState<number | null>(null);
  const [heatKind, setHeatKind] = useState<"rent" | "buy" | null>(null);
  const [heatLoading, setHeatLoading] = useState<"rent" | "buy" | null>(null);
  const [heatMax, setHeatMax] = useState<number | null>(null);
  const [heatError, setHeatError] = useState<string | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [sortBy, setSortBy] = useState<"yield" | "price">("yield");
  const [bedFilter, setBedFilter] = useState<number[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const gymLayerRef = useRef<LayerGroup | null>(null);
  const cafeLayerRef = useRef<LayerGroup | null>(null);
  const heatLayerRef = useRef<import("leaflet").Layer | null>(null);
  const heatBusyRef = useRef(false); // synchronous re-entry guard for the heat toggle
  // Spiderfy state: same-building favorites share exact coordinates, so their pins
  // stack. On hover the group fans out around a dot at the building, with legs.
  const groupsRef = useRef<Map<string, string[]>>(new Map()); // groupKey -> listing ids
  const groupOfRef = useRef<Map<string, string>>(new Map()); // listing id -> groupKey
  const origLatLngRef = useRef<Map<string, [number, number]>>(new Map());
  const spiderLayerRef = useRef<LayerGroup | null>(null); // legs + center dot
  const spiderOpenRef = useRef<string | null>(null);
  const spiderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unspiderfyRef = useRef<() => void>(() => {});
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

  // Load the user's saved gyms once (local DB, cheap).
  useEffect(() => {
    fetch("/api/gyms")
      .then((r) => r.json())
      .then((j) => setSavedGyms(j.gyms || []))
      .catch(() => setSavedGyms([]));
  }, []);

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
        // leaflet.heat ghosts (duplicate shifted blobs) during the animated-zoom
        // transform; snap zoom so the heat canvas redraws cleanly at each zoom end.
        zoomAnimation: false,
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

      // Pixel-space spider offsets stop making sense once the zoom changes.
      map.on("zoomstart", () => unspiderfyRef.current());

      // Keep the heat influence constant in real-world size across zoom levels:
      // rescale the pixel radius whenever the zoom settles.
      map.on("zoomend", () => {
        const layer = heatLayerRef.current as unknown as {
          setOptions?: (o: Record<string, unknown>) => void;
        } | null;
        if (!layer?.setOptions) return;
        layer.setOptions(heatRadiusForZoom(map.getZoom()));
      });
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
      cafeLayerRef.current = null;
      didFitRef.current = false;
      setMapReady(false);
    };
  }, []);

  // --- Spiderfy: fan out stacked same-building pins on hover ---------------
  // All of these read refs only, so the instances captured by long-lived marker
  // handlers never go stale.
  const cancelCollapse = () => {
    if (spiderTimerRef.current) {
      clearTimeout(spiderTimerRef.current);
      spiderTimerRef.current = null;
    }
  };

  const unspiderfy = () => {
    cancelCollapse();
    const key = spiderOpenRef.current;
    if (!key) return;
    for (const id of groupsRef.current.get(key) ?? []) {
      const m = markersRef.current[id];
      const ll = origLatLngRef.current.get(id);
      if (m && ll) {
        m.setLatLng(ll);
        m.setZIndexOffset(0);
      }
    }
    if (spiderLayerRef.current) mapRef.current?.removeLayer(spiderLayerRef.current);
    spiderLayerRef.current = null;
    spiderOpenRef.current = null;
  };
  useEffect(() => {
    unspiderfyRef.current = unspiderfy;
  });

  const scheduleCollapse = () => {
    cancelCollapse();
    spiderTimerRef.current = setTimeout(unspiderfy, 250);
  };

  const spiderfy = (key: string) => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (spiderOpenRef.current === key) return; // already open
    unspiderfy();
    const ids = groupsRef.current.get(key);
    if (!ids || ids.length < 2) return;
    const anchor = origLatLngRef.current.get(ids[0]);
    if (!anchor) return;
    const p0 = map.latLngToLayerPoint(anchor);
    const radius = Math.min(90, 34 + 14 * ids.length);
    const layer = L.layerGroup();
    ids.forEach((id, i) => {
      const m = markersRef.current[id];
      if (!m) return;
      // Fan across the upper semicircle (pins are labels anchored bottom-center).
      const a = ((-160 + (140 * i) / Math.max(1, ids.length - 1)) * Math.PI) / 180;
      const ll = map.layerPointToLatLng(
        L.point(p0.x + radius * Math.cos(a), p0.y + radius * Math.sin(a))
      );
      m.setLatLng(ll);
      m.setZIndexOffset(2000);
      L.polyline([anchor, [ll.lat, ll.lng]], { color: "#b84f30", weight: 1.5, opacity: 0.8 }).addTo(layer);
    });
    // Dot marking the building itself.
    L.marker(anchor, {
      icon: L.divIcon({ className: "", html: `<div class="bw-spider-dot"></div>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
      interactive: false,
    }).addTo(layer);
    layer.addTo(map);
    spiderLayerRef.current = layer;
    spiderOpenRef.current = key;
  };

  // --- Property markers: kept in sync with the favorites list --------------
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady || !rows) return;
    unspiderfy(); // stale spider legs/dot must not survive a marker rebuild
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
    groupsRef.current = new Map();
    groupOfRef.current = new Map();
    origLatLngRef.current = new Map();
    const bounds: [number, number][] = [];
    for (const r of rows) {
      if (r.lat == null || r.lon == null) continue;
      // Same-building listings share exact coordinates: group them for spiderfy.
      const groupKey = `${r.lat.toFixed(5)},${r.lon.toFixed(5)}`;
      groupsRef.current.set(groupKey, [...(groupsRef.current.get(groupKey) ?? []), r.id]);
      groupOfRef.current.set(r.id, groupKey);
      origLatLngRef.current.set(r.id, [r.lat, r.lon]);
      const y = r.asking_yield != null ? (r.asking_yield * 100).toFixed(1) + "%" : "—";
      const icon = L.divIcon({
        className: "",
        html: `<div class="bw-pin" style="--pin-color:${yieldColor(r.asking_yield)}"><div class="bw-pin-label">${y}</div><div class="bw-pin-tail"></div></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker([r.lat, r.lon], { icon })
        .addTo(map)
        .bindPopup(popupHtml(r), { maxWidth: 260, offset: [0, -34] });
      marker.on("mouseover", () => {
        cancelCollapse();
        if ((groupsRef.current.get(groupKey)?.length ?? 0) > 1) spiderfy(groupKey);
        setHoveredId(r.id);
        document.getElementById(`fav-${r.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      marker.on("mouseout", () => {
        setHoveredId(null);
        scheduleCollapse();
      });
      markersRef.current[r.id] = marker;
      bounds.push([r.lat, r.lon]);
    }
    if (!didFitRef.current && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      didFitRef.current = true;
    }
    // spiderfy/unspiderfy/scheduleCollapse read refs only — never stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mapReady]);

  // --- Bidirectional hover highlight ---------------------------------------
  useEffect(() => {
    const spiderKey = spiderOpenRef.current;
    for (const [id, m] of Object.entries(markersRef.current)) {
      const pin = m.getElement()?.querySelector(".bw-pin");
      pin?.classList.toggle("bw-pin--hl", id === hoveredId);
      // Don't stomp the raised z-index of a fanned-out group.
      const inOpenGroup = spiderKey != null && groupOfRef.current.get(id) === spiderKey;
      m.setZIndexOffset(id === hoveredId ? 3000 : inOpenGroup ? 2000 : 0);
    }
    // Hovering a list card whose pin is stacked: fan the group out so it's visible.
    if (hoveredId) {
      const gk = groupOfRef.current.get(hoveredId);
      if (gk && (groupsRef.current.get(gk)?.length ?? 0) > 1) {
        cancelCollapse();
        spiderfy(gk);
      }
    } else {
      scheduleCollapse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Same id extraction the server does (parseListingUrl in the API route).
  const listingIdOf = (u: string): string | null => {
    try {
      const p = new URL(u).pathname;
      const m = p.match(/-(\d+)\.html$/) || p.match(/\/(\d+)(?:\/)?$/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  };

  const enqueueUrls = (raw: string): { added: number; skipped: number } => {
    const urls = raw
      .split(/[\n\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("http") && /propertyfinder\.ae/.test(s));
    // Discard the ones already saved (and de-dupe the paste itself) so only new
    // listings get analysed — no wasted scrape/round-trip on ones we already have.
    const have = new Set((rows ?? []).map((r) => r.id));
    const seen = new Set<string>();
    const fresh: string[] = [];
    let skipped = 0;
    for (const u of urls) {
      const id = listingIdOf(u);
      if (id && (have.has(id) || seen.has(id))) {
        skipped++;
        continue;
      }
      if (id) seen.add(id);
      fresh.push(u);
    }
    if (fresh.length) {
      setErrors([]);
      setQueue((prev) => [...prev, ...fresh]);
    }
    setSkippedMsg(skipped > 0 ? `${skipped} ya guardado${skipped === 1 ? "" : "s"}, descartado${skipped === 1 ? "" : "s"}.` : null);
    return { added: fresh.length, skipped };
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { added, skipped } = enqueueUrls(input);
    if (added > 0 || skipped > 0) setInput("");
  };

  const pasteFromPf = async () => {
    setSyncMsg(null);
    try {
      const text = await navigator.clipboard.readText();
      const { added, skipped } = enqueueUrls(text);
      setSyncMsg(
        added > 0
          ? `${added} piso${added === 1 ? "" : "s"} nuevo${added === 1 ? "" : "s"} en cola — analizando y añadiendo…${skipped > 0 ? ` (${skipped} ya guardado${skipped === 1 ? "" : "s"})` : ""}`
          : skipped > 0
            ? `Los ${skipped} piso${skipped === 1 ? "" : "s"} del portapapeles ya estaban guardados. Nada nuevo que analizar.`
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

  // Build a Leaflet layer of POI markers (gyms / cafés) with a Google Maps popup.
  const buildPoiLayer = (
    L: typeof import("leaflet"),
    items: { name: string; lat: number; lon: number }[],
    cssClass: string,
    svg: string
  ) => {
    const layer = L.layerGroup();
    for (const p of items) {
      const icon = L.divIcon({ className: "", html: `<div class="${cssClass}">${svg}</div>`, iconSize: [0, 0], iconAnchor: [0, 0] });
      const safeName = p.name.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
      // Business name in the query, exact spot in the /@lat,lon path (not the query text):
      // a named POI opens its own Maps place card; the coordinates never clutter the search
      // box and only bias the map to Dubai so the right branch/spot is what's shown.
      const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(p.name)}/@${p.lat},${p.lon},17z`;
      L.marker([p.lat, p.lon], { icon })
        .bindPopup(
          `<b>${safeName}</b><br><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:12px">Ver en Google Maps ↗</a>`,
          { offset: [0, -16] }
        )
        .addTo(layer);
    }
    return layer;
  };

  const togglePoi = async (opts: {
    api: string;
    dataKey: string;
    cssClass: string;
    svg: string;
    layerRef: React.MutableRefObject<LayerGroup | null>;
    visible: boolean;
    setVisible: (v: boolean) => void;
    setLoading: (v: boolean) => void;
    setCount: (v: number | null) => void;
  }) => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (opts.layerRef.current) {
      if (opts.visible) map.removeLayer(opts.layerRef.current);
      else opts.layerRef.current.addTo(map);
      opts.setVisible(!opts.visible);
      return;
    }
    opts.setLoading(true);
    try {
      const res = await fetch(opts.api);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const items = j[opts.dataKey] as { name: string; lat: number; lon: number }[];
      const layer = buildPoiLayer(L, items, opts.cssClass, opts.svg);
      layer.addTo(map);
      opts.layerRef.current = layer;
      opts.setCount(items.length);
      opts.setVisible(true);
    } catch {
      opts.setCount(null);
    } finally {
      opts.setLoading(false);
    }
  };

  // --- Manual gyms (user-curated via Google Maps links) --------------------
  const buildGymLayer = (L: typeof import("leaflet"), gyms: GymRow[]) => {
    const layer = L.layerGroup();
    for (const g of gyms) {
      const icon = L.divIcon({ className: "", html: `<div class="bw-gym">${GYM_SVG}</div>`, iconSize: [0, 0], iconAnchor: [0, 0] });
      const safeName = g.name.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
      const mapsUrl = g.url || `https://www.google.com/maps/search/${encodeURIComponent(g.name)}/@${g.lat},${g.lon},17z`;
      L.marker([g.lat, g.lon], { icon })
        .bindPopup(
          `<b>${safeName}</b><br><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:12px">Ver en Google Maps ↗</a>`,
          { offset: [0, -16] }
        )
        .addTo(layer);
    }
    return layer;
  };

  // Push a gym set to state and, if the layer is showing, rebuild it in place.
  const applyGyms = (gyms: GymRow[]) => {
    setSavedGyms(gyms);
    const map = mapRef.current;
    const L = leafletRef.current;
    if (map && L && gymsVisible) {
      if (gymLayerRef.current) map.removeLayer(gymLayerRef.current);
      const layer = buildGymLayer(L, gyms);
      layer.addTo(map);
      gymLayerRef.current = layer;
    }
  };

  const toggleGyms = () => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (gymsVisible) {
      if (gymLayerRef.current) map.removeLayer(gymLayerRef.current);
      setGymsVisible(false);
    } else {
      if (gymLayerRef.current) map.removeLayer(gymLayerRef.current);
      const layer = buildGymLayer(L, savedGyms);
      layer.addTo(map);
      gymLayerRef.current = layer;
      setGymsVisible(true);
    }
  };

  const addGymFromLink = async () => {
    const url = gymInput.trim();
    if (!url) return;
    setGymBusy(true);
    setGymError(null);
    try {
      const res = await fetch("/api/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const list = await (await fetch("/api/gyms")).json();
      applyGyms(list.gyms || []);
      setGymInput("");
    } catch (e) {
      setGymError((e as Error).message);
    } finally {
      setGymBusy(false);
    }
  };

  const deleteGym = async (id: string) => {
    try {
      await fetch(`/api/gyms?id=${id}`, { method: "DELETE" });
      const list = await (await fetch("/api/gyms")).json();
      applyGyms(list.gyms || []);
    } catch {
      /* leave the list as-is on failure */
    }
  };

  const toggleCafes = () =>
    togglePoi({
      api: "/api/cafes", dataKey: "cafes", cssClass: "bw-cafe", svg: CAFE_SVG,
      layerRef: cafeLayerRef, visible: cafesVisible, setVisible: setCafesVisible, setLoading: setCafesLoading, setCount: setCafeCount,
    });

  // Liquidity heatmap: DLD transactions per tower (last 12 months) as a heat surface.
  // Rent and sale are separate markets, so only one kind shows at a time.
  const toggleLiquidity = async (kind: "rent" | "buy") => {
    const map = mapRef.current;
    if (!map || !leafletRef.current) return;
    // Ignore clicks while a layer is still loading — otherwise a second fetch
    // would add a second (orphaned) heat canvas that never gets removed and
    // shows as a duplicate circle that doesn't rescale on zoom.
    if (heatBusyRef.current) return;
    // Clicking the active kind turns it off.
    if (heatKind === kind) {
      if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
      setHeatKind(null);
      return;
    }
    // Switching kinds: drop the current layer first.
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }
    heatBusyRef.current = true;
    setHeatLoading(kind);
    setHeatError(null);
    try {
      const res = await fetch(`/api/liquidity?kind=${kind}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await import("leaflet.heat").catch(() => {
        throw new Error("Falta la dependencia del mapa de calor. Cierra la app y vuelve a arrancarla para que se instale.");
      }); // patches L.heatLayer
      const max = j.max || 1;
      setHeatMax(j.max ?? null);
      // Each favorite blooms proportionally to its tower's recent activity; a small
      // floor keeps even low-liquidity listings visible as a faint mark.
      const pts = (j.points as { lat: number; lon: number; weight: number }[]).map(
        (p) => [p.lat, p.lon, Math.max(0.15, p.weight / max)] as [number, number, number]
      );
      type HeatFn = (latlngs: [number, number, number][], opts?: Record<string, unknown>) => import("leaflet").Layer;
      const Lmod = leafletRef.current as unknown as { heatLayer?: HeatFn; default?: { heatLayer?: HeatFn } };
      const heatLayer = Lmod.heatLayer ?? Lmod.default?.heatLayer;
      if (!heatLayer) throw new Error("plugin de calor no disponible");
      const { radius, blur } = heatRadiusForZoom(map.getZoom());
      const layer = heatLayer(pts, {
        radius,
        blur,
        max: 1,
        minOpacity: 0.4, // lower = softer bloom edges (no hard disc boundary)
        // Yellow (low) → purple (high).
        gradient: { 0.15: "#fef08a", 0.4: "#fde047", 0.65: "#d946ef", 1.0: "#7c3aed" },
      });
      layer.addTo(map);
      heatLayerRef.current = layer;
      setHeatKind(kind);
    } catch (e) {
      setHeatKind(null);
      setHeatError((e as Error).message || "No se pudo cargar el mapa de calor.");
    } finally {
      setHeatLoading(null);
      heatBusyRef.current = false;
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
      : (b.asking_yield ?? -1) - (a.asking_yield ?? -1)
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
              onClick={() => setExpandedId((id) => (id === r.id ? null : r.id))}
              className="flex min-w-0 items-center gap-1 text-left font-sans text-sm font-semibold normal-case tracking-normal hover:underline"
              title="Ver previsualización"
            >
              <span className="truncate">{r.title}</span>
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`shrink-0 text-neutral-400 transition-transform ${expandedId === r.id ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
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
            <YieldBadge value={r.asking_yield} n={r.rent_n ?? undefined} />
            {r.gross_yield != null && (
              <span className="text-xs text-neutral-500">mercado: {(r.gross_yield * 100).toFixed(1)} %</span>
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

      {/* Preview desplegable al pulsar el título */}
      {expandedId === r.id && (
        <div className="mt-2 rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
          {r.images.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {r.images.slice(0, 10).map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={img.medium} alt="" className="h-24 w-36 shrink-0 rounded object-cover" loading="lazy" />
              ))}
            </div>
          )}
          {r.description && (
            <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-xs text-neutral-500">{r.description}</p>
          )}
          <Link
            href={`/listing/${r.id}`}
            className="btn-font mt-2 inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
          >
            {MORE_SVG} Ver más
          </Link>
        </div>
      )}

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
            <Link href="/pipeline" className="btn-font rounded-full px-2.5 py-1 font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
              Pipeline
            </Link>
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
              {skippedMsg && (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{skippedMsg}</p>
              )}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLayers((v) => !v)}
                  disabled={(rows?.length ?? 0) === 0}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-neutral-300 py-2 text-xs font-semibold hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Capas del mapa
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showLayers ? "rotate-180" : ""}`}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {showLayers && (
                  <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
                    <p className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-neutral-400">Puntos cercanos</p>
                    <LayerToggle label="Gimnasios" color="#b84f30" loading={false} visible={gymsVisible} count={savedGyms.length || null} onToggle={toggleGyms} />
                    {/* Manual gym management: paste a Google Maps link */}
                    <div className="px-2 pb-1.5 pt-0.5">
                      <div className="flex gap-1">
                        <input
                          value={gymInput}
                          onChange={(e) => setGymInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addGymFromLink();
                            }
                          }}
                          placeholder="Pega enlace de Google Maps del gym…"
                          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-950"
                        />
                        <button
                          type="button"
                          onClick={addGymFromLink}
                          disabled={gymBusy || !gymInput.trim()}
                          className="btn-font rounded bg-blue-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                        >
                          {gymBusy ? "…" : "Añadir"}
                        </button>
                      </div>
                      {gymError && <p className="mt-1 text-[10px] leading-tight text-red-600 dark:text-red-400">{gymError}</p>}
                      {savedGyms.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {savedGyms.map((g) => (
                            <li key={g.id} className="flex items-center gap-1 text-[11px]">
                              <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: "#b84f30" }} />
                              <span className="flex-1 truncate" title={g.name}>{g.name}</span>
                              <button
                                type="button"
                                onClick={() => deleteGym(g.id)}
                                title="Eliminar"
                                className="shrink-0 px-1 text-neutral-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <LayerToggle label="Cafeterías" color="#6f4e37" loading={cafesLoading} visible={cafesVisible} count={cafeCount} onToggle={toggleCafes} />
                    <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
                    <p className="px-2 pb-0.5 pt-0.5 text-[10px] uppercase tracking-wide text-neutral-400">Mapa de calor de liquidez media anual</p>
                    <LayerToggle label="Alquiler" color="#d946ef" loading={heatLoading === "rent"} visible={heatKind === "rent"} count={null} onToggle={() => toggleLiquidity("rent")} />
                    <LayerToggle label="Venta" color="#7c3aed" loading={heatLoading === "buy"} visible={heatKind === "buy"} count={null} onToggle={() => toggleLiquidity("buy")} />
                    {heatKind && (
                      <p className="px-2 pb-1 pt-0.5 text-[10px] leading-tight text-neutral-500">
                        {heatKind === "rent" ? "Contratos de alquiler" : "Ventas"} (DLD) por edificio, media al año. Amarillo = poco líquido, morado = mucha actividad.
                      </p>
                    )}
                    {heatError && (
                      <p className="px-2 pb-1 pt-0.5 text-[10px] leading-tight text-red-600 dark:text-red-400">{heatError}</p>
                    )}
                  </div>
                )}
              </div>
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
        {heatKind && (
          <div className="pointer-events-none absolute bottom-4 left-3 z-[500] rounded border border-black/10 bg-white/90 px-2.5 py-2 text-neutral-700 shadow-lg dark:border-white/10 dark:bg-neutral-900/90 dark:text-neutral-200">
            <div className="btn-font mb-1 text-[9px] text-neutral-500">
              Liquidez media anual · {heatKind === "rent" ? "contratos" : "ventas"}/año
            </div>
            <div
              className="h-2 w-52 rounded-sm"
              style={{ background: "linear-gradient(90deg, #fef08a, #fde047, #d946ef, #7c3aed)" }}
            />
            <div className="mt-1 flex w-52 justify-between text-[10px] font-semibold">
              <span>0</span>
              {heatMax != null && <span>{Math.round(heatMax / 2)}</span>}
              {heatMax != null && <span>{Math.round(heatMax)}</span>}
            </div>
            <div className="flex w-52 justify-between text-[9px] text-neutral-500">
              <span>parado</span>
              <span>activo</span>
            </div>
            <div className="mt-0.5 w-52 text-[9px] leading-tight text-neutral-400">
              {heatKind === "rent" ? "Contratos de alquiler" : "Ventas"} en el DLD por edificio, media de operaciones por año.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
