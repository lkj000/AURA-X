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
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold tracking-tight text-white">
            AURA<span className="text-violet-400"> X</span>
          </span>
          <nav className="flex gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
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
        <span className="text-xs text-zinc-600">Okovanggo AI</span>
      </div>
    </header>
  );
}
