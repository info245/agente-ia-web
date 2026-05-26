import { supabase } from "../../lib/supabase.js";
import { compactString } from "./agentResponseSchema.js";

export async function logAgentRun({
  conversationId,
  agentId,
  intent = null,
  inputSummary = "",
  outputSummary = "",
  toolsUsed = [],
  error = null,
} = {}) {
  if (!conversationId || !agentId) return { skipped: true, reason: "missing-required-fields" };

  const payload = {
    conversation_id: conversationId,
    agent_id: agentId,
    intent,
    input_summary: compactString(inputSummary, 1000),
    output_summary: compactString(outputSummary, 1000),
    tools_used: Array.isArray(toolsUsed) ? toolsUsed : [],
    error: error ? compactString(error?.message || error, 1000) : null,
  };

  const { data, error: insertError } = await supabase
    .from("agent_runs")
    .insert(payload)
    .select()
    .single();

  if (insertError) {
    const message = String(insertError.message || "").toLowerCase();
    if (
      message.includes("agent_runs") ||
      message.includes("does not exist") ||
      message.includes("schema cache")
    ) {
      console.log("[agentLogger] agent_runs skipped:", insertError.message);
      return { skipped: true, reason: insertError.message };
    }
    throw insertError;
  }

  return data;
}
