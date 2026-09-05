import { describe, expect, it } from "vitest";
import {
  parseFlowEdges,
  parseFlowNodes,
  runFlow,
  type FlowEdge,
  type FlowNode,
} from "./engine";

function node(
  id: string,
  type: FlowNode["type"],
  data: Record<string, unknown> = {}
): FlowNode {
  return { id, type, data, position: { x: 0, y: 0 } };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string
): FlowEdge {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

const context = { incomingText: "send me the LINK please", tags: ["customer"] };

describe("runFlow", () => {
  it("starts at the node nothing points at and walks the chain in order", () => {
    const nodes = [
      node("a", "send_dm", { message: "here you go" }),
      node("b", "add_tag", { tag: "lead" }),
    ];
    const edges = [edge("e1", "a", "b")];

    expect(runFlow({ nodes, edges, context })).toEqual([
      { type: "send_dm", message: "here you go" },
      { type: "add_tag", tag: "lead" },
    ]);
  });

  it("follows the true branch and skips the false one", () => {
    const nodes = [
      node("c", "condition", {
        field: "tags",
        operator: "includes",
        value: "customer",
      }),
      node("yes", "send_dm", { message: "welcome back" }),
      node("no", "send_dm", { message: "hi there" }),
    ];
    const edges = [
      edge("e1", "c", "yes", "true"),
      edge("e2", "c", "no", "false"),
    ];

    expect(runFlow({ nodes, edges, context })).toEqual([
      { type: "send_dm", message: "welcome back" },
    ]);
  });

  it("stops silently when the branch it took has no edge", () => {
    const nodes = [
      node("c", "condition", {
        field: "incomingText",
        operator: "not_includes",
        value: "link",
      }),
      node("yes", "send_dm", { message: "unreachable" }),
    ];
    // Only the true branch is wired; the text does contain "link", so
    // not_includes is false and the walk ends with no action.
    const edges = [edge("e1", "c", "yes", "true")];

    expect(runFlow({ nodes, edges, context })).toEqual([]);
  });

  it("stops on a cycle instead of looping forever", () => {
    const nodes = [
      node("a", "send_dm", { message: "one" }),
      node("b", "add_tag", { tag: "looped" }),
      node("c", "send_dm", { message: "two" }),
    ];
    const edges = [
      edge("e1", "a", "b"),
      edge("e2", "b", "c"),
      edge("e3", "c", "b"),
    ];

    expect(runFlow({ nodes, edges, context })).toEqual([
      { type: "send_dm", message: "one" },
      { type: "add_tag", tag: "looped" },
      { type: "send_dm", message: "two" },
    ]);
  });

  it("does nothing when every node has an incoming edge, so there is no trigger", () => {
    const nodes = [
      node("a", "send_dm", { message: "one" }),
      node("b", "add_tag", { tag: "looped" }),
    ];
    const edges = [edge("e1", "a", "b"), edge("e2", "b", "a")];

    expect(runFlow({ nodes, edges, context })).toEqual([]);
  });

  it("honours startNodeId over the detected root", () => {
    const nodes = [
      node("a", "send_dm", { message: "skipped" }),
      node("b", "ai_reply", { systemPrompt: "answer as support" }),
    ];
    const edges = [edge("e1", "a", "b")];

    expect(runFlow({ nodes, edges, startNodeId: "b", context })).toEqual([
      { type: "ai_reply", systemPrompt: "answer as support" },
    ]);
  });
});

describe("parseFlowNodes / parseFlowEdges", () => {
  it("keeps valid entries and drops malformed ones", () => {
    const parsed = parseFlowNodes([
      { id: "a", type: "send_dm", data: { message: "hi" }, position: { x: 5, y: 6 } },
      { id: "b", type: "not_a_node_type", data: {}, position: { x: 0, y: 0 } },
      { id: "c", type: "add_tag" },
      "nope",
    ]);

    expect(parsed).toEqual([
      { id: "a", type: "send_dm", data: { message: "hi" }, position: { x: 5, y: 6 } },
      { id: "c", type: "add_tag", data: {}, position: { x: 0, y: 0 } },
    ]);

    expect(parseFlowNodes(null)).toEqual([]);
    expect(
      parseFlowEdges([
        { id: "e1", source: "a", target: "b", sourceHandle: "true" },
        { id: "e2", source: "a" },
      ])
    ).toEqual([{ id: "e1", source: "a", target: "b", sourceHandle: "true" }]);
  });
});
