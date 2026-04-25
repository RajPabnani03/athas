## Cursor Cloud specific instructions

### Overview

Athas is a Tauri 2 desktop code editor (Rust backend + React/TypeScript frontend). Development uses **Bun** for frontend, **Cargo** (nightly) for Rust.

### Running the app

```bash
bun dev
```

This runs `WEBKIT_DISABLE_DMABUF_RENDERER=1 tauri dev`, which starts both the Vite dev server (port 1420) and compiles/runs the Rust backend.

The `CXX=g++` environment variable must be set for Rust compilation because the DuckDB bundled build (`libduckdb-sys`) fails with the default Clang compiler due to missing C++ standard library header resolution. Export it or prefix commands:

```bash
CXX=g++ bun dev
```

### Lint, typecheck, and test commands

See `package.json` scripts. Key commands:

- **Lint**: `bun lint` (runs `bunx vp lint .`)
- **Typecheck**: `bun typecheck` (runs `tsc --noEmit`)
- **Frontend tests**: `bun run test` (runs `bunx vp test run` via Vitest) -- note: `bun test` uses Bun's built-in test runner and will fail; always use `bun run test`
- **Rust tests**: `CXX=g++ cargo test`
- **Full check**: `bun check` (runs `bunx vp check`, which includes lint + format)
- **Auto-fix**: `bun fix` (runs `bunx vp check --fix`)

### System dependencies (Linux)

Tauri requires GTK3, WebKit2GTK 4.1, and libsoup3 development headers. See `scripts/linux/setup.sh` for the full list. The key packages on Ubuntu/Debian:

```
build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev
libayatana-appindicator3-dev librsvg2-dev pkg-config libstdc++-13-dev
```

A `libstdc++.so` symlink in `/usr/lib/x86_64-linux-gnu/` pointing to the gcc version is needed for the Rust linker to find the C++ standard library when linking DuckDB.

### Gotchas

- The `bun.lock` file uses Bun's binary lockfile format.
- The `postinstall` script builds tree-sitter WASM parsers and installs bundled LSP deps. It skips parsers that already exist.
- Git hooks are managed by `simple-git-hooks` (pre-commit runs `bunx vp check --fix`, pre-push runs `bun check:all`, commit-msg runs commitlint).
- The `.claude/settings.json` has a `PreToolUse` hook that runs `scripts/prevent-build.sh` -- this blocks production builds to prevent accidentally running `tauri build`.
- All external database/AI services are optional and user-configured; no Docker or docker-compose required.
