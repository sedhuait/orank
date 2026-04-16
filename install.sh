#!/bin/bash
# orank — install script
# Registers orank as a local marketplace plugin in Claude Code.
# No npm install. No compilation. Just files.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$HOME/.claude/plugins/data/orank"

echo ""
echo "  orank installer"
echo "  ─────────────────────────────"
echo ""

# Check Node.js 18+
if ! command -v node &> /dev/null; then
  echo "  Error: Node.js is required (v18+)."
  echo "  Install it from https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "  Error: Node.js v18+ required. You have v$(node -v)."
  exit 1
fi

# Check Claude Code is installed
if ! command -v claude &> /dev/null; then
  echo "  Error: Claude Code CLI not found."
  echo "  Install it from https://claude.ai/code"
  exit 1
fi

# Create data directory
echo "  1. Creating data directory..."
mkdir -p "$DATA_DIR"

# Stamp the install time so /orank can detect "hooks have never fired since install"
# (a sidecar file, not an event — keeps events.jsonl pure user activity)
CLAUDE_PLUGIN_DATA="$DATA_DIR" node --input-type=module -e "
  import('$SCRIPT_DIR/scripts/storage.js').then(({ Storage }) => new Storage().markInstalled());
" 2>/dev/null || true

# Add local marketplace and install plugin
echo "  2. Adding orank marketplace..."
claude plugin marketplace add "$SCRIPT_DIR" 2>/dev/null || true

echo "  3. Installing orank plugin..."
claude plugin install orank@orank --scope user 2>/dev/null || true

echo ""
echo "  Done! orank is installed."
echo ""
echo "  Next steps:"
echo "    1. Start a new Claude Code session"
echo "    2. Run /orank to see your stats"
echo "    3. Run /orank import to pull in historical data"
echo ""
echo "  Data:   $DATA_DIR"
echo "  Source: $SCRIPT_DIR"
echo ""
echo "  To test without installing permanently:"
echo "    claude --plugin-dir $SCRIPT_DIR"
echo ""
