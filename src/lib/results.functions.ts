import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SHEET_ID = "1sLbxZhWvHBfkvhCq_e3r7nAeWxWEwIOYPWiNispyFUc";
const RANGE = "'_Дані_для_Looker_Studio'!A1:E5000";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

export type ResultRow = { module: string; time: string; score: string; name: string };

export function normTitle(s: string) {
  return s.toLowerCase().replace(/[’'`ʼ]/g, "'").replace(/[^\p{L}\p{N}.']+/gu, " ").trim();
}

export const fetchCourseResults = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ modules: z.array(z.string().max(300)).max(200) }).parse(d))
  .handler(async ({ data }): Promise<ResultRow[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
    if (!lovableKey || !sheetsKey) throw new Error("Таблицю результатів не підключено");
    const res = await fetch(`${GATEWAY_URL}/spreadsheets/${SHEET_ID}/values/${RANGE}`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Sheets request failed [${res.status}]: ${body}`);
      throw new Error(`Не вдалося прочитати таблицю результатів [${res.status}]`);
    }
    const json = (await res.json()) as { values?: string[][] };
    const wanted = new Set(data.modules.map(normTitle).filter(Boolean));
    // Only columns A–D are returned: email (column E) is never sent to the browser.
    return (json.values ?? [])
      .slice(1)
      .filter((r) => r[0] && wanted.has(normTitle(r[0])))
      .map((r) => ({ module: r[0] ?? "", time: r[1] ?? "", score: r[2] ?? "", name: r[3] ?? "" }));
  });
