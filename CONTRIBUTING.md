# Contributing to Athas

Thank you for contributing to Athas! Please check existing issues and pull requests before creating new ones.

## Setup

Prerequisites:

- [Rust](https://rustup.rs) - `rust-toolchain.toml` pins the nightly toolchain, and the Rust checks
  need its formatting and lint components:
  `rustup component add rustfmt clippy --toolchain nightly`
- [Bun 1.3.14](https://bun.sh) - the version pinned in `package.json`'s `packageManager` field
- [Node.js 24](https://nodejs.org) - `.node-version` pins 24.19.0

### System libraries

Tauri links against the platform web view and its supporting libraries, so they have to be present
before Cargo can build the app. On Ubuntu, Debian, and their derivatives:

```bash
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev \
  libayatana-appindicator3-dev librsvg2-dev libssl-dev pkg-config pkgconf perl \
  build-essential
```

On macOS, install the Xcode Command Line Tools with `xcode-select --install`. On Windows, install
the Visual Studio C++ build tools and WebView2 as the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) describe. Package names for Fedora,
Arch, and openSUSE are in `scripts/setup/linux.sh`.

### Install dependencies

```bash
bun install --ignore-scripts
bun scripts/postinstall.ts
bun run prepare
```

`nucleo-ui-outline-18` is a licence-gated package whose install script exits unless
`NUCLEO_LICENSE_KEY` is set in the environment. `--ignore-scripts` skips that check, and
`bun scripts/postinstall.ts` runs the one setup step the project needs, which builds the bundled
tree-sitter parsers. A plain `bun install` fails on a machine without the key, so use the first two
commands.

`--ignore-scripts` also skips the `prepare` script, so `bun run prepare` is a separate step: it
points Git at `.vite-hooks`, which runs the staged-file checks and commitlint on every commit.
Without it those hooks never fire.

`bun setup` installs the system libraries above and the Tauri CLI for your platform, but it ends
with a plain `bun install`, so without `NUCLEO_LICENSE_KEY` it stops on that licence error after the
native setup. Run the three install commands above after it, or install the system libraries
yourself and skip it.

## Start The App

```bash
bun dev
```

## Before Submitting

1. TypeScript checks: `bunx tsc --noEmit -p tsconfig.json`
2. Tests: `bunx vp test run`
3. Full check suite: `bun check`
4. Auto-fix issues: `bun fix`
5. Formatting only when needed: `bun format`
6. Rust checks: `bun check:rust`
7. Design-system drift: `bun check:design`
8. App runs: `bun dev`
9. Run release validation when touching release flow: `bun release:check`
10. Rebase on master: `git rebase origin/master`
11. Squash commits into logical units
12. Review and agree to the
    [Contributor License and Feedback Agreement](CONTRIBUTOR_LICENSE_AND_FEEDBACK_AGREEMENT.md)

`bun check` runs `scripts/check/frontend.sh`, the test suite, and `scripts/check/rust.sh` in
sequence. A `typecheck` script is being added to `package.json`; until it lands,
`bunx tsc --noEmit -p tsconfig.json` is the TypeScript check.

## Guidelines

- Follow the existing code style
- Use descriptive commit messages (i.e., "Add autocompletion")
- One logical change per commit
- Update documentation if needed

## Rust Tests

- Keep small unit tests in a `#[cfg(test)] mod tests` block beside the code they exercise.
- Move a large unit-test suite to `src/<module>/tests.rs` and declare it with
  `#[cfg(test)] mod tests;` from the owning module.
- Use `crates/<crate>/tests/` for integration tests that exercise the crate through its public API.
- Add focused regression tests for behavior changes and bug fixes instead of targeting a coverage
  percentage.
- Run one crate or test while iterating with `cargo test -p <crate> <test-name>`, then run
  `bun check:rust` before submitting Rust changes.
