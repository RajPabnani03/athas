import { describe, expect, it } from "vite-plus/test";
import { isAgentInputEnabled, isAcpAgentType, requiresProviderApiKey } from "./agent-auth-policy";

describe("agent-auth-policy", () => {
  it("treats ACP agents as self-authenticated", () => {
    expect(isAcpAgentType("claude-code")).toBe(true);
    expect(requiresProviderApiKey("claude-code")).toBe(false);
  });

  it("requires provider keys for HTTP agents", () => {
    expect(isAcpAgentType("custom")).toBe(false);
    expect(isAcpAgentType("company")).toBe(false);
    expect(requiresProviderApiKey("custom")).toBe(true);
    expect(requiresProviderApiKey("company")).toBe(true);
  });

  it("keeps input disabled for key-required agents without key", () => {
    expect(isAgentInputEnabled("company", false)).toBe(false);
    expect(isAgentInputEnabled("custom", false)).toBe(false);
    expect(isAgentInputEnabled("company", true)).toBe(true);
  });
});
