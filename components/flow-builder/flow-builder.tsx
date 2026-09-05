"use client";

/**
 * Flow Builder
 *
 * Canvas alternative to the simple keyword → DM form. A campaign with no nodes
 * keeps running in legacy mode, so saving an empty canvas is what clears the
 * flow and hands the campaign back to the simple path.
 */

import "@xyflow/react/dist/style.css";

import { useCallback, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import FlowNodeCard, { type FlowCanvasNode } from "./flow-node";
import {
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  type FlowEdge,
  type FlowNode,
  type FlowNodeData,
  type FlowNodeType,
} from "@/lib/flow/engine";

const nodeTypes: NodeTypes = {
  condition: FlowNodeCard,
  send_dm: FlowNodeCard,
  add_tag: FlowNodeCard,
  ai_reply: FlowNodeCard,
  show_products: FlowNodeCard,
};

const PALETTE: { type: FlowNodeType; label: string }[] = [
  { type: "condition", label: "Condition" },
  { type: "send_dm", label: "Send DM" },
  { type: "add_tag", label: "Add tag" },
  { type: "ai_reply", label: "AI reply" },
  { type: "show_products", label: "Show products" },
];

const NEW_NODE_DATA: Record<FlowNodeType, FlowNodeData> = {
  condition: { field: "incomingText", operator: "includes", value: "" },
  send_dm: { message: "" },
  add_tag: { tag: "" },
  ai_reply: { systemPrompt: "" },
  show_products: { query: "" },
};

const FIELD_LABELS: Record<(typeof CONDITION_FIELDS)[number], string> = {
  tags: "Contact tags",
  incomingText: "Message text",
};

const OPERATOR_LABELS: Record<(typeof CONDITION_OPERATORS)[number], string> = {
  includes: "includes",
  not_includes: "does not include",
};

const inputClass =
  "w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-accent/40 focus:outline-none";

function toFlowNodes(nodes: FlowCanvasNode[]): FlowNode[] {
  return nodes.flatMap((node) =>
    node.type
      ? [
          {
            id: node.id,
            type: node.type,
            data: node.data,
            position: { x: node.position.x, y: node.position.y },
          },
        ]
      : []
  );
}

function toFlowEdges(edges: Edge[]): FlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
  }));
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export type FlowBuilderProps = {
  initialNodes: FlowNode[];
  initialEdges: FlowEdge[];
  onSave: (nodes: FlowNode[], edges: FlowEdge[]) => Promise<void>;
};

export default function FlowBuilder({
  initialNodes,
  initialEdges,
  onSave,
}: FlowBuilderProps) {
  const [nodes, setNodes, onNodesChange] =
    useNodesState<FlowCanvasNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const addNode = useCallback(
    (type: FlowNodeType) => {
      const id = crypto.randomUUID();
      setNodes((nds) => [
        ...nds,
        {
          id,
          type,
          data: { ...NEW_NODE_DATA[type] },
          position: { x: 120 + (nds.length % 3) * 40, y: 60 + nds.length * 120 },
        },
      ]);
      setSelectedId(id);
    },
    [setNodes]
  );

  const updateNodeData = useCallback(
    (id: string, patch: FlowNodeData) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...patch } } : node
        )
      );
    },
    [setNodes]
  );

  const removeNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [setEdges, setNodes]
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(toFlowNodes(nodes), toFlowEdges(edges));
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the flow");
    } finally {
      setSaving(false);
    }
  }

  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Add node</span>
          {PALETTE.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => addNode(item.type)}
              className="rounded border border-border px-2.5 py-1 text-xs text-muted hover:border-border-hover hover:text-foreground"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !error && (
            <span className="text-xs text-muted">Saved at {savedAt}</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-error/20 bg-error/10 p-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_minmax(0,260px)]">
        <div className="h-[calc(100vh-260px)] min-h-[460px] rounded border border-border bg-surface">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_event, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed },
            }}
            proOptions={{ hideAttribution: false }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        <aside className="rounded border border-border bg-surface p-3">
          {selected ? (
            <NodeInspector
              node={selected}
              onChange={(patch) => updateNodeData(selected.id, patch)}
              onRemove={() => removeNode(selected.id)}
            />
          ) : (
            <p className="text-xs leading-5 text-muted">
              Add nodes, drag from a handle to connect them, then pick a node to
              configure it. The first node nothing points at is the trigger.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function NodeInspector({
  node,
  onChange,
  onRemove,
}: {
  node: FlowCanvasNode;
  onChange: (patch: FlowNodeData) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {PALETTE.find((item) => item.type === node.type)?.label ?? "Node"}
        </h2>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-muted hover:text-error"
        >
          Remove
        </button>
      </div>

      {node.type === "condition" && (
        <>
          <Field label="Check">
            <select
              value={readString(node.data.field) || "incomingText"}
              onChange={(e) => onChange({ field: e.target.value })}
              className={inputClass}
            >
              {CONDITION_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {FIELD_LABELS[field]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Operator">
            <select
              value={readString(node.data.operator) || "includes"}
              onChange={(e) => onChange({ operator: e.target.value })}
              className={inputClass}
            >
              {CONDITION_OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {OPERATOR_LABELS[operator]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Value">
            <input
              value={readString(node.data.value)}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder={node.data.field === "tags" ? "customer" : "price"}
              className={inputClass}
            />
          </Field>
        </>
      )}

      {node.type === "send_dm" && (
        <Field label="Message">
          <textarea
            value={readString(node.data.message)}
            onChange={(e) => onChange({ message: e.target.value })}
            rows={5}
            placeholder="here you go: {link}"
            className={`${inputClass} resize-y`}
          />
        </Field>
      )}

      {node.type === "add_tag" && (
        <Field label="Tag">
          <input
            value={readString(node.data.tag)}
            onChange={(e) => onChange({ tag: e.target.value })}
            placeholder="customer"
            className={inputClass}
          />
        </Field>
      )}

      {node.type === "ai_reply" && (
        <Field label="System prompt">
          <textarea
            value={readString(node.data.systemPrompt)}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            rows={6}
            placeholder="Answer as our support team. Keep it under two sentences."
            className={`${inputClass} resize-y`}
          />
        </Field>
      )}

      {node.type === "show_products" && (
        <Field label="Search">
          <input
            value={readString(node.data.query)}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Leave empty to show the whole catalog"
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-muted">
            Sends up to 5 matching products as tappable cards, pulled live
            from the store connected in Settings → Ecommerce integration.
          </p>
        </Field>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Wires the builder to the flow API for one campaign. Lives here so the flow
 * page can stay a server component and still hand the canvas a save handler.
 */
export function AutomationFlowEditor({
  automationId,
  initialNodes,
  initialEdges,
}: {
  automationId: string;
  initialNodes: FlowNode[];
  initialEdges: FlowEdge[];
}) {
  const onSave = useCallback(
    async (savedNodes: FlowNode[], savedEdges: FlowEdge[]) => {
      const response = await fetch(`/api/automations/${automationId}/flow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: savedNodes, edges: savedEdges }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!payload.success) {
        throw new Error(payload.error ?? "Could not save the flow");
      }
    },
    [automationId]
  );

  return (
    <FlowBuilder
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      onSave={onSave}
    />
  );
}
