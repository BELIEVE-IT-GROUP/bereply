import { prisma } from "@/lib/db/client";
import { getClient } from "@/lib/ai/responder";

/**
 * Maasy (mcp.maasy.ai) is the source of truth for each brand's DNA. BeReply
 * keeps a condensed copy in InstagramAccount.knowledgeBase instead of querying
 * Maasy per DM: the full DNA runs 50k-110k chars, far too much to send with
 * every reply, and a DM must not depend on Maasy being up.
 */

const MCP_URL = process.env.MAASY_MCP_URL || "https://mcp.maasy.ai";
const MAX_KNOWLEDGE_CHARS = 12_000;

export interface MaasyBrand {
  id: string;
  brand_name: string;
}

interface DnaField {
  label: string;
  value: unknown;
  filled: boolean;
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.MAASY_MCP_API_KEY;
  if (!apiKey) throw new Error("MAASY_MCP_API_KEY is not set");

  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  const payload = JSON.parse(raw.slice(raw.indexOf("{"))) as {
    error?: { message?: string };
    result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  };
  if (payload.error) throw new Error(payload.error.message ?? "maasy-mcp error");

  const text = payload.result?.content?.map((c) => c.text ?? "").join("") ?? "";
  if (payload.result?.isError) throw new Error(text || `maasy-mcp tool "${name}" failed`);
  return JSON.parse(text) as T;
}

export async function listMaasyBrands(): Promise<MaasyBrand[]> {
  const data = await callTool<MaasyBrand[] | { brands: MaasyBrand[] }>("maasy_list_brands", {});
  const brands = Array.isArray(data) ? data : data.brands;
  return brands
    .map(({ id, brand_name }) => ({ id, brand_name }))
    .sort((a, b) => a.brand_name.localeCompare(b.brand_name));
}

async function getBrandDnaText(projectId: string): Promise<string> {
  const dna = await callTool<{ sections: Record<string, DnaField[]> }>("maasy_get_brand_dna", {
    project_id: projectId,
  });
  return Object.entries(dna.sections)
    .map(([section, fields]) => {
      const lines = fields
        .filter((f) => f.filled)
        .map((f) => `${f.label}: ${typeof f.value === "string" ? f.value : JSON.stringify(f.value)}`);
      return lines.length ? `## ${section}\n${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

const CONDENSE_PROMPT = `You turn a brand's full DNA document into the fact sheet an Instagram DM
assistant will use to answer customers. Keep only what a customer could ask
about: what the business sells, products/services, prices, conditions,
locations, schedules, how to buy or book, contact channels, FAQs, who the
customer is, and the brand's tone of voice. Drop strategy, positioning
analysis, competitors and internal notes. Copy facts exactly — never round,
infer or invent prices, dates or availability. Write in the same language as
the document, as compact plain-text sections. Hard limit: ${MAX_KNOWLEDGE_CHARS - 2000} characters.`;

async function condense(dnaText: string): Promise<string> {
  const response = await getClient().chat.completions.create(
    {
      model: "believe-smart",
      messages: [
        { role: "system", content: CONDENSE_PROMPT },
        { role: "user", content: dnaText },
      ],
    },
    { timeout: 180_000 }
  );
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("BeGateway returned an empty summary");
  return text.slice(0, MAX_KNOWLEDGE_CHARS);
}

/** Pulls the linked brand's DNA from Maasy and stores the condensed copy. */
export async function syncAccountFromMaasy(accountId: string): Promise<string> {
  const account = await prisma.instagramAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { maasyProjectId: true },
  });
  if (!account.maasyProjectId) throw new Error("Account is not linked to a Maasy brand");

  const knowledgeBase = await condense(await getBrandDnaText(account.maasyProjectId));
  await prisma.instagramAccount.update({
    where: { id: accountId },
    data: { knowledgeBase, maasySyncedAt: new Date() },
  });
  return knowledgeBase;
}
