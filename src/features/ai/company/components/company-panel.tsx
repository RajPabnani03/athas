import {
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  GitBranch,
  LayoutGrid,
  ListTree,
  Users,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import { ORG_CHART } from "../constants/org-chart";
import { useCompanyStore } from "../store/company-store";
import type { DepartmentId, OrgMember } from "../types/org";
import { ActivityFeed } from "./activity-feed";
import { TaskBoard } from "./task-board";

type PanelView = "org" | "tasks" | "activity";

export const CompanyPanel = memo(function CompanyPanel() {
  const isActive = useCompanyStore.use.isActive();
  const isPanelExpanded = useCompanyStore.use.isPanelExpanded();
  const totalMembers = useCompanyStore.use.totalMembers();
  const memberStatuses = useCompanyStore.use.memberStatuses();
  const togglePanel = useCompanyStore.use.actions().togglePanel;
  const [view, setView] = useState<PanelView>("org");

  const workingCount = useMemo(() => {
    let count = 0;
    memberStatuses.forEach((status) => {
      if (status === "working" || status === "reviewing") count++;
    });
    return count;
  }, [memberStatuses]);

  if (!isActive) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col border-t border-border bg-primary-bg",
        isPanelExpanded ? "h-72" : "",
      )}
    >
      <button
        type="button"
        onClick={togglePanel}
        className="flex items-center gap-2 border-b border-border px-3 py-2 text-left transition-colors hover:bg-hover"
        aria-label="Toggle company panel"
      >
        <Building2 size={12} className="text-accent" />
        <span className="flex-1 text-xs font-medium text-text">Company Agent</span>
        <span className="text-[10px] text-text-lighter">
          {totalMembers} members
          {workingCount > 0 ? ` / ${workingCount} active` : ""}
        </span>
        {isPanelExpanded ? (
          <ChevronDown size={12} className="text-text-lighter" />
        ) : (
          <ChevronRight size={12} className="text-text-lighter" />
        )}
      </button>

      {isPanelExpanded && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex border-b border-border">
            <ViewTab
              active={view === "org"}
              onClick={() => setView("org")}
              icon={<ListTree size={11} />}
              label="Org"
            />
            <ViewTab
              active={view === "tasks"}
              onClick={() => setView("tasks")}
              icon={<LayoutGrid size={11} />}
              label="Tasks"
            />
            <ViewTab
              active={view === "activity"}
              onClick={() => setView("activity")}
              icon={<GitBranch size={11} />}
              label="Activity"
            />
          </div>

          <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
            {view === "org" && <OrgTreeView />}
            {view === "tasks" && <TaskBoard />}
            {view === "activity" && <ActivityFeed />}
          </div>
        </div>
      )}
    </div>
  );
});

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] transition-colors",
        active ? "border-b-2 border-accent text-accent" : "text-text-lighter hover:text-text",
      )}
      aria-label={`View ${label}`}
    >
      {icon}
      {label}
    </button>
  );
}

const OrgTreeView = memo(function OrgTreeView() {
  const [expandedDepts, setExpandedDepts] = useState<Set<DepartmentId>>(new Set(["executive"]));
  const memberStatuses = useCompanyStore.use.memberStatuses();
  const setSelectedMember = useCompanyStore.use.actions().setSelectedMember;

  const toggleDept = useCallback((deptId: DepartmentId) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) {
        next.delete(deptId);
      } else {
        next.add(deptId);
      }
      return next;
    });
  }, []);

  const departments = useMemo(() => Array.from(ORG_CHART.departments.entries()), []);

  return (
    <div className="p-2">
      {departments.map(([deptId, dept]) => {
        const isExpanded = expandedDepts.has(deptId);
        const deptMembers = dept.members
          .map((id) => ORG_CHART.members.get(id))
          .filter(Boolean) as OrgMember[];

        const activeCount = deptMembers.filter((m) => {
          const status = memberStatuses.get(m.id);
          return status === "working" || status === "reviewing";
        }).length;

        return (
          <div key={deptId} className="mb-1">
            <button
              type="button"
              onClick={() => toggleDept(deptId)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-hover"
              aria-label={`Toggle ${dept.name}`}
            >
              {isExpanded ? (
                <ChevronDown size={10} className="text-text-lighter" />
              ) : (
                <ChevronRight size={10} className="text-text-lighter" />
              )}
              <Users size={10} className="text-accent" />
              <span className="flex-1 text-[11px] font-medium text-text">{dept.name}</span>
              <span className="text-[9px] text-text-lighter">
                {deptMembers.length}
                {activeCount > 0 ? ` (${activeCount} active)` : ""}
              </span>
            </button>

            {isExpanded && (
              <div className="ml-4 border-l border-border/40 pl-2">
                {deptMembers.map((m) => {
                  const status = memberStatuses.get(m.id) || "idle";
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMember(m.id)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-left transition-colors hover:bg-hover"
                      aria-label={`View ${m.name}`}
                    >
                      <CircleDot
                        size={8}
                        className={cn(
                          status === "working" && "text-green-500",
                          status === "reviewing" && "text-yellow-500",
                          status === "blocked" && "text-red-500",
                          status === "idle" && "text-text-lighter/40",
                        )}
                      />
                      <span className="flex-1 truncate text-[10px] text-text">{m.name}</span>
                      <span className="text-[9px] text-text-lighter">{m.role}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
