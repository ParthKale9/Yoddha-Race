"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePolling } from "@/lib/usePolling";
import { fmtTime } from "@/lib/format";
import type { LeaderRow, Station, StationRow } from "@/lib/types";
import Bib from "@/components/Bib";

type Tab = "male" | "female" | "stations";

export default function Leaderboard() {
  const [tab, setTab] = useState<Tab>("male");
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationRows, setStationRows] = useState<StationRow[]>([]);
  const [stationId, setStationId] = useState<number | null>(null);
  const [genderFilter, setGenderFilter] = useState<"male" | "female">("male");
  const [updated, setUpdated] = useState<Date | null>(null);

  usePolling(async () => {
    const [l, s, sl] = await Promise.all([
      supabase.from("leaderboard").select("*"),
      supabase.from("stations").select("*").order("position"),
      supabase.from("station_leaderboard").select("*"),
    ]);
    setRows((l.data as LeaderRow[]) ?? []);
    const st = (s.data as Station[]) ?? [];
    setStations(st);
    setStationId((cur) => cur ?? st[0]?.id ?? null);
    setStationRows((sl.data as StationRow[]) ?? []);
    setUpdated(new Date());
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "male", label: "Men" },
    { id: "female", label: "Women" },
    { id: "stations", label: "By station" },
  ];

  const genderRows = rows.filter((r) => r.gender === tab);
  const finished = genderRows.filter((r) => r.finished).sort((a, b) => (a.rank_gender ?? 999) - (b.rank_gender ?? 999));
  const onCourse = genderRows.filter((r) => !r.finished && r.stations_done > 0).sort((a, b) => b.stations_done - a.stations_done);

  const station = stations.find((s) => s.id === stationId);
  const stationList = stationRows
    .filter((r) => r.station_id === stationId && r.gender === genderFilter)
    .sort((a, b) => a.rank_gender - b.rank_gender);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="font-display text-4xl font-extrabold text-navy">Leaderboard</h1>
        <span className="text-xs text-navy/60">{updated ? `Updated ${updated.toLocaleTimeString()}` : "Loading..."}</span>
      </div>

      <div role="tablist" className="flex gap-1 border-b-2 border-navy/15">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-0.5 border-b-4 px-4 py-3 font-semibold ${tab === t.id ? "border-saffron text-navy" : "border-transparent text-navy/60 hover:text-navy"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "stations" ? (
        <>
          <table className="w-full bg-white text-left">
            <thead className="bg-navy text-white">
              <tr><th className="w-14 px-3 py-2">Rank</th><th className="px-3 py-2">Athlete</th><th className="px-3 py-2 text-right">Penalty</th><th className="px-3 py-2 text-right">Total time</th></tr>
            </thead>
            <tbody>
              {finished.map((r) => (
                <tr key={r.bib_no} className="border-b border-navy/10">
                  <td className="px-3 py-3 font-display text-2xl font-extrabold tabular-nums text-navy">{r.rank_gender}</td>
                  <td className="px-3 py-3"><Link href={`/athlete/${r.bib_no}`} className="flex items-center gap-2 hover:underline"><Bib no={r.bib_no} />{r.name}</Link></td>
                  <td className="px-3 py-3 text-right tabular-nums text-crimson">{r.penalty_seconds ? `+${r.penalty_seconds}s` : ""}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{fmtTime(r.total_seconds)}</td>
                </tr>
              ))}
              {finished.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-navy/60">No finishers yet. Times appear here as athletes complete the course.</td></tr>}
            </tbody>
          </table>

          {onCourse.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold text-navy">On the course</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {onCourse.map((r) => (
                  <li key={r.bib_no} className="flex items-center justify-between bg-white px-3 py-2">
                    <Link href={`/athlete/${r.bib_no}`} className="flex items-center gap-2 hover:underline"><Bib no={r.bib_no} />{r.name}</Link>
                    <span className="text-sm text-navy/70">{r.stations_done} of {stations.length} stations</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {stations.map((s) => (
              <button key={s.id} onClick={() => setStationId(s.id)}
                className={`px-3 py-2 text-sm font-semibold ${stationId === s.id ? "bg-navy text-white" : "bg-white text-navy hover:bg-navy/10"}`}>
                {s.position}. {s.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-navy/70">Loads differ, so men and women are ranked separately:</span>
            {(["male", "female"] as const).map((g) => (
              <button key={g} onClick={() => setGenderFilter(g)}
                className={`border px-3 py-1 ${genderFilter === g ? "border-saffron bg-saffron/20 font-semibold" : "border-navy/20"}`}>
                {g === "male" ? "Men" : "Women"}
              </button>
            ))}
          </div>
          <table className="w-full bg-white text-left">
            <thead className="bg-navy text-white">
              <tr><th className="w-14 px-3 py-2">Rank</th><th className="px-3 py-2">Athlete</th><th className="px-3 py-2 text-right">{station?.metric === "reps" ? "Reps" : "Time"}</th><th className="px-3 py-2 text-right">Penalty</th></tr>
            </thead>
            <tbody>
              {stationList.map((r) => (
                <tr key={r.bib_no} className="border-b border-navy/10">
                  <td className="px-3 py-3 font-display text-2xl font-extrabold tabular-nums text-navy">{r.rank_gender}</td>
                  <td className="px-3 py-3"><Link href={`/athlete/${r.bib_no}`} className="flex items-center gap-2 hover:underline"><Bib no={r.bib_no} />{r.name}</Link></td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{r.metric === "reps" ? `${r.reps ?? 0} (${fmtTime(r.duration_seconds)})` : fmtTime(r.duration_seconds + r.penalty_seconds)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-crimson">{r.penalty_seconds ? `+${r.penalty_seconds}s` : ""}</td>
                </tr>
              ))}
              {stationList.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-navy/60">No results at this station yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
