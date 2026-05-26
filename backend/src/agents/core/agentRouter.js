import { getAgent } from "./agentRegistry.js";
import { logAgentRun } from "./agentLogger.js";
import { compactString } from "./agentResponseSchema.js";

export async function runAgent(agentId, context = {}) {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Agente no registrado: ${agentId}`);

  try {
    const output = await agent(context);
    await logAgentRun({
      conversationId: context.conversationId,
      agentId,
      intent: context.routerResult?.intent || output?.intent || null,
      inputSummary: context.message || context.userMessage || "",
      outputSummary: compactString(JSON.stringify(output || {}), 1000),
      toolsUsed: output?.tools_used || [],
    });
    return output;
  } catch (error) {
    await logAgentRun({
      conversationId: context.conversationId,
      agentId,
      intent: context.routerResult?.intent || null,
      inputSummary: context.message || context.userMessage || "",
      outputSummary: "",
      error,
    }).catch(() => null);
    throw error;
  }
}
