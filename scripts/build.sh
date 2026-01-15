#!/bin/bash
# Awesome Claude - Build Script (Bash)
# This script builds the entire application into a single distributable exe

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "===================================="
echo "  Awesome Claude Build Script"
echo "===================================="
echo ""

# Check prerequisites
echo "[1/5] Checking prerequisites..."

for cmd in node pnpm bun cargo; do
    if ! command -v $cmd &> /dev/null; then
        echo "ERROR: $cmd is not installed or not in PATH"
        exit 1
    fi
done
echo "  All prerequisites found!"

# Install dependencies
echo ""
echo "[2/5] Installing dependencies..."
cd "$ROOT_DIR"
pnpm install

echo "  Dependencies installed!"

# Build shared package
echo ""
echo "[3/5] Building shared package..."
cd "$ROOT_DIR/packages/shared"
pnpm build
echo "  Shared package built!"

# Build MCP server executable
echo ""
echo "[4/5] Building MCP server executable..."
cd "$ROOT_DIR/packages/mcp-server"

# Create binaries directory in tauri-app
BINARIES_DIR="$ROOT_DIR/packages/tauri-app/src-tauri/binaries"
mkdir -p "$BINARIES_DIR"

# Detect platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    if [[ $(uname -m) == "arm64" ]]; then
        TARGET="bun-darwin-arm64"
        SUFFIX="aarch64-apple-darwin"
    else
        TARGET="bun-darwin-x64"
        SUFFIX="x86_64-apple-darwin"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    TARGET="bun-linux-x64"
    SUFFIX="x86_64-unknown-linux-gnu"
else
    TARGET="bun-windows-x64"
    SUFFIX="x86_64-pc-windows-msvc.exe"
fi

# Build with Bun
bun build src/server.ts --compile --outfile="$BINARIES_DIR/awesome-claude-mcp-$SUFFIX" --target=$TARGET || {
    echo "  Warning: Bun compile failed, using fallback..."
    pnpm build
}
echo "  MCP server built!"

# Build Tauri application
echo ""
echo "[5/5] Building Tauri application..."
cd "$ROOT_DIR/packages/tauri-app"

if [[ "$1" == "--debug" ]]; then
    pnpm tauri build --debug
else
    pnpm tauri build
fi

echo "  Tauri application built!"

# Done
echo ""
echo "===================================="
echo "  Build Complete!"
echo "===================================="
echo ""
echo "Output location:"
echo "  $ROOT_DIR/packages/tauri-app/src-tauri/target/release/bundle/"
echo ""

cd "$ROOT_DIR"
