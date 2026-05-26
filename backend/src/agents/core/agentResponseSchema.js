export const ROUTER_SCHEMA = {
  intent: "lead_capture",
  service: "unknown",
  lead_stage: "new",
  next_agent: "sales_qualification",
  confidence: 0.5,
  reason: "",
};

export const QUALIFICATION_FIELDS = {
  name: null,
  email: null,
  phone: null,
  service: null,
  budget_range: null,
  urgency: null,
  business_type: null,
  objective: null,
  source_channel: "web",
};

export const MEMORY_SCHEMA = {
  lead_patch: {},
  memory_patch: {},
  conversation_summary: "",
  should_save: true,
};

export const CLOSING_SCHEMA = {
  chat_completed: false,
  missing_critical_fields: [],
  closing_message: "",
  internal_summary: "",
};

export function parseJsonObject(value, fallback = {}) {
  if (!value) return { ...fallback };
  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...fallback, ...value };
  }

  const raw = String(value || "").trim();
  if (!raw) return { ...fallback };

  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch (_error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ...fallback };
    try {
      return { ...fallback, ...JSON.parse(match[0]) };
    } catch (_innerError) {
      return { ...fallback };
    }
  }
}

export function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function compactString(value, max = 2000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
