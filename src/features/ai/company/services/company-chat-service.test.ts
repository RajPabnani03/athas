import { describe, expect, it } from "vite-plus/test";
import { enableMapSet } from "immer";
import { useCompanyStore } from "../store/company-store";
import { processCompanyMessage } from "./company-chat-service";

enableMapSet();

function countActiveTaskLines(context: string): number {
  return context.split("\n").filter((line) => line.startsWith("- [")).length;
}

describe("processCompanyMessage", () => {
  it("resets company orchestration state between messages", () => {
    const request = "Build a new frontend panel with backend API support";

    const firstContext = processCompanyMessage(request);
    const firstTaskCount = countActiveTaskLines(firstContext);
    const firstStoreTaskCount = useCompanyStore.getState().tasks.length;

    expect(firstTaskCount).toBeGreaterThan(0);
    expect(firstStoreTaskCount).toBe(firstTaskCount);

    const secondContext = processCompanyMessage(request);
    const secondTaskCount = countActiveTaskLines(secondContext);
    const secondStoreTaskCount = useCompanyStore.getState().tasks.length;

    expect(secondTaskCount).toBe(firstTaskCount);
    expect(secondStoreTaskCount).toBe(firstStoreTaskCount);
  });
});
