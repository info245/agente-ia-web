import type { Block } from "@/components/email-editor";

// Mapa de una automatización: el primer nodo es el inicio; cada nodo apunta al siguiente
// (next) y una condición a sus dos caminos (yes / no). null = fin del camino.
export type FlowNode = {
  id: string;
  type: "wait" | "email" | "whatsapp" | "notify_team" | "condition" | "add_tag" | "set_stage";
  next?: string | null;
  yes?: string | null;
  no?: string | null;
  amount?: number;
  unit?: "hours" | "days";
  subject?: string;
  preheader?: string;
  blocks?: Block[];
  template_name?: string;
  language?: string;
  params?: string[];
  message?: string;
  text?: string;
  check?: "opened_last" | "clicked_last" | "has_tag" | "stage";
  value?: string;
  tag?: string;
  stage?: string;
};
export type Edge = { from: string | null; key: "next" | "yes" | "no" };

export const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function nodeById(steps: FlowNode[], id?: string | null) {
  return id ? steps.find((s) => s.id === id) || null : null;
}

function targetOf(steps: FlowNode[], edge: Edge) {
  if (edge.from === null) return steps[0]?.id || null;
  return (nodeById(steps, edge.from)?.[edge.key] as string | null | undefined) || null;
}

// Solo se guarda lo que se alcanza desde el inicio (lo demás quedó huérfano al borrar).
export function prune(steps: FlowNode[]) {
  if (!steps.length) return steps;
  const seen = new Set<string>();
  const stack = [steps[0].id];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = nodeById(steps, id);
    for (const k of ["next", "yes", "no"] as const) if (n?.[k]) stack.push(n[k] as string);
  }
  return steps.filter((s) => seen.has(s.id));
}

// Inserta un nodo en una flecha: lo que venía después cuelga del nuevo nodo
// (en una condición, del camino «Sí»).
export function insertNode(steps: FlowNode[], edge: Edge, node: FlowNode): FlowNode[] {
  const after = targetOf(steps, edge);
  const created: FlowNode = node.type === "condition" ? { ...node, yes: after, no: null } : { ...node, next: after };
  if (edge.from === null) return [created, ...steps];
  return [...steps.map((s) => (s.id === edge.from ? { ...s, [edge.key]: created.id } : s)), created];
}

// Quita un nodo y une lo de antes con lo de después (de una condición se conserva el camino «Sí»).
export function removeNode(steps: FlowNode[], id: string): FlowNode[] {
  const node = nodeById(steps, id);
  if (!node) return steps;
  const replacement = (node.type === "condition" ? node.yes : node.next) || null;
  let next = steps
    .filter((s) => s.id !== id)
    .map((s) => ({
      ...s,
      ...(s.next === id ? { next: replacement } : {}),
      ...(s.yes === id ? { yes: replacement } : {}),
      ...(s.no === id ? { no: replacement } : {}),
    }));
  if (steps[0]?.id === id) {
    const head = next.find((s) => s.id === replacement);
    next = head ? [head, ...next.filter((s) => s.id !== replacement)] : [];
  }
  return prune(next);
}

export function updateNode(steps: FlowNode[], id: string, part: Partial<FlowNode>) {
  return steps.map((s) => (s.id === id ? { ...s, ...part } : s));
}

// ¿Hay una espera entre el último email y esta condición? Si no, «abrió el email» casi nunca se cumple.
export function hasWaitBefore(steps: FlowNode[], id: string): boolean {
  const parent = steps.find((s) => s.next === id || s.yes === id || s.no === id);
  if (!parent) return false;
  if (parent.type === "wait") return true;
  if (parent.type === "email") return false;
  return hasWaitBefore(steps, parent.id);
}
