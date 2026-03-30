## Important

- Commits should have the first character uppercased
- Do not prefix unused variables with an underscore, delete them instead
- Do not use emojis in commit messages, logs, or documentation
- Never change the .rules file unless the user specifically asks for it
- Avoid unnecessary comments in UI components (keep code self-explanatory)
- Avoid unnecessary `cn(...)` calls: use it only for conditional or merged class names; do not wrap static strings
- Always use bun.

## Project Overview

Athas is a Tauri-based desktop code editor with a React/TypeScript frontend and Rust backend. It features syntax highlighting for 30+ languages via Tree-sitter, LSP support, integrated terminal, Git integration, AI chat (multi-provider), SQLite viewer, and a pluggable extension/theme system.

- **App identifier**: `com.code.athas`
- **License**: AGPL-3.0
- **Platforms**: macOS, Linux, Windows

## Technology Stack

### Frontend
- React 19, TypeScript 5, Vite (custom `vite-plus` fork)
- Tailwind CSS 4 with CSS variable theming
- Zustand 5 for state management
- xterm.js for terminal emulation
- Tree-sitter (WebAssembly) for syntax highlighting

### Backend
- Tauri 2 (Rust desktop app framework)
- Tokio async runtime
- MiMalloc global allocator
- SQLite via custom `crates/database`

### Tooling
- Bun 1.3.2 (package manager and script runner)
- Vitest for testing
- OxLint + OxFmt for linting/formatting
- simple-git-hooks for pre-commit/pre-push hooks
- commitlint (sentence-case, 3-72 chars, no emojis)

## Repository Structure

```
athas/
├── src/                        # React/TypeScript frontend
│   ├── App.tsx                 # Root component
│   ├── main.tsx                # Entry point
│   ├── styles.css              # Global styles entry (imports theme, base, fonts, etc.)
│   ├── features/               # Feature-first modules (see below)
│   ├── extensions/             # Extension system (themes, languages, icons)
│   ├── ui/                     # Reusable headless UI components
│   ├── hooks/                  # Shared React hooks
│   ├── lib/                    # Shared libraries
│   └── utils/                  # Shared utility functions
├── src-tauri/                  # Tauri app shell (thin wiring only)
│   └── src/                    # main.rs, plugin init, IPC setup
├── crates/                     # Rust feature crates (workspace members)
│   ├── ai/                     # AI agent infrastructure
│   ├── database/               # SQLite management
│   ├── extensions/             # Extension loading/management
│   ├── github/                 # GitHub API integration
│   ├── lsp/                    # Language Server Protocol manager
│   ├── project/                # Project/workspace handling
│   ├── remote/                 # Remote connection support
│   ├── runtime/                # Runtime utilities
│   ├── terminal/               # Terminal backend (shell I/O)
│   ├── tooling/                # Dev tooling utilities
│   └── version-control/        # Git operations
├── docs/                       # User-facing documentation (MDX)
├── public/                     # Static assets
├── scripts/                    # Build and release scripts
├── tree-sitter/                # Bundled Tree-sitter parsers (.wasm + .scm queries)
└── vendor/                     # Patched upstream packages
```

## Development Workflow

### Setup and Running
```sh
bun install          # Install dependencies
bun dev              # Start Tauri dev server with React HMR (port 1420)
bun dev:scan         # Dev with React Scan performance overlay
```

### Quality Checks
```sh
bun test             # Run Vitest
bun typecheck        # TypeScript type check
bun check            # Lint check (vite-plus)
bun fix              # Auto-fix lint issues
bun format           # Format code
bun check:all        # typecheck + test + lint (runs on pre-push)
```

### Release
```sh
bun pre-release              # Validate before release
bun pre-release:full         # Full validation
bun release:patch            # Bump patch version
bun release:minor            # Bump minor version
bun release:major            # Bump major version
bun release:alpha            # Alpha pre-release
bun release:beta             # Beta pre-release
bun release:rc               # Release candidate
```

Release scripts update `package.json`, `tauri.conf.json`, and `Cargo.toml`, then create a tag. GitHub Actions builds cross-platform installers automatically.

### Git Hooks (auto-run, do not skip)
- **pre-commit**: `bunx vp check --fix` (lint + format)
- **pre-push**: `bun check:all` (typecheck + test + lint)
- **commit-msg**: commitlint (sentence-case, 3-72 chars, no emojis)

## Feature Architecture

All features live in `src/features/[feature]/` and follow this canonical structure:

```
src/features/[feature]/
├── components/     # React components: [feature]-*.tsx
├── hooks/          # Custom hooks: use-[feature]-*.ts
├── services/       # Business logic
├── api/            # Tauri IPC calls (invoke wrappers)
├── stores/         # Zustand stores
├── state/          # State interfaces/types
├── selectors/      # Derived state selectors
├── types/          # TypeScript types
├── constants/      # Feature constants
├── utils/          # Feature utilities
└── tests/          # Vitest tests
```

Do not scatter feature logic at the `src/features/[feature]/` root when an appropriate subfolder exists. Backend feature logic belongs in `crates/[feature]`; keep `src-tauri` focused on app wiring only.

### Major Features
| Feature | Description |
|---|---|
| `editor` | Code editing, LSP, completion, formatting, markdown |
| `file-explorer` | File tree, clipboard, watchers |
| `git` | Blame, branches, diff, commits, status |
| `terminal` | xterm.js terminal emulation |
| `ai` | Multi-provider chat (Anthropic, OpenAI, Gemini), agents |
| `database` | SQLite viewer with filtering/editing |
| `settings` | Preferences, themes, keymaps, fonts |
| `vim` | Vim keybinding emulation |
| `command-palette` | Quick command access |
| `global-search` | Project-wide content search |
| `panes` | Split view management |
| `tabs` | Document tab management |
| `keymaps` | Keyboard shortcut management |
| `diagnostics` | Error/warning panel |
| `github` | GitHub integration |
| `quick-open` | File search dialog |
| `window` | Window management, session persistence |

## IPC Communication (Frontend to Tauri)

Frontend services call Rust commands via Tauri's `invoke`:

```ts
// In src/features/[feature]/api/
import { invoke } from "@tauri-apps/api/core"

export const getGitBlame = (rootPath: string, filePath: string) =>
  invoke<GitBlame>("git_blame_file", { rootPath, filePath })
```

Command handlers live in `src-tauri/src/commands/` or in the relevant `crates/[feature]`.

## Zustand

This project uses Zustand for state management with specific patterns:

- `createSelectors` - Creates automatic selectors for each state property. Use like `store.use.property()` instead of `store((state) => state.property)`
- `immer` - Use when stores have deep nesting to enable direct mutations in set functions
- `persist` - Use to sync store state with localStorage
- `createWithEqualityFn` - Use when you need custom comparison functions for selectors to avoid unnecessary rerenders when stable references change
- `useShallow` - Use when creating selectors that return objects/arrays to compare them shallowly and avoid rerenders

### Store Access Patterns

- Use `getState()` to access other stores' state within actions: `const { fontSize } = useEditorSettingsStore.getState()`
- Prefer accessing dependent store state inside actions rather than passing parameters
- Group all actions in an `actions` object within the store
- Always use `createSelectors` wrapper for stores

### CSS Variables for Theming

All theme colors are defined as CSS variables following this structure:

**Variable Naming Convention:**
- Use semantic names without prefixes: `--primary-bg`, `--text`, `--accent`
- No `--tw-` prefix (this was removed during standardization)
- Variables are defined in `:root` with system theme fallbacks via `@media (prefers-color-scheme: dark)`

**Tailwind Integration:**
- CSS variables map to Tailwind colors via `@theme inline` directive
- Use pattern: `--color-{name}: var(--{name})`
- Enables utilities like `bg-primary-bg`, `text-text`, `border-border`

**Theme System:**
- All themes (including built-ins) are defined in JSON files in `src/extensions/themes/builtin/`
- Themes override CSS variables via the Theme Registry
- No CSS classes for themes - pure variable-based theming
- Data attributes track current theme: `data-theme="theme-id"` and `data-theme-type="light|dark"`

### CSS File Organization

```
src/
├── styles.css                    # Global styles, Tailwind imports, theme config
│   ├── theme.css                 # CSS variables and theme definitions
│   ├── base.css                  # Reset and base styles
│   ├── fonts.css                 # Font imports (Geist, Geist Mono)
│   ├── scrollbars.css            # Custom scrollbar styling
│   ├── tokens.css                # Design tokens
│   ├── layout.css                # Layout utilities
│   └── utilities.css             # Custom utilities
├── features/
│   └── [feature]/
│       └── styles/               # Feature-specific CSS files
└── extensions/
    └── themes/
        ├── builtin/*.json        # Theme definitions
        ├── theme-registry.ts     # Theme management
        └── types.ts              # Theme interfaces
```

### Best Practices

1. **Consistency**: Use Tailwind utilities for all standard component styling
2. **Performance**: Use CSS files for complex layouts with many styles
3. **Theming**: Always use CSS variables for colors, never hardcode hex values
4. **Maintainability**: Keep styles close to their components using feature-based organization
5. **Customization**: Make components themeable by using semantic CSS variable names

### Accessibility

- Always add accessibility attributes like `aria-label`, `role`, etc. to interactive elements

### Folder Structure

- Group related components, hooks, and utils into feature-based folders (e.g. `src/features/editor/[components,types,utils,config,constants,etc.])
- Use `src/` for shared, generic components used across multiple features (e.g. `src/components`, `src/hooks`, `src/utils`, etc.)
- Use `src/extensions/` for extension-specific code (e.g. themes, plugins, etc.)
- New feature code should follow the canonical structure documented in `docs/contributing.mdx`
- Prefer `src/features/[feature]/{components,hooks,services,api,adapters,stores,state,selectors,contexts,types,constants,utils,tests}`
- Do not add new feature-specific logic to global folders unless it is genuinely shared across multiple features
- Do not leave feature logic scattered in `src/features/[feature]/` root when an appropriate subfolder exists
- Keep feature tests under `src/features/[feature]/tests/` when practical
- Backend feature logic should prefer `crates/[feature]`; keep `src-tauri` focused on app wiring and integration

## Testing

- Test framework: Vitest (via `vite-plus`)
- Run with: `bun test`
- Place tests in `src/features/[feature]/tests/` or as `*.test.ts` alongside the file
- Write unit tests for utilities, services, and hooks

## Documentation

- Update relevant documentation files when adding new features or making significant changes
- Documentation should be clear and concise, focusing on usage and examples
- Documentation is for users, not developers - avoid internal implementation details unless necessary for understanding usage, except for `docs/contributing/`
- Use markdown format for documentation files with proper headings, lists, and code blocks
- Documentation is stored in the same repository as the codebase for easy access and versioning (e.g. `docs/` folder or README files in relevant directories)
- Directories should not contain README files, all documentation should be centralized in a `docs/` folder
- Documents that concern developers should be stored in `docs/contributing/`
