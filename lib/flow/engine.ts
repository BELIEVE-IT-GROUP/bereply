/**
 * Visual flow engine.
 *
 * Pure: no Prisma, no Meta calls, no I/O. It turns a saved node graph plus the
 * context of one incoming comment/DM into an ordered list of actions, and the
 * caller (the worker) decides how to perform them. That split is what makes the
 * flow testable without a database or a Meta token.
 */

export const FLOW_NODE_TYPES = [
  "condition",
  "send_dm",
  "add_tag",
  "ai_reply",
  "show_products",
] as const;

export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];

export type FlowNodeData = Record<string, unknown>;

export type FlowNode = {
  id: string;
  type: FlowNodeType;
  data: FlowNodeData;
  position: { x: number; y: number };
};

export type FlowEdge = {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
};

export type FlowAction =
  | { type: "send_dm"; message: string }
  | { type: "add_tag"; tag: string }
  | { type: "ai_reply"; systemPrompt: string }
  | { type: "show_products"; query: string }
  | { type: "escalate"; reason: string };

export const CONDITION_FIELDS = ["tags", "incomingText"] as const;
export const CONDITION_OPERATORS = ["includes", "not_includes"] as const;

export type ConditionField = (typeof CONDITION_FIELDS)[number];
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export type FlowContext = {
  matchedKeyword?: string;
  incomingText: string;
  tags: string[];
};

export type RunFlowInput = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  startNodeId?: string;
  context: FlowContext;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFlowNodeType(value: unknown): value is FlowNodeType {
  return (
    typeof value === "string" &&
    (FLOW_NODE_TYPES as readonly string[]).includes(value)
  );
}

/** The trigger node: the only one nothing points at. */
function findRootNode(nodes: FlowNode[], edges: FlowEdge[]): FlowNode | null {
  const targets = new Set(edges.map((edge) => edge.target));
  return nodes.find((node) => !targets.has(node.id)) ?? null;
}

function evaluateCondition(data: FlowNodeData, context: FlowContext): boolean {
  const value = readString(data.value).toLowerCase();
  // An unconfigured condition matches nothing, so `includes` sends the flow down
  // the false branch instead of matching every message by accident.
  if (!value) return data.operator === "not_includes";

  const matched =
    data.field === "tags"
      ? context.tags.some((tag) => tag.trim().toLowerCase() === value)
      : context.incomingText.toLowerCase().includes(value);

  return data.operator === "not_includes" ? !matched : matched;
}

export function runFlow(input: RunFlowInput): FlowAction[] {
  const { nodes, edges, startNodeId, context } = input;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const actions: FlowAction[] = [];
  const visited = new Set<string>();

  let current: FlowNode | null = startNodeId
    ? byId.get(startNodeId) ?? null
    : findRootNode(nodes, edges);

  while (current !== null) {
    const node: FlowNode = current;
    if (visited.has(node.id)) break;
    visited.add(node.id);

    // Only condition nodes pick a branch; every other node follows its single
    // outgoing edge, whatever its handle id is.
    let handle: string | null = null;

    switch (node.type) {
      case "condition":
        handle = evaluateCondition(node.data, context) ? "true" : "false";
        break;
      case "send_dm": {
        const message = readString(node.data.message);
        if (message) actions.push({ type: "send_dm", message });
        break;
      }
      case "add_tag": {
        const tag = readString(node.data.tag);
        if (tag) actions.push({ type: "add_tag", tag });
        break;
      }
      case "ai_reply": {
        const systemPrompt = readString(node.data.systemPrompt);
        if (systemPrompt) actions.push({ type: "ai_reply", systemPrompt });
        break;
      }
      case "show_products": {
        // Empty query is valid here — it means "show the whole catalog",
        // unlike every other node type where an empty field means unconfigured.
        actions.push({ type: "show_products", query: readString(node.data.query) });
        break;
      }
      default:
        return actions;
    }

    const next = edges.find(
      (edge) =>
        edge.source === node.id && (handle === null || edge.sourceHandle === handle)
    );

    current = next ? byId.get(next.target) ?? null : null;
  }

  return actions;
}

/**
 * Coerce a `Json` column (or any untrusted payload) into nodes the engine can
 * walk. Anything malformed is dropped rather than throwing, so one bad node
 * never takes a live campaign down.
 */
export function parseFlowNodes(value: unknown): FlowNode[] {
  if (!Array.isArray(value)) return [];

  const nodes: FlowNode[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (typeof raw.id !== "string" || !isFlowNodeType(raw.type)) continue;

    const position = isRecord(raw.position) ? raw.position : {};
    nodes.push({
      id: raw.id,
      type: raw.type,
      data: isRecord(raw.data) ? raw.data : {},
      position: {
        x: typeof position.x === "number" ? position.x : 0,
        y: typeof position.y === "number" ? position.y : 0,
      },
    });
  }

  return nodes;
}

export function parseFlowEdges(value: unknown): FlowEdge[] {
  if (!Array.isArray(value)) return [];

  const edges: FlowEdge[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (
      typeof raw.id !== "string" ||
      typeof raw.source !== "string" ||
      typeof raw.target !== "string"
    ) {
      continue;
    }

    edges.push({
      id: raw.id,
      source: raw.source,
      target: raw.target,
      ...(typeof raw.sourceHandle === "string"
        ? { sourceHandle: raw.sourceHandle }
        : {}),
    });
  }

  return edges;
}

/** True when a campaign has a usable visual flow; false means legacy simple mode. */
export function hasFlow(nodes: unknown): boolean {
  return parseFlowNodes(nodes).length > 0;
}
