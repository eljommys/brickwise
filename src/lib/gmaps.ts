export interface GmapsPlace {
  name: string;
  lat: number;
  lon: number;
}

const SHORT_HOSTS = /(^|\.)(goo\.gl|maps\.app\.goo\.gl|g\.co)$/;

/** Follow a shortened Google Maps link (maps.app.goo.gl, goo.gl) to its full URL. */
async function expandShortLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (brickwise-local)" },
      signal: AbortSignal.timeout(10000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function decodePlaceName(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " ")).trim();
  } catch {
    return raw.replace(/\+/g, " ").trim();
  }
}

/** Pull {name, lat, lon} out of a full Google Maps URL string. */
function parseFullUrl(url: string): GmapsPlace | null {
  // Coordinates, best first: the place pin (!3d<lat>!4d<lon>), then the map
  // center (/@lat,lon), then a q=/ll= coordinate query.
  let lat: number | null = null;
  let lon: number | null = null;
  const pin = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const at = url.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const q = url.match(/[?&](?:q|ll|query|center)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  const coord = pin || at || q;
  if (coord) {
    lat = parseFloat(coord[1]);
    lon = parseFloat(coord[2]);
  }
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Name: /place/<name>/, then /maps/search/<name>/@, then a textual q=/query= param.
  let name = "";
  const place = url.match(/\/maps\/place\/([^/@]+)/);
  const search = url.match(/\/maps\/search\/([^/@?]+)\/@/);
  if (place) {
    name = decodePlaceName(place[1]);
  } else if (search) {
    name = decodePlaceName(search[1]);
  } else {
    const textq = url.match(/[?&](?:q|query)=([^&]+)/);
    if (textq && !/^-?\d+\.\d+,/.test(decodeURIComponent(textq[1]))) name = decodePlaceName(textq[1]);
  }
  if (!name) name = "Gimnasio";

  return { name, lat, lon };
}

/**
 * Resolve a pasted Google Maps link to a place. Expands short links first, then
 * extracts name + coordinates. Returns null if no coordinates can be found.
 */
export async function resolveGoogleMapsUrl(input: string): Promise<GmapsPlace | null> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const full = SHORT_HOSTS.test(url.hostname) ? await expandShortLink(url.href) : url.href;
  return parseFullUrl(full);
}
