const SHEET_ID = "1sLbxZhWvHBfkvhCq_e3r7nAeWxWEwIOYPWiNispyFUc";
const RANGE = "'_Дані_для_Looker_Studio'!A1:E5000";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

// Best-effort isolate-local data cache, never a cross-request pending promise.
let cached: { rows: string[][]; expires: number } | undefined;

export async function readResultsSheet(lovableKey: string, sheetsKey: string): Promise<string[][]> {
  if (cached && cached.expires > Date.now()) return cached.rows;
  const response = await fetch(`${GATEWAY_URL}/spreadsheets/${SHEET_ID}/values/${RANGE}`, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(`Sheets request failed [${response.status}]: ${body}`);
    throw new Error(`Не вдалося прочитати таблицю результатів [${response.status}]`);
  }
  const rows = (((await response.json()) as { values?: string[][] }).values ?? []).slice(1);
  cached = { rows, expires: Date.now() + 5000 };
  return rows;
}