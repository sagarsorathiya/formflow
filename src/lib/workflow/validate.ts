/**
 * Validates a WorkflowDefinition before publishing.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */

import type { WorkflowDefinition, ConditionNodeConfig } from "@/lib/types/schema";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWorkflow(wf: WorkflowDefinition): ValidationResult {
  const errors: string[] = [];
  const nodeMap = new Map(wf.nodes.map((n) => [n.id, n]));
  const edgesBySource = new Map<string, string[]>();

  for (const edge of wf.edges) {
    const targets = edgesBySource.get(edge.source) ?? [];
    targets.push(edge.target);
    edgesBySource.set(edge.source, targets);
    // Validate edge targets exist
    if (!nodeMap.has(edge.target)) {
      errors.push(`Edge ${edge.id} points to non-existent node "${edge.target}".`);
    }
    if (!nodeMap.has(edge.source)) {
      errors.push(`Edge ${edge.id} comes from non-existent node "${edge.source}".`);
    }
  }

  // Must have exactly one start node
  const startNodes = wf.nodes.filter((n) => n.type === "start");
  if (startNodes.length === 0) errors.push("Workflow must have a Start node.");
  if (startNodes.length > 1) errors.push("Workflow must have exactly one Start node.");

  // Must have at least one end node
  const endNodes = wf.nodes.filter(
    (n) => n.type === "end-approved" || n.type === "end-rejected"
  );
  if (endNodes.length === 0) errors.push("Workflow must have at least one End node.");

  // All non-end nodes must have at least one outgoing edge
  for (const node of wf.nodes) {
    if (node.type === "end-approved" || node.type === "end-rejected") continue;
    if (node.type === "condition") {
      // Condition node outgoing edges come from its branches config, not just edges
      const cfg = node.data as ConditionNodeConfig;
      if (!cfg.branches || cfg.branches.length === 0) {
        errors.push(`Condition node "${node.id}" must have at least one branch.`);
      }
      // Verify branch targets exist
      for (const branch of cfg.branches ?? []) {
        if (!nodeMap.has(branch.targetNodeId)) {
          errors.push(
            `Condition node "${node.id}" branch "${branch.label}" targets non-existent node "${branch.targetNodeId}".`
          );
        }
      }
      if (cfg.elseBranchTarget && !nodeMap.has(cfg.elseBranchTarget)) {
        errors.push(
          `Condition node "${node.id}" else branch targets non-existent node "${cfg.elseBranchTarget}".`
        );
      }
      continue;
    }
    const outgoing = edgesBySource.get(node.id) ?? [];
    if (outgoing.length === 0) {
      errors.push(`Node "${node.label ?? node.id}" (${node.type}) has no outgoing connection.`);
    }
  }

  // Reachability: BFS from start
  if (startNodes.length === 1) {
    const reachable = new Set<string>();
    const queue: string[] = [startNodes[0].id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      const node = nodeMap.get(current);
      if (!node) continue;
      // Via edges
      const targets = edgesBySource.get(current) ?? [];
      for (const t of targets) queue.push(t);
      // Via condition branches
      if (node.type === "condition") {
        const cfg = node.data as ConditionNodeConfig;
        for (const b of cfg.branches ?? []) queue.push(b.targetNodeId);
        if (cfg.elseBranchTarget) queue.push(cfg.elseBranchTarget);
      }
    }
    for (const node of wf.nodes) {
      // end-rejected nodes are valid without an explicit graph path — the worker
      // routes to them implicitly when a task is rejected, not via a designed edge.
      if (node.type === "end-rejected") continue;
      if (!reachable.has(node.id)) {
        errors.push(`Node "${node.label ?? node.id}" is unreachable from Start.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Check if a WorkflowDefinition is the trivial empty default (start → end only). */
export function isTrivialWorkflow(wf: WorkflowDefinition): boolean {
  return (
    wf.nodes.length === 2 &&
    wf.nodes.some((n) => n.type === "start") &&
    wf.nodes.some((n) => n.type === "end-approved") &&
    wf.edges.length === 1
  );
}
