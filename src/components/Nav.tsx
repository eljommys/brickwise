"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/favorites", label: "⭐ Favoritos + Mapa" },
  { href: "/", label: "📊 Analizados" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex h-14 w-full max-w-[1800px] items-center gap-2 px-4">
      <Link href="/" className="font-brand mr-4 flex items-center gap-2 text-lg font-bold tracking-tight">
        🧱 Brickwise
      </Link>
      {ITEMS.map((it) => {
        const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`btn-font rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
