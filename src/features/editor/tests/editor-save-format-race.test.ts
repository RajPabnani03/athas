import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { EditorContent } from "@/features/panes/types/pane-content.types";
import { useSettingsStore } from "@/features/settings/stores/settings.store";
import type { useBufferStore as useBufferStoreHook } from "../stores/buffer.store";
import type { useEditorAppStore as useEditorAppStoreHook } from "../stores/editor-app.store";

const mocks = vi.hoisted(() => ({
  formatContent: vi.fn(),
  notifyDocumentSave: vi.fn(),
  recordLocalHistoryFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/features/editor/formatter/formatter-service", () => ({
  formatContent: mocks.formatContent,
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

function makeEditorBuffer(content: string): EditorContent {
  return {
    id: "format-buffer",
    type: "editor",
    path: "/workspace/format.ts",
    name: "format.ts",
    content,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("editor format on save race", () => {
  let useBufferStore: typeof useBufferStoreHook;
  let useEditorAppStore: typeof useEditorAppStoreHook;
  const initialSettings = useSettingsStore.getState().settings;

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
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.recordLocalHistoryFile.mockResolvedValue(undefined);
    mocks.notifyDocumentSave.mockResolvedValue(undefined);

    ({ useBufferStore } = await import("../stores/buffer.store"));
    ({ useEditorAppStore } = await import("../stores/editor-app.store"));

    useSettingsStore.setState({
      settings: { ...initialSettings, formatOnSave: true, lintOnSave: false },
    });
    useBufferStore.setState({
      activeBufferId: "format-buffer",
      buffers: [makeEditorBuffer("typed before formatting")],
      pendingClose: null,
      closedBuffersHistory: [],
    });
  });

  afterEach(() => {
    useSettingsStore.setState({ settings: initialSettings });
    useBufferStore?.setState({
      activeBufferId: null,
      buffers: [],
      pendingClose: null,
      closedBuffersHistory: [],
    });
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("writes the edits typed while the formatter ran instead of the pre-format snapshot", async () => {
    const formatted = deferred<{ success: boolean; formattedContent: string }>();
    mocks.formatContent.mockReturnValue(formatted.promise);

    const savePromise = useEditorAppStore.getState().actions.handleSave();
    await vi.waitFor(() => expect(mocks.formatContent).toHaveBeenCalledOnce());

    useBufferStore
      .getState()
      .actions.updateBufferContent("format-buffer", "typed during formatting", true);

    formatted.resolve({ success: true, formattedContent: "formatted()" });
    const saved = await savePromise;

    expect(saved).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith("/workspace/format.ts", "typed during formatting");
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      content: "typed during formatting",
      savedContent: "typed during formatting",
      isDirty: false,
    });
  });

  it("applies the formatted content when the buffer did not change while formatting", async () => {
    mocks.formatContent.mockResolvedValue({ success: true, formattedContent: "formatted()" });

    const saved = await useEditorAppStore.getState().actions.handleSave();

    expect(saved).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith("/workspace/format.ts", "formatted()");
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      content: "formatted()",
      savedContent: "formatted()",
      isDirty: false,
    });
  });

  it("keeps the buffer dirty when edits land after the write starts", async () => {
    mocks.formatContent.mockResolvedValue({ success: true, formattedContent: "formatted()" });
    const write = deferred<void>();
    mocks.writeFile.mockReturnValue(write.promise);

    const savePromise = useEditorAppStore.getState().actions.handleSave();
    await vi.waitFor(() => expect(mocks.writeFile).toHaveBeenCalledOnce());

    useBufferStore
      .getState()
      .actions.updateBufferContent("format-buffer", "typed during write", true);
    write.resolve();
    await savePromise;

    expect(mocks.writeFile).toHaveBeenCalledWith("/workspace/format.ts", "formatted()");
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      content: "typed during write",
      savedContent: "formatted()",
      isDirty: true,
    });
  });
});
