import { invoke } from "@tauri-apps/api/core";
import {
  AIProvider,
  type ProviderHeaders,
  type ProviderModel,
  type StreamRequest,
} from "./ai-provider-interface";

export class CopilotProvider extends AIProvider {
  buildHeaders(_apiKey?: string): ProviderHeaders {
    return {
      "Content-Type": "application/json",
    };
  }

  async buildHeadersAsync(_apiKey?: string): Promise<ProviderHeaders> {
    const token = await invoke<string>("copilot_get_api_token");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Request-Id": crypto.randomUUID(),
      "Copilot-Integration-Id": "vscode-chat",
      "Editor-Version": "athas/0.4.5",
      "Editor-Plugin-Version": "copilot/1.0.0",
    };
  }

  buildPayload(request: StreamRequest): any {
    return {
      model: request.modelId,
      messages: request.messages,
      stream: true,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    };
  }

  async validateApiKey(_apiKey?: string): Promise<boolean> {
    try {
      const status = await invoke<{ is_authenticated: boolean }>("copilot_get_auth_status");
      return status.is_authenticated;
    } catch {
      return false;
    }
  }

  buildUrl(_request?: StreamRequest): string {
    return "https://api.githubcopilot.com/chat/completions";
  }

  async getModels(): Promise<ProviderModel[]> {
    try {
      const token = await invoke<string>("copilot_get_api_token");
      const response = await fetch("https://api.githubcopilot.com/models", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Copilot-Integration-Id": "vscode-chat",
          "Editor-Version": "athas/0.4.5",
        },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map((m: any) => ({
        id: m.id || m.name,
        name: m.name || m.id,
        maxTokens: m.max_tokens || 128000,
      }));
    } catch {
      return [];
    }
  }
}
