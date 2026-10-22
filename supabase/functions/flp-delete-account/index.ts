// Supabase Edge Function: flp-delete-account
// Fully deletes the signed-in user's Fat-Loss Planner account (all app data AND the sign-in/auth user).
// Before deleting, it keeps ONLY a salted SHA-256 hash of the email + trial start date in flp_trial_hashes,
// so a deleted-and-recreated account can't restart the free trial. No other personal data is kept.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Not signed in" }, 401);
  // act as the user for the data cleanup (RLS + auth.uid() apply), then as admin to delete the auth user
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error: ue } = await asUser.auth.getUser();
  if (ue || !u?.user) return json({ error: "Not signed in" }, 401);
  const { error: de } = await asUser.rpc("flp_delete_me"); // stores the trial hash, deletes all app rows
  if (de) return json({ error: "Data cleanup failed: " + de.message }, 500);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { error: ae } = await admin.auth.admin.deleteUser(u.user.id);
  if (ae) return json({ error: "Account deletion failed: " + ae.message }, 500);
  return json({ ok: true });
});
