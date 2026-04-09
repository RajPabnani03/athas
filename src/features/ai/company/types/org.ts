export type DepartmentId =
  | "executive"
  | "engineering"
  | "architecture"
  | "qa"
  | "devops"
  | "security"
  | "frontend"
  | "backend"
  | "data"
  | "product"
  | "design"
  | "documentation"
  | "support";

export type RoleLevel =
  | "c-suite"
  | "vp"
  | "director"
  | "manager"
  | "lead"
  | "senior"
  | "mid"
  | "junior";

export type TaskStatus = "queued" | "delegated" | "in-progress" | "review" | "completed" | "failed";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface OrgMember {
  id: string;
  name: string;
  role: string;
  level: RoleLevel;
  department: DepartmentId;
  reportsTo: string | null;
  directReports: string[];
  expertise: string[];
  systemPrompt: string;
  status: "idle" | "working" | "reviewing" | "blocked";
  currentTaskId: string | null;
}

export interface Department {
  id: DepartmentId;
  name: string;
  head: string;
  members: string[];
  description: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  delegatedBy: string;
  department: DepartmentId;
  status: TaskStatus;
  priority: TaskPriority;
  subtasks: string[];
  parentTaskId: string | null;
  result: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface DelegationChain {
  fromMemberId: string;
  toMemberId: string;
  taskId: string;
  reason: string;
  timestamp: Date;
}

export interface CompanyState {
  members: Map<string, OrgMember>;
  departments: Map<DepartmentId, Department>;
  tasks: Map<string, Task>;
  delegationHistory: DelegationChain[];
  activeWorkflow: string | null;
}

export interface TaskBreakdown {
  title: string;
  description: string;
  department: DepartmentId;
  priority: TaskPriority;
  assignTo: string;
  subtasks: TaskBreakdown[];
}

export interface WorkflowStep {
  memberId: string;
  action: string;
  input: string;
  output: string | null;
  status: TaskStatus;
  startedAt: Date;
  completedAt: Date | null;
}

export interface CompanyWorkflow {
  id: string;
  customerRequest: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
  status: "planning" | "executing" | "reviewing" | "completed" | "failed";
  finalDeliverable: string | null;
  createdAt: Date;
}
