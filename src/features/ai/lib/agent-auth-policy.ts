import { AGENT_OPTIONS, type AgentType } from "@/features/ai/types/ai-chat";

export function isAcpAgentType(agentId: AgentType): boolean {
  const agent = AGENT_OPTIONS.find((option) => option.id === agentId);
  return agent?.isAcp ?? false;
}

export function requiresProviderApiKey(agentId: AgentType): boolean {
  return !isAcpAgentType(agentId);
}

export function isAgentInputEnabled(agentId: AgentType, hasApiKey: boolean): boolean {
  return !requiresProviderApiKey(agentId) || hasApiKey;
}
