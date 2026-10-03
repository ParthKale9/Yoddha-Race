"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setBusy(true);
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")), password: String(f.get("password")),
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/volunteer");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4">
      <h1 className="font-display text-4xl font-extrabold text-navy">Volunteer sign in</h1>
      <p className="text-sm text-navy/70">Accounts are set up by the admin before race day. Check your email for an invite link if you don&apos;t have a password yet.</p>
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="field" autoComplete="email" /></div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required className="field" autoComplete="current-password" /></div>
      {error && <p role="alert" className="bg-crimson/10 p-3 text-sm font-medium text-crimson">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}
