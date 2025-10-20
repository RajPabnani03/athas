# Athas Project Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Overview](#architecture-overview)
4. [State Management](#state-management)
5. [Directory Structure](#directory-structure)
6. [Key Components](#key-components)
7. [Data Flow Examples](#data-flow-examples)
8. [Backend-Frontend Communication](#backend-frontend-communication)
9. [Extension System](#extension-system)
10. [Development Guidelines](#development-guidelines)

---

## Project Overview

**Athas** is a lightweight, fast desktop code editor built with React, TypeScript, and Tauri. It combines modern web UI with native performance through a Rust backend.

### Core Features
- Fast code editing with syntax highlighting (tree-sitter)
- Git integration (status, diff, blame, staging)
- Language Server Protocol (LSP) support for code completion
- Terminal emulation (xterm.js)
- Remote SSH/SFTP file system access
- AI-powered chat and code completion
- SQLite database viewer
- Customizable themes and extensions
- Multi-platform (Linux, macOS, Windows)

---

## Technology Stack

### Frontend
- **React 19.1** - UI framework
- **TypeScript 5.8** - Type safety
- **Vite 7** - Build tool and dev server
- **Tauri 2** - Desktop framework (Rust backend)
- **Zustand 5** - State management
- **Tailwind CSS** - Styling with @tailwindcss/vite
- **Immer** - Immutable state updates
- **react-window** - List virtualization
- **xterm.js** - Terminal emulation
- **Prism.js** - Syntax highlighting
- **Lucide React** - Icons
- **Day.js** - Date utilities

### Backend (Rust)
- **Tauri** - Desktop app framework
- **tree-sitter** - Code parsing and syntax highlighting
- **git2 (libgit2)** - Git operations
- **tokio** - Async runtime
- **rusqlite** - SQLite database access
- **ssh2** - SSH/SFTP connectivity
- **lsp-types** - LSP protocol implementation
- **portable-pty** - Terminal PTY
- **notify** - File system watching

### Build & Development
- **Biome** - Linting and formatting
- **Bun** - Package manager and runtime
- **commitlint** - Commit message validation

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Components  │  │   Zustand    │  │    Hooks     │      │
│  │              │←→│    Stores    │←→│              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ↕                  ↕                  ↕              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Tauri Invoke/Events API                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                     Backend (Rust/Tauri)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Git    │  │   LSP    │  │   SSH    │  │ Terminal │   │
│  │ Commands │  │ Manager  │  │ Sessions │  │   PTY    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   File   │  │  Tree    │  │  SQLite  │  │  Format  │   │
│  │ System   │  │  Sitter  │  │  Query   │  │  Docs    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Operating System                          │
│         File System | Git | LSP Servers | Shell              │
└─────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
App
├── FontPreloader
├── MainLayout
│   ├── CustomTitleBar (window chrome)
│   ├── MenuBar (native or UI menu)
│   ├── MainSidebar
│   │   ├── FileTree
│   │   ├── GitView
│   │   └── RemoteConnections
│   ├── TabBar (file tabs with drag-drop)
│   ├── CodeEditor (main editor)
│   ├── BottomPane
│   │   ├── SearchView
│   │   ├── TerminalContainer
│   │   └── DiagnosticsView
│   └── AIChat (right sidebar, lazy-loaded)
├── CommandPalette (Cmd/Ctrl+Shift+P)
├── ContextMenus
├── ToastContainer
└── ZoomIndicator
```

---

## State Management

### Zustand Patterns

This project uses Zustand with specific custom patterns defined in `CLAUDE.md`:

#### 1. createSelectors Pattern

Automatic property selectors for ergonomic state access:

```typescript
// utils/zustand-selectors.ts
export const createSelectors = <T extends UseBoundStore<StoreApi<any>>>(
  store: T
) => {
  store.use = {};
  for (const k of Object.keys(store.getState())) {
    (store.use as any)[k] = () => store((s) => s[k]);
  }
  return store;
};

// Usage
const useMyStore = createSelectors(
  create((set) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 }))
  }))
);

// In components
const count = useMyStore.use.count(); // Instead of useMyStore((s) => s.count)
```

#### 2. Immer Middleware

Enable direct mutations for nested state updates:

```typescript
import { immer } from 'zustand/middleware/immer';

const useStore = create(
  immer((set) => ({
    nested: { deep: { value: 0 } },
    updateDeep: (val) => set((state) => {
      state.nested.deep.value = val; // Direct mutation
    })
  }))
);
```

#### 3. Persist Middleware

Sync store state with localStorage (via Tauri plugin-store):

```typescript
import { persist } from 'zustand/middleware';

const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 14
    }),
    {
      name: 'settings-store'
    }
  )
);
```

#### 4. createWithEqualityFn

Custom comparison for deep objects to avoid unnecessary rerenders:

```typescript
import { createWithEqualityFn } from 'zustand/traditional';
import fastDeepEqual from 'fast-deep-equal';

const useBufferStore = createWithEqualityFn(
  (set) => ({ buffers: [] }),
  fastDeepEqual
);
```

#### 5. Store Communication Pattern

Access other stores' state via `getState()` inside actions:

```typescript
const useAppStore = create((set, get) => ({
  actions: {
    handleSave: async () => {
      // Access other store's state
      const { activeBufferId } = useBufferStore.getState();
      const { rootFolderPath } = useFileSystemStore.getState();

      // Perform action
      await saveFile(rootFolderPath, activeBufferId);
    }
  }
}));
```

### Core Stores

| Store | Purpose | Middleware | Location |
|-------|---------|------------|----------|
| `useBufferStore` | Open file buffers, content, dirty state | immer, createWithEqualityFn | `stores/buffer-store.ts` |
| `useAppStore` | Autosave, quick edit modal | immer | `stores/app-store.ts` |
| `useEditorSettingsStore` | Font, tab size, word wrap | persist | `stores/editor-settings-store.ts` |
| `useFileSystemStore` | File tree, root folder | immer | `file-system/controllers/store.ts` |
| `useGitStore` | Git status, branch, commits | immer | `version-control/git/controllers/git-store.ts` |
| `useLspStore` | LSP completions, cache | - | `stores/lsp-store.ts` |
| `useAIChatStore` | AI conversations, context | immer | `stores/ai-chat/store.ts` |
| `useThemeStore` | Theme selection | persist | `stores/theme-store.ts` |
| `useSidebarStore` | Sidebar visibility, position | persist | `stores/sidebar-store.ts` |
| `useUIStateStore` | Modal states, dialogs | - | `stores/ui-state-store.ts` |

---

## Directory Structure

```
/home/user/athas/
├── src/                                    # React frontend
│   ├── components/                         # React components
│   │   ├── editor/                         # Core editor
│   │   │   ├── CodeEditor.tsx             # Main editor component
│   │   │   ├── EditorLine.tsx             # Single line renderer
│   │   │   └── CompletionPopup.tsx        # Code completion UI
│   │   ├── layout/                         # Layout structure
│   │   │   ├── MainLayout.tsx
│   │   │   ├── MainSidebar.tsx
│   │   │   └── BottomPane.tsx
│   │   ├── ai-chat/                        # AI chat UI
│   │   ├── terminal/                       # Terminal
│   │   ├── tab-bar/                        # Tab management
│   │   ├── command/                        # Command palette
│   │   ├── remote/                         # SSH connections
│   │   ├── diagnostics/                    # LSP diagnostics
│   │   ├── ui/                             # Reusable UI components
│   │   └── window/                         # Window chrome
│   │
│   ├── stores/                             # Zustand stores
│   │   ├── buffer-store.ts                 # Open file buffers
│   │   ├── app-store.ts                    # Global app state
│   │   ├── editor-settings-store.ts        # Editor config
│   │   ├── lsp-store.ts                    # LSP state
│   │   ├── git-blame-store.ts              # Git blame
│   │   ├── theme-store.ts                  # Theme selection
│   │   └── ai-chat/
│   │       └── store.ts                    # AI chat state
│   │
│   ├── file-system/                        # File system operations
│   │   ├── controllers/
│   │   │   ├── store.ts                    # File system store
│   │   │   ├── file-watcher-store.ts       # File watching
│   │   │   ├── recent-files-store.ts       # Recent files
│   │   │   └── platform.ts                 # Platform API
│   │   └── models/
│   │       └── app.ts                      # FileEntry type
│   │
│   ├── file-explorer/                      # File tree UI
│   │   ├── controllers/
│   │   │   └── file-tree-store.ts          # Tree state
│   │   └── views/
│   │       └── FileTree.tsx
│   │
│   ├── extensions/                         # Extension system
│   │   ├── extension-manager.ts            # Lifecycle
│   │   ├── editor-api.ts                   # Extension API
│   │   ├── syntax-highlighting-extension.ts
│   │   ├── basic-editing-extension.ts
│   │   ├── themes/                         # Built-in themes
│   │   └── language-support/               # Language packs
│   │
│   ├── version-control/                    # Git integration
│   │   ├── git/
│   │   │   ├── controllers/
│   │   │   │   ├── git.ts                  # Git commands
│   │   │   │   ├── git-store.ts            # Git state
│   │   │   │   └── git-diff-cache.ts       # Diff caching
│   │   │   ├── models/
│   │   │   │   └── git-types.ts
│   │   │   └── views/
│   │   └── diff-viewer/                    # Diff UI
│   │
│   ├── settings/                           # User settings
│   │   ├── store.ts                        # Settings store
│   │   ├── config/                         # Defaults
│   │   └── components/
│   │
│   ├── hooks/                              # Custom React hooks
│   │   ├── use-keyboard-shortcuts.ts       # Keybindings
│   │   ├── use-context-menus.tsx           # Context menus
│   │   ├── use-menu-events.ts              # Menu events
│   │   └── use-terminal-tabs.ts
│   │
│   ├── lib/                                # Libraries
│   │   ├── lsp/
│   │   │   └── lsp-client.ts               # LSP protocol
│   │   └── rust-api/
│   │       └── tokens.ts                   # Syntax tokens
│   │
│   ├── utils/                              # Utilities
│   │   ├── zustand-selectors.ts            # createSelectors
│   │   ├── ai-chat.ts
│   │   ├── ai-completion.ts
│   │   ├── language-detection.ts
│   │   ├── token-manager.ts                # API keys
│   │   └── fuzzy-matcher.tsx
│   │
│   ├── contexts/                           # React contexts
│   │   └── toast-context.tsx
│   │
│   ├── types/                              # TypeScript types
│   │   ├── ai-provider.ts
│   │   ├── editor-types.ts
│   │   └── terminal.ts
│   │
│   ├── styles/                             # CSS files
│   │   ├── styles.css                      # Global + Tailwind
│   │   ├── editor-line-based.css
│   │   └── token-theme.css
│   │
│   ├── App.tsx                             # Root component
│   └── main.tsx                            # Entry point
│
├── src-tauri/                              # Rust backend
│   ├── src/
│   │   ├── main.rs                         # App init
│   │   ├── lib.rs
│   │   ├── file_watcher.rs                 # File watching
│   │   ├── ssh.rs                          # SSH/SFTP
│   │   ├── xterm_terminal.rs               # Terminal PTY
│   │   ├── menu.rs                         # App menu
│   │   ├── claude_bridge.rs                # AI interceptor
│   │   ├── logger.rs
│   │   ├── lsp/                            # LSP implementation
│   │   │   ├── manager.rs
│   │   │   ├── client.rs
│   │   │   ├── config.rs
│   │   │   └── types.rs
│   │   └── commands/                       # Tauri commands
│   │       ├── git/                        # Git operations
│   │       ├── lsp.rs
│   │       ├── font.rs
│   │       ├── format.rs
│   │       ├── tokens.rs                   # Tree-sitter
│   │       ├── theme.rs
│   │       ├── sqlite.rs
│   │       ├── fs.rs
│   │       └── watcher.rs
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── capabilities/                       # Security config
│
├── public/                                 # Static assets
├── docs/                                   # Documentation
├── .claude/                                # Claude Code config
│   ├── CLAUDE.md                          # Project instructions
│   └── PROJECT.md                         # This file
├── package.json
├── vite.config.ts
├── tsconfig.json
└── biome.json
```

---

## Key Components

### 1. Buffer Store (`stores/buffer-store.ts`)

Manages all open file buffers and their state.

**Key Responsibilities:**
- Track open files and their content
- Handle dirty state (unsaved changes)
- Support virtual buffers (settings, diffs)
- Image and SQLite buffer types
- Tab pinning and LRU eviction
- Syntax token caching
- Tab reordering

**Key State:**
```typescript
{
  buffers: Buffer[];           // All open buffers
  activeBufferId: string;      // Currently focused buffer
  pinnedBufferIds: string[];   // Pinned tabs
  maxBuffers: number;          // LRU limit
}
```

**Key Actions:**
- `openBuffer(path, content, language)` - Open/focus file
- `closeBuffer(id)` - Close file tab
- `updateBufferContent(id, content, markDirty)` - Update content
- `saveBuffer(id)` - Mark as saved (clear dirty flag)
- `pinBuffer(id)` / `unpinBuffer(id)` - Pin/unpin tabs
- `reorderBuffers(sourceIndex, destIndex)` - Drag-drop reorder

**Usage Example:**
```typescript
// src/components/editor/CodeEditor.tsx:123
const buffer = useBufferStore.use.buffers().find(b => b.id === activeBufferId);
const { updateBufferContent } = useBufferStore.use.actions();

const handleChange = (newContent: string) => {
  updateBufferContent(buffer.id, newContent, true);
};
```

### 2. File System Store (`file-system/controllers/store.ts`)

Manages project root and file tree.

**Key Responsibilities:**
- Open/change root folder
- Build and update file tree
- Handle file operations (create, delete, rename)
- Track expanded folders
- Apply gitignore patterns
- Integrate with file watcher
- Recent folders tracking

**Key State:**
```typescript
{
  rootFolderPath: string | null;
  fileTree: FileEntry[];
  expandedFolders: Set<string>;
  isLoading: boolean;
}
```

**Key Actions:**
- `openFolder(path)` - Set project root
- `refreshFileTree()` - Rebuild tree
- `toggleFolder(path)` - Expand/collapse
- `createFile(path, content)` - New file
- `deleteFile(path)` - Remove file
- `renameFile(oldPath, newPath)` - Rename

**Integration with File Watcher:**
```typescript
// File watcher emits events -> store reacts
listen('file-created', ({ path }) => {
  fileSystemStore.actions.handleFileCreated(path);
});
```

### 3. Git Integration (`version-control/git/controllers/git.ts`)

Wraps Tauri backend Git commands.

**Key Responsibilities:**
- Git status tracking
- Staging/unstaging files
- Commits with messages
- Log and history
- Blame annotations
- Diff generation
- Branch management

**Key Functions:**
```typescript
export async function gitStatus(repoPath: string): Promise<GitStatus>;
export async function gitAdd(repoPath: string, files: string[]): Promise<void>;
export async function gitCommit(repoPath: string, message: string): Promise<void>;
export async function gitLog(repoPath: string, maxCount: number): Promise<Commit[]>;
export async function gitBlame(repoPath: string, filePath: string): Promise<BlameLine[]>;
export async function gitDiff(repoPath: string, filePath: string): Promise<string>;
```

**Usage in Components:**
```typescript
// src/version-control/git/views/GitView.tsx:45
const handleStage = async (file: string) => {
  await gitAdd(repoPath, [file]);
  await refreshGitStatus();
};
```

### 4. LSP Store (`stores/lsp-store.ts`)

Manages Language Server Protocol integration.

**Key Responsibilities:**
- Request code completions
- Cache completion results (5s TTL)
- Debounce requests (150ms)
- Track LSP connection status
- Abort in-flight requests

**Key State:**
```typescript
{
  completions: CompletionItem[];
  isLoadingCompletions: boolean;
  completionCache: Map<string, CachedCompletion>;
  abortController: AbortController | null;
  lspStatus: 'connected' | 'disconnected';
}
```

**Caching Strategy:**
```typescript
const cacheKey = `${filePath}:${line}:${col}:${prefix}`;
const cached = completionCache.get(cacheKey);
if (cached && Date.now() - cached.timestamp < 5000) {
  return cached.completions; // Return cached
}
```

### 5. App Store (`stores/app-store.ts`)

Global application state and autosave logic.

**Key Responsibilities:**
- Autosave coordination (150ms debounce)
- Quick edit modal state
- Handle content changes from editor
- Trigger file saves
- Invalidate git diff cache on save

**Autosave Flow:**
```typescript
handleContentChange(content: string) {
  // Update buffer content (mark dirty)
  bufferStore.updateBufferContent(activeId, content, true);

  // Clear existing timeout
  if (autosaveTimeout) clearTimeout(autosaveTimeout);

  // Set new timeout (150ms)
  autosaveTimeout = setTimeout(() => {
    handleSave();
  }, 150);
}
```

### 6. AI Chat Store (`stores/ai-chat/store.ts`)

Manages AI conversation state.

**Key Responsibilities:**
- Store conversation history
- Track message streaming
- Manage file context (@mentions)
- Handle multiple providers (OpenAI, Claude, Copilot)
- Tool call execution

**Key State:**
```typescript
{
  conversations: Conversation[];
  activeConversationId: string;
  isStreaming: boolean;
  contextFiles: string[];
  provider: AIProvider;
  model: string;
}
```

### 7. Extension System (`extensions/extension-manager.ts`)

Pluggable extension architecture.

**Key Components:**
- `ExtensionManager` - Lifecycle management
- `EditorAPI` - API exposed to extensions
- Extension types: syntax, themes, commands, keybindings

**Extension Registration:**
```typescript
class ExtensionManager {
  registerExtension(extension: Extension) {
    extension.activate(this.editorAPI);
    this.extensions.set(extension.id, extension);
  }

  unregisterExtension(id: string) {
    const ext = this.extensions.get(id);
    ext?.deactivate();
    this.extensions.delete(id);
  }
}
```

**Built-in Extensions:**
- `basic-editing-extension.ts` - Cut, copy, paste, undo, redo
- `syntax-highlighting-extension.ts` - Prism-based highlighting
- Theme extensions (TOML-based)
- Language support extensions

---

## Data Flow Examples

### Example 1: Opening a File

```
User clicks file in FileTree
    ↓
FileTree.tsx: handleFileClick(path)
    ↓
useBufferStore.actions.openBuffer(path, null, null)
    ↓
Check if buffer already exists
    ↓ No
Tauri invoke: read_file_to_string(path)
    ↓
Rust: fs::read_to_string(path)
    ↓
Return content to frontend
    ↓
Detect language from file extension
    ↓
Create new Buffer object
    ↓
Add to buffers array
    ↓
Set as activeBufferId
    ↓
Add to RecentFilesStore
    ↓
CodeEditor re-renders with new content
    ↓
Request syntax tokens from Rust
    ↓
Highlight code
    ↓
Initialize LSP for language
    ↓
Ready for editing
```

### Example 2: Typing in Editor (with autosave)

```
User types character
    ↓
CodeEditor.tsx: onChange(newContent)
    ↓
useAppStore.actions.handleContentChange(newContent)
    ↓
useBufferStore.actions.updateBufferContent(id, newContent, markDirty=true)
    ↓
Buffer.isDirty = true
    ↓
Tab shows unsaved indicator (*)
    ↓
Clear existing autosave timeout
    ↓
Set new timeout (150ms)
    ↓
[User continues typing, timeout resets each time]
    ↓
[150ms of no typing passes]
    ↓
useAppStore.actions.handleSave()
    ↓
useFileWatcherStore.actions.markPendingSave(path)
    ↓
Tauri invoke: write_file(path, content)
    ↓
Rust: fs::write(path, content)
    ↓
File watcher detects change
    ↓
Check if pending save for this path
    ↓ Yes
Clear pending save, ignore event
    ↓
useBufferStore.actions.saveBuffer(id)
    ↓
Buffer.isDirty = false
    ↓
Tab unsaved indicator removed
    ↓
Invalidate git diff cache
    ↓
Emit git-status-updated event
    ↓
useGitStore refreshes status
    ↓
FileTree shows file as modified (if tracked)
```

### Example 3: Git Staging and Commit

```
User clicks "Stage" on file in GitView
    ↓
GitView.tsx: handleStageFile(file)
    ↓
git.ts: gitAdd(repoPath, [file])
    ↓
Tauri invoke: git_add(repo_path, files)
    ↓
Rust: use git2 library to stage file
    ↓
Return success
    ↓
GitView: refreshGitStatus()
    ↓
git.ts: gitStatus(repoPath)
    ↓
Tauri invoke: git_status(repo_path)
    ↓
Rust: parse git status
    ↓
Return { staged: [...], unstaged: [...], untracked: [...] }
    ↓
useGitStore.actions.setGitStatus(status)
    ↓
GitView re-renders, file now in "Staged" section
    ↓
User enters commit message
    ↓
User clicks "Commit"
    ↓
GitView: handleCommit(message)
    ↓
git.ts: gitCommit(repoPath, message)
    ↓
Tauri invoke: git_commit(repo_path, message)
    ↓
Rust: create commit with git2
    ↓
Return commit hash
    ↓
Show toast: "Committed successfully"
    ↓
Refresh git status
    ↓
Staged files cleared
```

### Example 4: LSP Code Completion

```
User types in editor (e.g., "console.")
    ↓
CodeEditor: onChange triggered
    ↓
After onChange, detect cursor position
    ↓
Debounce 150ms
    ↓
useLspStore.actions.requestCompletions(path, line, col, prefix)
    ↓
Check cache: cacheKey = "path:line:col:prefix"
    ↓ Cache miss or expired
Abort any in-flight request
    ↓
Create new AbortController
    ↓
Tauri invoke: lsp_get_completions(path, line, col)
    ↓
Rust: LspManager.get_completions()
    ↓
Send LSP request to language server (e.g., typescript-language-server)
    ↓
Language server responds with completion items
    ↓
Return completions to frontend
    ↓
Cache result with timestamp
    ↓
useLspStore: set completions
    ↓
CompletionPopup renders below cursor
    ↓
Shows: [log, error, warn, table, ...]
    ↓
User presses arrow keys to navigate
    ↓
User presses Enter/Tab to accept
    ↓
Insert completion text into editor
    ↓
Close completion popup
```

### Example 5: SSH Remote File Editing

```
User clicks "Connect to SSH" in Remote sidebar
    ↓
RemoteConnectionDialog opens
    ↓
User enters: host, port, username, password/key
    ↓
Click "Connect"
    ↓
Tauri invoke: ssh_connect(host, port, username, auth)
    ↓
Rust: ssh2::Session::new()
    ↓
Establish SSH connection
    ↓
Authenticate with password or key
    ↓
Create SFTP session
    ↓
Return connection ID
    ↓
Store connection in RemoteStore
    ↓
Show remote file tree (list files via SFTP)
    ↓
User clicks remote file
    ↓
Tauri invoke: ssh_read_file(connection_id, path)
    ↓
Rust: sftp.open(path).read_to_string()
    ↓
Return file content
    ↓
useBufferStore.openBuffer("remote://connId/path", content, language)
    ↓
CodeEditor shows remote file
    ↓
User edits file
    ↓
Autosave triggers
    ↓
Tauri invoke: ssh_write_file(connection_id, path, content)
    ↓
Rust: sftp.create(path).write_all(content)
    ↓
Remote file updated
    ↓
useBufferStore.saveBuffer(id)
```

---

## Backend-Frontend Communication

### Tauri Invoke Pattern

**Frontend → Backend:**
```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<ReturnType>('command_name', {
  param1: value1,
  param2: value2
});
```

**Backend (Rust):**
```rust
#[tauri::command]
pub async fn command_name(
    param1: String,
    param2: u32
) -> Result<ReturnType, String> {
    // Implementation
    Ok(result)
}

// Register in main.rs
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            command_name,
            // ... other commands
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
```

### Tauri Events Pattern

**Backend → Frontend:**
```rust
// Emit event from Rust
app.emit_all("event-name", EventPayload {
    message: "Hello".to_string()
})?;
```

**Frontend listener:**
```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<EventPayload>('event-name', (event) => {
  console.log('Received:', event.payload);
  // Update store or trigger action
});

// Cleanup
unlisten();
```

### Common Commands

#### File System
- `read_file_to_string(path: string): Promise<string>`
- `write_file(path: string, content: string): Promise<void>`
- `delete_file(path: string): Promise<void>`
- `rename_file(old: string, new: string): Promise<void>`
- `read_dir(path: string): Promise<DirEntry[]>`

#### Git
- `git_status(repo_path: string): Promise<GitStatus>`
- `git_add(repo_path: string, files: string[]): Promise<void>`
- `git_commit(repo_path: string, message: string): Promise<string>`
- `git_log(repo_path: string, max: number): Promise<Commit[]>`
- `git_blame(repo_path: string, file: string): Promise<BlameLine[]>`
- `git_diff(repo_path: string, file: string): Promise<string>`

#### LSP
- `lsp_start(workspace_path: string): Promise<void>`
- `lsp_get_completions(path: string, line: number, col: number): Promise<CompletionItem[]>`
- `lsp_get_hover(path: string, line: number, col: number): Promise<Hover>`
- `lsp_stop(workspace_path: string): Promise<void>`

#### Terminal
- `create_terminal_session(shell: string): Promise<string>`
- `write_to_terminal(session_id: string, data: string): Promise<void>`
- `resize_terminal(session_id: string, cols: number, rows: number): Promise<void>`
- `close_terminal(session_id: string): Promise<void>`

#### SSH
- `ssh_connect(config: SshConfig): Promise<string>`
- `ssh_disconnect(connection_id: string): Promise<void>`
- `ssh_read_file(connection_id: string, path: string): Promise<string>`
- `ssh_write_file(connection_id: string, path: string, content: string): Promise<void>`
- `ssh_list_dir(connection_id: string, path: string): Promise<DirEntry[]>`

#### Syntax Highlighting
- `get_syntax_tokens(language: string, code: string): Promise<Token[]>`

#### Other
- `get_system_fonts(): Promise<string[]>`
- `format_document(language: string, code: string): Promise<string>`
- `execute_sqlite_query(db_path: string, query: string): Promise<QueryResult>`
- `load_theme(theme_path: string): Promise<Theme>`

### Common Events

- `file-created` - File system watcher detected new file
- `file-modified` - File changed on disk
- `file-deleted` - File removed
- `git-status-updated` - Git status changed
- `lsp-diagnostics` - LSP reported errors/warnings
- `terminal-output` - Terminal received output

---

## Extension System

### Extension Structure

```typescript
interface Extension {
  id: string;
  name: string;
  version: string;
  activate(api: EditorAPI): void;
  deactivate(): void;
}
```

### Editor API

Extensions have access to:

```typescript
interface EditorAPI {
  // Buffer management
  getActiveBuffer(): Buffer | null;
  getAllBuffers(): Buffer[];
  openBuffer(path: string): void;
  closeBuffer(id: string): void;

  // Editor actions
  insertText(text: string): void;
  replaceSelection(text: string): void;
  getSelection(): string;
  getCursorPosition(): { line: number; col: number };

  // Commands
  registerCommand(id: string, handler: () => void): void;
  executeCommand(id: string): void;

  // Keybindings
  registerKeybinding(key: string, commandId: string): void;

  // Decorations
  addDecoration(decoration: Decoration): void;
  removeDecoration(id: string): void;

  // Language support
  registerLanguage(config: LanguageConfig): void;

  // Themes
  registerTheme(theme: Theme): void;
}
```

### Creating an Extension

```typescript
// extensions/my-extension.ts
export class MyExtension implements Extension {
  id = 'my-extension';
  name = 'My Extension';
  version = '1.0.0';

  activate(api: EditorAPI) {
    // Register command
    api.registerCommand('my-extension.doSomething', () => {
      const selection = api.getSelection();
      const transformed = selection.toUpperCase();
      api.replaceSelection(transformed);
    });

    // Register keybinding
    api.registerKeybinding('Ctrl+Shift+U', 'my-extension.doSomething');
  }

  deactivate() {
    // Cleanup
  }
}
```

### Registering Extension

```typescript
// src/App.tsx or extension-manager.ts
import { MyExtension } from './extensions/my-extension';

const extensionManager = new ExtensionManager(editorAPI);
extensionManager.registerExtension(new MyExtension());
```

---

## Development Guidelines

### Code Style

1. **TypeScript**
   - Use strict mode
   - Prefer interfaces over types for object shapes
   - Use explicit return types for functions
   - Avoid `any`, use `unknown` if type is truly unknown

2. **React Components**
   - Use functional components with hooks
   - Extract complex logic into custom hooks
   - Use `React.memo` for expensive components
   - Prefer composition over inheritance

3. **Zustand Stores**
   - Always use `createSelectors` wrapper
   - Group actions in `actions` object
   - Use `immer` for deep nested updates
   - Access other stores via `getState()` inside actions
   - Never pass store state as parameters to actions

4. **File Naming**
   - Components: `PascalCase.tsx`
   - Utilities: `kebab-case.ts`
   - Stores: `kebab-case-store.ts`
   - Types: `kebab-case-types.ts`

5. **Import Order**
   - React imports
   - Third-party libraries
   - Internal components
   - Internal utilities
   - Types
   - Styles

### Git Commit Messages

From `CLAUDE.md`:
- First character must be uppercase
- Follow conventional commits format
- Examples:
  - `Add feature for syntax highlighting`
  - `Fix buffer memory leak`
  - `Update dependencies`
  - `Refactor file system store`

### Unused Variables

From `CLAUDE.md`:
- **Do NOT prefix with underscore**
- **Delete unused variables instead**

```typescript
// BAD
const _unusedVar = someValue;

// GOOD - just remove it
// (nothing)
```

### Performance Best Practices

1. **Debouncing**
   - LSP completions: 150ms
   - Autosave: 150ms
   - Search: 300ms

2. **Caching**
   - LSP completions: 5s TTL
   - Git diffs: invalidate on file save
   - Syntax tokens: buffer-level cache

3. **Virtualization**
   - Use `react-window` for long lists (file tree, terminal output)

4. **Lazy Loading**
   - AI Chat component
   - Large extensions

5. **Equality Checks**
   - Use `fast-deep-equal` for buffer store
   - Use `useShallow` for array/object selectors

### Testing

- Write unit tests for utilities
- Write integration tests for stores
- Test edge cases (empty files, large files, binary files)
- Test error handling (file not found, permission denied)

### Error Handling

1. **Frontend**
   ```typescript
   try {
     const result = await invoke('command');
   } catch (error) {
     console.error('Command failed:', error);
     showToast({ message: 'Operation failed', type: 'error' });
   }
   ```

2. **Backend**
   ```rust
   #[tauri::command]
   pub async fn command() -> Result<String, String> {
       match dangerous_operation() {
           Ok(result) => Ok(result),
           Err(e) => Err(format!("Operation failed: {}", e))
       }
   }
   ```

### Adding New Features

1. **Plan the feature**
   - Identify affected stores
   - Design data flow
   - Consider backend requirements

2. **Implement backend first** (if needed)
   - Add Rust command in `src-tauri/src/commands/`
   - Register in `main.rs`
   - Test with Rust tests

3. **Implement frontend store**
   - Create or update Zustand store
   - Add actions and state
   - Use appropriate middleware

4. **Implement UI components**
   - Create presentation components
   - Connect to stores
   - Add keyboard shortcuts

5. **Test integration**
   - Test full flow
   - Handle errors gracefully
   - Update documentation

### Debugging

1. **Frontend**
   - Use React DevTools
   - Use Redux DevTools for Zustand (with middleware)
   - Console.log in development only

2. **Backend**
   - Use `dbg!()` macro
   - Check Tauri logs in `~/.local/share/athas/logs/`
   - Use `RUST_LOG=debug` environment variable

3. **IPC Communication**
   - Log invoke calls with parameters
   - Log event emissions
   - Check for serialization errors

### Common Patterns

#### Handling Async Operations in Stores

```typescript
const useMyStore = create(immer((set, get) => ({
  data: null,
  isLoading: false,
  error: null,

  actions: {
    fetchData: async () => {
      set(state => { state.isLoading = true; });

      try {
        const data = await invoke('get_data');
        set(state => {
          state.data = data;
          state.error = null;
        });
      } catch (error) {
        set(state => {
          state.error = error.message;
        });
      } finally {
        set(state => { state.isLoading = false; });
      }
    }
  }
})));
```

#### Coordinating Multiple Stores

```typescript
// In one store's action
const handleSaveAll = async () => {
  const { buffers } = useBufferStore.getState();
  const { rootFolderPath } = useFileSystemStore.getState();
  const { markPendingSave } = useFileWatcherStore.getState().actions;

  for (const buffer of buffers) {
    if (buffer.isDirty) {
      const fullPath = `${rootFolderPath}/${buffer.path}`;
      markPendingSave(fullPath);
      await invoke('write_file', { path: fullPath, content: buffer.content });
      useBufferStore.getState().actions.saveBuffer(buffer.id);
    }
  }
};
```

#### File Watcher Integration

```typescript
// Prevent re-triggering on programmatic saves
const handleFileSave = async (path: string, content: string) => {
  // 1. Mark as pending save
  useFileWatcherStore.getState().actions.markPendingSave(path);

  // 2. Write file
  await invoke('write_file', { path, content });

  // 3. File watcher detects change, checks if pending
  // If pending, ignores event and clears pending flag
};
```

---

## FAQ

### Q: How do I add a new store?

1. Create file in `src/stores/` or appropriate subdirectory
2. Use `create` from Zustand with middleware (immer, persist, etc.)
3. Wrap with `createSelectors`
4. Export store and types
5. Import and use in components with `useStore.use.property()`

### Q: How do I call a Tauri command?

```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<ReturnType>('command_name', {
  param: value
});
```

### Q: How do I add a new keyboard shortcut?

1. Register in `src/hooks/use-keyboard-shortcuts.ts`
2. Add to command registry if it's a command
3. Handle in appropriate component or store action

### Q: How do I add a new language?

1. Add tree-sitter grammar to `src-tauri/Cargo.toml`
2. Update `src-tauri/src/commands/tokens.rs` with new language
3. Add language config in `src/extensions/language-support/`
4. Add file extension mapping in `src/utils/language-detection.ts`

### Q: How do I add a new theme?

1. Create TOML file in `src/extensions/themes/`
2. Define colors for syntax tokens
3. Theme will be auto-discovered by theme system

### Q: How do I handle circular dependencies between stores?

Use dynamic imports inside actions:

```typescript
const myAction = async () => {
  const { useOtherStore } = await import('./other-store');
  const { data } = useOtherStore.getState();
  // Use data
};
```

### Q: Where should I add file operations?

- Simple read/write: Directly invoke Tauri commands
- Complex operations: Add to `useFileSystemStore` actions
- With watching: Use `useFileWatcherStore.markPendingSave()`

### Q: How does autosave work?

1. User types → `AppStore.handleContentChange()`
2. Buffer marked dirty
3. Timeout set (150ms)
4. If no more changes, timeout fires
5. `AppStore.handleSave()` → write file
6. File watcher sees change, ignores (pending save)
7. Buffer marked clean

---

## Conclusion

Athas is a well-architected code editor that combines React's component model with Tauri's native backend capabilities. The state management using Zustand with custom patterns provides a clean, ergonomic API. The extension system allows for customization without modifying core code. The integration of Git, LSP, terminals, and AI features creates a comprehensive development environment.

For development, always:
1. Follow Zustand patterns from CLAUDE.md
2. Use createSelectors for stores
3. Access other stores via getState() in actions
4. Handle errors gracefully
5. Test both frontend and backend
6. Document new features
7. Keep commits well-formatted

**Happy coding!**
