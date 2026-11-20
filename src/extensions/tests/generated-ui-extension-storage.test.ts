import { describe, expect, it } from "vite-plus/test";
import {
  createGeneratedExtensionManifest,
  wrapGeneratedExtensionSource,
} from "../ui/services/generated/generated-ui-extension-installer";
import { validateGeneratedExtensionSource } from "@/extensions/ui/services/generated/generated-ui-extension-source";
import {
  normalizeGeneratedExtensionId,
  readStoredGeneratedExtensions,
} from "../ui/services/generated/generated-ui-extension-storage";

describe("generated UI extension storage", () => {
  it("normalizes generated extension ids into their isolated namespace", () => {
    expect(normalizeGeneratedExtensionId("  Project Dashboard / Preview  ")).toBe(
      "generated.project-dashboard-preview",
    );
    expect(normalizeGeneratedExtensionId("already.valid-id")).toBe("generated.already.valid-id");
  });

  it("wraps generated code as an isolated worker module", () => {
    const extension = {
      id: "release-health",
      name: "Release Health",
      description: "Tracks release readiness.",
      contributionType: "sidebar" as const,
      permissions: { workspace: "read" as const },
      code: 'api.commands.register({ id: "workspace", title: "Workspace", run: () => api.workspace.getCurrent() }); api.sidebar.registerView({ id: "health", title: "Health", render: () => api.ui.empty("Ready") });',
    };

    expect(createGeneratedExtensionManifest(extension)).toMatchObject({
      id: "generated.release-health",
      name: "Release Health",
      main: "generated.js",
      publisher: "athas.generated",
      permissions: { workspace: "read" },
    });
    expect(wrapGeneratedExtensionSource(extension.code)).toBe(
      `export async function activate(api) {\n"use strict";\n${extension.code}\n}\n`,
    );
  });

  it("rejects generated source that can escape the provided worker API", () => {
    expect(() => validateGeneratedExtensionSource('import("https://example.com/tool.js")')).toThrow(
      "must not use imports",
    );
    expect(() => validateGeneratedExtensionSource('window.open("https://example.com")')).toThrow(
      "must not use browser DOM APIs",
    );
    expect(() => validateGeneratedExtensionSource('fetch("https://example.com")')).toThrow(
      "must not use direct network or worker APIs",
    );
    expect(() => validateGeneratedExtensionSource('postMessage({ type: "ready" })')).toThrow(
      "must not use worker messaging or storage globals",
    );
    expect(() => validateGeneratedExtensionSource("globalThis.fetch")).toThrow(
      "must not use direct network or worker APIs",
    );
    expect(() =>
      validateGeneratedExtensionSource("[].filter.constructor('return this')()"),
    ).toThrow("must not use dynamic code constructors");
    expect(() =>
      validateGeneratedExtensionSource('const issue = { location: "editor" }; issue.location;'),
    ).not.toThrow();
    expect(() => validateGeneratedExtensionSource("   ")).toThrow("must not be empty");
  });

  it("normalizes host permissions for stored extensions", () => {
    const manifest = createGeneratedExtensionManifest({
      id: "release-health",
      name: "Release Health",
      description: "Tracks release readiness.",
      contributionType: "command",
      permissions: {
        workspace: "read",
        network: ["https://status.example.com/", "https://status.example.com"],
        clipboardWrite: true,
      },
      code: `
        api.commands.register({
          id: "refresh",
          title: "Refresh",
          async run() {
            await api.workspace.getCurrent();
            await api.http.request({ url: "https://status.example.com/health" });
            await api.clipboard.writeText("workspace ready");
          },
        });
      `,
    });

    expect(manifest.permissions).toEqual({
      workspace: "read",
      network: ["https://status.example.com"],
      clipboardWrite: true,
    });
  });

  it.each([
    {
      permissions: undefined,
      code: 'api.commands.register({ id: "read", title: "Read", run: () => api.workspace.getCurrent() });',
      error: "uses workspace read without requesting permission",
    },
    {
      permissions: { openExternal: true },
      code: 'api.sidebar.registerView({ id: "health", title: "Health", render: () => api.ui.empty("Ready") });',
      error: "requests unused external links permission",
    },
    {
      permissions: { network: ["https://*"] },
      code: 'api.commands.register({ id: "load", title: "Load", run: () => api.http.request({ url: "https://example.com" }) });',
      error: "must be an exact origin",
    },
  ])("rejects stored extension permissions: $error", ({ code, permissions, error }) => {
    expect(() =>
      createGeneratedExtensionManifest({
        id: "release-health",
        name: "Release Health",
        description: "Tracks release readiness.",
        contributionType: "command",
        code,
        permissions,
      }),
    ).toThrow(error);
  });

  it("keeps compatible stored extensions available for worker migration", () => {
    const stored = [
      {
        id: "legacy-dashboard",
        name: "Legacy Dashboard",
        description: "Stored before the worker runtime migration.",
        contributionType: "sidebar",
        code: 'api.sidebar.registerView({ id: "dashboard", title: "Dashboard", render: () => api.ui.stack({ children: [api.ui.text({ children: "Ready" })] }) });',
      },
    ];
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => JSON.stringify(stored),
      },
    });

    try {
      expect(readStoredGeneratedExtensions()).toEqual(stored);
      expect(() => validateGeneratedExtensionSource(stored[0].code)).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  });
});
