import { describe, expect, test } from "vite-plus/test";
import { processCompanyMessage } from "../services/company-chat-service";
import { useCompanyStore } from "../store/company-store";

describe("processCompanyMessage", () => {
  test("resets company state between requests to avoid prompt bloat", () => {
    const message =
      "Build a secure backend API with frontend UI updates, tests, and documentation.";
    const store = useCompanyStore.getState();

    store.actions.reset();
    store.actions.deactivate();

    processCompanyMessage(message);
    const firstTaskCount = useCompanyStore.getState().tasks.length;
    expect(firstTaskCount).toBeGreaterThan(0);

    processCompanyMessage(message);
    const secondTaskCount = useCompanyStore.getState().tasks.length;
    expect(secondTaskCount).toBe(firstTaskCount);
  });
});
