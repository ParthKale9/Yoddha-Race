import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// This route runs on the server only. SUPABASE_SERVICE_ROLE_KEY is never
// sent to the browser (it has no NEXT_PUBLIC_ prefix), so it's safe here.
// It lets an already-signed-in admin create a new volunteer account by
// email invite, without exposing admin powers to the client bundle.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  if (!serviceKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in your hosting provider's environment variables." },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Verify the caller and confirm they're an admin, using their own token.
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await asCaller.auth.getUser(token);
  if (userErr || !userData?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: profile } = await asCaller.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const { email, full_name } = await req.json();
  if (!email || typeof email !== "string") return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const admin = createClient(url, serviceKey);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
    data: { full_name: full_name || email },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.user?.id });
}
