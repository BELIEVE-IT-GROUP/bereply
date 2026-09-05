"use client";

/**
 * Flow Node
 *
 * One card on the flow canvas. Registered under all flow node types, so
 * the xyflow node `type` is the domain type — no extra `data.nodeType` mirror
 * to keep in sync with what the engine reads.
 */

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData, FlowNodeType } from "@/lib/flow/engine";

export type FlowCanvasNode = Node<FlowNodeData, FlowNodeType>;

const HANDLE_SIZE = 9;

const handleStyle = (color: string) => ({
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  borderRadius: 2,
  background: color,
  border: "1px solid var(--color-background)",
});

function ConditionIcon() {
  return (
    <Icon>
      <path d="M6 2v4a3 3 0 0 0 3 3h5" />
      <path d="M6 14v-4a3 3 0 0 1 3-3h5" />
      <path d="M11 6l3 3-3 3" />
    </Icon>
  );
}

function SendDmIcon() {
  return (
    <Icon>
      <path d="M2 8.5 14 3l-4 11-2.5-4.5L2 8.5Z" />
    </Icon>
  );
}

function AddTagIcon() {
  return (
    <Icon>
      <path d="M8.5 2H14v5.5L7 14.5 1.5 9 8.5 2Z" />
      <path d="M11 5h.01" />
    </Icon>
  );
}

function AiReplyIcon() {
  return (
    <Icon>
      <path d="M8 1.5 9.4 6l4.6 1.4L9.4 8.8 8 13.4 6.6 8.8 2 7.4 6.6 6 8 1.5Z" />
    </Icon>
  );
}

function ShowProductsIcon() {
  return (
    <Icon>
      <path d="M4 5.5h8l-.7 7.5a1 1 0 0 1-1 .9H5.7a1 1 0 0 1-1-.9L4 5.5Z" />
      <path d="M6 5.5V4a2 2 0 0 1 4 0v1.5" />
    </Icon>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type NodeConfig = {
  label: string;
  bar: string;
  tone: string;
  icon: () => React.ReactElement;
  subtitle: (data: FlowNodeData) => string;
};

const NODE_CONFIG: Record<FlowNodeType, NodeConfig> = {
  condition: {
    label: "Condition",
    bar: "border-l-warning",
    tone: "text-warning",
    icon: ConditionIcon,
    subtitle: (data) => {
      const field = data.field === "tags" ? "Tags" : "Message";
      const operator = data.operator === "not_includes" ? "does not include" : "includes";
      const value = readString(data.value);
      return value ? `${field} ${operator} "${value}"` : "Set the condition";
    },
  },
  send_dm: {
    label: "Send DM",
    bar: "border-l-accent",
    tone: "text-accent",
    icon: SendDmIcon,
    subtitle: (data) => readString(data.message) || "Write the message",
  },
  add_tag: {
    label: "Add tag",
    bar: "border-l-success",
    tone: "text-success",
    icon: AddTagIcon,
    subtitle: (data) => readString(data.tag) || "Name the tag",
  },
  ai_reply: {
    label: "AI reply",
    bar: "border-l-foreground",
    tone: "text-foreground",
    icon: AiReplyIcon,
    subtitle: (data) => readString(data.systemPrompt) || "Write the system prompt",
  },
  show_products: {
    label: "Show products",
    bar: "border-l-accent",
    tone: "text-accent",
    icon: ShowProductsIcon,
    subtitle: (data) => {
      const query = readString(data.query);
      return query ? `Search: "${query}"` : "Whole catalog";
    },
  },
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function FlowNodeCard({ data, type, selected }: NodeProps<FlowCanvasNode>) {
  const config = NODE_CONFIG[type];
  const NodeIcon = config.icon;
  const isCondition = type === "condition";

  return (
    <div
      className={`w-[210px] rounded border border-l-2 bg-background px-3 py-2 ${config.bar} ${
        selected ? "border-border-hover" : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={handleStyle("var(--color-border-hover)")}
      />

      <div className={`flex items-center gap-1.5 ${config.tone}`}>
        <NodeIcon />
        <span className="text-xs font-semibold">{config.label}</span>
      </div>

      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">
        {config.subtitle(data)}
      </p>

      {isCondition ? (
        <>
          <div className="mt-1.5 flex justify-between px-1 text-[9px] font-medium">
            <span className="text-success">Yes</span>
            <span className="text-error">No</span>
          </div>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ ...handleStyle("var(--color-success)"), left: "25%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ ...handleStyle("var(--color-error)"), left: "75%" }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          style={handleStyle("var(--color-border-hover)")}
        />
      )}
    </div>
  );
}

export default memo(FlowNodeCard);
