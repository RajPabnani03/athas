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
3. **System libraries (Tauri / GTK)**: Required for `cargo check` and `bun tauri dev`. On Debian/Ubuntu:

   ```bash
   sudo apt-get update
   sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf pkg-config build-essential
   ```

   Other distributions: install the equivalent WebKitGTK 4.1, GTK 3, and appindicator development packages (see the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux)).

### Setup

```bash
# Install project dependencies
bun install

# Start development server
bun tauri dev
```
