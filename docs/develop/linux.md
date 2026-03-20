# Linux Development Setup

## Quick Setup (Recommended)

Use the automated setup script:

```bash
bun setup
```

## Manual Setup

### Prerequisites

1. **Install Bun**: Visit [bun.sh](https://bun.sh) for installation instructions
2. **Install Rust**: Visit [rustup.rs](https://rustup.rs) for installation instructions
3. **Tauri / GTK dependencies** (needed for `cargo check`, `tauri build`, etc. on Linux): install WebKitGTK and related packages. On Debian/Ubuntu you can use:

   `sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev patchelf pkg-config build-essential`

   Or run `bun setup` / `./scripts/linux/setup.sh`, which installs these for supported distributions.

### Setup

```bash
# Install project dependencies
bun install

# Start development server
bun tauri dev
```
