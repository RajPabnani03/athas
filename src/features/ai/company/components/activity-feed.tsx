import { memo } from "react";
import { cn } from "@/utils/cn";
import { useCompanyStore } from "../store/company-store";

export const ActivityFeed = memo(function ActivityFeed() {
  const activityLog = useCompanyStore.use.activityLog();

  if (activityLog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <p className="text-[11px] text-text-lighter">No activity yet.</p>
        <p className="mt-1 text-[10px] text-text-lighter/70">
          Send a message to the CEO to start the company workflow.
        </p>
      </div>
    );
  }

  return (
    <div className="p-2">
      {activityLog.slice(0, 50).map((entry) => (
        <div
          key={entry.id}
          className="mb-1 flex items-start gap-2 rounded-md px-2 py-1 transition-colors hover:bg-hover/50"
        >
          <div
            className={cn(
              "mt-0.5 size-1.5 shrink-0 rounded-full",
              entry.message.includes("Task assigned") && "bg-blue-500",
              entry.message.includes("Delegated") && "bg-yellow-500",
              entry.message.includes("Received") && "bg-green-500",
              entry.message.includes("Completed") && "bg-accent",
              !entry.message.includes("Task assigned") &&
                !entry.message.includes("Delegated") &&
                !entry.message.includes("Received") &&
                !entry.message.includes("Completed") &&
                "bg-text-lighter/40",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-medium text-text">{entry.memberName}</span>
              <span className="text-[9px] text-text-lighter">({entry.memberRole})</span>
            </div>
            <p className="text-[10px] text-text-lighter">{entry.message}</p>
          </div>
          <span className="shrink-0 text-[9px] text-text-lighter/60">
            {formatTime(entry.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
});

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  return `${Math.floor(diff / 3600000)}h`;
}
