"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Station } from "@/lib/types";
import { RUN_METERS } from "@/lib/config";
import Image from "next/image";

export default function Home() {
  const [stations, setStations] = useState<Station[]>([]);
  useEffect(() => {
    supabase.from("stations").select("*").order("position").then(({ data }) => setStations((data as Station[]) ?? []));
  }, []);

  return (
    <div className="space-y-10">
      <section className="-mx-4 -mt-6 bg-navy px-4 py-14 text-white">
        <div className="mx-auto max-w-5xl">
          <Image src="/logo.png" alt="" width={110} height={110} className="mb-4 h-24 w-24 sm:h-28 sm:w-28" priority />
          <h1 className="font-display text-6xl font-extrabold leading-none tracking-tight sm:text-8xl">
            Yoddha Race
          </h1>
          <p className="mt-4 max-w-md text-lg text-white/80">
            {stations.length || 7} stations, a {RUN_METERS} m run between each, and one clock that never stops.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary text-lg">Register to race</Link>
            <Link href="/leaderboard" className="btn border border-white/40 text-white hover:bg-white/10">See the leaderboard</Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-3xl font-extrabold text-navy">The course</h2>
        <p className="mt-1 text-sm text-navy/70">Do the stations in this order, with a {RUN_METERS} m run between each. Your total time covers the runs and includes any penalties.</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {stations.map((s) => (
            <li key={s.id} className="flex items-start gap-4 border-l-4 border-saffron bg-white px-4 py-3">
              <span className="font-display text-3xl font-extrabold tabular-nums text-navy">{s.position}</span>
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-sm text-navy/70">Men: {s.spec_male ?? "–"}</div>
                <div className="text-sm text-navy/70">Women: {s.spec_female ?? "–"}</div>
              </div>
            </li>
          ))}
        </ol>
        {stations.length === 0 && <p className="mt-4 text-navy/60">Course details will appear here soon.</p>}
      </section>

      <section className="bg-white px-5 py-5">
        <h2 className="font-display text-2xl font-extrabold text-navy">Event details</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-navy/60">Date</dt><dd className="font-semibold">11 October 2026</dd></div>
          <div><dt className="text-navy/60">Venue</dt><dd className="font-semibold">Athletes Fitness Club, Bibvewadi, Pune</dd></div>
          <div><dt className="text-navy/60">Categories</dt><dd className="font-semibold">Men and Women</dd></div>
        </dl>
      </section>
    </div>
  );
}
