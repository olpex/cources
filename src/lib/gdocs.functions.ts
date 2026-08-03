import { createServerFn } from "@tanstack/react-start";
import { extractDocId, parseGoogleDoc, type GDocResponse, type ParsedDoc } from "@/lib/gdocs-parse";

export const importGoogleDoc = createServerFn({ method: "POST" })
  .inputValidator((data: { url: string }) => {
    if (!data || typeof data.url !== "string" || data.url.length > 2000) {
      throw new Error("Вкажіть посилання на Google Документ");
    }
    return { url: data.url };
  })
  .handler(async ({ data }): Promise<ParsedDoc> => {
    const docId = extractDocId(data.url);
    if (!docId) throw new Error("Не вдалося розпізнати посилання на Google Документ");

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const connectorKey = process.env["GOOGLE_DOCS_API_KEY"];
    if (!lovableKey || !connectorKey) {
      throw new Error("Google Docs не підключено до проєкту");
    }

    const res = await fetch(
      `https://connector-gateway.lovable.dev/google_docs/v1/documents/${docId}?includeTabsContent=true`,
      {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connectorKey,
        },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`Google Docs request failed [${res.status}]: ${body}`);
      if (res.status === 403 || res.status === 404) {
        throw new Error(
          "Немає доступу до документа. Надайте доступ обліковому запису Google, який підключено до проєкту.",
        );
      }
      throw new Error(`Не вдалося завантажити документ (${res.status})`);
    }

    const json = (await res.json()) as GDocResponse;
    return parseGoogleDoc(json, docId);
  });
