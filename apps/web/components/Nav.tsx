"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/launch", label: "Launch" },
  { href: "/", label: "Studio" },
  { href: "/generate", label: "Generate" },
  { href: "/amapianorize", label: "Analyse" },
  { href: "/tracks", label: "Tracks" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/earnings", label: "Earnings" },
  { href: "/onboarding", label: "Sign up" },
  { href: "/dataset", label: "Dataset" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
      {/* AT 390px THE DOCUMENT MEASURED 788px WIDE AND THIS NAV CLIPPED.
          A row of non-wrapping links in a fixed-width container forces the whole PAGE to overflow, so
          every view scrolls sideways — not just the nav. `min-w-0` lets the flex child shrink below its
          content width (flex items default to min-width:auto, which is what prevented it), the nav
          scrolls on its own axis, and the two fixed elements are held with `shrink-0` so they are not
          squeezed to nothing instead. */}
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-6 min-w-0">
          <span className="font-bold tracking-tight text-white shrink-0">
            AURA<span className="text-violet-400"> X</span>
          </span>
          <nav className="flex gap-1 overflow-x-auto scrollbar-none min-w-0">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "whitespace-nowrap",
                  "px-3 py-1.5 rounded text-sm transition-colors",
                  path === l.href
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <span className="text-xs text-zinc-600 shrink-0 hidden sm:inline">Okovanggo AI</span>
      </div>
    </header>
  );
}
