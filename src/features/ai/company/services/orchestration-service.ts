import { CEO_ID, ORG_CHART } from "../constants/org-chart";
import { buildCeoPrompt, buildDelegationPrompt } from "../constants/system-prompts";
import type {
  CompanyWorkflow,
  DelegationChain,
  DepartmentId,
  OrgMember,
  Task,
  TaskPriority,
  TaskStatus,
  WorkflowStep,
} from "../types/org";

let taskIdCounter = 0;
function nextTaskId(): string {
  taskIdCounter++;
  return `task-${Date.now()}-${taskIdCounter}`;
}

let workflowIdCounter = 0;
function nextWorkflowId(): string {
  workflowIdCounter++;
  return `workflow-${Date.now()}-${workflowIdCounter}`;
}

export interface OrchestrationCallbacks {
  onMemberStatusChange: (memberId: string, status: OrgMember["status"]) => void;
  onTaskCreated: (task: Task) => void;
  onTaskStatusChange: (taskId: string, status: TaskStatus) => void;
  onDelegation: (chain: DelegationChain) => void;
  onWorkflowStepUpdate: (
    workflowId: string,
    stepIndex: number,
    update: Partial<WorkflowStep>,
  ) => void;
  onWorkflowComplete: (workflowId: string, result: string) => void;
  onActivityLog: (memberId: string, message: string) => void;
}

export class OrchestrationService {
  private workflows = new Map<string, CompanyWorkflow>();
  private tasks = new Map<string, Task>();
  private callbacks: OrchestrationCallbacks;

  constructor(callbacks: OrchestrationCallbacks) {
    this.callbacks = callbacks;
  }

  resetState(): void {
    this.workflows.clear();
    this.tasks.clear();
  }

  getCeo(): OrgMember {
    return ORG_CHART.members.get(CEO_ID)!;
  }

  getMember(id: string): OrgMember | undefined {
    return ORG_CHART.members.get(id);
  }

  getDepartmentMembers(departmentId: DepartmentId): OrgMember[] {
    const dept = ORG_CHART.departments.get(departmentId);
    if (!dept) return [];
    return dept.members.map((id) => ORG_CHART.members.get(id)!).filter(Boolean);
  }

  getDepartmentHead(departmentId: DepartmentId): OrgMember | undefined {
    const dept = ORG_CHART.departments.get(departmentId);
    if (!dept) return undefined;
    return ORG_CHART.members.get(dept.head);
  }

  getDirectReports(memberId: string): OrgMember[] {
    const member = ORG_CHART.members.get(memberId);
    if (!member) return [];
    return member.directReports.map((id) => ORG_CHART.members.get(id)!).filter(Boolean);
  }

  getReportChain(memberId: string): OrgMember[] {
    const chain: OrgMember[] = [];
    let current = ORG_CHART.members.get(memberId);
    while (current?.reportsTo) {
      const manager = ORG_CHART.members.get(current.reportsTo);
      if (manager) {
        chain.push(manager);
        current = manager;
      } else {
        break;
      }
    }
    return chain;
  }

  createTask(
    title: string,
    description: string,
    assignedTo: string,
    delegatedBy: string,
    department: DepartmentId,
    priority: TaskPriority,
    parentTaskId: string | null = null,
  ): Task {
    const task: Task = {
      id: nextTaskId(),
      title,
      description,
      assignedTo,
      delegatedBy,
      department,
      status: "queued",
      priority,
      subtasks: [],
      parentTaskId,
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    this.tasks.set(task.id, task);
    this.callbacks.onTaskCreated(task);
    this.callbacks.onActivityLog(assignedTo, `Task assigned: ${title}`);

    if (parentTaskId) {
      const parentTask = this.tasks.get(parentTaskId);
      if (parentTask) {
        parentTask.subtasks.push(task.id);
      }
    }

    return task;
  }

  delegateTask(fromId: string, toId: string, taskId: string, reason: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = "delegated";
    task.assignedTo = toId;
    task.updatedAt = new Date();

    const chain: DelegationChain = {
      fromMemberId: fromId,
      toMemberId: toId,
      taskId,
      reason,
      timestamp: new Date(),
    };

    this.callbacks.onDelegation(chain);
    this.callbacks.onTaskStatusChange(taskId, "delegated");
    this.callbacks.onMemberStatusChange(toId, "working");
    this.callbacks.onActivityLog(
      fromId,
      `Delegated "${task.title}" to ${this.getMember(toId)?.name}`,
    );
    this.callbacks.onActivityLog(toId, `Received task: ${task.title}`);
  }

  updateTaskStatus(taskId: string, status: TaskStatus, result?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;
    task.updatedAt = new Date();
    if (result) task.result = result;
    if (status === "completed" || status === "failed") {
      task.completedAt = new Date();
      this.callbacks.onMemberStatusChange(task.assignedTo, "idle");
    }

    this.callbacks.onTaskStatusChange(taskId, status);
  }

  startWorkflow(customerRequest: string): CompanyWorkflow {
    const workflow: CompanyWorkflow = {
      id: nextWorkflowId(),
      customerRequest,
      steps: [],
      currentStepIndex: 0,
      status: "planning",
      finalDeliverable: null,
      createdAt: new Date(),
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  addWorkflowStep(workflowId: string, memberId: string, action: string, input: string): number {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return -1;

    const step: WorkflowStep = {
      memberId,
      action,
      input,
      output: null,
      status: "queued",
      startedAt: new Date(),
      completedAt: null,
    };

    workflow.steps.push(step);
    return workflow.steps.length - 1;
  }

  completeWorkflowStep(workflowId: string, stepIndex: number, output: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || !workflow.steps[stepIndex]) return;

    workflow.steps[stepIndex].output = output;
    workflow.steps[stepIndex].status = "completed";
    workflow.steps[stepIndex].completedAt = new Date();
    workflow.currentStepIndex = stepIndex + 1;

    this.callbacks.onWorkflowStepUpdate(workflowId, stepIndex, {
      output,
      status: "completed",
      completedAt: new Date(),
    });
  }

  completeWorkflow(workflowId: string, finalResult: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    workflow.status = "completed";
    workflow.finalDeliverable = finalResult;
    this.callbacks.onWorkflowComplete(workflowId, finalResult);
  }

  buildCeoSystemPrompt(): string {
    return buildCeoPrompt();
  }

  buildDelegationContext(
    fromId: string,
    toId: string,
    taskDescription: string,
    additionalContext: string,
  ): string {
    const from = this.getMember(fromId);
    const to = this.getMember(toId);
    if (!from || !to) return taskDescription;

    return buildDelegationPrompt(from.role, to.role, taskDescription, additionalContext);
  }

  findBestAssignee(department: DepartmentId, expertise: string[]): OrgMember | undefined {
    const members = this.getDepartmentMembers(department);
    const available = members.filter((m) => m.status === "idle");

    if (available.length === 0) return this.getDepartmentHead(department);

    let bestMatch: OrgMember | undefined;
    let bestScore = -1;

    for (const member of available) {
      const score = member.expertise.filter((e) =>
        expertise.some((req) => e.toLowerCase().includes(req.toLowerCase())),
      ).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = member;
      }
    }

    return bestMatch || available[0];
  }

  getOrgSummary(): string {
    const deptSummaries: string[] = [];
    for (const [, dept] of ORG_CHART.departments) {
      const head = ORG_CHART.members.get(dept.head);
      deptSummaries.push(
        `- ${dept.name} (${dept.members.length} members, led by ${head?.name || "N/A"})`,
      );
    }
    return [
      `Company: ${ORG_CHART.members.size} members across ${ORG_CHART.departments.size} departments`,
      "",
      "Departments:",
      ...deptSummaries,
    ].join("\n");
  }

  getActiveTasksSummary(): string {
    const activeTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status !== "completed" && t.status !== "failed",
    );
    if (activeTasks.length === 0) return "No active tasks.";

    return activeTasks
      .map((t) => {
        const assignee = this.getMember(t.assignedTo);
        return `- [${t.status.toUpperCase()}] ${t.title} (assigned to ${assignee?.name || "unknown"})`;
      })
      .join("\n");
  }
}
