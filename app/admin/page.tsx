"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { downloadCsv } from "@/lib/csv";
import { fmtTime } from "@/lib/format";
import type { Athlete, Heat, LeaderRow, Profile, Station, StationRow } from "@/lib/types";

type LogRow = {
  id: string; checked_in_at: string; checked_out_at: string | null; reps: number | null; voided: boolean;
  athletes: { bib_no: number; name: string } | null; stations: { name: string } | null;
};
type PenRow = { id: string; seconds: number; reason: string; voided: boolean; athletes: { bib_no: number; name: string } | null; stations: { name: string } | null };
type AssignRow = { id: string; volunteer_id: string; athletes: { bib_no: number; name: string; heat_id: string | null } | null };
type LiveRow = { log_id: string; bib_no: number; name: string; gender: string; station_position: number; station_name: string; checked_in_at: string };

type Tab = "athletes" | "assignments" | "volunteers" | "stations" | "waves" | "records";

export default function Admin() {
  const { loading, profile } = useAuth();
  const [tab, setTab] = useState<Tab>("waves");
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [heats, setHeats] = useState<Heat[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<AssignRow[]>([]);
  const [live, setLive] = useState<LiveRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [pens, setPens] = useState<PenRow[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [assignPick, setAssignPick] = useState<Record<string, string>>({});
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [stationEdits, setStationEdits] = useState<Record<number, Partial<Station>>>({});

  const load = useCallback(async () => {
    const [a, h, s, p, asn, lv, l, pe] = await Promise.all([
      supabase.from("athletes").select("*").order("bib_no"),
      supabase.from("heat_availability").select("*").order("name"),
      supabase.from("stations").select("*").order("position"),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("assignments").select("id,volunteer_id,athletes(bib_no,name,heat_id)"),
      supabase.from("live_race").select("*").order("station_position"),
      supabase.from("station_logs").select("id,checked_in_at,checked_out_at,reps,voided,athletes(bib_no,name),stations(name)").order("created_at", { ascending: false }).limit(150),
      supabase.from("penalties").select("id,seconds,reason,voided,athletes(bib_no,name),stations(name)").order("created_at", { ascending: false }).limit(100),
    ]);
    setAthletes((a.data as Athlete[]) ?? []);
    setHeats((h.data as Heat[]) ?? []);
    setStations((s.data as Station[]) ?? []);
    setProfiles((p.data as Profile[]) ?? []);
    setAssignments((asn.data as unknown as AssignRow[]) ?? []);
    setLive((lv.data as LiveRow[]) ?? []);
    setLogs((l.data as unknown as LogRow[]) ?? []);
    setPens((pe.data as unknown as PenRow[]) ?? []);
  }, []);
  useEffect(() => { if (profile?.role === "admin") load(); }, [profile, load]);
  useEffect(() => {
    if (profile?.role !== "admin") return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [profile, load]);

  async function update(table: string, id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from(table).update(patch).eq("id", id);
    setNote(error ? error.message : "Saved.");
    load();
  }
  async function voidPenalty(id: string) {
    const { error } = await supabase.rpc("void_penalty", { p_penalty_id: id });
    setNote(error ? error.message : "Penalty removed.");
    load();
  }
  async function startWave(heatId: string) {
    const { error } = await supabase.rpc("start_wave", { p_heat_id: heatId });
    setNote(error ? error.message : "Wave started — clocks are running.");
    load();
  }
  async function assignVolunteer(bib: number, volunteerId: string) {
    if (!volunteerId) return;
    const { error } = await supabase.rpc("assign_volunteer", { p_bib: bib, p_volunteer: volunteerId });
    setNote(error ? error.message : `Bib ${bib} assigned.`);
    load();
  }
  async function unassign(bib: number) {
    const { error } = await supabase.rpc("unassign_volunteer", { p_bib: bib });
    setNote(error ? error.message : "Unassigned.");
    load();
  }

  async function inviteVolunteer(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/invite-volunteer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ email: inviteEmail, full_name: inviteName }),
    });
    const body = await res.json();
    setInviteBusy(false);
    if (!res.ok) { setNote(body.error ?? "Could not send invite."); return; }
    setNote(`Invite sent to ${inviteEmail}.`);
    setInviteName(""); setInviteEmail("");
    load();
  }

  function stationField(s: Station, field: "spec_male" | "spec_female"): string {
    return (stationEdits[s.id]?.[field] as string) ?? s[field] ?? "";
  }
  async function saveStation(id: number) {
    const patch = stationEdits[id];
    if (!patch) return;
    const { error } = await supabase.from("stations").update(patch).eq("id", id);
    setNote(error ? error.message : "Station updated.");
    setStationEdits((m) => { const n = { ...m }; delete n[id]; return n; });
    load();
  }
  async function exportResults() {
    const [l, s] = await Promise.all([supabase.from("leaderboard").select("*"), supabase.from("station_leaderboard").select("*")]);
    const lr = (l.data as LeaderRow[]) ?? [];
    downloadCsv("yoddha-overall-results.csv", lr.map((r) => ({
      bib: r.bib_no, name: r.name, gender: r.gender, stations_done: r.stations_done, finished: r.finished,
      penalty_seconds: r.penalty_seconds, total_time: fmtTime(r.total_seconds), rank_gender: r.rank_gender, rank_overall: r.rank_overall,
    })));
    const sr = (s.data as StationRow[]) ?? [];
    downloadCsv("yoddha-station-results.csv", sr.map((r) => ({
      bib: r.bib_no, name: r.name, gender: r.gender, station: r.station_name,
      duration: fmtTime(r.duration_seconds), penalty_seconds: r.penalty_seconds, rank_gender: r.rank_gender,
    })));
  }

  if (loading) return <p className="text-navy/60">Loading...</p>;
  if (!profile) return <div className="mx-auto max-w-sm space-y-4 bg-white p-6 text-center"><p>Sign in with an admin account.</p><Link href="/login" className="btn-primary">Sign in</Link></div>;
  if (profile.role !== "admin") return <p className="bg-white p-6">This page is for admins only.</p>;

  const q = search.trim().toLowerCase();
  const shown = athletes.filter((a) => !q || a.name.toLowerCase().includes(q) || String(a.bib_no).includes(q));
  const volunteers = profiles.filter((p) => p.role === "volunteer");
  const assignedBibs = new Set(assignments.map((a) => a.athletes?.bib_no));
  const tabs: { id: Tab; label: string }[] = [
    { id: "waves", label: "Waves" },
    { id: "assignments", label: `Assignments (${assignments.length})` },
    { id: "volunteers", label: `Volunteers (${volunteers.length})` },
    { id: "stations", label: "Stations" },
    { id: "athletes", label: `Athletes (${athletes.length})` },
    { id: "records", label: "Records" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold text-navy">Admin</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => downloadCsv("yoddha-registrations.csv", athletes.map((a) => ({ bib: a.bib_no, name: a.name, gender: a.gender, age: a.age, phone: a.phone, email: a.email, heat: heats.find((h) => h.id === a.heat_id)?.name ?? "" })))}>Export registrations</button>
          <button className="btn-navy" onClick={exportResults}>Export results</button>
        </div>
      </div>
      {note && <p role="status" className="bg-navy/10 p-2 text-sm">{note}</p>}

      <div role="tablist" className="flex flex-wrap gap-1 border-b-2 border-navy/15">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-0.5 border-b-4 px-4 py-3 font-semibold ${tab === t.id ? "border-saffron text-navy" : "border-transparent text-navy/60"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "waves" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {heats.map((h) => {
              const inWave = athletes.filter((a) => a.heat_id === h.id);
              const assignedInWave = inWave.filter((a) => assignedBibs.has(a.bib_no)).length;
              return (
                <div key={h.id} className="space-y-2 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-display text-xl font-extrabold text-navy">{h.name}</div>
                    {h.started_at
                      ? <span className="bg-green-100 px-2 py-1 text-xs font-semibold text-green-900">Started {new Date(h.started_at).toLocaleTimeString()}</span>
                      : <span className="bg-navy/10 px-2 py-1 text-xs font-semibold text-navy/70">Not started</span>}
                  </div>
                  <div className="text-sm text-navy/70">{inWave.length} athletes · {assignedInWave} of {inWave.length} have a volunteer assigned</div>
                  {!h.started_at && (
                    <button className="btn-primary w-full" disabled={inWave.length === 0 || assignedInWave < inWave.length}
                      onClick={() => startWave(h.id)}>
                      {inWave.length === 0 ? "No athletes in this wave" : assignedInWave < inWave.length ? "Assign volunteers first" : "Start wave (blow the whistle)"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <section>
            <h2 className="mb-2 font-semibold text-navy">Live right now ({live.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] bg-white text-left text-sm">
                <thead className="bg-navy text-white"><tr><th className="px-3 py-2">Athlete</th><th className="px-3 py-2">Station</th><th className="px-3 py-2">Since</th></tr></thead>
                <tbody>
                  {live.map((r) => (
                    <tr key={r.log_id} className="border-b border-navy/10">
                      <td className="px-3 py-2">{r.bib_no} {r.name}</td>
                      <td className="px-3 py-2">{r.station_position}. {r.station_name}</td>
                      <td className="px-3 py-2 tabular-nums">{new Date(r.checked_in_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                  {live.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-navy/60">Nobody is mid-station right now.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "assignments" && (
        <div className="space-y-3">
          <p className="text-sm text-navy/70">Give each athlete one volunteer to follow them through the race. Do this before starting their wave.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] bg-white text-left text-sm">
              <thead className="bg-navy text-white"><tr><th className="px-3 py-2">Athlete</th><th className="px-3 py-2">Wave</th><th className="px-3 py-2">Volunteer</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {athletes.map((a) => {
                  const current = assignments.find((x) => x.athletes?.bib_no === a.bib_no);
                  const value = assignPick[a.id] ?? current?.volunteer_id ?? "";
                  return (
                    <tr key={a.id} className="border-b border-navy/10">
                      <td className="px-3 py-2 font-semibold">{a.bib_no} {a.name}</td>
                      <td className="px-3 py-2">{heats.find((h) => h.id === a.heat_id)?.name ?? "–"}</td>
                      <td className="px-3 py-2">
                        <select className="field py-1" value={value} onChange={(e) => setAssignPick((m) => ({ ...m, [a.id]: e.target.value }))}>
                          <option value="">Unassigned</option>
                          {volunteers.map((v) => <option key={v.id} value={v.id}>{v.full_name ?? v.id}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button className="btn-ghost py-1" disabled={!value} onClick={() => assignVolunteer(a.bib_no, value)}>Save</button>
                          {current && <button className="text-crimson underline" onClick={() => unassign(a.bib_no)}>Remove</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "volunteers" && (
        <div className="space-y-5">
          <form onSubmit={inviteVolunteer} className="max-w-sm space-y-3 bg-white p-4">
            <h2 className="font-semibold text-navy">Invite a volunteer</h2>
            <p className="text-sm text-navy/70">They&apos;ll get an email with a link to set their password. Do this on race day or the day before.</p>
            <div><label className="label" htmlFor="inv_name">Name</label><input id="inv_name" className="field" value={inviteName} onChange={(e) => setInviteName(e.target.value)} required /></div>
            <div><label className="label" htmlFor="inv_email">Email</label><input id="inv_email" type="email" className="field" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required /></div>
            <button className="btn-primary w-full" disabled={inviteBusy}>{inviteBusy ? "Sending..." : "Send invite"}</button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] bg-white text-left text-sm">
              <thead className="bg-navy text-white"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th></tr></thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-navy/10">
                    <td className="px-3 py-2">{p.full_name ?? p.id}</td>
                    <td className="px-3 py-2">{p.role === "admin" ? "Admin" : "Volunteer"}</td>
                  </tr>
                ))}
                {profiles.length === 0 && <tr><td colSpan={2} className="px-3 py-6 text-center text-navy/60">No accounts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "stations" && (
        <div className="space-y-3">
          <p className="text-sm text-navy/70">Edit the distance, weight or reps for each station. Changes apply immediately.</p>
          <div className="grid gap-3">
            {stations.map((s) => (
              <div key={s.id} className="grid gap-2 bg-white p-4 sm:grid-cols-[2rem_1fr_1fr_1fr_auto] sm:items-end">
                <div className="font-display text-2xl font-extrabold text-navy">{s.position}</div>
                <div className="font-semibold">{s.name}</div>
                <div>
                  <label className="label">Men</label>
                  <input className="field" value={stationField(s, "spec_male")} onChange={(e) => setStationEdits((m) => ({ ...m, [s.id]: { ...m[s.id], spec_male: e.target.value } }))} />
                </div>
                <div>
                  <label className="label">Women</label>
                  <input className="field" value={stationField(s, "spec_female")} onChange={(e) => setStationEdits((m) => ({ ...m, [s.id]: { ...m[s.id], spec_female: e.target.value } }))} />
                </div>
                <button className="btn-ghost" disabled={!stationEdits[s.id]} onClick={() => saveStation(s.id)}>Save</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "athletes" && (
        <div className="space-y-3">
          <input className="field max-w-sm" placeholder="Search by name or bib" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] bg-white text-left text-sm">
              <thead className="bg-navy text-white"><tr><th className="px-3 py-2">Bib</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Heat</th></tr></thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className="border-b border-navy/10">
                    <td className="px-3 py-2 font-semibold tabular-nums">{a.bib_no}</td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">{a.gender === "male" ? "Men" : "Women"}</td>
                    <td className="px-3 py-2">{a.phone}</td>
                    <td className="px-3 py-2">
                      <select className="field py-1" value={a.heat_id ?? ""} onChange={(e) => update("athletes", a.id, { heat_id: e.target.value })}>
                        {heats.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.taken}/{h.capacity})</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "records" && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-semibold text-navy">Station entries (latest 150)</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] bg-white text-left text-sm">
                <thead className="bg-navy text-white"><tr><th className="px-3 py-2">Athlete</th><th className="px-3 py-2">Station</th><th className="px-3 py-2">In</th><th className="px-3 py-2">Out</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className={`border-b border-navy/10 ${l.voided ? "text-navy/40 line-through" : ""}`}>
                      <td className="px-3 py-2">{l.athletes?.bib_no} {l.athletes?.name}</td>
                      <td className="px-3 py-2">{l.stations?.name}</td>
                      <td className="px-3 py-2 tabular-nums">{new Date(l.checked_in_at).toLocaleTimeString()}</td>
                      <td className="px-3 py-2 tabular-nums">{l.checked_out_at ? new Date(l.checked_out_at).toLocaleTimeString() : "at station"}</td>
                      <td className="px-3 py-2 text-right">{!l.voided && <button className="text-crimson underline" onClick={() => update("station_logs", l.id, { voided: true, void_reason: "Voided by admin" })}>Void</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-navy">Penalties</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] bg-white text-left text-sm">
                <thead className="bg-navy text-white"><tr><th className="px-3 py-2">Athlete</th><th className="px-3 py-2">Station</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Seconds</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {pens.map((p) => (
                    <tr key={p.id} className={`border-b border-navy/10 ${p.voided ? "text-navy/40 line-through" : ""}`}>
                      <td className="px-3 py-2">{p.athletes?.bib_no} {p.athletes?.name}</td>
                      <td className="px-3 py-2">{p.stations?.name}</td>
                      <td className="px-3 py-2">{p.reason}</td>
                      <td className="px-3 py-2 tabular-nums">+{p.seconds}</td>
                      <td className="px-3 py-2 text-right">{!p.voided && <button className="text-crimson underline" onClick={() => voidPenalty(p.id)}>Remove</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
