import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistrationDatabase } from "@/lib/registration-database";
import type { RegistrationFacts } from "@/lib/mailing-rules";

/**
 * Registration facts for a set of addresses, for the mailing rules.
 *
 * Lives outside registration.functions.ts because forum.functions.ts needs it
 * and registration.functions.ts already imports sendGmail from there — sharing
 * through a third module avoids a circular import.
 *
 * The service role is required: student_registrations is deliberately not
 * reachable by ordinary sessions, and the generated live types do not list it,
 * so the query goes through the local contract in registration-database.ts.
 */
export async function registrationFactsFor(
  emails: string[],
): Promise<Map<string, RegistrationFacts>> {
  const map = new Map<string, RegistrationFacts>();
  const wanted = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (wanted.length === 0) return map;
  for (const email of wanted) {
    map.set(email, { email, activeCourseId: null, hasRegistration: false });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient<RegistrationDatabase>;
  const { data, error } = await db
    .from("student_registrations")
    .select("email, course_id, status")
    .in("email", wanted);
  if (error) {
    // Refusing is safer than mailing blind, so leave hasRegistration false for
    // nobody: mark every address as registered with no active course instead.
    console.error("registrationFactsFor failed", error.message);
    for (const email of wanted) {
      map.set(email, { email, activeCourseId: null, hasRegistration: true });
    }
    return map;
  }
  for (const row of data ?? []) {
    const email = String(row.email).toLowerCase();
    const facts = map.get(email) ?? { email, activeCourseId: null, hasRegistration: false };
    facts.hasRegistration = true;
    if (row.status === "active") facts.activeCourseId = row.course_id;
    map.set(email, facts);
  }
  return map;
}
