import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTestExclusions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: teacher, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "teacher" });
    if (roleError || !teacher) throw new Error("Доступ лише для викладача");
    const { data, error } = await context.supabase.from("test_result_exclusions").select("email").order("email");
    if (error) throw new Error("Не вдалося завантажити список виключень");
    return (data ?? []).map((row) => row.email);
  });

export const changeTestExclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().trim().toLowerCase().email().max(320), remove: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: teacher, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "teacher" });
    if (roleError || !teacher) throw new Error("Доступ лише для викладача");
    const { error } = data.remove
      ? await context.supabase.from("test_result_exclusions").delete().eq("email", data.email)
      : await context.supabase.from("test_result_exclusions").upsert({ email: data.email }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw new Error("Не вдалося зберегти список виключень");
    return { ok: true };
  });