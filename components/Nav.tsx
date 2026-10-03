"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/register", label: "Register" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/volunteer", label: "Volunteers" },
  { href: "/admin", label: "Admin" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="bg-navy-deep text-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Yoddha Race" width={36} height={36} className="h-9 w-9" priority />
          <span className="font-display text-2xl font-extrabold tracking-tight text-saffron">Yoddha</span>
          <span className="hidden text-sm text-white/70 sm:inline">Athletes Fitness Club</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded px-3 py-2 ${path.startsWith(l.href) ? "bg-saffron/20 font-semibold text-saffron" : "text-white/80 hover:bg-white/10"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
