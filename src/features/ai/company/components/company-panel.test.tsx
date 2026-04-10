import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { CompanyPanel } from "./company-panel";
import { useCompanyStore } from "../store/company-store";

function resetCompanyStoreState() {
  const { actions } = useCompanyStore.getState();
  actions.reset();
  actions.deactivate();
}

describe("CompanyPanel", () => {
  beforeEach(() => {
    resetCompanyStoreState();
  });

  it("does not render while inactive", () => {
    const html = renderToStaticMarkup(<CompanyPanel />);
    expect(html).toBe("");
  });

  it("uses a bounded layout when expanded", () => {
    const { actions } = useCompanyStore.getState();
    actions.activate();
    actions.togglePanel();

    const html = renderToStaticMarkup(<CompanyPanel />);
    expect(html).toContain("shrink-0");
    expect(html).toContain("h-64");
    expect(html).not.toContain("h-full flex-col border-t");
  });
});
