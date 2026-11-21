import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { extensionRegistry } from "@/extensions/registry/extension-registry";
import { parseCollaborationNoteBufferPath } from "@/features/collaboration/lib/collaboration-sidebar-model";
import { useFileSystemStore } from "@/features/file-system/stores/file-system.store";
import { useFileWatcherStore } from "@/features/file-system/stores/file-watcher.store";
import { emitGitChanged } from "@/features/git/events/git-events";
import { recordLocalHistoryFile } from "@/features/local-history/api/local-history-api";
import { isEditorContent } from "@/features/panes/types/pane-content.types";
import { useSettingsStore } from "@/features/settings/stores/settings.store";
import { showAlertDialog } from "@/ui/dialog";
import { createSelectors } from "@/utils/zustand-selectors";
import { writeFile } from "@/features/file-system/controllers/platform";
import type { EditorContentChangeOptions, Position, Range } from "../types/editor.types";
import { getBufferById } from "../utils/buffer-index";
import { getDirtyWritableEditorBuffers } from "../utils/editor-buffer-selectors";
import { trackBufferHistoryChange } from "./buffer-history-tracking";
import { useBufferStore } from "./buffer.store";
import { queueEditorViewContentChange } from "./view.store";

async function recordLocalHistoryBeforeWrite(
  path: string,
  reason: "save" | "auto-save" | "restore",
): Promise<void> {
  try {
    await recordLocalHistoryFile(path, reason);
  } catch (error) {
    console.warn("Failed to record local history:", error);
  }
}

async function saveEditorBufferAs(bufferId: string): Promise<boolean> {
  const { buffers } = useBufferStore.getState();
  const { markBufferSaved, updateBufferPath } = useBufferStore.getState().actions;
  const { markPendingSave } = useFileWatcherStore.getState().actions;
  const initialBuffer = getBufferById(buffers, bufferId);
  if (!initialBuffer || (isEditorContent(initialBuffer) && initialBuffer.readOnly)) return false;

  const { save: saveDialog } = await import("@tauri-apps/plugin-dialog");
  const result = await saveDialog({
    title: "Save As",
    defaultPath: initialBuffer.name,
    filters: [
      { name: "All Files", extensions: ["*"] },
      {
        name: "Text Files",
        extensions: ["txt", "md", "json", "js", "ts", "tsx", "jsx", "css", "html"],
      },
    ],
  });
  if (!result) return false;

  markPendingSave(result);

  try {
    const buffer = getBufferById(useBufferStore.getState().buffers, bufferId);
    if (!buffer) return false;

    if (!isEditorContent(buffer)) {
      await invoke("write_file", { path: result, contents: "" });
      return true;
    }

    const contentToSave = buffer.content;
    await writeFile(result, contentToSave);
    await recordLocalHistoryBeforeWrite(result, "save");

    const canRebindPath =
      buffer.path.startsWith("untitled:") || (!buffer.isVirtual && !buffer.path.includes("://"));

    if (canRebindPath) {
      updateBufferPath(buffer.id, result);
      markBufferSaved(buffer.id, contentToSave);
    }

    const rootFolderPath = useFileSystemStore.getState().rootFolderPath;
    if (rootFolderPath) {
      emitGitChanged({
        repoPath: rootFolderPath,
        filePath: result,
        scopes: ["working-tree"],
        source: "save",
      });
    }
    return true;
  } catch (error) {
    console.error("Error saving file as:", error);
    await showAlertDialog("Failed to save file. Please try again.", "Save As");
    return false;
  }
}

async function saveEditorBufferById(bufferId: string): Promise<boolean> {
  const { buffers } = useBufferStore.getState();
  const { markBufferDirty, markBufferSaved, updateBufferContent, updateBufferPath } =
    useBufferStore.getState().actions;
  const { updateSettingsFromJSON } = useSettingsStore.getState().actions;
  const { markPendingSave } = useFileWatcherStore.getState().actions;
  const activeBuffer = getBufferById(buffers, bufferId);
  if (!activeBuffer || !isEditorContent(activeBuffer)) return false;
  if (activeBuffer.readOnly) return false;

  const collaborationNoteTarget = parseCollaborationNoteBufferPath(activeBuffer.path);

  if (activeBuffer.path.startsWith("untitled:")) {
    const { save: saveDialog } = await import("@tauri-apps/plugin-dialog");
    const result = await saveDialog({
      title: "Save",
      defaultPath: activeBuffer.name,
      filters: [{ name: "All Files", extensions: ["*"] }],
    });
    if (!result) return false;

    await writeFile(result, activeBuffer.content);
    updateBufferPath(activeBuffer.id, result);
    markBufferDirty(activeBuffer.id, false);
    return true;
  }

  if (collaborationNoteTarget) {
    const [{ updateCollaborationChannelNote }, { useAuthStore }, { updateCollaborationNoteFile }] =
      await Promise.all([
        import("@/features/window/services/auth-api"),
        import("@/features/window/stores/auth.store"),
        import("@/features/collaboration/lib/collaboration-sidebar-model"),
      ]);
    const { subscription, actions } = useAuthStore.getState();
    const collaboration = subscription?.collaboration;
    const channelNote = collaboration?.channelNotes.find(
      (note) => note.channelId === collaborationNoteTarget.channelId,
    );

    if (!channelNote) {
      markBufferDirty(activeBuffer.id, true);
      return false;
    }

    const nextCollaboration = await updateCollaborationChannelNote({
      channelId: collaborationNoteTarget.channelId,
      contentMarkdown: updateCollaborationNoteFile({
        contentMarkdown: channelNote.contentMarkdown,
        path: collaborationNoteTarget.notePath,
        fileContent: activeBuffer.content,
      }),
    });
    actions.setCollaborationSnapshot(nextCollaboration);
    markBufferDirty(activeBuffer.id, false);
    return true;
  }

  if (activeBuffer.isVirtual) {
    if (activeBuffer.path === "settings://user-settings.json") {
      const success = updateSettingsFromJSON(activeBuffer.content);
      markBufferDirty(activeBuffer.id, !success);
      return success;
    }

    markBufferDirty(activeBuffer.id, false);
    return true;
  }

  if (activeBuffer.path.startsWith("remote://")) {
    markBufferDirty(activeBuffer.id, true);
    const pathParts = activeBuffer.path.replace("remote://", "").split("/");
    const connectionId = pathParts.shift();
    const remotePath = `/${pathParts.join("/")}`;

    if (!connectionId) return false;

    try {
      await invoke("ssh_write_file", {
        connectionId,
        filePath: remotePath,
        content: activeBuffer.content,
      });
      markBufferDirty(activeBuffer.id, false);
      return true;
    } catch (error) {
      console.error("Error saving remote file:", error);
      markBufferDirty(activeBuffer.id, true);
      return false;
    }
  }

  try {
    markPendingSave(activeBuffer.path);

    const contentAtSaveStart = activeBuffer.content;
    const { settings } = useSettingsStore.getState();

    if (settings.formatOnSave) {
      const { formatContent } = await import("@/features/editor/formatter/formatter-service");
      const languageId = extensionRegistry.getLanguageId(activeBuffer.path);

      const formatResult = await formatContent({
        filePath: activeBuffer.path,
        content: contentAtSaveStart,
        languageId: languageId || undefined,
      });

      const bufferAfterFormat = getBufferById(useBufferStore.getState().buffers, activeBuffer.id);
      const contentAfterFormat =
        bufferAfterFormat && isEditorContent(bufferAfterFormat)
          ? bufferAfterFormat.content
          : contentAtSaveStart;

      if (
        formatResult.success &&
        formatResult.formattedContent &&
        contentAfterFormat === contentAtSaveStart
      ) {
        updateBufferContent(activeBuffer.id, formatResult.formattedContent, false);
      }
    }

    const bufferBeforeWrite = getBufferById(useBufferStore.getState().buffers, activeBuffer.id);
    const contentToSave =
      bufferBeforeWrite && isEditorContent(bufferBeforeWrite)
        ? bufferBeforeWrite.content
        : contentAtSaveStart;

    await recordLocalHistoryBeforeWrite(activeBuffer.path, "save");
    await writeFile(activeBuffer.path, contentToSave);
    const { LspClient } = await import("@/features/editor/lsp/lsp-client");
    await LspClient.getInstance().notifyDocumentSave(activeBuffer.path, contentToSave);
    markBufferSaved(activeBuffer.id, contentToSave);

    if (settings.lintOnSave) {
      const { lintContent } = await import("@/features/editor/linter/linter-service");
      const { convertLintDiagnostic, useDiagnosticsStore } =
        await import("@/features/diagnostics/stores/diagnostics.store");
      const languageId = extensionRegistry.getLanguageId(activeBuffer.path);

      const lintResult = await lintContent({
        filePath: activeBuffer.path,
        content: contentToSave,
        languageId: languageId || undefined,
      });

      if (lintResult.success && lintResult.diagnostics) {
        useDiagnosticsStore.getState().actions.setDiagnostics(
          activeBuffer.path,
          lintResult.diagnostics.map((diagnostic) =>
            convertLintDiagnostic(activeBuffer.path, diagnostic),
          ),
          "linter",
        );
      }
    }

    const rootFolderPath = useFileSystemStore.getState().rootFolderPath;
    if (rootFolderPath) {
      emitGitChanged({
        repoPath: rootFolderPath,
        filePath: activeBuffer.path,
        scopes: ["working-tree"],
        source: "save",
      });
    }
    return true;
  } catch (error) {
    console.error("Error saving local file:", error);
    markBufferDirty(activeBuffer.id, true);
    return false;
  }
}

interface AppState {
  autoSaveTimeoutId: NodeJS.Timeout | null;
  quickEditState: {
    isOpen: boolean;
    selectedText: string;
    cursorPosition: { x: number; y: number };
    selectionRange: { start: number; end: number };
  };
  actions: AppActions;
}

interface AppActions {
  handleContentChange: (
    content: string,
    previousContent?: string,
    previousCursorPosition?: Position,
    previousSelection?: Range,
    options?: EditorContentChangeOptions,
  ) => Promise<void>;
  handleSave: () => Promise<boolean>;
  handleSaveAs: () => Promise<boolean>;
  handleSaveAll: () => Promise<number>;
  openQuickEdit: (params: {
    text: string;
    cursorPosition: { x: number; y: number };
    selectionRange: { start: number; end: number };
  }) => void;
  cleanup: () => void;
}

export const useEditorAppStore = createSelectors(
  create<AppState>()(
    immer((set, get) => ({
      autoSaveTimeoutId: null,
      quickEditState: {
        isOpen: false,
        selectedText: "",
        cursorPosition: { x: 0, y: 0 },
        selectionRange: { start: 0, end: 0 },
      },
      actions: {
        handleContentChange: async (
          content: string,
          previousContent?: string,
          previousCursorPosition?: Position,
          previousSelection?: Range,
          options?: EditorContentChangeOptions,
        ) => {
          const { activeBufferId, buffers } = useBufferStore.getState();
          const { updateBufferContent, markBufferDirty } = useBufferStore.getState().actions;
          const { settings } = useSettingsStore.getState();
          const { markPendingSave } = useFileWatcherStore.getState().actions;
          const contentAlreadyApplied = options?.contentAlreadyApplied === true;

          const activeBuffer = getBufferById(buffers, activeBufferId);
          if (!activeBuffer || !isEditorContent(activeBuffer)) return;
          const collaborationNoteTarget = parseCollaborationNoteBufferPath(activeBuffer.path);

          if (!contentAlreadyApplied && activeBufferId && options?.contentChange) {
            queueEditorViewContentChange(
              activeBufferId,
              activeBuffer.content,
              content,
              options.contentChange,
            );
          }

          if (activeBufferId) {
            trackBufferHistoryChange({
              bufferId: activeBufferId,
              currentContent: activeBuffer.content,
              nextContent: content,
              previousContent,
              previousCursorPosition,
              previousSelection,
              skipUndoGrouping: options?.skipUndoGrouping,
              contentChange: options?.contentChange,
            });
          }

          const isRemoteFile = activeBuffer.path.startsWith("remote://");

          if (isRemoteFile) {
            if (!contentAlreadyApplied) {
              updateBufferContent(activeBuffer.id, content, false);
            }
          } else if (collaborationNoteTarget) {
            if (!contentAlreadyApplied) {
              updateBufferContent(activeBuffer.id, content, true);
            }
            markBufferDirty(activeBuffer.id, content !== activeBuffer.savedContent);
          } else {
            if (!contentAlreadyApplied) {
              updateBufferContent(activeBuffer.id, content, true);
            }

            if (!activeBuffer.isVirtual && settings.autoSave) {
              const { autoSaveTimeoutId } = get();
              if (autoSaveTimeoutId) {
                clearTimeout(autoSaveTimeoutId);
              }

              const newTimeoutId = setTimeout(async () => {
                try {
                  markPendingSave(activeBuffer.path);
                  await recordLocalHistoryBeforeWrite(activeBuffer.path, "auto-save");
                  await writeFile(activeBuffer.path, content);
                  markBufferDirty(activeBuffer.id, false);

                  const rootFolderPath = useFileSystemStore.getState().rootFolderPath;
                  if (rootFolderPath) {
                    emitGitChanged({
                      repoPath: rootFolderPath,
                      filePath: activeBuffer.path,
                      scopes: ["working-tree"],
                      source: "auto-save",
                    });
                  }
                } catch (error) {
                  console.error("Error saving file:", error);
                  markBufferDirty(activeBuffer.id, true);
                }
              }, 150);

              set((state) => {
                state.autoSaveTimeoutId = newTimeoutId;
              });
            }
          }
        },

        handleSave: async () => {
          const { activeBufferId, buffers } = useBufferStore.getState();
          const activeBuffer = getBufferById(buffers, activeBufferId);
          if (!activeBuffer || !isEditorContent(activeBuffer) || activeBuffer.readOnly)
            return false;

          return saveEditorBufferById(activeBuffer.id);
        },

        handleSaveAs: async () => {
          const { activeBufferId } = useBufferStore.getState();
          if (!activeBufferId) return false;

          return saveEditorBufferAs(activeBufferId);
        },

        handleSaveAll: async () => {
          const dirtyBufferIds = getDirtyWritableEditorBuffers(
            useBufferStore.getState().buffers,
          ).map((buffer) => buffer.id);
          const saveResults = await Promise.all(
            dirtyBufferIds.map(async (bufferId) => {
              const saved = await saveEditorBufferById(bufferId);
              const nextBuffer = getBufferById(useBufferStore.getState().buffers, bufferId);
              return saved && (!nextBuffer || !isEditorContent(nextBuffer) || !nextBuffer.isDirty);
            }),
          );

          return saveResults.filter(Boolean).length;
        },

        openQuickEdit: (params) => {
          set((state) => {
            state.quickEditState = {
              isOpen: true,
              selectedText: params.text,
              cursorPosition: params.cursorPosition,
              selectionRange: params.selectionRange,
            };
          });
        },

        cleanup: () => {
          const { autoSaveTimeoutId } = get();
          if (autoSaveTimeoutId) {
            clearTimeout(autoSaveTimeoutId);
          }
        },
      },
    })),
  ),
);
