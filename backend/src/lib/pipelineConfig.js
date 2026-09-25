const CATEGORY_VALUES = new Set(["open", "won", "lost"]);
const DEFAULT_COLOR = "#64748b";

export const DEFAULT_PIPELINE_STAGES = Object.freeze([
  { key: "nuevo", label: "Nuevo", category: "open", color: "#3b82f6", position: 0, is_default: true },
  { key: "contactado", label: "Contactado", category: "open", color: "#06b6d4", position: 1 },
  { key: "cualificado", label: "Cualificado", category: "open", color: "#8b5cf6", position: 2 },
  { key: "presupuesto_borrador", label: "Presupuesto borrador", category: "open", color: "#f59e0b", position: 3 },
  { key: "presupuesto_enviado", label: "Presupuesto enviado", category: "open", color: "#f97316", position: 4 },
  { key: "negociacion", label: "Negociación", category: "open", color: "#ec4899", position: 5 },
  { key: "ganado", label: "Ganado", category: "won", color: "#22c55e", position: 6 },
  { key: "perdido", label: "Perdido", category: "lost", color: "#ef4444", position: 7 },
].map(Object.freeze));

function cleanText(value, maxLength) {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
  return cleaned.slice(0, maxLength);
}

export function normalizePipelineStageKey(value) {
  return cleanText(value, 100)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function cloneDefaults() {
  return DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage, is_default: Boolean(stage.is_default), is_active: true }));
}

export function sanitizePipelineStages(input, { fallbackToDefaults = true } = {}) {
  if (!Array.isArray(input) || !input.length) return fallbackToDefaults ? cloneDefaults() : [];

  const seen = new Set();
  const stages = [];
  for (const raw of input.slice(0, 50)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const label = cleanText(raw.label || raw.name, 80);
    const key = normalizePipelineStageKey(raw.key || raw.slug || label);
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    const category = CATEGORY_VALUES.has(String(raw.category || "").toLowerCase())
      ? String(raw.category).toLowerCase()
      : "open";
    const colorCandidate = cleanText(raw.color, 20);
    const color = /^#[0-9a-f]{6}$/i.test(colorCandidate) ? colorCandidate.toLowerCase() : DEFAULT_COLOR;
    stages.push({
      key,
      label,
      category,
      color,
      position: Number.isFinite(Number(raw.position)) ? Number(raw.position) : stages.length,
      is_default: Boolean(raw.is_default),
      is_active: raw.is_active !== false,
    });
  }

  if (!stages.length) return fallbackToDefaults ? cloneDefaults() : [];

  stages.sort((left, right) => left.position - right.position);
  const activeStages = stages.filter((stage) => stage.is_active);
  const defaultCandidate = activeStages.find((stage) => stage.is_default && stage.category === "open")
    || activeStages.find((stage) => stage.category === "open");
  return stages.map((stage, position) => ({
    ...stage,
    position,
    is_default: stage.key === defaultCandidate?.key,
  }));
}

export function validatePipelineStages(input) {
  const stages = sanitizePipelineStages(input, { fallbackToDefaults: false });
  const errors = [];
  if (!stages.length) errors.push({ code: "pipeline_empty", message: "El pipeline necesita al menos una etapa válida." });
  if (!stages.some((stage) => stage.is_active && stage.category === "open")) {
    errors.push({ code: "missing_open_stage", message: "Debe existir una etapa abierta activa." });
  }
  if (!stages.some((stage) => stage.is_active && stage.category === "won")) {
    errors.push({ code: "missing_won_stage", message: "Debe existir una etapa ganada activa." });
  }
  if (!stages.some((stage) => stage.is_active && stage.category === "lost")) {
    errors.push({ code: "missing_lost_stage", message: "Debe existir una etapa perdida activa." });
  }
  return { valid: errors.length === 0, errors, stages };
}

export function getPipelineStage(stages, key) {
  const safeKey = normalizePipelineStageKey(key);
  const sanitized = sanitizePipelineStages(stages);
  return sanitized.find((stage) => stage.key === safeKey)
    || sanitized.find((stage) => stage.is_default)
    || sanitized[0]
    || null;
}

