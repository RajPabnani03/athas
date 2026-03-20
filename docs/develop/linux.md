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
3. **Tauri system libraries** (GTK, WebKit): on Debian/Ubuntu, install the same packages as in `scripts/linux/setup.sh` (for example `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, and build essentials). Running `bun setup` installs these automatically.

### Setup

```bash
# Install project dependencies
bun install

# Start development server
bun tauri dev
```
