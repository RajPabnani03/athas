import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { EditorContent } from "@/features/panes/types/pane-content.types";
import type { useBufferStore as useBufferStoreHook } from "@/features/editor/stores/buffer.store";

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  readFileContent: vi.fn(),
  showChoiceDialog: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(async (path: string) => path.slice(0, path.lastIndexOf("/"))),
}));

vi.mock("@/ui/dialog", () => ({
  showChoiceDialog: mocks.showChoiceDialog,
}));

vi.mock("@/features/file-system/controllers/file-operations", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/file-system/controllers/file-operations")>();
  return {
    ...original,
    readFileContent: mocks.readFileContent,
  };
});

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

function makeEditorBuffer(path: string, content: string, isDirty: boolean): EditorContent {
  return {
    id: "watched-buffer",
    type: "editor",
    path,
    name: path.split("/").pop() ?? path,
    content,
    savedContent: isDirty ? "on disk" : content,
    isDirty,
    isVirtual: false,
    isPinned: false,
    isPreview: false,
    isActive: true,
    language: "typescript",
    tokens: [],
  };
}

function getFileChangedHandler() {
  const call = mocks.listen.mock.calls.find(([eventName]) => eventName === "file-changed");
  if (!call) {
    throw new Error("file-changed listener was not registered");
  }
  return call[1] as (event: {
    payload: { path: string; event_type: "opened" | "reloaded" | "deleted" };
  }) => Promise<void>;
}

describe("file watcher dirty buffer conflict", () => {
  let useBufferStore: typeof useBufferStoreHook;

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

    mocks.listen.mockResolvedValue(() => {});
    mocks.readFileContent.mockResolvedValue("changed on disk");

    ({ useBufferStore } = await import("@/features/editor/stores/buffer.store"));
    const { initializeFileWatcherListener } = await import("../services/file-watcher-listener");
    await initializeFileWatcherListener();
  });

  afterEach(async () => {
    const { cleanupFileWatcherListener } = await import("../services/file-watcher-listener");
    await cleanupFileWatcherListener();
    useBufferStore?.setState({
      activeBufferId: null,
      buffers: [],
      pendingClose: null,
      closedBuffersHistory: [],
    });
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function setBuffer(buffer: EditorContent) {
    useBufferStore.setState({
      activeBufferId: buffer.id,
      buffers: [buffer],
      pendingClose: null,
      closedBuffersHistory: [],
    });
  }

  it("keeps unsaved edits when the user chooses to keep their changes", async () => {
    setBuffer(makeEditorBuffer("/workspace/watched.ts", "my unsaved edits", true));
    mocks.showChoiceDialog.mockResolvedValue("keep");

    await getFileChangedHandler()({
      payload: { path: "/workspace/watched.ts", event_type: "reloaded" },
    });

    expect(mocks.showChoiceDialog).toHaveBeenCalledOnce();
    expect(mocks.readFileContent).not.toHaveBeenCalled();
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      content: "my unsaved edits",
      isDirty: true,
    });
  });

  it("reloads from disk only after the user confirms discarding their edits", async () => {
    setBuffer(makeEditorBuffer("/workspace/watched.ts", "my unsaved edits", true));
    mocks.showChoiceDialog.mockResolvedValue("reload");

    await getFileChangedHandler()({
      payload: { path: "/workspace/watched.ts", event_type: "reloaded" },
    });

    expect(mocks.showChoiceDialog).toHaveBeenCalledOnce();
    expect(mocks.readFileContent).toHaveBeenCalledWith("/workspace/watched.ts");
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      content: "changed on disk",
      isDirty: false,
    });
  });

  it("reloads a clean buffer without prompting", async () => {
    setBuffer(makeEditorBuffer("/workspace/watched.ts", "clean", false));

    await getFileChangedHandler()({
      payload: { path: "/workspace/watched.ts", event_type: "reloaded" },
    });

    expect(mocks.showChoiceDialog).not.toHaveBeenCalled();
    expect(mocks.readFileContent).toHaveBeenCalledWith("/workspace/watched.ts");
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      content: "changed on disk",
      isDirty: false,
    });
  });

  it("treats a dismissed prompt as keeping the local changes", async () => {
    setBuffer(makeEditorBuffer("/workspace/watched.ts", "my unsaved edits", true));
    mocks.showChoiceDialog.mockResolvedValue(null);

    await getFileChangedHandler()({
      payload: { path: "/workspace/watched.ts", event_type: "reloaded" },
    });

    expect(mocks.readFileContent).not.toHaveBeenCalled();
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      content: "my unsaved edits",
      isDirty: true,
    });
  });
});
