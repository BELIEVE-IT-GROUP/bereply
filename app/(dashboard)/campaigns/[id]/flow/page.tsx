import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AutomationFlowEditor } from "@/components/flow-builder/flow-builder";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { parseFlowEdges, parseFlowNodes } from "@/lib/flow/engine";

type FlowPageProps = { params: Promise<{ id: string }> };

export default async function CampaignFlowPage({ params }: FlowPageProps) {
  const { id } = await params;

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    redirect("/login");
  }

  const automation = await prisma.automation.findFirst({
    where: { id, workspaceId },
    select: { id: true, name: true, nodes: true, edges: true },
  });

  if (!automation) {
    notFound();
  }

  const nodes = parseFlowNodes(automation.nodes);
  const edges = parseFlowEdges(automation.edges);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link
          href={`/campaigns/${automation.id}`}
          className="text-sm text-muted hover:text-foreground"
        >
          &larr; {automation.name}
        </Link>
        <h1 className="text-lg font-semibold">Flow</h1>
        <p className="text-sm text-muted">
          {nodes.length === 0
            ? "This campaign runs on its keyword and DM settings. Build a flow here to take over from them."
            : "This flow replaces the campaign's keyword and DM settings. Save an empty canvas to go back to them."}
        </p>
      </div>

      <AutomationFlowEditor
        automationId={automation.id}
        initialNodes={nodes}
        initialEdges={edges}
      />
    </div>
  );
}
