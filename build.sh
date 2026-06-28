#!/bin/bash
# Build the Ancroo browser extension.
# Usage: ./build.sh [--no-zip]
#   --no-zip   Skip packaging dist/ into ancroo-web-extension.zip (zip is built by default)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MAKE_ZIP=true
for arg in "$@"; do
    case "$arg" in
        --no-zip) MAKE_ZIP=false ;;
        *)
            echo "Unknown option: $arg" >&2
            echo "Usage: ./build.sh [--no-zip]" >&2
            exit 1
            ;;
    esac
done

# Ensure pnpm is available
if ! command -v pnpm &>/dev/null; then
    echo "Installing pnpm..."
    sudo corepack enable 2>/dev/null || corepack enable
fi

echo "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "Building extension..."
pnpm build

if [ "$MAKE_ZIP" = true ]; then
    echo "Packaging ZIP archive..."
    # Match the CI step: zip the contents of dist/, not the dist/ folder itself.
    rm -f "$SCRIPT_DIR/ancroo-web-extension.zip"
    (cd dist && zip -9 -r ../ancroo-web-extension.zip .) >/dev/null
    echo "ZIP created: $SCRIPT_DIR/ancroo-web-extension.zip"
fi

echo ""
echo "Extension built: $SCRIPT_DIR/dist/"
echo ""
echo "To install in Chrome:"
echo "  1. Open chrome://extensions"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: $SCRIPT_DIR/dist/"
