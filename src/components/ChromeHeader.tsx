"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";

/** The map view is full-screen and provides its own navigation, so hide the
 *  global top bar there. */
export default function ChromeHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/favorites") || pathname.startsWith("/map")) return null;
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/85">
      <Nav />
    </header>
  );
}
