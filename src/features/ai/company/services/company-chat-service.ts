import { useCompanyStore } from "../store/company-store";
import { OrchestrationService } from "./orchestration-service";
import { CEO_ID } from "../constants/org-chart";
import type { DepartmentId, TaskPriority } from "../types/org";

let orchestrationInstance: OrchestrationService | null = null;

function getOrchestration(): OrchestrationService {
  if (!orchestrationInstance) {
    const store = useCompanyStore.getState();
    orchestrationInstance = new OrchestrationService({
      onMemberStatusChange: (memberId, status) => {
        store.actions.setMemberStatus(memberId, status);
      },
      onTaskCreated: (task) => {
        store.actions.addTask(task);
      },
      onTaskStatusChange: (taskId, status) => {
        store.actions.updateTaskStatus(taskId, status);
      },
      onDelegation: (chain) => {
        store.actions.addDelegation(chain);
      },
      onWorkflowStepUpdate: (workflowId, stepIndex, update) => {
        store.actions.updateWorkflowStep(workflowId, stepIndex, update);
      },
      onWorkflowComplete: (workflowId, result) => {
        store.actions.completeWorkflow(workflowId, result);
      },
      onActivityLog: (memberId, message) => {
        store.actions.addActivityLog(memberId, message);
      },
    });
  }
  return orchestrationInstance;
}

export function processCompanyMessage(userMessage: string): string {
  const orch = getOrchestration();
  const store = useCompanyStore.getState();

  store.actions.activate();

  const workflow = orch.startWorkflow(userMessage);
  store.actions.addWorkflow(workflow);

  store.actions.setMemberStatus(CEO_ID, "working");
  store.actions.addActivityLog(CEO_ID, `Received customer request: "${truncate(userMessage, 80)}"`);

  const analysis = analyzeRequest(userMessage);

  for (const dept of analysis.departments) {
    const head = orch.getDepartmentHead(dept.id);
    if (!head) continue;

    const task = orch.createTask(
      dept.taskTitle,
      dept.taskDescription,
      head.id,
      CEO_ID,
      dept.id,
      dept.priority,
    );

    orch.delegateTask(CEO_ID, head.id, task.id, `CEO delegation for: ${dept.taskTitle}`);
    orch.addWorkflowStep(workflow.id, head.id, dept.taskTitle, dept.taskDescription);

    simulateDepartmentWork(orch, head.id, task.id, dept.id);
  }

  store.actions.setMemberStatus(CEO_ID, "reviewing");

  const orgSummary = orch.getOrgSummary();
  const activeTasks = orch.getActiveTasksSummary();

  const ceoContext = [
    orch.buildCeoSystemPrompt(),
    "",
    "=== COMPANY STATUS ===",
    orgSummary,
    "",
    "=== ACTIVE TASKS ===",
    activeTasks,
    "",
    "=== DELEGATION PLAN ===",
    `Departments involved: ${analysis.departments.map((d) => d.id).join(", ")}`,
    analysis.departments
      .map(
        (d) =>
          `- ${d.id}: ${d.taskTitle} [${d.priority}] -> ${orch.getDepartmentHead(d.id)?.name || "N/A"}`,
      )
      .join("\n"),
    "",
    "=== CUSTOMER REQUEST ===",
    userMessage,
    "",
    "Respond to the customer as the CEO. Explain what your company is doing to address their request.",
    "Include the delegation plan, which teams are working on it, and what the customer can expect.",
  ].join("\n");

  store.actions.setMemberStatus(CEO_ID, "idle");

  return ceoContext;
}

interface DepartmentTask {
  id: DepartmentId;
  taskTitle: string;
  taskDescription: string;
  priority: TaskPriority;
}

interface RequestAnalysis {
  departments: DepartmentTask[];
  complexity: "simple" | "moderate" | "complex";
}

function analyzeRequest(message: string): RequestAnalysis {
  const lower = message.toLowerCase();
  const departments: DepartmentTask[] = [];

  const hasUI =
    /\b(ui|component|button|page|layout|design|style|css|tailwind|responsive|modal|dialog|panel|sidebar)\b/.test(
      lower,
    );
  const hasBackend =
    /\b(api|backend|server|database|rust|tauri|command|endpoint|service|query|schema)\b/.test(
      lower,
    );
  const hasBug =
    /\b(bug|fix|error|crash|broken|issue|problem|failing|not working|doesn't work)\b/.test(lower);
  const hasSecurity =
    /\b(security|auth|permission|encrypt|vulnerability|token|password|xss|csrf)\b/.test(lower);
  const hasPerformance = /\b(performance|slow|optimize|fast|speed|memory|cache|efficient)\b/.test(
    lower,
  );
  const hasTest = /\b(test|testing|qa|quality|coverage|e2e|integration|unit test)\b/.test(lower);
  const hasDevOps = /\b(deploy|ci|cd|pipeline|build|docker|release|infrastructure)\b/.test(lower);
  const hasDocs = /\b(document|docs|readme|guide|tutorial|changelog|api doc)\b/.test(lower);
  const hasFeature = /\b(feature|add|create|implement|build|new|develop)\b/.test(lower);
  const hasRefactor = /\b(refactor|clean|restructure|reorganize|simplify|improve code)\b/.test(
    lower,
  );
  const hasData = /\b(data|analytics|metrics|dashboard|report|sql|database model)\b/.test(lower);
  const hasDesign = /\b(design|ux|wireframe|prototype|user experience|accessibility|a11y)\b/.test(
    lower,
  );

  departments.push({
    id: "product",
    taskTitle: "Analyze customer requirements",
    taskDescription: `Analyze and create detailed requirements for: ${message}`,
    priority: "high",
  });

  if (hasUI || hasFeature) {
    departments.push({
      id: "frontend",
      taskTitle: "Frontend implementation",
      taskDescription: `Implement frontend changes for: ${message}`,
      priority: hasUI ? "high" : "medium",
    });
  }

  if (hasBackend || hasFeature) {
    departments.push({
      id: "backend",
      taskTitle: "Backend implementation",
      taskDescription: `Implement backend changes for: ${message}`,
      priority: hasBackend ? "high" : "medium",
    });
  }

  if (hasFeature || hasRefactor || hasUI || hasBackend) {
    departments.push({
      id: "architecture",
      taskTitle: "Architecture review",
      taskDescription: `Review architecture implications for: ${message}`,
      priority: "medium",
    });
  }

  if (hasBug || hasTest || hasFeature) {
    departments.push({
      id: "qa",
      taskTitle: "Quality assurance",
      taskDescription: `Create test plan and verify quality for: ${message}`,
      priority: hasBug ? "high" : "medium",
    });
  }

  if (hasSecurity) {
    departments.push({
      id: "security",
      taskTitle: "Security assessment",
      taskDescription: `Perform security review for: ${message}`,
      priority: "critical",
    });
  }

  if (hasPerformance) {
    departments.push({
      id: "engineering",
      taskTitle: "Performance optimization",
      taskDescription: `Analyze and optimize performance for: ${message}`,
      priority: "high",
    });
  }

  if (hasDevOps) {
    departments.push({
      id: "devops",
      taskTitle: "DevOps setup",
      taskDescription: `Configure DevOps infrastructure for: ${message}`,
      priority: "medium",
    });
  }

  if (hasDocs) {
    departments.push({
      id: "documentation",
      taskTitle: "Documentation update",
      taskDescription: `Create or update documentation for: ${message}`,
      priority: "low",
    });
  }

  if (hasData) {
    departments.push({
      id: "data",
      taskTitle: "Data engineering",
      taskDescription: `Implement data solutions for: ${message}`,
      priority: "medium",
    });
  }

  if (hasDesign) {
    departments.push({
      id: "design",
      taskTitle: "UX/UI design",
      taskDescription: `Design user experience for: ${message}`,
      priority: "high",
    });
  }

  if (departments.length <= 1) {
    departments.push({
      id: "engineering",
      taskTitle: "Engineering assessment",
      taskDescription: `Assess and implement engineering work for: ${message}`,
      priority: "medium",
    });
  }

  const complexity: RequestAnalysis["complexity"] =
    departments.length > 5 ? "complex" : departments.length > 3 ? "moderate" : "simple";

  return { departments, complexity };
}

function simulateDepartmentWork(
  orch: OrchestrationService,
  headId: string,
  parentTaskId: string,
  department: DepartmentId,
): void {
  const reports = orch.getDirectReports(headId);

  for (const report of reports.slice(0, 3)) {
    const subtask = orch.createTask(
      `${report.role} subtask`,
      `Contribute ${report.expertise.slice(0, 2).join(", ")} expertise`,
      report.id,
      headId,
      department,
      "medium",
      parentTaskId,
    );

    orch.delegateTask(
      headId,
      report.id,
      subtask.id,
      `Delegated by ${orch.getMember(headId)?.role}`,
    );

    const subReports = orch.getDirectReports(report.id);
    for (const sub of subReports.slice(0, 2)) {
      const subSubTask = orch.createTask(
        `${sub.role} work item`,
        `Execute ${sub.expertise.slice(0, 2).join(", ")} work`,
        sub.id,
        report.id,
        department,
        "medium",
        subtask.id,
      );
      orch.delegateTask(report.id, sub.id, subSubTask.id, `Work delegation by ${report.role}`);
    }
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}...`;
}
