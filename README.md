# 🧱 Brickwise

App web local (Next.js) para buscar inmuebles en venta en [Property Finder UAE](https://www.propertyfinder.ae) y analizar su **rentabilidad bruta de alquiler** con el histórico real de transacciones DLD (compra y alquiler) del propio edificio.

## Arranque en un comando

App **100% local**: el servidor y la base de datos corren en tu máquina, sin nube. Solo necesitas
tener [Node.js](https://nodejs.org) 18.18+ instalado.

```bash
npx brickwise
```

Eso es todo: **instala las dependencias y arranca** (la primera vez tarda ~1 min instalando),
elige un puerto libre y abre la app en tu navegador. No hay nada más que configurar.

<details>
<summary>¿Prefieres clonarlo?</summary>

```bash
git clone https://github.com/eljommys/brickwise.git
cd brickwise
npm install
npm run dev      # → http://localhost:3000
```
</details>

### Base de datos local

Todo (favoritos, análisis, transacciones, ubicaciones, gimnasios) se guarda en un único fichero
**SQLite** en **`~/.brickwise/brickwise.db`** (en tu carpeta de usuario). Se crea solo al primer uso
y **persiste entre reinicios y actualizaciones**. Para copia de seguridad o mover tus datos, basta con
**copiar ese fichero**. Puedes cambiar su ubicación con la variable de entorno `BRICKWISE_DB`.

## Qué hace

- **/search** — buscador con filtros: ubicación (autocompletado local con las +16k ubicaciones de PF), precio, superficie, habitaciones, baños, tipo, amenities (gimnasio, parking, piscina…) y distancia máxima al gimnasio externo más cercano (OpenStreetMap).
- Cada resultado se analiza en segundo plano: se scrapea la ficha del anuncio y el histórico completo de transacciones de su torre (`/en/transactions/{buy|rent}/dubai/{torre}`), y se calcula:
  - **Rentabilidad bruta** = mediana de rentas anuales (últimos 24 meses, mismas habitaciones) / precio del anuncio.
  - **Valor de mercado estimado** = mediana AED/sqft de ventas × superficie, y % de prima/descuento del precio frente a ese valor.
  - **Distancia al gimnasio más cercano** vía Overpass (OSM), con caché.
- **/listing/[id]** — ficha con galería de fotos, métricas desglosadas, tablas de transacciones de venta y alquiler del edificio y enlace al anuncio original.
- **/** — dashboard persistente con todo lo analizado, ordenable por rentabilidad, precio, prima vs mercado o distancia al gym.

## Cómo scrapea

Property Finder es una app Next.js: cada página embebe sus datos en `<script id="__NEXT_DATA__">`. Basta un `fetch` con User-Agent de navegador (sin headless):

- Búsqueda: `/en/search?l={locId}&c=1&pf=&pt=&af=&at=&bdr[]=&am[]=&t=&page=`
- Ficha: `share_url` del anuncio → `propertyResult.property` (incluye `similar_price_transactions` como fallback).
- Transacciones: `/en/transactions/{buy|rent}/dubai/{slug}?page=` (paginado, tope 10 págs por tipo).
- Ubicaciones: `/api/pwa/location/list` (~7,5k filas) + ancestros derivados de los paths → tabla `locations`.

Scraping educado: cola global a **1 req/s**, retry con backoff, caché en SQLite (transacciones 7 días, gimnasios 30 días, análisis 24 h).

## Estructura

```
src/lib/pf/        cliente HTTP, parser __NEXT_DATA__, search, listing, transactions, locations
src/lib/yield.ts   cálculo de rentabilidad (medianas, ventana 24 meses, muestra por habitaciones/tamaño)
src/lib/gyms.ts    gimnasio más cercano vía Overpass/OSM con caché
src/lib/db.ts      SQLite (better-sqlite3) + esquema
src/app/api/       /api/search, /api/listing/[id], /api/locations, /api/dashboard
src/app/           páginas: dashboard, search, listing/[id]
```

## Notas

- Uso personal/local. Respeta los términos de Property Finder: no elevar el rate-limit ni desplegarlo público.
- La rentabilidad es **bruta** (sin service charges, vacancy ni costes de compra). Los tamaños muestrales (`N tx`) se muestran como indicador de confianza.
