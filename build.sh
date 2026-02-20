#!/usr/bin/env bash
# build.sh — Install pi-auto prerequisites globally (Pi Coding Agent, @ccusage/pi, alias, MCP adapter, Cursor provider).
# Usage: ./build.sh [--no-cursor]   (--no-cursor skips the optional Cursor provider)

set -e

SKIP_CURSOR=false
for arg in "$@"; do
  case "$arg" in
    --no-cursor) SKIP_CURSOR=true ;;
  esac
done

echo "==> Checking Node.js (>=18)..."
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed. Install Node 18+ from https://nodejs.org/"
  exit 1
fi
NODE_VER=$(node -p "parseInt(process.versions.node.split('.')[0], 10)")
if [[ "$NODE_VER" -lt 18 ]]; then
  echo "Error: Node.js 18+ required (current: $(node -v))"
  exit 1
fi

echo "==> 1. Installing Pi Coding Agent globally..."
npm install -g @mariozechner/pi-coding-agent

echo "==> 2. Installing @ccusage/pi globally..."
npm install -g @ccusage/pi

echo "==> 3. Adding 'ccusage' alias..."
ALIAS_LINE="alias ccusage='npx @ccusage/pi@latest'"
for rc in ~/.zshrc ~/.bashrc; do
  if [[ -f "$rc" ]]; then
    if grep -q "alias ccusage=" "$rc" 2>/dev/null; then
      echo "    (alias already in $rc)"
    else
      echo "$ALIAS_LINE" >> "$rc"
      echo "    Added to $rc"
    fi
  fi
done

echo "==> 4. Installing Pi MCP adapter..."
pi install npm:pi-mcp-adapter

if [[ "$SKIP_CURSOR" == "true" ]]; then
  echo "==> 5. Skipping Cursor provider (--no-cursor)."
else
  echo "==> 5. Installing Cursor provider for Pi (optional)..."
  pi install npm:@netandreus/pi-cursor-provider
fi

echo ""
echo "Done. Reload your shell so the 'ccusage' alias is available:"
echo "  source ~/.zshrc   # or: source ~/.bashrc"
echo ""
