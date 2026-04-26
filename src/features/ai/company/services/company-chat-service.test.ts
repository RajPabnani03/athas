import { enableMapSet } from "immer";
import { describe, expect, it } from "vite-plus/test";
import { useCompanyStore } from "../store/company-store";
import { processCompanyMessage } from "./company-chat-service";

enableMapSet();

describe("processCompanyMessage", () => {
  it("delegates work without mutating frozen store objects", () => {
    useCompanyStore.getState().actions.reset();

    const result = processCompanyMessage(
      "Implement a frontend component with backend API changes and QA coverage",
    );

    expect(result).toContain("=== COMPANY STATUS ===");
    expect(useCompanyStore.getState().tasks.length).toBeGreaterThan(0);
    expect(useCompanyStore.getState().delegationHistory.length).toBeGreaterThan(0);
  });
});
