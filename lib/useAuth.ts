"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Profile } from "./types";

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (active) { setProfile(null); setLoading(false); } return; }
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (active) { setProfile((data as Profile) ?? null); setLoading(false); }
    }
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return { loading, profile };
}
