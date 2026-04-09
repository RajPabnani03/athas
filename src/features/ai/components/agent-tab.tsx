import { useBufferStore } from "@/features/editor/stores/buffer-store";
import { CompanyPanel } from "@/features/ai/company/components/company-panel";
import AIChat from "./chat/ai-chat";

export function AgentTab() {
  const buffers = useBufferStore.use.buffers();
  const activeBufferId = useBufferStore.use.activeBufferId();
  const activeBuffer = buffers.find((b) => b.id === activeBufferId) || null;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1">
        <AIChat mode="chat" activeBuffer={activeBuffer} buffers={buffers} />
      </div>
      <CompanyPanel />
    </div>
  );
}
