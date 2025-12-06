## Important

- Commits should have the first character uppercased
- Do not prefix unused variables with an underscore - delete them instead
- Never use backwards-compatibility hacks (renaming to `_vars`, re-exporting unused types, `// removed` comments)
- If something is unused, delete it completely

## TypeScript

- Use strict mode (already enabled in tsconfig.json)
- Target ES2020 with ESNext modules
- Always use absolute imports with `@/` alias (e.g., `import { foo } from "@/utils/bar"`)
- Define interfaces for component props, store states, and API contracts
- Use generics for reusable type-safe utilities
- Prefer `interface` over `type` for object shapes
- Co-locate types with features when specific, use `src/types/` for shared types

## React Patterns

- Use functional components with hooks exclusively
- Minimize props - prefer pulling data from Zustand stores
- Use custom hooks for complex logic (prefix with `use-`)
- Leverage `react-window` for virtualized lists with large datasets
- Use `react-intersection-observer` for lazy loading
- Use `useDebounce` from `use-debounce` for search and scroll operations

### Component Structure

```tsx
// 1. Imports (group: React, third-party, local stores, local components, utils)
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { useEditorStore } from "@/stores/editor-store";

// 2. Types/Interfaces
interface MyComponentProps {
  id: string;
}

// 3. Component
export function MyComponent({ id }: MyComponentProps) {
  // Zustand selectors
  const fontSize = useEditorStore.use.fontSize();
  const { setFontSize } = useEditorStore.use.actions();

  // Effects
  useEffect(() => {
    // ...
  }, []);

  // Render
  return <div>...</div>;
}
```

## Zustand State Management

This project uses Zustand with specific patterns and custom utilities:

### Store Creation Pattern

```tsx
interface MyState {
  value: string;
  nested: { data: number };
  actions: MyActions;
}

interface MyActions {
  setValue: (value: string) => void;
  updateNested: (data: number) => void;
}

export const useMyStore = createSelectors(
  create<MyState>()(
    immer(
      subscribeWithSelector((set) => ({
        value: "",
        nested: { data: 0 },
        actions: {
          setValue: (value) => set({ value }),
          updateNested: (data) => set((state) => {
            state.nested.data = data; // Direct mutation via immer
          }),
        },
      })),
    ),
  ),
);
```

### Middleware Guidelines

- **`createSelectors`** - ALWAYS use this wrapper for all stores to enable `store.use.property()` pattern
- **`immer`** - Use for stores with nested objects/arrays to enable direct mutations in `set()`
- **`subscribeWithSelector`** - Use for fine-grained subscription control
- **`createWithEqualityFn`** - Use when custom equality checking needed (avoid unnecessary rerenders)
- **`useShallow`** - Use when selectors return objects/arrays to compare shallowly

### Store Access Patterns

- Use `store.use.property()` for component subscriptions (enabled by `createSelectors`)
- Use `store.getState()` for accessing state in actions or non-React code
- Access other stores within actions via `getState()`: `const { fontSize } = useEditorSettingsStore.getState()`
- Group ALL actions in an `actions` object within the store
- Prefer accessing dependent store state inside actions rather than passing as parameters

### Store Organization

- Name stores with `-store.ts` suffix (e.g., `editor-store.ts`)
- Place stores in `src/stores/` or feature subdirectories
- One store per file, export as `useXxxStore`
- Keep store interfaces separate or above the store definition

## File Naming Conventions

- **Components**: PascalCase (e.g., `CodeEditor.tsx`, `FileTree.tsx`)
- **Utilities**: kebab-case (e.g., `zustand-selectors.ts`, `file-utils.ts`)
- **Stores**: kebab-case with `-store.ts` suffix (e.g., `buffer-store.ts`)
- **Hooks**: kebab-case with `use-` prefix (e.g., `use-keyboard-shortcuts.ts`)
- **Types**: kebab-case with `.types.ts` suffix or in `types/` directory
- **Styles**: kebab-case with `.css` extension

## Styling with Tailwind CSS

- Use Tailwind utility classes as the primary styling method
- Use CSS variables for theme colors: `--text`, `--bg`, `--hover`, `--selected`, `--border`, `--secondary-bg`
- For complex styles, create separate CSS files co-located with components
- Use `clsx` for conditional class names
- Size variants: `xs`, `sm`, `md`, `lg`
- Button variants: `default`, `ghost`, `outline`, `vim`

### Custom Components

- Build on `src/components/ui/` base components (Button, Input, Dialog, etc.)
- Support variant and size props consistently
- Use Tailwind classes with CSS variable colors for theming

## Tauri and Rust Backend

### Frontend-Backend Communication

```tsx
// Invoke Rust commands from React
import { invoke } from "@tauri-apps/api/core";

const result = await invoke<ReturnType>("command_name", {
  arg1: value1,
  arg2: value2,
});
```

### Patterns

- All Rust commands in `src-tauri/src/commands/`
- Group related commands in modules (e.g., `git/`, `lsp/`)
- Type Rust command signatures in TypeScript for type safety
- Use Tauri events for real-time updates (file watching, LSP notifications)
- Handle errors gracefully with try-catch when invoking commands

## Performance Best Practices

- **Virtualization**: Use `react-window` for lists with 100+ items
- **Debouncing**: Use `useDebounce` for search inputs and scroll handlers (300-500ms)
- **Memoization**: Use `useMemo` for expensive calculations, `useCallback` for function props
- **Lazy Loading**: Use `react-intersection-observer` for off-screen content
- **Store Subscriptions**: Only subscribe to specific store slices needed (`store.use.property()` not entire store)
- **Equality Checks**: Use `useShallow` when selecting objects/arrays from stores

## LSP and Language Features

- LSP client is a singleton managed in Rust backend
- Workspace support for multi-root projects
- Use `src/lib/lsp/` for LSP client interactions
- Capabilities: completion, hover, diagnostics, go-to-definition
- Supported languages via Tree-sitter: TS, JS, Go, Rust, Python, Java, C/C++, Ruby, PHP, HTML, CSS, Bash, Markdown, TOML, YAML, JSON

## Git Integration

- Use Rust commands for git operations (better performance than JS libs)
- Git state managed in stores: `git-blame-store`, version control stores
- Support for blame, diff viewing, branch management
- All git commands in `src-tauri/src/commands/git/`

## Icons and Assets

- Use Lucide React for general UI icons
- Use Material File Icons for file type indicators
- Import icons as named imports: `import { Icon } from "lucide-react"`

## Code Quality

- **Linter/Formatter**: Biome (not ESLint/Prettier)
  - Run: `bun check` or `bun format`
  - 2-space indentation, 100 character line width
  - Double quotes, always arrow parentheses
- **Pre-commit**: Biome check via lint-staged
- **Pre-push**: TypeScript check + full lint
- **Commit messages**: Sentence-case, 3-72 characters (enforced by commitlint)

## Testing

- No testing framework currently in place
- When adding tests in the future, prefer Vitest (aligns with Vite)

## Project Structure

```
src/
├── components/        # React components (feature-based)
│   ├── ui/           # Reusable UI components
│   └── [feature]/    # Feature components
├── stores/           # Zustand state stores
├── hooks/            # Custom React hooks
├── lib/              # Library code (LSP, Rust API)
├── utils/            # Utility functions
├── types/            # Shared TypeScript types
└── styles/           # Global CSS and themes

src-tauri/src/        # Rust backend
├── commands/         # Tauri command handlers
└── lsp/             # LSP manager
```

## Development Commands

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun check` - Run Biome linter
- `bun format` - Format code with Biome
- `bun typecheck` - Run TypeScript compiler check
