import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { EditorContent } from "@/features/panes/types/pane-content.types";
import type { useBufferStore as useBufferStoreHook } from "../stores/buffer.store";
import type { useEditorAppStore as useEditorAppStoreHook } from "../stores/editor-app.store";

const mocks = vi.hoisted(() => ({
  copyFile: vi.fn(),
  notifyDocumentSave: vi.fn(),
  recordLocalHistoryFile: vi.fn(),
  save: vi.fn(),
  showAlertDialog: vi.fn(),
  stat: vi.fn(),
  showChoiceDialog: vi.fn(),
  stopForFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: mocks.save,
}));

vi.mock("@/ui/dialog", () => ({
  showAlertDialog: mocks.showAlertDialog,
  showChoiceDialog: mocks.showChoiceDialog,
}));

vi.mock("@tauri-apps/plugin-fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("@tauri-apps/plugin-fs")>();
  return {
    ...original,
    copyFile: mocks.copyFile,
    stat: mocks.stat,
  };
});

vi.mock("@/features/editor/lsp/lsp-client", () => ({
  LspClient: {
    getInstance: () => ({
      notifyDocumentSave: mocks.notifyDocumentSave,
      stopForFile: mocks.stopForFile,
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

function makeEditorBuffer(overrides: Partial<EditorContent> = {}): EditorContent {
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
    ...overrides,
  };
}

function makeDestinationBuffer(isDirty: boolean): EditorContent {
  return makeEditorBuffer({
    id: "destination-buffer",
    path: "/workspace/copy.ts",
    name: "copy.ts",
    content: isDirty ? "destination edits" : "destination content",
    savedContent: "destination content",
    isDirty,
    isActive: false,
  });
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
    mocks.showChoiceDialog.mockResolvedValue("replace");
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.recordLocalHistoryFile.mockResolvedValue(undefined);
    mocks.notifyDocumentSave.mockResolvedValue(undefined);
    mocks.stopForFile.mockResolvedValue(undefined);
    mocks.copyFile.mockResolvedValue(undefined);
    mocks.stat.mockImplementation(async (path: string) => {
      if (path.includes("copy.ts")) {
        throw new Error("not found");
      }
      return { dev: 1, ino: 1 };
    });
    mocks.showAlertDialog.mockResolvedValue(undefined);

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

  it("closes an already-open clean destination so only one buffer owns the path", async () => {
    useBufferStore.setState({
      activeBufferId: "save-as-buffer",
      buffers: [makeEditorBuffer(), makeDestinationBuffer(false)],
      pendingClose: null,
      closedBuffersHistory: [],
    });

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith("/workspace/copy.ts", "edited content");
    const buffers = useBufferStore.getState().buffers;
    const boundToCopy = buffers.filter((buffer) => buffer.path === "/workspace/copy.ts");
    expect(boundToCopy).toHaveLength(1);
    expect(boundToCopy[0]).toMatchObject({ id: "save-as-buffer", isDirty: false });
    expect(buffers.find((buffer) => buffer.id === "destination-buffer")).toBeUndefined();
  });

  it("cancels without writing when the open destination has unsaved changes", async () => {
    useBufferStore.setState({
      activeBufferId: "save-as-buffer",
      buffers: [makeEditorBuffer(), makeDestinationBuffer(true)],
      pendingClose: null,
      closedBuffersHistory: [],
    });
    mocks.showChoiceDialog.mockResolvedValue("cancel");

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(false);
    expect(mocks.showChoiceDialog).toHaveBeenCalledOnce();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(useBufferStore.getState().buffers).toHaveLength(2);
  });

  it("replaces an open dirty destination only after confirmation", async () => {
    useBufferStore.setState({
      activeBufferId: "save-as-buffer",
      buffers: [makeEditorBuffer(), makeDestinationBuffer(true)],
      pendingClose: null,
      closedBuffersHistory: [],
    });
    mocks.showChoiceDialog.mockResolvedValue("replace");

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(true);
    expect(mocks.showChoiceDialog).toHaveBeenCalledOnce();
    expect(mocks.writeFile).toHaveBeenCalledWith("/workspace/copy.ts", "edited content");
    const buffers = useBufferStore.getState().buffers;
    expect(buffers.filter((buffer) => buffer.path === "/workspace/copy.ts")).toHaveLength(1);
    expect(buffers.find((buffer) => buffer.id === "destination-buffer")).toBeUndefined();
  });

  it("copies the source bytes for a file-backed non-editor buffer", async () => {
    useBufferStore.setState({
      activeBufferId: "image-buffer",
      buffers: [
        {
          id: "image-buffer",
          type: "image",
          path: "/workspace/pic.png",
          name: "pic.png",
          isPinned: false,
          isPreview: false,
          isActive: true,
        },
      ],
      pendingClose: null,
      closedBuffersHistory: [],
    });

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(true);
    expect(mocks.copyFile).toHaveBeenCalledWith("/workspace/pic.png", "/workspace/copy.ts");
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("refuses a preview tab whose path is not a real file", async () => {
    useBufferStore.setState({
      activeBufferId: "preview-buffer",
      buffers: [
        {
          id: "preview-buffer",
          type: "markdownPreview",
          path: "/workspace/notes.md:preview",
          name: "notes.md (Preview)",
          content: "# Notes",
          sourceFilePath: "/workspace/notes.md",
          isPinned: false,
          isPreview: false,
          isActive: true,
        },
      ],
      pendingClose: null,
      closedBuffersHistory: [],
    });

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(false);
    expect(mocks.showAlertDialog).toHaveBeenCalledOnce();
    expect(mocks.copyFile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("closes an open destination tab before rebinding a non-editor copy", async () => {
    useBufferStore.setState({
      activeBufferId: "image-buffer",
      buffers: [
        {
          id: "image-buffer",
          type: "image",
          path: "/workspace/pic.png",
          name: "pic.png",
          isPinned: false,
          isPreview: false,
          isActive: true,
        },
        makeDestinationBuffer(false),
      ],
      pendingClose: null,
      closedBuffersHistory: [],
    });

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(true);
    expect(mocks.copyFile).toHaveBeenCalledWith("/workspace/pic.png", "/workspace/copy.ts");
    expect(
      useBufferStore.getState().buffers.find((b) => b.id === "destination-buffer"),
    ).toBeUndefined();
  });

  it("does not copy over a dirty destination tab without confirmation", async () => {
    useBufferStore.setState({
      activeBufferId: "image-buffer",
      buffers: [
        {
          id: "image-buffer",
          type: "image",
          path: "/workspace/pic.png",
          name: "pic.png",
          isPinned: false,
          isPreview: false,
          isActive: true,
        },
        makeDestinationBuffer(true),
      ],
      pendingClose: null,
      closedBuffersHistory: [],
    });
    mocks.showChoiceDialog.mockResolvedValue("cancel");

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(false);
    expect(mocks.showChoiceDialog).toHaveBeenCalledOnce();
    expect(mocks.copyFile).not.toHaveBeenCalled();
    expect(useBufferStore.getState().buffers).toHaveLength(2);
  });

  it("copies when the platform reports no device or inode for the files", async () => {
    useBufferStore.setState({
      activeBufferId: "image-buffer",
      buffers: [
        {
          id: "image-buffer",
          type: "image",
          path: "/workspace/pic.png",
          name: "pic.png",
          isPinned: false,
          isPreview: false,
          isActive: true,
        },
      ],
      pendingClose: null,
      closedBuffersHistory: [],
    });
    mocks.stat.mockResolvedValue({ dev: null, ino: null });

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(true);
    expect(mocks.copyFile).toHaveBeenCalledWith("/workspace/pic.png", "/workspace/copy.ts");
  });

  it("fails visibly instead of copying when the source cannot be inspected", async () => {
    useBufferStore.setState({
      activeBufferId: "image-buffer",
      buffers: [
        {
          id: "image-buffer",
          type: "image",
          path: "/workspace/pic.png",
          name: "pic.png",
          isPinned: false,
          isPreview: false,
          isActive: true,
        },
      ],
      pendingClose: null,
      closedBuffersHistory: [],
    });
    mocks.stat.mockRejectedValue(new Error("stat not permitted"));

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(false);
    expect(mocks.copyFile).not.toHaveBeenCalled();
    expect(mocks.showAlertDialog).toHaveBeenCalledOnce();
  });

  it("skips the copy when the destination names the same file through another path", async () => {
    useBufferStore.setState({
      activeBufferId: "image-buffer",
      buffers: [
        {
          id: "image-buffer",
          type: "image",
          path: "/workspace/pic.png",
          name: "pic.png",
          isPinned: false,
          isPreview: false,
          isActive: true,
        },
      ],
      pendingClose: null,
      closedBuffersHistory: [],
    });
    mocks.stat.mockResolvedValue({ dev: 1, ino: 42 });
    mocks.save.mockResolvedValue("/workspace/pic-link.png");

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(true);
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });

  it("refuses Save As for a tab with no file instead of writing an empty one", async () => {
    useBufferStore.setState({
      activeBufferId: "terminal-buffer",
      buffers: [
        {
          id: "terminal-buffer",
          type: "terminal",
          path: "terminal://session-1",
          name: "Terminal",
          sessionId: "session-1",
          isPinned: false,
          isPreview: false,
          isActive: true,
        },
      ],
      pendingClose: null,
      closedBuffersHistory: [],
    });

    const saved = await useEditorAppStore.getState().actions.handleSaveAs();

    expect(saved).toBe(false);
    expect(mocks.showAlertDialog).toHaveBeenCalledOnce();
    expect(mocks.copyFile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(useBufferStore.getState().buffers[0]).toMatchObject({
      id: "terminal-buffer",
      path: "terminal://session-1",
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
