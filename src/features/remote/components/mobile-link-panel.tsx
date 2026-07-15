import { DeviceMobile, LinkSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { LoadingIndicator } from "@/ui/loading";
import { toast } from "@/ui/toast";
import { createMobilePairingSession, type MobilePairingSession } from "../services/mobile-link-actions";

const MobileLinkPanel = () => {
  const [pairingSession, setPairingSession] = useState<MobilePairingSession | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const handleCreateSession = async () => {
    setIsCreatingSession(true);
    try {
      const session = await createMobilePairingSession();
      setPairingSession(session);
      toast.success("Mobile pairing session created");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create mobile pairing session";
      toast.error(message);
    } finally {
      setIsCreatingSession(false);
    }
  };

  return (
    <div className="border-border border-t px-2 py-2">
      <div className="mb-2 flex items-center gap-1.5 text-text ui-text-xs">
        <DeviceMobile className="text-text-lighter" />
        <span className="ui-font font-medium tracking-wide">Mobile Link</span>
      </div>

      <p className="mb-2 text-text-lighter ui-text-xs">
        Pair your phone with this laptop using a temporary code.
      </p>

      <Button onClick={handleCreateSession} compact disabled={isCreatingSession} className="w-full">
        {isCreatingSession ? (
          <LoadingIndicator label="Creating session" compact />
        ) : (
          <span className="flex items-center justify-center gap-1.5">
            <LinkSimple />
            Start Pairing
          </span>
        )}
      </Button>

      {pairingSession ? (
        <div className="mt-2 rounded border border-border bg-primary-bg p-2">
          <p className="ui-text-xs text-text-lighter">Pairing code</p>
          <p className="ui-font ui-text-sm font-semibold text-text">{pairingSession.pairingCode}</p>
          <p className="mt-1 break-all ui-text-xs text-text-lighter">{pairingSession.deeplinkUrl}</p>
        </div>
      ) : null}
    </div>
  );
};

export default MobileLinkPanel;
