import { memo, useMemo } from "react";
import { cn } from "@/utils/cn";
import { ORG_CHART } from "../constants/org-chart";
import { useCompanyStore } from "../store/company-store";
import type { TaskStatus } from "../types/org";

const STATUS_COLUMNS: Array<{ status: TaskStatus; label: string; color: string }> = [
  { status: "queued", label: "Queued", color: "bg-text-lighter/40" },
  { status: "delegated", label: "Delegated", color: "bg-blue-500" },
  { status: "in-progress", label: "In Progress", color: "bg-yellow-500" },
  { status: "review", label: "Review", color: "bg-purple-500" },
  { status: "completed", label: "Done", color: "bg-green-500" },
  { status: "failed", label: "Failed", color: "bg-red-500" },
];

export const TaskBoard = memo(function TaskBoard() {
  const tasks = useCompanyStore.use.tasks();

  const tasksByStatus = useMemo(() => {
    const grouped = new Map<TaskStatus, typeof tasks>();
    for (const col of STATUS_COLUMNS) {
      grouped.set(
        col.status,
        tasks.filter((t) => t.status === col.status),
      );
    }
    return grouped;
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <p className="text-[11px] text-text-lighter">No tasks yet.</p>
        <p className="mt-1 text-[10px] text-text-lighter/70">
          Tasks will appear here as the CEO delegates work.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto p-2">
      {STATUS_COLUMNS.map((col) => {
        const colTasks = tasksByStatus.get(col.status) || [];
        if (colTasks.length === 0 && col.status === "failed") return null;

        return (
          <div key={col.status} className="min-w-[140px] flex-1">
            <div className="mb-1 flex items-center gap-1.5 px-1">
              <div className={cn("size-1.5 rounded-full", col.color)} />
              <span className="text-[10px] font-medium text-text-lighter">{col.label}</span>
              <span className="text-[9px] text-text-lighter/60">{colTasks.length}</span>
            </div>

            <div className="space-y-1">
              {colTasks.map((task) => {
                const assignee = ORG_CHART.members.get(task.assignedTo);
                return (
                  <div
                    key={task.id}
                    className="rounded-lg border border-border/40 bg-secondary-bg/40 p-2"
                  >
                    <p className="text-[10px] font-medium text-text">{task.title}</p>
                    {assignee && (
                      <p className="mt-0.5 text-[9px] text-text-lighter">
                        {assignee.name} ({assignee.role})
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-1">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[8px]",
                          task.priority === "critical" && "bg-red-500/10 text-red-500",
                          task.priority === "high" && "bg-orange-500/10 text-orange-500",
                          task.priority === "medium" && "bg-yellow-500/10 text-yellow-500",
                          task.priority === "low" && "bg-green-500/10 text-green-500",
                        )}
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});
