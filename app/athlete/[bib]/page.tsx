"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePolling } from "@/lib/usePolling";
import { fmtTime } from "@/lib/format";
import type { LeaderRow, RunSplit, Station, StationRow } from "@/lib/types";
import { RUN_METERS } from "@/lib/config";
import { Fragment } from "react";
import Bib from "@/components/Bib";

export default function AthleteProfile() {
  const { bib } = useParams<{ bib: string }>();
  const [me, setMe] = useState<LeaderRow | null>(null);
  const [splits, setSplits] = useState<StationRow[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [runs, setRuns] = useState<RunSplit[]>([]);
  const [loaded, setLoaded] = useState(false);

  usePolling(async () => {
    const [l, s, st, rn] = await Promise.all([
      supabase.from("leaderboard").select("*").eq("bib_no", Number(bib)).maybeSingle(),
      supabase.from("station_leaderboard").select("*").eq("bib_no", Number(bib)),
      supabase.from("stations").select("*").order("position"),
      supabase.from("run_splits").select("*").eq("bib_no", Number(bib)),
    ]);
    setRuns((rn.data as RunSplit[]) ?? []);
    setMe((l.data as LeaderRow) ?? null);
    setSplits((s.data as StationRow[]) ?? []);
    setStations((st.data as Station[]) ?? []);
    setLoaded(true);
  }, 8000);

  if (!loaded) return <p className="text-navy/60">Loading...</p>;
  if (!me) return <p className="bg-white p-6">No athlete found with bib {bib}. Check the number and try again.</p>;

  const genderLabel = me.gender === "male" ? "Men" : "Women";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 bg-navy p-5 text-white">
        <Bib no={me.bib_no} size="lg" />
        <div>
          <h1 className="font-display text-3xl font-extrabold">{me.name}</h1>
          <p className="text-white/70">{genderLabel} category</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`Rank in ${genderLabel}`} value={me.finished ? `#${me.rank_gender}` : "–"} />
        <Stat label="Overall rank" value={me.finished ? `#${me.rank_overall}` : "–"} />
        <Stat label="Total time" value={me.finished ? fmtTime(me.total_seconds) : `${me.stations_done}/${stations.length} done`} />
        <Stat label="Penalties" value={me.penalty_seconds ? `+${me.penalty_seconds}s` : "None"} danger={me.penalty_seconds > 0} />
      </div>

      <table className="w-full bg-white text-left">
        <thead className="bg-navy text-white">
          <tr><th className="px-3 py-2">Station</th><th className="px-3 py-2 text-right">Result</th><th className="px-3 py-2 text-right">Penalty</th><th className="px-3 py-2 text-right">Station rank</th></tr>
        </thead>
        <tbody>
          {stations.map((s, idx) => {
            const r = splits.find((x) => x.station_id === s.id);
            const prev = stations[idx - 1];
            const run = prev ? runs.find((x) => x.from_position === prev.position && x.to_position === s.position) : undefined;
            return (
              <Fragment key={s.id}>
              {prev && (
                <tr className="border-b border-navy/10 bg-chalk text-sm text-navy/70">
                  <td className="px-3 py-2">{RUN_METERS} m run</td>
                  <td className="px-3 py-2 text-right tabular-nums">{run ? fmtTime(run.run_seconds) : "–"}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
              <tr className="border-b border-navy/10">
                <td className="px-3 py-3 font-medium">{s.position}. {s.name}</td>
                {r ? (
                  <>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">
                      {r.metric === "reps" ? `${r.reps ?? 0} reps in ${fmtTime(r.duration_seconds)}` : fmtTime(r.duration_seconds)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-crimson">{r.penalty_seconds ? `+${r.penalty_seconds}s` : ""}</td>
                    <td className="px-3 py-3 text-right tabular-nums">#{r.rank_gender}</td>
                  </>
                ) : (
                  <td colSpan={3} className="px-3 py-3 text-right text-navy/50">Not completed yet</td>
                )}
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-navy/60">Station rank is within your category. This page refreshes automatically.</p>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="border-l-4 border-saffron bg-white px-4 py-3">
      <div className="text-sm text-navy/70">{label}</div>
      <div className={`font-display text-3xl font-extrabold tabular-nums ${danger ? "text-crimson" : "text-navy"}`}>{value}</div>
    </div>
  );
}
