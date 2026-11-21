import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { EditorContent } from "@/features/panes/types/pane-content.types";
import type { useBufferStore as useBufferStoreHook } from "../stores/buffer.store";
import type { useEditorAppStore as useEditorAppStoreHook } from "../stores/editor-app.store";

const mocks = vi.hoisted(() => ({
  notifyDocumentSave: vi.fn(),
  recordLocalHistoryFile: vi.fn(),
  save: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: mocks.save,
}));

vi.mock("@/features/editor/lsp/lsp-client", () => ({
  LspClient: {
    getInstance: () => ({
      notifyDocumentSave: mocks.notifyDocumentSave,
    }),
  },
}));

vi.mock("@/features/file-system/controllers/platform", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/file-system/controllers/platform")>();
  return {
    ...original,
    writeFile: mocks.writeFile,
  };
});

vi.mock("@/features/local-history/api/local-history-api", () => ({
  recordLocalHistoryFile: mocks.recordLocalHistoryFile,
}));

const createMockStorage = () => {
  const storage = new Map<string, string>();

  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  };
};

function makeEditorBuffer(): EditorContent {
  return {
    id: "save-as-buffer",
    type: "editor",
    path: "/workspace/original.ts",
    name: "original.ts",
    content: "edited content",
    savedContent: "original content",
    isDirty: true,
    isVirtual: false,
    isPinned: false,
    isPreview: false,
    isActive: true,
    language: "typescript",
    tokens: [],
  };
}

describe("editor save as", () => {
  let useBufferStore: typeof useBufferStoreHook;
  let useEditorAppStore: typeof useEditorAppStoreHook;

  beforeEach(async () => {
    vi.stubGlobal("localStorage", createMockStorage());
    vi.stubGlobal("window", {
      __TAURI_INTERNALS__: {
        invoke: vi.fn().mockResolvedValue([]),
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    mocks.save.mockResolvedValue("/workspace/copy.ts");
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.recordLocalHistoryFile.mockResolvedValue(undefined);
    mocks.notifyDocumentSave.mockResolvedValue(undefined);

    ({ useBufferStore } = await import("../stores/buffer.store"));
    ({ useEditorAppStore } = await import("../stores/editor-app.store"));

    useBufferStore.setState({
      activeBufferId: "save-as-buffer",
      buffers: [makeEditorBuffer()],
      pendingClose: null,
      closedBuffersHistory: [],
    });
  });

  afterEach(() => {
    useBufferStore?.setState({
      activeBufferId: null,
      buffers: [],
      pendingClose: null,
      closedBuffersHistory: [],
    });
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("rebinds the buffer so the next save writes the new file, not the original", async () => {
    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith("/workspace/copy.ts", "edited content");
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      path: "/workspace/copy.ts",
      name: "copy.ts",
      isDirty: false,
      savedContent: "edited content",
    });

    mocks.writeFile.mockClear();
    await useEditorAppStore.getState().actions.handleSave();

    expect(mocks.writeFile).toHaveBeenCalledWith("/workspace/copy.ts", "edited content");
    expect(mocks.writeFile).not.toHaveBeenCalledWith("/workspace/original.ts", "edited content");
  });

  it("rebinds the buffer when Save As runs from the keymap command", async () => {
    const { saveActiveFileAs } = await import("@/features/keymaps/commands/file-command-actions");

    await saveActiveFileAs();

    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      path: "/workspace/copy.ts",
      name: "copy.ts",
      isDirty: false,
    });
  });

  it("keeps the buffer bound to the original file when the dialog is cancelled", async () => {
    mocks.save.mockResolvedValue(null);

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(false);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      path: "/workspace/original.ts",
      name: "original.ts",
      isDirty: true,
    });
  });
});
