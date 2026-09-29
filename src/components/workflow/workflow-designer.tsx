"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LucideIcon } from "lucide-react";
import {
  UserCheck,
  GitBranch,
  Bell,
  CheckCircle2,
  XCircle,
  Play,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Zap,
  ArrowRight,
  MousePointerClick,
} from "lucide-react";

import { StartNode } from "./nodes/start-node";
import { ApprovalNode } from "./nodes/approval-node";
import { ConditionNode } from "./nodes/condition-node";
import { EndApprovedNode, EndRejectedNode } from "./nodes/end-node";
import { NotifyNode } from "./nodes/notify-node";
import { ApprovalConfigPanel } from "./panels/approval-config-panel";
import { ConditionConfigPanel } from "./panels/condition-config-panel";
import type {
  WorkflowDefinition,
  WorkflowNode,
  ApprovalNodeConfig,
  ConditionNodeConfig,
  NotifyNodeConfig,
  FormSchema,
} from "@/lib/types/schema";

// â"€â"€â"€ Node type registry â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const nodeTypes = {
  start: StartNode,
  approval: ApprovalNode,
  condition: ConditionNode,
  "end-approved": EndApprovedNode,
  "end-rejected": EndRejectedNode,
  notify: NotifyNode,
};

// â"€â"€â"€ Node metadata — friendly names & descriptions â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type NodeMeta = { Icon: LucideIcon; title: string; description: string; iconClass: string };

const NODE_META: Record<string, NodeMeta> = {
  start: {
    Icon: Play,
    title: "Start",
    description: "The workflow begins when someone submits this form.",
    iconClass: "text-slate-500",
  },
  approval: {
    Icon: UserCheck,
    title: "Approval Step",
    description: "Someone must review and approve before the request moves forward.",
    iconClass: "text-amber-500",
  },
  condition: {
    Icon: GitBranch,
    title: "Decision Point",
    description: "Route the form down different paths based on what was filled in.",
    iconClass: "text-blue-500",
  },
  notify: {
    Icon: Bell,
    title: "Send Notification",
    description: "Alert someone by email. No action required from them.",
    iconClass: "text-slate-500",
  },
  "end-approved": {
    Icon: CheckCircle2,
    title: "Finish: Approved",
    description: "The request is fully approved and the process ends here.",
    iconClass: "text-green-500",
  },
  "end-rejected": {
    Icon: XCircle,
    title: "Finish: Rejected",
    description: "The request is declined and the process ends here.",
    iconClass: "text-red-500",
  },
};

// â"€â"€â"€ Palette items â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type AddableNodeType = "approval" | "condition" | "notify" | "end-approved" | "end-rejected";

type PaletteItem = {
  type: AddableNodeType;
  Icon: LucideIcon;
  label: string;
  description: string;
  colorClass: string;
  iconClass: string;
};

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: "approval",
    Icon: UserCheck,
    label: "Approval Step",
    description: "Someone must approve to continue",
    colorClass:
      "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/15",
    iconClass: "text-amber-500 dark:text-amber-400",
  },
  {
    type: "condition",
    Icon: GitBranch,
    label: "Decision Point",
    description: "Route based on form answers",
    colorClass:
      "bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/15",
    iconClass: "text-blue-500 dark:text-blue-400",
  },
  {
    type: "notify",
    Icon: Bell,
    label: "Send Notification",
    description: "Alert someone, no action needed",
    colorClass:
      "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-card dark:border-border dark:text-slate-300 dark:hover:bg-muted/80",
    iconClass: "text-slate-500 dark:text-slate-400",
  },
  {
    type: "end-approved",
    Icon: CheckCircle2,
    label: "Form Approved ✓",
    description: "Successful end of the flow",
    colorClass:
      "bg-green-50 border-green-200 text-green-900 hover:bg-green-100 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-300 dark:hover:bg-green-500/15",
    iconClass: "text-green-500 dark:text-green-400",
  },
  {
    type: "end-rejected",
    Icon: XCircle,
    label: "Form Rejected ✗",
    description: "End the flow as declined",
    colorClass:
      "bg-red-50 border-red-200 text-red-900 hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/15",
    iconClass: "text-red-500 dark:text-red-400",
  },
];

// â"€â"€â"€ Quick-start templates â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const EDGE_STYLE = { stroke: "#94a3b8" };

type Template = { name: string; label: string; description: string; build: () => { nodes: Node[]; edges: Edge[] } };

const TEMPLATES: Template[] = [
  {
    name: "simple",
    label: "Simple Approval",
    description: "One approval, then done.",
    build() {
      const a1 = uid(), e1 = uid();
      return {
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 30 }, data: { label: "Start" } },
          {
            id: a1,
            type: "approval",
            position: { x: 205, y: 150 },
            data: { label: "Manager Approval", assigneeStrategy: "submitter-manager", anyOneApproves: true, allowReturn: true },
          },
          { id: e1, type: "end-approved", position: { x: 225, y: 300 }, data: { label: "Approved" } },
        ],
        edges: [
          { id: `e-s-${a1}`, source: "start", target: a1, style: EDGE_STYLE },
          { id: `e-${a1}-${e1}`, source: a1, target: e1, style: EDGE_STYLE },
        ],
      };
    },
  },
  {
    name: "two-step",
    label: "Two-Step Approval",
    description: "Manager, then department head.",
    build() {
      const a1 = uid(), a2 = uid(), e1 = uid();
      return {
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 30 }, data: { label: "Start" } },
          {
            id: a1,
            type: "approval",
            position: { x: 205, y: 150 },
            data: { label: "Manager Approval", assigneeStrategy: "submitter-manager", anyOneApproves: true, allowReturn: true },
          },
          {
            id: a2,
            type: "approval",
            position: { x: 205, y: 300 },
            data: { label: "Dept Head Approval", assigneeStrategy: "dept-head", anyOneApproves: true, allowReturn: true },
          },
          { id: e1, type: "end-approved", position: { x: 225, y: 450 }, data: { label: "Approved" } },
        ],
        edges: [
          { id: `e-s-${a1}`, source: "start", target: a1, style: EDGE_STYLE },
          { id: `e-${a1}-${a2}`, source: a1, target: a2, style: EDGE_STYLE },
          { id: `e-${a2}-${e1}`, source: a2, target: e1, style: EDGE_STYLE },
        ],
      };
    },
  },
  {
    name: "data-only",
    label: "Data Collection Only",
    description: "Submit & notify — no approval needed.",
    build() {
      const n1 = uid(), e1 = uid();
      return {
        nodes: [
          { id: "start", type: "start", position: { x: 250, y: 30 }, data: { label: "Start" } },
          {
            id: n1,
            type: "notify",
            position: { x: 205, y: 160 },
            data: { label: "Notify Submitter", recipientStrategy: "submitter" },
          },
          { id: e1, type: "end-approved", position: { x: 225, y: 300 }, data: { label: "Submitted" } },
        ],
        edges: [
          { id: `e-s-${n1}`, source: "start", target: n1, style: EDGE_STYLE },
          { id: `e-${n1}-${e1}`, source: n1, target: e1, style: EDGE_STYLE },
        ],
      };
    },
  },
  {
    name: "with-condition",
    label: "Approval + Decision",
    description: "Route to different approvers based on form data.",
    build() {
      const a1 = uid(), cond = uid(), a2 = uid(), e1 = uid(), e2 = uid();
      return {
        nodes: [
          { id: "start", type: "start", position: { x: 280, y: 30 }, data: { label: "Start" } },
          {
            id: a1,
            type: "approval",
            position: { x: 235, y: 150 },
            data: { label: "Manager Approval", assigneeStrategy: "submitter-manager", anyOneApproves: true, allowReturn: true },
          },
          {
            id: cond,
            type: "condition",
            position: { x: 240, y: 300 },
            data: { label: "Decision Point", branches: [], elseBranchTarget: e1 },
          },
          {
            id: a2,
            type: "approval",
            position: { x: 60, y: 430 },
            data: { label: "GM Approval", assigneeStrategy: "dept-head", anyOneApproves: true, allowReturn: false },
          },
          { id: e1, type: "end-approved", position: { x: 390, y: 430 }, data: { label: "Approved" } },
          { id: e2, type: "end-rejected", position: { x: 60, y: 580 }, data: { label: "Rejected" } },
        ],
        edges: [
          { id: `e-s-${a1}`, source: "start", target: a1, style: EDGE_STYLE },
          { id: `e-${a1}-${cond}`, source: a1, target: cond, style: EDGE_STYLE },
          { id: `e-${cond}-${a2}`, source: cond, target: a2, style: EDGE_STYLE },
          { id: `e-${cond}-${e1}`, source: cond, target: e1, style: EDGE_STYLE },
          { id: `e-${a2}-${e2}`, source: a2, target: e2, style: EDGE_STYLE },
        ],
      };
    },
  },
];

// â"€â"€â"€ WorkflowDefinition ↔ React Flow converters â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function wfToRf(wf: WorkflowDefinition): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: wf.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n.data, label: n.label },
    })),
    edges: wf.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      animated: false,
      style: EDGE_STYLE,
    })),
  };
}

function rfToWf(rfNodes: Node[], rfEdges: Edge[]): WorkflowDefinition {
  return {
    version: 1,
    nodes: rfNodes.map((n) => ({
      id: n.id,
      type: n.type as WorkflowNode["type"],
      position: n.position,
      label: (n.data as { label?: string }).label,
      data: (() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { label: _l, ...rest } = n.data as Record<string, unknown>;
        return rest as WorkflowNode["data"];
      })(),
    })),
    edges: rfEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === "string" ? e.label : undefined,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  };
}

// â"€â"€â"€ Auto-fit view — runs on tab visibility change or template apply â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function AutoFitView({ isVisible, fitTrigger }: { isVisible: boolean; fitTrigger: number }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!isVisible) return;
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
    return () => clearTimeout(t);
  // fitTrigger intentionally included so templates also trigger a re-fit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, fitTrigger, fitView]);

  return null;
}

// â"€â"€â"€ Main component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

interface WorkflowDesignerProps {
  initialWorkflow: WorkflowDefinition;
  schema: FormSchema;
  isVisible?: boolean;
  onChange: (workflow: WorkflowDefinition) => void;
}

export function WorkflowDesigner({
  initialWorkflow,
  schema,
  isVisible = true,
  onChange,
}: WorkflowDesignerProps) {
  const { nodes: initNodes, edges: initEdges } = wfToRf(initialWorkflow);
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const isMounted = useRef(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const nodeMeta = selectedNode ? NODE_META[selectedNode.type ?? ""] : null;
  const isEmptyCanvas = nodes.length === 1 && nodes[0]?.type === "start";

  // Propagate changes to parent (skip initial mount)
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    onChange(rfToWf(nodes, edges));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          { ...connection, id: `e-${connection.source}-${connection.target}`, style: EDGE_STYLE },
          eds
        )
      );
    },
    [setEdges]
  );

  function addNode(type: AddableNodeType) {
    const id = `${type}-${uid()}`;
    const defaultLabels: Record<AddableNodeType, string> = {
      approval: "Approval",
      condition: "Decision Point",
      notify: "Notification",
      "end-approved": "Approved",
      "end-rejected": "Rejected",
    };
    const defaultData: Record<AddableNodeType, Record<string, unknown>> = {
      approval: { assigneeStrategy: "submitter-manager", anyOneApproves: true, allowReturn: true },
      condition: { branches: [], elseBranchTarget: undefined },
      notify: { recipientStrategy: "submitter-manager" },
      "end-approved": {},
      "end-rejected": {},
    };
    setNodes((nds) => [
      ...nds,
      {
        id,
        type,
        position: { x: 200 + Math.random() * 80, y: 200 + Math.random() * 80 },
        data: { ...defaultData[type], label: defaultLabels[type] },
      },
    ]);
    setSelectedNodeId(id);
  }

  function applyTemplate(tpl: Template) {
    const built = tpl.build();
    setNodes(built.nodes);
    setEdges(built.edges);
    setSelectedNodeId(null);
    setFitTrigger((v) => v + 1);
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node || node.type === "start") return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }

  function updateSelectedNodeConfig(label: string, data: ApprovalNodeConfig | ConditionNodeConfig) {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...data, label } } : n))
    );
  }

  return (
    <div className="flex" style={{ height: "calc(100vh - 112px)" }}>

      {/* â"€â"€ Left palette â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden dark:bg-[#0f1628] dark:border-border">

        {/* Collapsible tips */}
        <div className="border-b border-slate-100 dark:border-border">
          <button
            onClick={() => setShowTips((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-muted/40 transition"
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">How to build a flow</span>
            </div>
            {showTips
              ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {showTips && (
            <div className="px-3 pb-3 space-y-2">
              {[
                "Add steps from the panel below by clicking them",
                "Connect steps by dragging from the dot at the bottom of one to the top of the next",
                "Click any step on the canvas to configure it in the right panel",
                "Every flow needs at least one Approval Step and one Finish step",
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-orange-500 mt-0.5 shrink-0">{i + 1}.</span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">{tip}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">

          {/* Step palette */}
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5">
            Add a Step
          </p>

          <div className="space-y-2">
            {PALETTE_ITEMS.map((item) => {
              const Icon = item.Icon;
              return (
                <button
                  key={item.type}
                  onClick={() => addNode(item.type)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition flex items-start gap-2.5 ${item.colorClass}`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${item.iconClass}`} />
                  <div>
                    <p className="text-xs font-semibold leading-tight">{item.label}</p>
                    <p className="text-[10px] opacity-70 leading-tight mt-0.5">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Delete selected */}
          {selectedNodeId && nodes.find((n) => n.id === selectedNodeId)?.type !== "start" && (
            <button
              onClick={deleteSelectedNode}
              className="w-full text-xs font-semibold rounded-xl border px-3 py-2.5 text-left transition mt-3 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15"
            >
              ✕ &nbsp;Delete selected step
            </button>
          )}

          {/* Quick-start templates */}
          <div className="border-t border-slate-100 dark:border-border pt-3 mt-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Zap className="w-3 h-3 text-orange-500" />
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Quick Start
              </p>
            </div>
            <div className="space-y-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => applyTemplate(tpl)}
                  className="w-full text-left rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 hover:bg-orange-100 transition dark:border-orange-500/20 dark:bg-orange-500/5 dark:hover:bg-orange-500/10"
                >
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 leading-tight">
                    {tpl.label}
                  </p>
                  <p className="text-[10px] text-orange-600/70 dark:text-orange-400/60 leading-tight mt-0.5">
                    {tpl.description}
                  </p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-2 leading-snug">
              Quick starts replace the current flow.
            </p>
          </div>
        </div>
      </aside>

      {/* â"€â"€ React Flow canvas â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="flex-1 min-w-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_evt, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          deleteKeyCode={null}
        >
          <AutoFitView isVisible={isVisible} fitTrigger={fitTrigger} />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === "start")        return "#475569";
              if (n.type === "approval")     return "#f59e0b";
              if (n.type === "condition")    return "#3b82f6";
              if (n.type === "end-approved") return "#16a34a";
              if (n.type === "end-rejected") return "#dc2626";
              return "#94a3b8";
            }}
            maskColor="rgba(248,250,252,0.7)"
          />

          {/* How to connect hint */}
          <Panel position="top-right">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 bg-white/90 dark:bg-[#0f1628]/90 border border-slate-200/70 dark:border-border rounded-lg px-3 py-1.5 shadow-sm backdrop-blur-sm">
              <MousePointerClick className="w-3 h-3 shrink-0" />
              <span>Click step to configure</span>
              <span className="opacity-40">·</span>
              <span>Drag <strong className="text-slate-600 dark:text-slate-300">●</strong> to connect</span>
            </div>
          </Panel>

          {/* Empty canvas guide — shown when only Start node exists */}
          {isEmptyCanvas && (
            <Panel position="top-center">
              <div className="mt-24 text-center px-6 py-5 rounded-2xl bg-white/96 dark:bg-[#0f1628]/96 border border-slate-200/80 dark:border-border shadow-lg backdrop-blur-sm max-w-xs">
                <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center mx-auto mb-3">
                  <ArrowRight className="w-5 h-5 text-orange-500" />
                </div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-1.5">
                  Your approval flow is empty
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                  Click <strong>Approval Step</strong> in the left panel to add your first approver, then drag the dot at the bottom of <strong>Start</strong> to connect it.
                </p>
                <p className="text-[10px] text-orange-500 dark:text-orange-400 font-semibold">
                  Or pick a Quick Start template ↙
                </p>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* â"€â"€ Right config panel â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {selectedNode && (
        <aside className="w-64 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden dark:bg-[#0f1628] dark:border-border">

          {/* Node type header with icon + explanation */}
          {nodeMeta && (() => {
            const Icon = nodeMeta.Icon;
            return (
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-border shrink-0">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 shrink-0 ${nodeMeta.iconClass}`} />
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{nodeMeta.title}</p>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
                  {nodeMeta.description}
                </p>
              </div>
            );
          })()}

          {/* Config content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {selectedNode.type === "start" && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No configuration needed — this is where the workflow begins automatically.
              </p>
            )}

            {(selectedNode.type === "end-approved" || selectedNode.type === "end-rejected") && (
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Label <span className="text-slate-400 font-normal">(shown in the approval trail)</span>
                </label>
                <input
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  value={(selectedNode.data as { label?: string }).label ?? ""}
                  onChange={(e) =>
                    setNodes((nds) =>
                      nds.map((n) =>
                        n.id === selectedNode.id ? { ...n, data: { ...n.data, label: e.target.value } } : n
                      )
                    )
                  }
                />
              </div>
            )}

            {selectedNode.type === "approval" && (
              <ApprovalConfigPanel
                nodeId={selectedNode.id}
                label={(selectedNode.data as { label?: string }).label ?? "Approval"}
                config={selectedNode.data as unknown as ApprovalNodeConfig}
                schema={schema}
                onChange={(label, cfg) => updateSelectedNodeConfig(label, cfg)}
              />
            )}

            {selectedNode.type === "condition" && (
              <ConditionConfigPanel
                nodeId={selectedNode.id}
                label={(selectedNode.data as { label?: string }).label ?? "Decision Point"}
                config={selectedNode.data as unknown as ConditionNodeConfig}
                schema={schema}
                nodes={nodes.map((n) => ({
                  id: n.id,
                  type: n.type ?? "",
                  label: (n.data as { label?: string }).label ?? n.id,
                }))}
                onChange={(label, cfg) => updateSelectedNodeConfig(label, cfg)}
              />
            )}

            {selectedNode.type === "notify" && (() => {
              const cfg = selectedNode.data as unknown as NotifyNodeConfig & { label?: string };
              const strategy = cfg.recipientStrategy ?? "submitter-manager";
              const recipientValue = (cfg.recipientValue as string) ?? "";
              const messageTemplate = cfg.messageTemplate ?? "";

              function patchNotify(patch: Partial<NotifyNodeConfig & { label?: string }>) {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n
                  )
                );
              }

              const RECIPIENT_OPTIONS: { value: string; label: string; hint: string; hasInput?: boolean; inputLabel?: string; inputPlaceholder?: string }[] = [
                { value: "submitter", label: "Submitter", hint: "Notifies the person who filled and submitted the form." },
                { value: "submitter-manager", label: "Submitter's Manager", hint: "Notifies the direct manager of whoever submitted the form." },
                { value: "dept-head", label: "Department Head", hint: "Notifies the admin of the form's department." },
                { value: "designation", label: "Specific Designation", hint: "Notifies all users with a matching job title.", hasInput: true, inputLabel: "Designation", inputPlaceholder: "e.g. HR Manager" },
                { value: "app-role", label: "Department Admin", hint: "Notifies all DEPT_ADMIN users for this department." },
                { value: "ad-group", label: "AD Group", hint: "Notifies all members of an Active Directory group.", hasInput: true, inputLabel: "AD Group name", inputPlaceholder: "e.g. FormFlow-HR-Admins" },
                { value: "custom-email", label: "Custom Email(s)", hint: "Send to one or more specific email addresses.", hasInput: true, inputLabel: "Email address(es)", inputPlaceholder: "hr@company.com, admin@company.com" },
              ];

              const selected = RECIPIENT_OPTIONS.find((o) => o.value === strategy) ?? RECIPIENT_OPTIONS[0];

              return (
                <div className="space-y-4">
                  {/* Label */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Label
                    </label>
                    <input
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      value={cfg.label ?? "Notification"}
                      onChange={(e) => patchNotify({ label: e.target.value })}
                    />
                  </div>

                  {/* Who to notify */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Who receives this notification?
                    </label>
                    <select
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      value={strategy}
                      onChange={(e) => patchNotify({ recipientStrategy: e.target.value as NotifyNodeConfig["recipientStrategy"], recipientValue: "" })}
                    >
                      {RECIPIENT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 leading-snug">
                      {selected.hint}
                    </p>
                  </div>

                  {/* Conditional value input */}
                  {selected.hasInput && (
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                        {selected.inputLabel}
                      </label>
                      <input
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        placeholder={selected.inputPlaceholder ?? selected.inputLabel}
                        value={recipientValue}
                        onChange={(e) => patchNotify({ recipientValue: e.target.value })}
                      />
                    </div>
                  )}

                  {/* Optional message */}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Custom message <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      rows={3}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
                      placeholder="Leave blank to use the default notification message…"
                      value={messageTemplate}
                      onChange={(e) => patchNotify({ messageTemplate: e.target.value })}
                    />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                      If filled, this text is included in the email body.
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className="pt-3 border-t border-slate-100 dark:border-border">
              <p className="text-[10px] text-slate-300 dark:text-slate-700 font-mono">id: {selectedNode.id}</p>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
