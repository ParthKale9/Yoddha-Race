"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { usePolling } from "@/lib/usePolling";
import { fmtTime } from "@/lib/format";
import { PENALTY_PRESETS } from "@/lib/penalties";
import type { Assignment, Heat, Log, Station } from "@/lib/types";
import Bib from "@/components/Bib";

export default function Volunteer() {
  const { loading, profile } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [heat, setHeat] = useState<Heat | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [preset, setPreset] = useState(0);
  const [seconds, setSeconds] = useState(PENALTY_PRESETS[0].seconds);
  // Admin-only manual override, for backup entry or testing.
  const [manualBib, setManualBib] = useState("");
  const [manualAthlete, setManualAthlete] = useState<{ id: string; bib_no: number; name: string; gender: string; heat_id: string | null } | null>(null);

  useEffect(() => {
    supabase.from("stations").select("*").order("position").then(({ data }) => setStations((data as Station[]) ?? []));
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const refresh = async () => {
    if (!profile) return;
    if (profile.role !== "admin") {
      const { data } = await supabase.from("assignments").select("*, athletes(bib_no,name,gender,heat_id)").eq("volunteer_id", profile.id).maybeSingle();
      setAssignment((data as Assignment) ?? null);
    }
  };
  usePolling(refresh, 6000);

  const athlete = profile?.role === "admin" ? manualAthlete : assignment?.athletes;
  const athleteId = profile?.role === "admin" ? manualAthlete?.id : assignment?.athlete_id;

  usePolling(async () => {
    if (!athlete || !athleteId) { setHeat(null); setLogs([]); return; }
    const [h, l] = await Promise.all([
      athlete.heat_id ? supabase.from("heat_availability").select("*").eq("id", athlete.heat_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("station_logs").select("*").eq("athlete_id", athleteId).eq("voided", false),
    ]);
    setHeat((h.data as Heat) ?? null);
    setLogs((l.data as Log[]) ?? []);
  }, 3000);

  async function findManual() {
    const n = Number(manualBib);
    if (!n) return;
    const { data } = await supabase.from("athletes").select("id,bib_no,name,gender,heat_id").eq("bib_no", n).maybeSingle();
    if (!data) { setMsg({ ok: false, text: `No athlete with bib ${n}.` }); return; }
    setManualAthlete(data as typeof manualAthlete);
    setMsg(null);
  }

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, okText: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: okText });
    if (athleteId) {
      const { data: l } = await supabase.from("station_logs").select("*").eq("athlete_id", athleteId).eq("voided", false);
      setLogs((l as Log[]) ?? []);
    }
  }

  if (loading) return <p className="text-navy/60">Loading...</p>;
  if (!profile) return (
    <div className="mx-auto max-w-sm space-y-4 bg-white p-6 text-center">
      <p>Sign in to record your athlete&apos;s times.</p>
      <Link href="/login" className="btn-primary">Sign in</Link>
    </div>
  );

  const completedPositions = new Set(logs.filter((l) => l.checked_out_at).map((l) => stations.find((s) => s.id === l.station_id)?.position));
  const currentStation = stations.find((s) => !completedPositions.has(s.position));
  const openLog = currentStation ? logs.find((l) => l.station_id === currentStation.id && !l.checked_out_at) : undefined;
  const allDone = stations.length > 0 && completedPositions.size === stations.length;

  const checkIn = () => run(() => supabase.rpc("check_in", { p_bib: athlete!.bib_no, p_station: currentStation!.id }), `Arrived at ${currentStation!.name}.`);
  const checkOut = () => run(() => supabase.rpc("check_out", { p_log_id: openLog!.id }), `Left ${currentStation!.name}.`);
  const finish = () => run(() => supabase.rpc("finish_athlete", { p_bib: athlete!.bib_no }), `Finished! Bib ${athlete!.bib_no}'s time is recorded.`);
  const undo = () => run(() => supabase.rpc("undo_log", { p_log_id: openLog!.id }), "Entry undone.");
  const addPenalty = () =>
    run(() => supabase.rpc("add_penalty", { p_bib: athlete!.bib_no, p_reason: PENALTY_PRESETS[preset].label, p_seconds: seconds, p_station: currentStation?.id ?? null }), `Penalty of ${seconds}s added.`)
      .then(() => setPenaltyOpen(false));

  const big = "min-h-16 w-full text-xl";

  if (profile.role === "admin" && !manualAthlete) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="font-display text-3xl font-extrabold text-navy">Volunteer mode (admin)</h1>
        <p className="text-sm text-navy/70">Admins bypass the volunteer assignment. Enter a bib number to record for any athlete.</p>
        <form onSubmit={(e) => { e.preventDefault(); findManual(); }} className="space-y-3">
          <input inputMode="numeric" value={manualBib} onChange={(e) => setManualBib(e.target.value)} className="field h-20 text-center font-display text-5xl font-extrabold tabular-nums" placeholder="Bib no." autoFocus />
          <button className={`btn-primary ${big}`}>Find athlete</button>
        </form>
        {msg && <p className="bg-crimson/10 p-3 text-sm text-crimson">{msg.text}</p>}
      </div>
    );
  }

  if (!athlete) return (
    <div className="mx-auto max-w-sm space-y-3 bg-white p-6 text-center">
      <p className="text-lg font-medium">No athlete is assigned to you yet.</p>
      <p className="text-sm text-navy/70">Ask the admin to assign you an athlete for this wave, then reload this page.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3 bg-navy p-4 text-white">
        <Bib no={athlete.bib_no} size="lg" />
        <div>
          <div className="text-xl font-semibold">{athlete.name}</div>
          <div className="text-white/70">{athlete.gender === "male" ? "Men" : "Women"}{profile.role === "admin" && (
            <button className="ml-3 text-sm underline" onClick={() => { setManualAthlete(null); setManualBib(""); }}>Change</button>
          )}</div>
        </div>
      </div>

      {!heat?.started_at ? (
        <div className="bg-white p-8 text-center">
          <p className="font-display text-3xl font-extrabold text-navy">Waiting for the whistle</p>
          <p className="mt-2 text-navy/70">{heat ? heat.name : "This athlete's wave hasn't started yet."} The clock starts the moment the admin starts the wave.</p>
        </div>
      ) : (
        <div className="bg-navy p-4 text-center text-white">
          <div className="text-sm text-white/70">Overall race time</div>
          <div className="font-display text-6xl font-extrabold tabular-nums">{fmtTime(Math.max(0, Math.floor((now - new Date(heat.started_at).getTime()) / 1000)))}</div>
        </div>
      )}

      {msg && <p role="status" className={`p-3 text-lg font-semibold ${msg.ok ? "bg-green-100 text-green-900" : "bg-crimson/10 text-crimson"}`}>{msg.text}</p>}

      {heat?.started_at && !allDone && currentStation && (
        <div className="space-y-3">
          <div className="border-l-4 border-saffron bg-white px-4 py-3">
            <div className="text-sm text-navy/70">Station {currentStation.position} of {stations.length}</div>
            <div className="font-display text-2xl font-extrabold text-navy">{currentStation.name}</div>
            <div className="text-navy/70">{(athlete.gender === "male" ? currentStation.spec_male : currentStation.spec_female) ?? "–"}</div>
          </div>

          {!openLog ? (
            <button className={`btn-primary ${big}`} disabled={busy} onClick={checkIn}>Arrived at {currentStation.name}</button>
          ) : (
            <>
              <div className="bg-white p-3 text-center">
                <div className="text-sm text-navy/70">At this station for</div>
                <div className="font-display text-4xl font-extrabold tabular-nums text-navy">{fmtTime(Math.max(0, Math.floor((now - new Date(openLog.checked_in_at).getTime()) / 1000)))}</div>
              </div>
              <button className={`btn-navy ${big}`} disabled={busy} onClick={checkOut}>Left {currentStation.name}</button>
            </>
          )}

          {!penaltyOpen ? (
            <button className={`btn-danger ${big}`} onClick={() => { setPenaltyOpen(true); setPreset(0); setSeconds(PENALTY_PRESETS[0].seconds); }}>Add penalty</button>
          ) : (
            <div className="space-y-3 border-2 border-crimson bg-white p-3">
              <div className="grid gap-2">
                {PENALTY_PRESETS.map((p, i) => (
                  <button key={p.label} onClick={() => { setPreset(i); setSeconds(p.seconds); }}
                    className={`min-h-14 px-3 text-left text-lg ${preset === i ? "bg-crimson text-white" : "bg-chalk"}`}>{p.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-ghost min-h-14 flex-1 text-2xl" onClick={() => setSeconds((s) => Math.max(0, s - 5))}>-5s</button>
                <div className="w-24 text-center font-display text-4xl font-extrabold tabular-nums">{seconds}s</div>
                <button className="btn-ghost min-h-14 flex-1 text-2xl" onClick={() => setSeconds((s) => s + 5)}>+5s</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost min-h-14 text-lg" onClick={() => setPenaltyOpen(false)}>Cancel</button>
                <button className="btn-danger min-h-14 text-lg" disabled={busy} onClick={addPenalty}>Add {seconds}s</button>
              </div>
            </div>
          )}

          {openLog && <button className="btn-ghost min-h-14 w-full text-lg" disabled={busy} onClick={undo}>Undo this entry</button>}
        </div>
      )}

      {heat?.started_at && allDone && (
        <div className="space-y-3 bg-white p-5 text-center">
          <p className="font-display text-2xl font-extrabold text-navy">All 7 stations done.</p>
          <button className={`btn-primary ${big}`} disabled={busy} onClick={finish}>Finish race</button>
        </div>
      )}
    </div>
  );
}
