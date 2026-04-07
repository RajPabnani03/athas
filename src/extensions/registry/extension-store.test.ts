import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { AvailableExtension } from "./extension-store-types";

const { installExtensionLifecycleMock } = vi.hoisted(() => ({
  installExtensionLifecycleMock: vi.fn(),
}));

vi.mock("./extension-store-helpers", () => ({
  findExtensionForFile: vi.fn(),
  isExtensionAllowedByEnterprisePolicy: vi.fn(() => true),
  mergeMarketplaceLanguageExtensions: vi.fn((extensions: unknown) => extensions),
}));

vi.mock("./extension-store-bootstrap", () => ({
  buildInstalledExtensionsMap: vi.fn(() => new Map()),
  initializeExtensionStoreBootstrap: vi.fn(async () => {}),
  loadInstalledExtensionsSnapshot: vi.fn(async () => ({
    backendInstalled: [],
    indexedDBInstalled: [],
  })),
}));

vi.mock("./extension-store-lifecycle", () => ({
  buildInstalledExtensionMetadata: vi.fn((id: string) => ({
    id,
    name: id,
    version: "1.0.0",
    installed_at: new Date().toISOString(),
    enabled: true,
  })),
  installExtensionLifecycle: installExtensionLifecycleMock,
  uninstallExtensionLifecycle: vi.fn(),
  updateExtensionLifecycle: vi.fn(),
}));

vi.mock("../installer/extension-installer", () => ({
  extensionInstaller: {
    listInstalled: vi.fn(async () => []),
  },
}));

vi.mock("../languages/language-packager", () => ({
  getPackagedLanguageExtensions: vi.fn(() => []),
}));

import { useExtensionStore } from "./extension-store";

const NON_LANGUAGE_EXTENSION_ID = "athas.theme-solarized";

const nonLanguageExtension: AvailableExtension = {
  manifest: {
    id: NON_LANGUAGE_EXTENSION_ID,
    name: "solarized-theme",
    displayName: "Solarized Theme",
    description: "Theme extension without language contributions",
    version: "1.0.0",
    publisher: "athas",
    categories: ["Theme"],
    installation: {
      downloadUrl: "https://example.com/theme.zip",
      checksum: "checksum",
      size: 1024,
    },
  },
  isInstalled: false,
  isInstalling: false,
};

describe("extension-store installExtension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExtensionStore.setState({
      availableExtensions: new Map([[NON_LANGUAGE_EXTENSION_ID, { ...nonLanguageExtension }]]),
      installedExtensions: new Map(),
      extensionsWithUpdates: new Set(),
      isLoadingRegistry: false,
      isLoadingInstalled: false,
      isCheckingUpdates: false,
    });
  });

  it("routes non-language extensions through lifecycle install flow", async () => {
    installExtensionLifecycleMock.mockImplementationOnce(
      async (params: { onNonLanguageInstalled: () => void }) => {
        params.onNonLanguageInstalled();
      },
    );

    await useExtensionStore.getState().actions.installExtension(NON_LANGUAGE_EXTENSION_ID);

    expect(installExtensionLifecycleMock).toHaveBeenCalledTimes(1);
    const extension = useExtensionStore
      .getState()
      .availableExtensions.get(NON_LANGUAGE_EXTENSION_ID);
    expect(extension?.isInstalling).toBe(false);
    expect(extension?.isInstalled).toBe(true);
    expect(extension?.installProgress).toBe(100);
  });
});
