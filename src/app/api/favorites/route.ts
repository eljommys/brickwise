import { NextRequest, NextResponse } from "next/server";
import { analyzeListing } from "@/lib/analyze";
import { addFavorite, listFavorites, removeFavorite, setFavoriteNotes } from "@/lib/store";

function serialize(rows: ReturnType<typeof listFavorites>) {
  return rows.map((r) => ({
    ...r,
    images: JSON.parse(r.images_json),
    amenities: JSON.parse(r.amenities_json),
  }));
}

export async function GET() {
  try {
    return NextResponse.json({ results: serialize(listFavorites()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Accepts any propertyfinder.ae listing URL and extracts the numeric listing id. */
function parseListingUrl(raw: string): { id: string; url: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("URL no válida");
  }
  if (!/(^|\.)propertyfinder\.ae$/.test(url.hostname)) {
    throw new Error("La URL debe ser de propertyfinder.ae");
  }
  const m = url.pathname.match(/-(\d+)\.html$/) || url.pathname.match(/\/(\d+)(?:\/)?$/);
  if (!m) throw new Error("No encuentro el id del anuncio en la URL (pega el enlace de la ficha del inmueble)");
  return { id: m[1], url: url.origin + url.pathname };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, url } = parseListingUrl(String(body.url || ""));
    const { listing, analysis } = await analyzeListing(id, url);
    addFavorite(listing.id);
    return NextResponse.json({
      listing: { ...listing, images: JSON.parse(listing.images_json), amenities: JSON.parse(listing.amenities_json) },
      analysis,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    setFavoriteNotes(String(body.id), String(body.notes ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new Error("id requerido");
    removeFavorite(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
