/**
 * Client for becommerce-mcp (mcp.becommerce.believe-global.com), the shared
 * multi-tenant MCP server that fronts every BeCommerce/Medusa store's public
 * "agent commerce" endpoints. Stateless per-call (no session, no auth) — see
 * believe-health/INFRA.md.
 *
 * Only search_products is used today: BeReply shows product cards in DM and
 * links to the real storefront product page, it does not create carts or
 * complete checkouts on the customer's behalf.
 */

const MCP_URL = "https://mcp.becommerce.believe-global.com/mcp";
const REQUEST_TIMEOUT_MS = 10_000;

export interface BecommerceProduct {
  product_id: string;
  title: string;
  handle: string;
  description: string;
  variant_id: string;
  sku: string;
  price: { value: number; currency: string };
  buyable_by_agent: boolean;
}

// The server responds as a single SSE-formatted chunk ("event: message\ndata:
// {...}") even for a plain POST — the "streamable HTTP" MCP transport.
function parseSseJson(raw: string): unknown {
  const line = raw.split("\n").find((l) => l.startsWith("data:")) ?? raw;
  return JSON.parse(line.replace(/^data:\s*/, ""));
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const raw = await response.text();
  const payload = parseSseJson(raw) as {
    error?: { message?: string };
    result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? "becommerce-mcp error");
  }

  const content = payload.result?.content?.[0];
  const text = content?.type === "text" ? content.text ?? "" : "";

  if (payload.result?.isError) {
    throw new Error(text || `becommerce-mcp tool "${name}" failed`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`becommerce-mcp tool "${name}" returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/** Only returns products the store has flagged as agent-buyable. */
export async function searchProducts(
  store: string,
  query: string,
  limit = 5
): Promise<BecommerceProduct[]> {
  const data = await callTool<{ results: BecommerceProduct[] }>("search_products", {
    store,
    query,
    limit,
  });
  return (data.results ?? []).filter((p) => p.buyable_by_agent);
}
