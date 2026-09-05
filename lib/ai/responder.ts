import OpenAI from "openai";

// Believe apps never hold a provider key directly — every LLM call goes
// through BeGateway (llm.believe-global.com, OpenAI-compatible) with a
// per-product key and a semantic tier instead of a hardcoded model name.
// See believe-infra/GATEWAYS-BELIEVE.md.
// Built lazily (not at module load) so importing this file never requires
// the env vars to be set — the OpenAI SDK throws at construction time if
// apiKey is empty.
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: `${process.env.LLM_GATEWAY_URL}/v1`,
      apiKey: process.env.LLM_GATEWAY_KEY_BEREPLY,
    });
  }
  return client;
}

type Tier = "believe-fast" | "believe-smart" | "believe-deep";
const DEFAULT_TIER: Tier = "believe-fast";
const REQUEST_TIMEOUT_MS = 15_000;
const REPLY_TOOL_NAME = "submit_reply";

// Non-negotiable rules, always applied regardless of the campaign's own
// system prompt. This block is not exposed to or editable by the client.
const FIXED_SYSTEM_PROMPT = `You are an automated Instagram DM assistant for a business. You reply on
behalf of the business, but you are not a human — never claim to be one.

Non-negotiable rules, in order of priority:
1. Never invent or guess prices, stock/availability, or shipping times. Only
   state facts that are explicitly present in the conversation or the brand
   instructions below. If the customer asks about price, stock, shipping, or
   any commercial detail not given to you, escalate instead of guessing.
2. If the customer's message contains an opt-out / stop request (e.g. "stop",
   "detente", "no me escribas", "no me contactes", "cancelar", "unsubscribe"),
   set escalate to true immediately with reason "opt_out". Do not send a reply
   in that case.
3. If the message is a complaint, a refund/dispute request, or anything that
   sounds legally or reputationally sensitive, escalate instead of handling it
   yourself.
4. When in doubt about whether you can safely answer, escalate. It is always
   better to hand off to a human than to risk an incorrect or unauthorized
   reply.

You must always respond by calling the ${REPLY_TOOL_NAME} tool — never as
plain text.`;

const REPLY_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: REPLY_TOOL_NAME,
    description:
      "Submit the reply to send to the customer, or escalate the conversation to a human.",
    parameters: {
      type: "object",
      properties: {
        reply: {
          type: "string",
          description:
            "The message to send back to the customer. Use an empty string when escalate is true.",
        },
        escalate: {
          type: "boolean",
          description:
            "True if a human should handle this conversation instead of sending `reply`.",
        },
        reason: {
          type: "string",
          description:
            "Short machine-readable reason for escalating, e.g. 'opt_out', 'pricing_question', 'complaint', 'uncertain'. Omit when escalate is false.",
        },
      },
      required: ["reply", "escalate"],
    },
  },
};

// Deterministic guard, checked before ever calling the model. A prompt-only
// rule can be missed by the model; opt-out compliance can't depend on that.
const OPT_OUT_PATTERNS: RegExp[] = [
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bdetente\b/i,
  /\bdeten[ée]te\b/i,
  /no me (?:escribas|contactes|molestes)\b/i,
  /para de escribirme\b/i,
  /d[ée]jame en paz\b/i,
  /\bcancelar\b/i,
];

function matchesOptOut(text: string): boolean {
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(text));
}

export interface AiReplyInput {
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  incomingMessage: string;
  tier?: Tier;
}

export interface AiReplyResult {
  reply: string | null;
  escalate: boolean;
  reason?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export async function getAiReply(input: AiReplyInput): Promise<AiReplyResult> {
  if (matchesOptOut(input.incomingMessage)) {
    return { reply: null, escalate: true, reason: "opt_out" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: `${FIXED_SYSTEM_PROMPT}\n\n${input.systemPrompt}` },
      ...input.history.map(
        (turn): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
          role: turn.role,
          content: turn.text,
        })
      ),
      { role: "user", content: input.incomingMessage },
    ];

    const response = await getClient().chat.completions.create(
      {
        model: input.tier ?? DEFAULT_TIER,
        max_tokens: 1024,
        messages,
        tools: [REPLY_TOOL],
        tool_choice: { type: "function", function: { name: REPLY_TOOL_NAME } },
      },
      { signal: controller.signal }
    );

    const usage = response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        }
      : undefined;

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.type !== "function") {
      return { reply: null, escalate: true, reason: "ai_error: no tool call in response", usage };
    }

    let parsed: { reply?: unknown; escalate?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return { reply: null, escalate: true, reason: "ai_error: malformed tool arguments", usage };
    }

    if (typeof parsed.reply !== "string" || typeof parsed.escalate !== "boolean") {
      return { reply: null, escalate: true, reason: "ai_error: malformed tool input", usage };
    }

    return {
      reply: parsed.escalate ? null : parsed.reply,
      escalate: parsed.escalate,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
      usage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return { reply: null, escalate: true, reason: `ai_error: ${message.slice(0, 200)}` };
  } finally {
    clearTimeout(timeoutId);
  }
}
