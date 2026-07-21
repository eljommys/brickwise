import { NextRequest, NextResponse } from "next/server";
import { addGym, listGyms, removeGym } from "@/lib/store";
import { resolveGoogleMapsUrl } from "@/lib/gmaps";

/** User-saved gyms (curated manually, not from OSM). */
export async function GET() {
  try {
    return NextResponse.json({ gyms: listGyms() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Add a gym from a pasted Google Maps link. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = String(body.url || "").trim();
    if (!url) throw new Error("Pega el enlace de Google Maps del gimnasio.");
    const place = await resolveGoogleMapsUrl(url);
    if (!place) {
      throw new Error("No pude extraer la ubicación del enlace. Usa el enlace del sitio en Google Maps (con coordenadas).");
    }
    const gym = addGym({ name: place.name, lat: place.lat, lon: place.lon, url });
    return NextResponse.json({ gym });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new Error("id requerido");
    removeGym(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
