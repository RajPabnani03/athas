import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createSelectors } from "@/utils/zustand-selectors";
import { ORG_CHART, TOTAL_MEMBERS } from "../constants/org-chart";
import type {
  CompanyWorkflow,
  DelegationChain,
  DepartmentId,
  OrgMember,
  Task,
  TaskStatus,
  WorkflowStep,
} from "../types/org";

export interface ActivityLogEntry {
  id: string;
  memberId: string;
  memberName: string;
  memberRole: string;
  department: DepartmentId;
  message: string;
  timestamp: Date;
}

interface CompanyStoreState {
  isActive: boolean;
  memberStatuses: Map<string, OrgMember["status"]>;
  tasks: Task[];
  delegationHistory: DelegationChain[];
  workflows: CompanyWorkflow[];
  activityLog: ActivityLogEntry[];
  selectedMemberId: string | null;
  selectedDepartmentId: DepartmentId | null;
  isPanelExpanded: boolean;
  totalMembers: number;
}

interface CompanyStoreActions {
  actions: {
    activate: () => void;
    deactivate: () => void;
    setMemberStatus: (memberId: string, status: OrgMember["status"]) => void;
    addTask: (task: Task) => void;
    updateTaskStatus: (taskId: string, status: TaskStatus) => void;
    addDelegation: (chain: DelegationChain) => void;
    addWorkflow: (workflow: CompanyWorkflow) => void;
    updateWorkflowStep: (
      workflowId: string,
      stepIndex: number,
      update: Partial<WorkflowStep>,
    ) => void;
    completeWorkflow: (workflowId: string, result: string) => void;
    addActivityLog: (memberId: string, message: string) => void;
    setSelectedMember: (memberId: string | null) => void;
    setSelectedDepartment: (departmentId: DepartmentId | null) => void;
    togglePanel: () => void;
    reset: () => void;
  };
}

let logIdCounter = 0;

const useCompanyStoreBase = create<CompanyStoreState & CompanyStoreActions>()(
  immer((set) => ({
    isActive: false,
    memberStatuses: new Map(),
    tasks: [],
    delegationHistory: [],
    workflows: [],
    activityLog: [],
    selectedMemberId: null,
    selectedDepartmentId: null,
    isPanelExpanded: false,
    totalMembers: TOTAL_MEMBERS,

    actions: {
      activate: () =>
        set((state) => {
          state.isActive = true;
        }),

      deactivate: () =>
        set((state) => {
          state.isActive = false;
        }),

      setMemberStatus: (memberId, status) =>
        set((state) => {
          state.memberStatuses.set(memberId, status);
        }),

      addTask: (task) =>
        set((state) => {
          state.tasks.push(task);
        }),

      updateTaskStatus: (taskId, status) =>
        set((state) => {
          const task = state.tasks.find((t) => t.id === taskId);
          if (task) {
            task.status = status;
            task.updatedAt = new Date();
            if (status === "completed" || status === "failed") {
              task.completedAt = new Date();
            }
          }
        }),

      addDelegation: (chain) =>
        set((state) => {
          state.delegationHistory.push(chain);
        }),

      addWorkflow: (workflow) =>
        set((state) => {
          state.workflows.push(workflow);
        }),

      updateWorkflowStep: (workflowId, stepIndex, update) =>
        set((state) => {
          const workflow = state.workflows.find((w) => w.id === workflowId);
          if (workflow && workflow.steps[stepIndex]) {
            Object.assign(workflow.steps[stepIndex], update);
          }
        }),

      completeWorkflow: (workflowId, result) =>
        set((state) => {
          const workflow = state.workflows.find((w) => w.id === workflowId);
          if (workflow) {
            workflow.status = "completed";
            workflow.finalDeliverable = result;
          }
        }),

      addActivityLog: (memberId, message) =>
        set((state) => {
          const member = ORG_CHART.members.get(memberId);
          if (!member) return;

          logIdCounter++;
          const entry: ActivityLogEntry = {
            id: `log-${logIdCounter}`,
            memberId,
            memberName: member.name,
            memberRole: member.role,
            department: member.department,
            message,
            timestamp: new Date(),
          };

          state.activityLog.unshift(entry);
          if (state.activityLog.length > 200) {
            state.activityLog = state.activityLog.slice(0, 200);
          }
        }),

      setSelectedMember: (memberId) =>
        set((state) => {
          state.selectedMemberId = memberId;
        }),

      setSelectedDepartment: (departmentId) =>
        set((state) => {
          state.selectedDepartmentId = departmentId;
        }),

      togglePanel: () =>
        set((state) => {
          state.isPanelExpanded = !state.isPanelExpanded;
        }),

      reset: () =>
        set((state) => {
          state.tasks = [];
          state.delegationHistory = [];
          state.workflows = [];
          state.activityLog = [];
          state.memberStatuses = new Map();
          state.selectedMemberId = null;
          state.selectedDepartmentId = null;
        }),
    },
  })),
);

export const useCompanyStore = createSelectors(useCompanyStoreBase);
