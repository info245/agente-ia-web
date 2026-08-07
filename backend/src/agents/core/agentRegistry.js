import { runLeadRouterAgent } from "../tmedia/leadRouterAgent.js";
import { runSalesQualificationAgent } from "../tmedia/salesQualificationAgent.js";
import { runServiceExpertAgent } from "../tmedia/serviceExpertAgent.js";
import { runLeadMemoryAgent } from "../tmedia/leadMemoryAgent.js";
import { runClosingAgent } from "../tmedia/closingAgent.js";
import { runNotificationAgent } from "../tmedia/notificationAgent.js";
import { runConversationAgent } from "../tmedia/conversationAgent.js";

const registry = new Map([
  ["lead_router", runLeadRouterAgent],
  ["sales_qualification", runSalesQualificationAgent],
  ["service_expert", runServiceExpertAgent],
  ["lead_memory", runLeadMemoryAgent],
  ["closing", runClosingAgent],
  ["notification", runNotificationAgent],
  ["conversation", runConversationAgent],
]);

export function getAgent(agentId) {
  return registry.get(agentId) || null;
}

export function registerAgent(agentId, handler) {
  if (!agentId || typeof handler !== "function") {
    throw new Error("registerAgent requiere agentId y handler");
  }
  registry.set(agentId, handler);
}

export function listAgents() {
  return Array.from(registry.keys());
}
