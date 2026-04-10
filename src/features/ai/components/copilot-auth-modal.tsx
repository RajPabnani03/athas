import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle, Copy, ExternalLink, Loader2, LogIn, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";

type AuthStep = "idle" | "device_code" | "polling" | "success" | "error";

interface CopilotAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthComplete: () => void;
}

export function CopilotAuthModal({ isOpen, onClose, onAuthComplete }: CopilotAuthModalProps) {
  const [step, setStep] = useState<AuthStep>("idle");
  const [userCode, setUserCode] = useState("");
  const [verificationUri, setVerificationUri] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  useEffect(() => {
    if (!isOpen) {
      cleanup();
      setStep("idle");
      setUserCode("");
      setVerificationUri("");
      setCountdown(0);
      setErrorMessage("");
      setCopied(false);
    }
  }, [isOpen, cleanup]);

  const handleStartFlow = async () => {
    try {
      setStep("device_code");
      setErrorMessage("");

      const response = await invoke<{
        device_code: string;
        user_code: string;
        verification_uri: string;
        expires_in: number;
        interval: number;
      }>("copilot_start_device_flow");

      setUserCode(response.user_code);
      setVerificationUri(response.verification_uri);
      setCountdown(response.expires_in);

      // Start countdown
      const expiresAt = Date.now() + response.expires_in * 1000;
      countdownRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setStep("error");
          setErrorMessage("Device code expired. Please try again.");
          cleanup();
        }
      }, 1000);

      // Start polling
      setStep("polling");
      const pollInterval = response.interval * 1000;
      pollRef.current = setInterval(async () => {
        try {
          const result = await invoke<string | null>("copilot_poll_device_token");
          if (result !== null) {
            cleanup();
            setStep("success");
            onAuthComplete();
            setTimeout(() => onClose(), 1500);
          }
        } catch (err: any) {
          cleanup();
          setStep("error");
          setErrorMessage(err?.toString() || "Authentication failed");
        }
      }, pollInterval);
    } catch (err: any) {
      setStep("error");
      setErrorMessage(err?.toString() || "Failed to start device flow");
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-150 flex items-center justify-center bg-black/50"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="flex max-h-[90vh] w-[480px] flex-col rounded-lg border border-border bg-primary-bg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-border border-b p-4">
          <div className="flex items-center gap-2">
            <LogIn className="text-text" />
            <h3 className="ui-font text-sm text-text">GitHub Copilot Authentication</h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-text-lighter hover:text-text"
          >
            <X />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {step === "idle" && (
            <>
              <div className="text-text-lighter text-xs leading-relaxed">
                Sign in with your GitHub account to access Copilot&apos;s AI models. Requires an
                active GitHub Copilot subscription (Individual, Business, or Enterprise).
              </div>
              <div className="rounded border border-border bg-secondary-bg p-3">
                <div className="mb-2 font-medium text-text text-xs">
                  How it works:
                </div>
                <ol className="list-inside list-decimal space-y-1 text-text-lighter text-xs">
                  <li>Click &quot;Sign in with GitHub&quot; to get a device code</li>
                  <li>Open the verification URL and enter the code</li>
                  <li>Authorize Athas in your GitHub account</li>
                  <li>Start using Copilot models in chat</li>
                </ol>
              </div>
            </>
          )}

          {(step === "device_code" || step === "polling") && (
            <>
              <div className="text-text-lighter text-xs leading-relaxed">
                Open the URL below and enter this code to authorize Athas:
              </div>

              <div className="space-y-3 rounded border border-border bg-secondary-bg p-4">
                <div>
                  <div className="mb-1 font-medium text-text text-xs">Verification URL:</div>
                  <a
                    href={verificationUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-400 text-sm transition-colors hover:text-blue-300"
                  >
                    {verificationUri}
                    <ExternalLink />
                  </a>
                </div>

                <div>
                  <div className="mb-1 font-medium text-text text-xs">Device Code:</div>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-primary-bg px-3 py-1.5 font-mono text-lg tracking-widest text-text">
                      {userCode}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleCopyCode}
                      className="gap-1 text-text-lighter"
                    >
                      {copied ? <CheckCircle /> : <Copy />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between border-border border-t pt-2">
                  <span className="text-text-lighter text-xs">
                    Expires in {formatCountdown(countdown)}
                  </span>
                  {step === "polling" && (
                    <span className="flex items-center gap-1 text-text-lighter text-xs">
                      <Loader2 className="size-3 animate-spin" />
                      Waiting for authorization...
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="size-10 text-green-500" />
              <div className="font-medium text-text text-sm">Successfully authenticated!</div>
              <div className="text-text-lighter text-xs">
                You can now use GitHub Copilot models in chat.
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <AlertCircle className="size-10 text-red-400" />
              <div className="font-medium text-text text-sm">Authentication failed</div>
              <div className="text-red-400 text-xs">{errorMessage}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-border border-t p-4">
          {step === "idle" && (
            <>
              <Button onClick={handleStartFlow} className="flex-1 gap-2">
                <LogIn />
                Sign in with GitHub
              </Button>
              <Button onClick={onClose} variant="ghost" className="px-4">
                Cancel
              </Button>
            </>
          )}

          {(step === "device_code" || step === "polling") && (
            <Button
              onClick={() => {
                cleanup();
                onClose();
              }}
              variant="ghost"
              className="flex-1"
            >
              Cancel
            </Button>
          )}

          {step === "error" && (
            <>
              <Button
                onClick={() => {
                  setStep("idle");
                  setErrorMessage("");
                }}
                className="flex-1"
              >
                Try Again
              </Button>
              <Button onClick={onClose} variant="ghost" className="px-4">
                Cancel
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
