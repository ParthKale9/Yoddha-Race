"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Bib from "@/components/Bib";

export default function Register() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bib, setBib] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { data, error } = await supabase.rpc("register_athlete", {
      p_name: f.get("name"), p_gender: f.get("gender"), p_age: Number(f.get("age")),
      p_phone: f.get("phone"), p_email: f.get("email"),
      p_emergency_name: f.get("emergency_name"), p_emergency_phone: f.get("emergency_phone"),
      p_waiver: f.get("waiver") === "on",
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setBib(data as number);
  }

  if (bib !== null) {
    return (
      <div className="mx-auto max-w-md space-y-5 bg-white p-6 text-center">
        <h1 className="font-display text-3xl font-extrabold text-navy">You are in.</h1>
        <p>Your bib number is</p>
        <Bib no={bib} size="lg" />
        <p className="text-sm text-navy/70">Save this number. Volunteers will ask for it at every station, and you can check your splits with it after the race. You&apos;ll be placed into a wave closer to race day.</p>
        <Link href={`/athlete/${bib}`} className="btn-navy">Open my profile</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-5">
      <h1 className="font-display text-4xl font-extrabold text-navy">Register for the Yoddha Race</h1>

      <div><label className="label" htmlFor="name">Full name</label><input id="name" name="name" required className="field" autoComplete="name" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="gender">Category</label>
          <select id="gender" name="gender" required className="field" defaultValue="">
            <option value="" disabled>Select</option>
            <option value="male">Men</option>
            <option value="female">Women</option>
          </select>
        </div>
        <div><label className="label" htmlFor="age">Age</label><input id="age" name="age" type="number" min={10} max={90} required className="field" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="phone">Phone number</label><input id="phone" name="phone" type="tel" required className="field" autoComplete="tel" /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="field" autoComplete="email" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="emergency_name">Emergency contact name</label><input id="emergency_name" name="emergency_name" required className="field" /></div>
        <div><label className="label" htmlFor="emergency_phone">Emergency contact phone</label><input id="emergency_phone" name="emergency_phone" type="tel" required className="field" /></div>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="waiver" required className="mt-1 h-5 w-5" />
        <span>I confirm I am fit to take part in the Yoddha Race, I accept the event rules, and I release Athletes Fitness Club from liability for injury during the race.</span>
      </label>

      {error && <p role="alert" className="bg-crimson/10 p-3 text-sm font-medium text-crimson">{error}</p>}
      <button className="btn-primary w-full text-lg" disabled={busy}>{busy ? "Registering..." : "Register"}</button>
    </form>
  );
}
