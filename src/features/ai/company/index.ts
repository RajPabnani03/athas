export { CompanyPanel } from "./components/company-panel";
export { useCompanyStore } from "./store/company-store";
export { OrchestrationService } from "./services/orchestration-service";
export { processCompanyMessage } from "./services/company-chat-service";
export { ORG_CHART, CEO_ID, TOTAL_MEMBERS } from "./constants/org-chart";
export type {
  OrgMember,
  Department,
  DepartmentId,
  Task,
  TaskStatus,
  TaskPriority,
  CompanyWorkflow,
  DelegationChain,
} from "./types/org";
